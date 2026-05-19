-- ============================================================
-- 1일1비, submissions에 status 컬럼 추가 (draft / submitted)
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- 의존: 20260519_normalize_learning.sql 먼저 RUN 돼있어야 함
--
-- 목적:
--   사용자가 시추에이션 영작 모달을 닫을 때 (아직 제출 안 함) draft로 저장.
--   "제출" 버튼 누르면 submitted로 승격.
--   미니 미션 mc 선택만 했을 때도 부분 진행 상태로 저장.
--   "어디까지 진행했는지" 추적 가능.
-- ============================================================

-- 1. status 컬럼 추가 (기존 row는 자동으로 'submitted' 간주)
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft', 'submitted'));

-- 2. save_submission RPC 업데이트, payload에 status 받음
CREATE OR REPLACE FUNCTION save_submission(p_email TEXT, p_day INT, p_payload JSONB)
RETURNS submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r submissions;
  v_status TEXT;
  v_answer TEXT;
BEGIN
  IF p_email IS NULL OR p_day IS NULL THEN
    RAISE EXCEPTION 'invalid input: email, day required';
  END IF;

  v_status := COALESCE(p_payload->>'status', 'submitted');
  v_answer := COALESCE(p_payload->>'answer_text', '');

  -- draft는 answer_text 빈 문자열도 허용 (mc만 선택한 경우 등)
  IF v_status = 'submitted' AND v_answer = '' THEN
    RAISE EXCEPTION 'submitted requires non-empty answer_text';
  END IF;

  -- 1) append-only ledger (모든 변경 영구 기록)
  INSERT INTO submissions_history(email, day, answer_text, payload)
  VALUES (p_email, p_day, v_answer, p_payload);

  -- 2) upsert latest. status 다운그레이드 방지: submitted → draft 회귀 불가.
  INSERT INTO submissions(
    email, day, word, scenario_id, answer_text, mc_choice, mentor_feedback, meta, status
  )
  VALUES (
    p_email, p_day,
    p_payload->>'word',
    p_payload->>'scenario_id',
    v_answer,
    p_payload->>'mc_choice',
    COALESCE(p_payload->'mentor_feedback', '{}'::jsonb),
    COALESCE(p_payload->'meta', '{}'::jsonb),
    v_status
  )
  ON CONFLICT (email, day) DO UPDATE SET
    word            = COALESCE(EXCLUDED.word, submissions.word),
    scenario_id     = COALESCE(EXCLUDED.scenario_id, submissions.scenario_id),
    -- answer_text는 빈 문자열로 덮어쓰지 않음 (mc만 저장하는 케이스 보호)
    answer_text     = CASE WHEN EXCLUDED.answer_text <> '' THEN EXCLUDED.answer_text ELSE submissions.answer_text END,
    mc_choice       = COALESCE(EXCLUDED.mc_choice, submissions.mc_choice),
    mentor_feedback = CASE WHEN EXCLUDED.mentor_feedback <> '{}'::jsonb THEN EXCLUDED.mentor_feedback ELSE submissions.mentor_feedback END,
    meta            = submissions.meta || EXCLUDED.meta,
    -- status 다운그레이드 방지
    status          = CASE
                        WHEN submissions.status = 'submitted' THEN 'submitted'
                        ELSE EXCLUDED.status
                      END,
    updated_at      = NOW()
  RETURNING * INTO r;

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION save_submission(TEXT, INT, JSONB) TO anon, authenticated;

-- 3. get_user_progress에 status 노출 추가
CREATE OR REPLACE FUNCTION get_user_progress(p_email TEXT)
RETURNS TABLE(
  day INT, word TEXT, answer_preview TEXT,
  status TEXT, mc_choice TEXT,
  has_note BOOLEAN, has_journal BOOLEAN,
  submitted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.day,
    s.word,
    LEFT(s.answer_text, 80),
    s.status,
    s.mc_choice,
    EXISTS(SELECT 1 FROM notes n    WHERE n.email = p_email AND n.day = s.day),
    EXISTS(SELECT 1 FROM journals j WHERE j.email = p_email AND j.day = s.day),
    s.submitted_at,
    s.updated_at
  FROM submissions s
  WHERE s.email = p_email
  ORDER BY s.day;
$$;

GRANT EXECUTE ON FUNCTION get_user_progress(TEXT) TO anon, authenticated;
