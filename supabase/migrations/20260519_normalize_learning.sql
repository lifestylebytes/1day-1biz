-- ============================================================
-- 1일1비 학습 데이터 정규화 + 영속성 강화
-- 실행: Supabase Dashboard → SQL Editor → 통째로 붙여넣고 RUN
-- 작성: 2026-05-19 (RLS 사고 대응, 50명 오픈 직전)
--
-- 핵심:
--   1) JSONB 통째 저장 폐기, 1row = 1answer 정규화
--   2) submissions_history append-only ledger (절대 안 지움)
--   3) RPC만 통로, anon 직접 update 차단
--   4) 운영자 조회용 RPC (get_user_progress, get_user_day)
--   5) 기존 users.scenarios_completed / saved_notes / daily_journals 백필
-- ============================================================

-- ====================
-- 1. 정규화 테이블
-- ====================

-- 최신 답안 (UPSERT 대상)
CREATE TABLE IF NOT EXISTS submissions (
  email           TEXT NOT NULL,
  day             INT  NOT NULL,
  word            TEXT,
  scenario_id     TEXT,
  answer_text     TEXT NOT NULL,
  mc_choice       TEXT,
  mentor_feedback JSONB DEFAULT '{}'::jsonb,
  meta            JSONB DEFAULT '{}'::jsonb,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email, day)
);
CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions(email);
CREATE INDEX IF NOT EXISTS idx_submissions_day   ON submissions(day);

-- 제출 이력 (append-only)
CREATE TABLE IF NOT EXISTS submissions_history (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  day         INT  NOT NULL,
  answer_text TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subhist_email_day_time
  ON submissions_history(email, day, created_at DESC);

-- 단어 노트 (1row = 1note)
CREATE TABLE IF NOT EXISTS notes (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  day        INT NOT NULL,
  text       TEXT NOT NULL,
  label      TEXT,
  kind       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, day, text)
);
CREATE INDEX IF NOT EXISTS idx_notes_email_day ON notes(email, day);

-- 업무일지 (1row = 1일 1일지)
CREATE TABLE IF NOT EXISTS journals (
  email     TEXT NOT NULL,
  day       INT NOT NULL,
  text      TEXT NOT NULL,
  saved_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email, day)
);
CREATE INDEX IF NOT EXISTS idx_journals_email ON journals(email);


-- ====================
-- 2. RLS, 직접 접근 차단 → RPC만 통로
-- ====================
ALTER TABLE submissions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals             ENABLE ROW LEVEL SECURITY;

-- anon/authenticated 모두 직접 R/W 차단. service_role은 RLS 무시하므로 운영자는 가능.
DROP POLICY IF EXISTS sub_block       ON submissions;
CREATE POLICY sub_block       ON submissions          FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS subh_block      ON submissions_history;
CREATE POLICY subh_block      ON submissions_history  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS notes_block     ON notes;
CREATE POLICY notes_block     ON notes                FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS journals_block  ON journals;
CREATE POLICY journals_block  ON journals             FOR ALL USING (false) WITH CHECK (false);


-- ====================
-- 3. 저장 RPC (SECURITY DEFINER, RLS 우회)
-- ====================

-- 시나리오 영작 저장
CREATE OR REPLACE FUNCTION save_submission(
  p_email TEXT, p_day INT, p_payload JSONB
) RETURNS submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r submissions;
BEGIN
  IF p_email IS NULL OR p_day IS NULL OR COALESCE(p_payload->>'answer_text','') = '' THEN
    RAISE EXCEPTION 'invalid input: email, day, answer_text required';
  END IF;

  -- 1) append-only ledger
  INSERT INTO submissions_history(email, day, answer_text, payload)
  VALUES (p_email, p_day, p_payload->>'answer_text', p_payload);

  -- 2) upsert latest
  INSERT INTO submissions(
    email, day, word, scenario_id, answer_text, mc_choice, mentor_feedback, meta
  )
  VALUES (
    p_email, p_day,
    p_payload->>'word',
    p_payload->>'scenario_id',
    p_payload->>'answer_text',
    p_payload->>'mc_choice',
    COALESCE(p_payload->'mentor_feedback', '{}'::jsonb),
    COALESCE(p_payload->'meta', '{}'::jsonb)
  )
  ON CONFLICT (email, day) DO UPDATE SET
    word            = EXCLUDED.word,
    scenario_id     = EXCLUDED.scenario_id,
    answer_text     = EXCLUDED.answer_text,
    mc_choice       = EXCLUDED.mc_choice,
    mentor_feedback = EXCLUDED.mentor_feedback,
    meta            = EXCLUDED.meta,
    updated_at      = NOW()
  RETURNING * INTO r;

  RETURN r;
END;
$$;

-- 단어 노트 저장
CREATE OR REPLACE FUNCTION save_note(
  p_email TEXT, p_day INT, p_text TEXT, p_label TEXT, p_kind TEXT
) RETURNS notes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r notes;
BEGIN
  IF p_email IS NULL OR p_day IS NULL OR COALESCE(p_text,'') = '' THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  INSERT INTO notes(email, day, text, label, kind)
  VALUES (p_email, p_day, p_text, p_label, p_kind)
  ON CONFLICT (email, day, text) DO UPDATE SET
    label = EXCLUDED.label,
    kind  = EXCLUDED.kind
  RETURNING * INTO r;
  RETURN r;
END;
$$;

-- 업무일지 저장
CREATE OR REPLACE FUNCTION save_journal(
  p_email TEXT, p_day INT, p_text TEXT
) RETURNS journals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r journals;
BEGIN
  IF p_email IS NULL OR p_day IS NULL OR COALESCE(p_text,'') = '' THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  INSERT INTO journals(email, day, text)
  VALUES (p_email, p_day, p_text)
  ON CONFLICT (email, day) DO UPDATE SET
    text     = EXCLUDED.text,
    saved_at = NOW()
  RETURNING * INTO r;
  RETURN r;
END;
$$;


-- ====================
-- 4. 운영자 조회 RPC
-- ====================

-- 사용자 전체 진도 (날짜별 요약)
CREATE OR REPLACE FUNCTION get_user_progress(p_email TEXT)
RETURNS TABLE(
  day INT, word TEXT, answer_preview TEXT,
  has_note BOOLEAN, has_journal BOOLEAN,
  submitted_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.day,
    s.word,
    LEFT(s.answer_text, 80),
    EXISTS(SELECT 1 FROM notes n    WHERE n.email = p_email AND n.day = s.day),
    EXISTS(SELECT 1 FROM journals j WHERE j.email = p_email AND j.day = s.day),
    s.submitted_at
  FROM submissions s
  WHERE s.email = p_email
  ORDER BY s.day;
$$;

-- 특정 N일차 풀 데이터 (시나리오 + 노트 + 일지 + history)
CREATE OR REPLACE FUNCTION get_user_day(p_email TEXT, p_day INT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'submission', (SELECT row_to_json(s.*) FROM submissions s
                    WHERE s.email = p_email AND s.day = p_day),
    'notes',      (SELECT COALESCE(jsonb_agg(row_to_json(n.*) ORDER BY n.created_at), '[]'::jsonb)
                    FROM notes n WHERE n.email = p_email AND n.day = p_day),
    'journal',    (SELECT row_to_json(j.*) FROM journals j
                    WHERE j.email = p_email AND j.day = p_day),
    'history',    (SELECT COALESCE(jsonb_agg(row_to_json(h.*) ORDER BY h.created_at DESC), '[]'::jsonb)
                    FROM submissions_history h
                    WHERE h.email = p_email AND h.day = p_day)
  );
$$;

-- 데이터 헬스 (운영 대시보드용)
CREATE OR REPLACE FUNCTION get_user_health(p_email TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'email', p_email,
    'submission_count',   (SELECT COUNT(*) FROM submissions WHERE email = p_email),
    'history_count',      (SELECT COUNT(*) FROM submissions_history WHERE email = p_email),
    'notes_count',        (SELECT COUNT(*) FROM notes WHERE email = p_email),
    'journals_count',     (SELECT COUNT(*) FROM journals WHERE email = p_email),
    'last_submission_at', (SELECT MAX(submitted_at) FROM submissions WHERE email = p_email),
    'last_history_at',    (SELECT MAX(created_at) FROM submissions_history WHERE email = p_email)
  );
$$;


-- ====================
-- 5. 권한 부여
-- ====================
GRANT EXECUTE ON FUNCTION save_submission(TEXT, INT, JSONB)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_note(TEXT, INT, TEXT, TEXT, TEXT)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_journal(TEXT, INT, TEXT)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_progress(TEXT)                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_day(TEXT, INT)                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_health(TEXT)                         TO anon, authenticated;


-- ====================
-- 6. 기존 데이터 백필 (users JSONB → 새 테이블)
-- 안전: ON CONFLICT DO NOTHING / DO UPDATE로 중복 입력 보호
-- ====================

-- 6-1. scenarios_completed → submissions
INSERT INTO submissions(
  email, day, word, scenario_id, answer_text, mc_choice, mentor_feedback, meta, submitted_at, updated_at
)
SELECT
  u.email,
  COALESCE((s->>'day')::int, 0),
  s->>'word',
  COALESCE(s->>'scenarioId', (s->>'day') || ':' || COALESCE(s->>'word','')),
  COALESCE(s->>'userAnswer', s->>'answer', s->>'text', ''),
  s->>'mcChoice',
  COALESCE(s->'mentorFeedback', '{}'::jsonb),
  COALESCE(s->'meta', jsonb_build_object('migratedFromJsonb', true)),
  COALESCE(NULLIF(s->>'submittedAt','')::timestamptz, NOW()),
  NOW()
FROM users u, jsonb_array_elements(COALESCE(u.scenarios_completed, '[]'::jsonb)) s
WHERE COALESCE(s->>'userAnswer', s->>'answer', s->>'text', '') <> ''
  AND COALESCE((s->>'day')::int, 0) > 0
ON CONFLICT (email, day) DO NOTHING;

-- 6-2. scenarios_completed → submissions_history (감사 추적, 같은 entry라도 한 번 들어감)
INSERT INTO submissions_history(email, day, answer_text, payload, created_at)
SELECT
  u.email,
  COALESCE((s->>'day')::int, 0),
  COALESCE(s->>'userAnswer', s->>'answer', s->>'text', ''),
  s || jsonb_build_object('migratedFromJsonb', true),
  COALESCE(NULLIF(s->>'submittedAt','')::timestamptz, NOW())
FROM users u, jsonb_array_elements(COALESCE(u.scenarios_completed, '[]'::jsonb)) s
WHERE COALESCE(s->>'userAnswer', s->>'answer', s->>'text', '') <> ''
  AND COALESCE((s->>'day')::int, 0) > 0;

-- 6-3. saved_notes (JSONB object day → array) → notes
INSERT INTO notes(email, day, text, label, kind, created_at)
SELECT
  u.email,
  COALESCE(day_key::int, 0),
  n->>'text',
  n->>'label',
  n->>'kind',
  COALESCE(NULLIF(n->>'savedAt','')::timestamptz, NOW())
FROM users u,
     jsonb_each(COALESCE(u.saved_notes, '{}'::jsonb)) AS notes_by_day(day_key, day_arr),
     jsonb_array_elements(day_arr) n
WHERE COALESCE(n->>'text','') <> ''
  AND COALESCE(day_key::int, 0) > 0
ON CONFLICT (email, day, text) DO NOTHING;

-- 6-4. daily_journals (JSONB object day → entry) → journals
INSERT INTO journals(email, day, text, saved_at)
SELECT
  u.email,
  COALESCE(day_key::int, 0),
  j->>'text',
  COALESCE(NULLIF(j->>'savedAt','')::timestamptz, NOW())
FROM users u,
     jsonb_each(COALESCE(u.daily_journals, '{}'::jsonb)) AS j_by_day(day_key, j)
WHERE COALESCE(j->>'text','') <> ''
  AND COALESCE(day_key::int, 0) > 0
ON CONFLICT (email, day) DO UPDATE SET
  text = EXCLUDED.text,
  saved_at = EXCLUDED.saved_at;


-- ====================
-- 7. 백필 결과 자가 진단
-- 실행 후 아래 쿼리로 결과 확인 권장:
-- ====================
-- SELECT COUNT(*) FROM submissions;
-- SELECT COUNT(*) FROM submissions_history;
-- SELECT COUNT(*) FROM notes;
-- SELECT COUNT(*) FROM journals;
-- SELECT * FROM get_user_progress('dmsgktn0523@gmail.com');
-- SELECT get_user_day('dmsgktn0523@gmail.com', 1);
-- SELECT get_user_health('dmsgktn0523@gmail.com');


-- ============================================================
-- 끝. RUN 후 운영자 본인 이메일로 get_user_progress 호출해서
-- 백필 정상 됐는지 확인.
-- ============================================================
