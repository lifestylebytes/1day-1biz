# 1일1비, 학습 데이터 손실 방지 플랜

작성 2026-05-19, 베타 50명 오픈 D-Day.

## 사고 진단 요약

오늘 RLS 강화 후 학습 내용이 멤버들에게 안 보이는 사고.
코드 분석으로 드러난 원인 가설:

1. `lib/supabase-client.js`에 `saveScenarioAtomic`, `saveNoteAtomic`, `rebuildFromHistory`가 RPC `merge_scenario_completion`, `merge_saved_note`, `rebuild_user_from_history`를 호출하도록 설계돼있음. 주석엔 "learning_history append-only 테이블에 영구 기록"이라 표기.
2. 그러나 `supabase/schema.sql`에는 이 RPC들과 `learning_history` 테이블 정의가 없음. SETUP.md에 "v1.5에 강화"라고만 명시.
3. 결과: 클라이언트는 RPC 호출하지만 서버엔 함수 없음 → catch에서 silently fallback → 통째 덮어쓰기 `updateProgress`로 떨어짐.
4. 오늘 RLS 강화로 anon의 update가 막히면서, fallback도 실패. localStorage엔 살아있지만 다른 기기·시크릿·캐시 클린 환경에서 들어오면 빈 상태로 보임.

핵심 약점:
- 백업 인프라(history)가 "있다고 믿었지만 실제론 없었음".
- JSONB 컬럼 통째 update는 race·RLS·부분 손실에 약함.
- 클라이언트가 DB write 실패를 시각화하지 않음. 사용자도 운영자도 인지 불가.

## 환경 조건

- Supabase Free 플랜 (PITR 없음, 일일 백업 1개)
- 베타 인원 10명 이하, 전원 카톡 연락 가능
- 오픈까지 2-6시간

## Phase 0, 진단 (30분 안)

### 0-1. service_role로 실제 DB 상태 확인
Supabase Dashboard → SQL Editor에서 service_role로:

```sql
SELECT
  email,
  name,
  jsonb_array_length(COALESCE(scenarios_completed, '[]'::jsonb)) AS scn_count,
  COALESCE(jsonb_object_keys(saved_notes), 'none') AS note_days_sample,
  updated_at
FROM users
ORDER BY updated_at DESC;
```

판단:
- `scn_count > 0` 이면 **데이터 살아있음, RLS만 막은 것**. 정책 원복으로 즉시 회복.
- `scn_count = 0` 이면 진짜 비어있음. Backups 또는 사용자 localStorage 의존.

### 0-2. Backups 탭 확인
Database → Backups. Free라도 daily 1개 있음. 어제 자정(2026-05-18 00:00) 백업이 사고 전이면 복구 후보.

복구하면 어제 이후 학습은 잃지만 어제까지는 회복. 사고 직전 시점은 아니지만 베이스라인 확보.

### 0-3. 베타 10명 localStorage 추출 부탁
카톡으로 요청 문안 예시:

```
유버디 베타 멤버님 죄송해요. DB 사고로 학습 내용 일부가 안 보일 수 있는데,
F12 누르고 콘솔 탭에 아래 한 줄 붙여서 엔터 치고, 나온 거 그대로 복사해서 카톡으로 보내주세요.
복구에 꼭 필요해요.

copy(localStorage.getItem("__OD_USER"))
```

받은 JSON을 운영자가 service_role로 직접 users 테이블에 UPSERT.

## Phase 1, 핵심 보강 (1-2시간)

### 1-1. learning_history 테이블과 RPC 만들기

`supabase/migrations/20260519_learning_history.sql` 새로 만들고 SQL Editor에서 RUN:

```sql
-- append-only ledger
CREATE TABLE IF NOT EXISTS learning_history (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('scenario','note','journal')),
  day TEXT,
  entry JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lh_email_kind_time
  ON learning_history(email, kind, created_at DESC);

ALTER TABLE learning_history ENABLE ROW LEVEL SECURITY;
-- 누구도 직접 INSERT/UPDATE/DELETE 못함. RPC만 통로.
DROP POLICY IF EXISTS lh_no_direct ON learning_history;
CREATE POLICY lh_no_direct ON learning_history FOR ALL USING (false) WITH CHECK (false);

-- 시나리오 완료 저장: history append + users.scenarios_completed union merge
CREATE OR REPLACE FUNCTION merge_scenario_completion(p_email TEXT, p_entry JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing JSONB;
  next_arr JSONB;
  this_day TEXT := COALESCE(p_entry->>'day', '');
BEGIN
  IF this_day = '' THEN
    RAISE EXCEPTION 'entry.day required';
  END IF;

  -- 1) append-only history
  INSERT INTO learning_history(email, kind, day, entry)
  VALUES (p_email, 'scenario', this_day, p_entry);

  -- 2) users.scenarios_completed 안에서 같은 day 제거하고 새 entry push
  SELECT COALESCE(scenarios_completed, '[]'::jsonb) INTO existing
    FROM users WHERE email = p_email;

  next_arr := COALESCE(
    (SELECT jsonb_agg(s) FROM jsonb_array_elements(existing) s
      WHERE s->>'day' <> this_day),
    '[]'::jsonb
  ) || jsonb_build_array(p_entry);

  UPDATE users
     SET scenarios_completed = next_arr,
         last_active = NOW(),
         updated_at = NOW()
   WHERE email = p_email;

  RETURN next_arr;
END;
$$;

-- 노트 저장: history append + users.saved_notes[day] 안 중복 제거하고 union
CREATE OR REPLACE FUNCTION merge_saved_note(p_email TEXT, p_day TEXT, p_note JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notes JSONB;
  day_arr JSONB;
  merged JSONB;
BEGIN
  INSERT INTO learning_history(email, kind, day, entry)
  VALUES (p_email, 'note', p_day, p_note);

  SELECT COALESCE(saved_notes, '{}'::jsonb) INTO notes
    FROM users WHERE email = p_email;

  day_arr := COALESCE(notes->p_day, '[]'::jsonb);

  -- 같은 text면 중복 제거
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(day_arr) n
    WHERE n->>'text' = p_note->>'text'
  ) THEN
    day_arr := day_arr || jsonb_build_array(p_note);
  END IF;

  merged := notes || jsonb_build_object(p_day, day_arr);

  UPDATE users
     SET saved_notes = merged,
         last_active = NOW(),
         updated_at = NOW()
   WHERE email = p_email;

  RETURN merged;
END;
$$;

-- 응급 복구: history에서 users 행 재구성
CREATE OR REPLACE FUNCTION rebuild_user_from_history(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_scenarios JSONB;
  notes_obj JSONB;
BEGIN
  -- 시나리오: day별 가장 최근 entry
  SELECT jsonb_agg(e ORDER BY (e->>'day')::int)
    INTO latest_scenarios
    FROM (
      SELECT DISTINCT ON (day) entry AS e
        FROM learning_history
       WHERE email = p_email AND kind = 'scenario'
       ORDER BY day, created_at DESC
    ) t;

  -- 노트: day별 entry text 중복 제거 후 배열로
  SELECT jsonb_object_agg(day, day_notes)
    INTO notes_obj
    FROM (
      SELECT day,
             jsonb_agg(DISTINCT entry) AS day_notes
        FROM learning_history
       WHERE email = p_email AND kind = 'note'
       GROUP BY day
    ) t;

  UPDATE users
     SET scenarios_completed = COALESCE(latest_scenarios, '[]'::jsonb),
         saved_notes = COALESCE(notes_obj, '{}'::jsonb),
         updated_at = NOW()
   WHERE email = p_email;

  RETURN jsonb_build_object(
    'scenarios', COALESCE(latest_scenarios, '[]'::jsonb),
    'notes', COALESCE(notes_obj, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION merge_scenario_completion(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION merge_saved_note(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION rebuild_user_from_history(TEXT) TO authenticated;
```

이걸 RUN하면 클라이언트 코드 수정 1줄도 없이 `saveScenarioAtomic`, `saveNoteAtomic`이 즉시 작동.
이제부터의 학습은 `learning_history`에 영구 기록되니 사고가 또 나도 `rebuild_user_from_history`로 복구 가능.

### 1-2. RLS 정책 정리

오늘 강화한 정책 원복하되 anon이 마구잡이 못 하게 RPC만 통로로:

```sql
-- users SELECT는 본인만(또는 service_role)
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select_self ON users
  FOR SELECT TO anon, authenticated
  USING (true);  -- 일단 베타 동안은 관대하게. 운영자 뷰가 anon으로 뜨므로.

-- users UPDATE는 직접 못 함. RPC(SECURITY DEFINER)만 가능
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update_blocked ON users
  FOR UPDATE TO anon, authenticated
  USING (false);
-- emergency: 본인 email 매칭 시만 허용으로 바꿔도 됨. 단 클라가 RPC 경로로 통일됐는지 먼저 확인.

-- users INSERT는 신규 가입에 필요하므로 열어둠 (중복은 unique 제약이 막음)
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert_open ON users
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);
```

핵심 변화: **JSONB 컬럼은 RPC를 통해서만 변경됨**. anon이 임의로 통째 덮어쓰기 못 함.

### 1-3. 클라이언트 outbox 패턴 (mainboard.html)

`saveCompletion`, `addNoteToDay`, `saveDailyJournal` 셋 모두에 적용.
실패한 write를 `localStorage('__OD_OUTBOX')`에 큐로 쌓고, 페이지 로드 + 60초마다 재전송.

```js
// 추가 위치: hydrateFromDb 함수 위쯤
const OUTBOX_KEY = '__OD_OUTBOX';
function pushOutbox(op) {
  try {
    const q = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    q.push({ ...op, queuedAt: Date.now() });
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(q));
    renderOutboxBadge();
  } catch (e) {}
}
function renderOutboxBadge() {
  try {
    const q = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    const el = document.getElementById('__od_outbox_badge');
    if (!el) return;
    if (q.length === 0) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = '저장 대기 ' + q.length + '건 (자동 재시도 중)';
  } catch (e) {}
}
async function flushOutbox() {
  if (!window.OD || !window.OD.enabled) return;
  let q;
  try { q = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (e) { return; }
  if (!q.length) return;
  const remaining = [];
  for (const op of q) {
    let r;
    try {
      if (op.type === 'scenario') r = await window.OD.saveScenarioAtomic(op.email, op.entry);
      else if (op.type === 'note') r = await window.OD.saveNoteAtomic(op.email, op.day, op.note);
      else if (op.type === 'journal') r = await window.OD.updateProgress(op.email, { daily_journals: op.dailyJournals });
    } catch (e) { r = { ok: false }; }
    if (!r || !r.ok) remaining.push(op);
  }
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
  renderOutboxBadge();
}
setInterval(flushOutbox, 60_000);
window.addEventListener('online', flushOutbox);
setTimeout(flushOutbox, 1500);
```

그리고 기존 save 함수에서 RPC 실패 시 `pushOutbox`로 큐잉. 예시 (`saveCompletion` 안):

```js
if (window.OD && window.OD.enabled && window.OD.saveScenarioAtomic && u.email) {
  window.OD.saveScenarioAtomic(u.email, entry).then(r => {
    if (!r || !r.ok) pushOutbox({ type: 'scenario', email: u.email, entry });
  }).catch(() => pushOutbox({ type: 'scenario', email: u.email, entry }));
}
```

UI 인디케이터 (상단에 작은 배지):
```html
<div id="__od_outbox_badge" style="display:none;position:fixed;top:8px;right:8px;background:#fef3c7;color:#92400e;padding:6px 10px;border-radius:8px;font-size:12px;z-index:9999"></div>
```

### 1-4. hydrate 가드 강화

`hydrateFromDb` 끝쪽의 푸시 결과를 받아서 localStorage에 반영, 푸시 실패 시 outbox로:

```js
if (changed && window.OD.updateProgress) {
  const r = await window.OD.updateProgress(local.email, {
    scenarios_completed: mergedCompleted,
    saved_notes: mergedNotes,
    daily_journals: mergedJournals,
  });
  if (!r || !r.ok) {
    pushOutbox({ type: 'journal', email: local.email, dailyJournals: mergedJournals });
    // 시나리오/노트도 각각 outbox로 분해해 큐잉 가능
  }
}
```

단, RLS 정책상 `updateProgress`를 막아둘 거라면 hydrate는 RPC를 호출하도록 바꿔야 함. 가장 깨끗한 건 hydrate가 끝나면 mergedCompleted 안의 each scenario를 한 번씩 `merge_scenario_completion`으로 푸시하는 방식. 동일 entry 재푸시는 history에 1행씩 더 쌓이지만 ledger는 append-only가 정상.

## Phase 2, 오픈 직후 24시간

- 운영자 페이지에 데이터 헬스 카드: 사용자별 (history 시나리오 개수 vs users.scenarios_completed 길이) 비교. 차이 나면 빨간색.
- Discord/Slack 웹훅: outbox에 5건 이상 쌓인 사용자 발견 시 운영자 알림.
- 매 6시간 Edge Function으로 `users` + `learning_history` 스냅샷을 별도 테이블 `backup_snapshots`에 dump. 30일 보관.

## Phase 3, 다음 주 안

- `users.scenarios_completed` JSONB를 별도 `scenarios` 테이블 1row=1answer 구조로 정규화. JSONB 통째 update는 영구히 폐기.
- Supabase Pro 업그레이드 검토. 50명 결제 시 본전 즉시 회수. PITR 활성화로 사고 직전 시점 복구 가능.
- 가입 후 첫 학습 데이터 저장 시 강제로 1회 더 reread (write-through 확인).

## 체크리스트, 오픈 전 반드시

- [ ] Phase 0-1, SQL로 실제 DB 상태 진단
- [ ] Phase 0-2, Backups 어제 자정 백업 존재 확인
- [ ] Phase 0-3, 베타 10명 localStorage 백업 받기
- [ ] Phase 1-1, learning_history + 3개 RPC 만들기
- [ ] Phase 1-2, RLS 원복, JSONB 변경은 RPC만 통로
- [ ] Phase 1-3, outbox 패턴 mainboard.html에 추가
- [ ] Phase 1-4, hydrate 푸시 결과 확인 가드
- [ ] 새 가입 1명 직접 테스트, history에 row 쌓이는지 확인
- [ ] 시크릿 모드에서 같은 계정 로그인, 학습 살아있는지 확인 (cross-device 보호 검증)

## 결제 50명 오픈 후, 이상 신호 모니터링

- 운영자 페이지 새로고침 시 active_24h가 결제자 수와 근사한지
- learning_history에 매 분 row가 늘고 있는지 (사용자가 학습 중이면 들어와야 정상)
- outbox 배지가 떠있는 사용자 있는지 추적

위 셋 중 하나라도 어긋나면 즉시 오픈 일시 중지 후 점검.
