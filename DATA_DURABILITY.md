# 1일1비, 학습 데이터 영속성 설계

목적: 이번 사고 이후 가입하는 모든 사용자에 대해 "데이터 손실 0, 운영자가 즉시 조회"를 보장.

## 1. 설계 원칙

1. **JSONB 통째 update 폐기**. 각 학습 entry는 정규화된 1row로 저장.
2. **append-only ledger 동행**. submissions_history는 절대 UPDATE/DELETE 없음.
3. **write-through verify**. 저장 후 즉시 reread, 실패 시 outbox 큐잉.
4. **외부 채널 보험**. 매 학습마다 운영자 메신저 웹훅으로 entry JSON 미러링.
5. **운영자 조회 도구화**. operator.html에 사용자·일자별 답안 조회 UI.

## 2. 스키마

```sql
-- 최신 답안 (UPSERT 대상)
CREATE TABLE submissions (
  email          TEXT NOT NULL,
  day            INT  NOT NULL,
  word           TEXT,
  scenario_id    TEXT,                  -- 시나리오 식별자
  answer_text    TEXT NOT NULL,
  mc_choice      TEXT,                  -- 객관식 선택 'correct'|'formal'|'weak'
  mentor_feedback JSONB,
  meta           JSONB DEFAULT '{}'::jsonb,
  submitted_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email, day)
);
CREATE INDEX idx_submissions_email ON submissions(email);
CREATE INDEX idx_submissions_day ON submissions(day);

-- 제출 이력 (append-only)
CREATE TABLE submissions_history (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  day         INT NOT NULL,
  answer_text TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_subhist_email_day ON submissions_history(email, day, created_at DESC);

-- 단어 노트 (per-entry)
CREATE TABLE notes (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  day        INT NOT NULL,
  text       TEXT NOT NULL,
  label      TEXT,
  kind       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, day, text)
);
CREATE INDEX idx_notes_email_day ON notes(email, day);

-- 업무일지
CREATE TABLE journals (
  email     TEXT NOT NULL,
  day       INT NOT NULL,
  text      TEXT NOT NULL,
  saved_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email, day)
);

-- RLS: 직접 접근 차단, RPC만 통로
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_block ON submissions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY subh_block ON submissions_history FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY notes_block ON notes FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY journals_block ON journals FOR ALL USING (false) WITH CHECK (false);

-- 운영자만 SELECT 가능 (service_role bypass + operator email 화이트리스트)
-- 또는 Supabase Auth로 운영자 JWT 마킹 후 정책 작성.
```

## 3. 저장 RPC

```sql
CREATE OR REPLACE FUNCTION save_submission(
  p_email TEXT, p_day INT, p_payload JSONB
) RETURNS submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r submissions;
BEGIN
  IF p_email IS NULL OR p_day IS NULL OR (p_payload->>'answer_text') IS NULL THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  -- 1) append-only history
  INSERT INTO submissions_history(email, day, answer_text, payload)
  VALUES (p_email, p_day, p_payload->>'answer_text', p_payload);

  -- 2) upsert latest
  INSERT INTO submissions(email, day, word, scenario_id, answer_text, mc_choice, mentor_feedback, meta)
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
    word = EXCLUDED.word,
    scenario_id = EXCLUDED.scenario_id,
    answer_text = EXCLUDED.answer_text,
    mc_choice = EXCLUDED.mc_choice,
    mentor_feedback = EXCLUDED.mentor_feedback,
    meta = EXCLUDED.meta,
    updated_at = NOW()
  RETURNING * INTO r;

  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION save_note(
  p_email TEXT, p_day INT, p_text TEXT, p_label TEXT, p_kind TEXT
) RETURNS notes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r notes;
BEGIN
  INSERT INTO notes(email, day, text, label, kind)
  VALUES (p_email, p_day, p_text, p_label, p_kind)
  ON CONFLICT (email, day, text) DO UPDATE SET
    label = EXCLUDED.label,
    kind = EXCLUDED.kind
  RETURNING * INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION save_journal(
  p_email TEXT, p_day INT, p_text TEXT
) RETURNS journals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r journals;
BEGIN
  INSERT INTO journals(email, day, text)
  VALUES (p_email, p_day, p_text)
  ON CONFLICT (email, day) DO UPDATE SET
    text = EXCLUDED.text,
    saved_at = NOW()
  RETURNING * INTO r;
  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION save_submission(TEXT, INT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_note(TEXT, INT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_journal(TEXT, INT, TEXT) TO anon, authenticated;
```

## 4. 운영자 조회 RPC

```sql
CREATE OR REPLACE FUNCTION get_user_progress(p_email TEXT)
RETURNS TABLE(
  day INT, word TEXT, answer_text TEXT,
  has_note BOOLEAN, has_journal BOOLEAN, submitted_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.day, s.word, s.answer_text,
         EXISTS(SELECT 1 FROM notes n WHERE n.email = p_email AND n.day = s.day),
         EXISTS(SELECT 1 FROM journals j WHERE j.email = p_email AND j.day = s.day),
         s.submitted_at
    FROM submissions s
   WHERE s.email = p_email
   ORDER BY s.day;
$$;

CREATE OR REPLACE FUNCTION get_user_day(p_email TEXT, p_day INT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'submission', (SELECT row_to_json(s.*) FROM submissions s WHERE s.email = p_email AND s.day = p_day),
    'notes',      (SELECT COALESCE(jsonb_agg(row_to_json(n.*) ORDER BY n.created_at), '[]'::jsonb) FROM notes n WHERE n.email = p_email AND n.day = p_day),
    'journal',    (SELECT row_to_json(j.*) FROM journals j WHERE j.email = p_email AND j.day = p_day),
    'history',    (SELECT COALESCE(jsonb_agg(row_to_json(h.*) ORDER BY h.created_at DESC), '[]'::jsonb) FROM submissions_history h WHERE h.email = p_email AND h.day = p_day)
  );
$$;

GRANT EXECUTE ON FUNCTION get_user_progress(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_day(TEXT, INT) TO authenticated;
```

운영자가 Supabase SQL Editor 또는 operator.html에서 호출 가능.

## 5. 클라이언트 변경 (mainboard.html · supabase-client.js)

### 5-1. supabase-client.js에 새 헬퍼 추가

```js
async function saveSubmission(email, day, payload) {
  try {
    const { data, error } = await client.rpc('save_submission', {
      p_email: email, p_day: day, p_payload: payload,
    });
    if (error) throw error;
    // write-through verify: 방금 쓴 거 다시 읽어서 일치 확인
    const { data: verify } = await client.rpc('get_user_day', {
      p_email: email, p_day: day,
    });
    const ok = verify && verify.submission && verify.submission.answer_text === payload.answer_text;
    return { ok, result: data, verified: ok };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function saveNoteRow(email, day, text, label, kind) { ... }
async function saveJournalRow(email, day, text) { ... }
```

### 5-2. mainboard.html의 `saveCompletion`을 새 경로로

```js
function saveCompletion(entry) {
  try {
    // 1) localStorage 즉시 저장 (기존과 동일)
    const raw = localStorage.getItem("__OD_USER");
    const u = raw ? JSON.parse(raw) : null;
    if (!u) return;
    u.scenariosCompleted = u.scenariosCompleted || [];
    const idx = u.scenariosCompleted.findIndex(s => s.day === entry.day);
    if (idx >= 0) u.scenariosCompleted[idx] = entry;
    else u.scenariosCompleted.push(entry);
    localStorage.setItem("__OD_USER", JSON.stringify(u));

    // 2) 새 정규화 테이블로 저장 + verify
    if (window.OD && window.OD.enabled && window.OD.saveSubmission && u.email) {
      const payload = {
        word: entry.word,
        scenario_id: entry.scenarioId || (entry.day + ':' + (entry.word || '')),
        answer_text: entry.userAnswer || entry.answer || entry.text,
        mc_choice: entry.mcChoice,
        mentor_feedback: entry.mentorFeedback || {},
        meta: { submittedAt: entry.submittedAt },
      };
      window.OD.saveSubmission(u.email, entry.day, payload).then(r => {
        if (!r.ok || !r.verified) {
          pushOutbox({ type: 'submission', email: u.email, day: entry.day, payload });
        }
        // 외부 채널 보험
        sendMirrorWebhook({ type: 'submission', email: u.email, day: entry.day, payload });
      });
    }
  } catch (e) { console.warn("saveCompletion failed:", e); }
}
```

`pushOutbox`, `flushOutbox`, `sendMirrorWebhook`은 RECOVERY_PLAN.md의 outbox 코드 + 아래 미러 함수.

```js
async function sendMirrorWebhook(op) {
  if (!window.__MIRROR_WEBHOOK_URL) return;
  try {
    await fetch(window.__MIRROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ts: new Date().toISOString(),
        ...op,
      }),
    });
  } catch (e) {}
}
```

`window.__MIRROR_WEBHOOK_URL`은 lib/supabase-config.js 옆에 별도 config 파일로:
- Discord channel webhook URL 또는
- Slack incoming webhook URL 또는
- Zapier catch hook

이 채널엔 운영자만 들어가있고, 메시지 자체가 entry JSON을 평문으로 담음. DB가 다 날아가도 채널 로그에서 줄줄이 복사해 복구 가능.

## 6. 자동 일일 백업 (Edge Function)

`supabase/functions/daily-backup/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const TO = "dmsgktn0523@gmail.com";

serve(async () => {
  const [{ data: subs }, { data: hist }, { data: notes }, { data: journals }] = await Promise.all([
    sb.from("submissions").select("*"),
    sb.from("submissions_history").select("*"),
    sb.from("notes").select("*"),
    sb.from("journals").select("*"),
  ]);
  const dump = { date: new Date().toISOString(), submissions: subs, submissions_history: hist, notes, journals };
  const json = JSON.stringify(dump);
  const b64 = btoa(unescape(encodeURIComponent(json)));

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "1day1biz <noreply@youbuddy.co.kr>",
      to: TO,
      subject: `[1일1비] 일일 학습 데이터 백업 ${new Date().toISOString().slice(0,10)}`,
      text: `submissions ${subs?.length} rows / history ${hist?.length} rows / notes ${notes?.length} / journals ${journals?.length}`,
      attachments: [{ filename: "backup.json", content: b64 }],
    }),
  });
  return new Response("ok");
});
```

Supabase Dashboard에서 Cron Trigger 매일 00:00 KST(15:00 UTC)로 등록.

## 7. 운영자 조회 UI (operator.html 추가)

심플하게: 이메일 입력칸 + Day 셀렉트 + "조회" 버튼.

```html
<section class="ops-card">
  <h3>학습 데이터 조회</h3>
  <input id="opQEmail" placeholder="이메일" />
  <select id="opQDay">
    <option value="">전체 진도</option>
    <option value="1">Day 1</option>
    ...
  </select>
  <button id="opQRun">조회</button>
  <pre id="opQResult"></pre>
</section>
<script>
document.getElementById('opQRun').onclick = async () => {
  const email = document.getElementById('opQEmail').value.trim();
  const day = document.getElementById('opQDay').value;
  if (!email) return;
  let r;
  if (day) {
    r = await window.OD.client.rpc('get_user_day', { p_email: email, p_day: Number(day) });
  } else {
    r = await window.OD.client.rpc('get_user_progress', { p_email: email });
  }
  document.getElementById('opQResult').textContent = JSON.stringify(r.data, null, 2);
};
</script>
```

운영자 로그인 상태에서만 보이게 가드. RPC는 GRANT EXECUTE TO authenticated이므로 매직링크 로그인 후만 호출 가능.

## 8. 신규 가입자 보호 보장 체크리스트

각 사용자 가입 1시간 내에 운영자가 콘솔에서:

```sql
SELECT
  u.email,
  EXISTS(SELECT 1 FROM submissions s WHERE s.email = u.email) AS has_submission,
  (SELECT COUNT(*) FROM submissions_history h WHERE h.email = u.email) AS history_count,
  (SELECT MAX(created_at) FROM submissions_history h WHERE h.email = u.email) AS last_save
FROM users u
WHERE u.signup_date > NOW() - INTERVAL '24 hours'
ORDER BY u.signup_date DESC;
```

submission이 안 쌓이는 사용자 발견 시 즉시 카톡 컨택.

## 9. 손실 시나리오 분석 (4중 방벽)

| 어디서 깨져야 데이터 손실 | 발생 확률 |
|---|---|
| 사용자 localStorage 직접 클리어 | 사용자 능동 행위 |
| + Supabase submissions 테이블 wipe | RLS·실수로 가능 |
| + submissions_history append-only도 wipe | service_role 직접 DELETE 필요 |
| + Discord/Slack 미러 채널 메시지 일괄 삭제 | 별도 계정·플랫폼 |
| + 운영자 이메일함의 daily-backup.json 모두 삭제 | 별도 계정 |

이 다섯이 동시에 발생해야 손실. 사실상 의도적 사보타주 아니면 0.

## 10. 마이그레이션 1회 스크립트 (기존 10명 백필)

```sql
-- 기존 users.scenarios_completed JSONB를 새 submissions로 풀어내기
INSERT INTO submissions(email, day, word, scenario_id, answer_text, mc_choice, mentor_feedback, meta, submitted_at, updated_at)
SELECT
  u.email,
  (s->>'day')::int,
  s->>'word',
  COALESCE(s->>'scenarioId', (s->>'day') || ':' || COALESCE(s->>'word','')),
  COALESCE(s->>'userAnswer', s->>'answer', s->>'text', ''),
  s->>'mcChoice',
  COALESCE(s->'mentorFeedback', '{}'::jsonb),
  COALESCE(s->'meta', jsonb_build_object('migratedFromJsonb', true)),
  COALESCE((s->>'submittedAt')::timestamptz, NOW()),
  NOW()
FROM users u, jsonb_array_elements(COALESCE(u.scenarios_completed, '[]'::jsonb)) s
WHERE COALESCE(s->>'userAnswer', s->>'answer', s->>'text', '') <> ''
ON CONFLICT (email, day) DO NOTHING;

-- 같은 패턴으로 notes, journals 백필
```

이 한 번만 돌리면 기존 10명도 신규 50명과 동일 보호 적용.
