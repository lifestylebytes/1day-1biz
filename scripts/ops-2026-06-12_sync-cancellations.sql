-- ============================================================
-- Latpeed 구독취소 8명을 Supabase에 수동 반영 (1회성)
-- Latpeed CSV(2026-06-11 다운) 기준. 취소예정일까지 접근 유지 후 만료.
-- ⚠️ 테스트 계정(유버디)은 제외함.
-- ============================================================

-- [1] 먼저 확인: 이 8명이 DB에 있고 현재 상태가 어떤지
SELECT email, name, cohort, membership_ends_at, membership_cancel_reason
FROM users
WHERE lower(email) IN (
  'suej.baek@gmail.com', 'oliviaha.hj@gmail.com', 'hj.choi7659@gmail.com',
  'ines@kdlab.kr', 'seunghee4371@gmail.com', '236979@gmail.com',
  'eszzangzz@gmail.com', 'unemje@naver.com'
)
ORDER BY email;

-- [2] 각자 취소예정일(KST 자정)까지 접근 유지 + 취소 사유 기록
--    이메일 소문자 매칭. 한 명씩 정확한 날짜로.
UPDATE users SET membership_ends_at = '2026-06-27T23:59:59+09:00', membership_cancel_reason = 'latpeed_subscription_cancelled'
  WHERE lower(email) = 'suej.baek@gmail.com';      -- 백수정
UPDATE users SET membership_ends_at = '2026-06-22T23:59:59+09:00', membership_cancel_reason = 'latpeed_subscription_cancelled'
  WHERE lower(email) = 'oliviaha.hj@gmail.com';     -- 하현주
UPDATE users SET membership_ends_at = '2026-06-21T23:59:59+09:00', membership_cancel_reason = 'latpeed_subscription_cancelled'
  WHERE lower(email) = 'hj.choi7659@gmail.com';     -- 최현진
UPDATE users SET membership_ends_at = '2026-06-21T23:59:59+09:00', membership_cancel_reason = 'latpeed_subscription_cancelled'
  WHERE lower(email) = 'ines@kdlab.kr';             -- 김혜인
UPDATE users SET membership_ends_at = '2026-06-21T23:59:59+09:00', membership_cancel_reason = 'latpeed_subscription_cancelled'
  WHERE lower(email) = 'seunghee4371@gmail.com';    -- 양승희
UPDATE users SET membership_ends_at = '2026-06-20T23:59:59+09:00', membership_cancel_reason = 'latpeed_subscription_cancelled'
  WHERE lower(email) = '236979@gmail.com';          -- 박채은
UPDATE users SET membership_ends_at = '2026-06-20T23:59:59+09:00', membership_cancel_reason = 'latpeed_subscription_cancelled'
  WHERE lower(email) = 'eszzangzz@gmail.com';       -- 김은선
UPDATE users SET membership_ends_at = '2026-06-20T23:59:59+09:00', membership_cancel_reason = 'latpeed_subscription_cancelled'
  WHERE lower(email) = 'unemje@naver.com';          -- 이정언

-- [3] 반영 확인 (8행 나와야 정상)
SELECT email, name, membership_ends_at, membership_cancel_reason
FROM users
WHERE membership_cancel_reason = 'latpeed_subscription_cancelled'
ORDER BY membership_ends_at;


-- ============================================================
-- [근본 원인 진단] 웹훅이 '구독 취소' 이벤트를 어떤 type/status로 받는지 확인
-- 결과를 보고 웹훅에 그 케이스를 추가하면 다음부턴 자동 반영됨.
-- ============================================================
SELECT type, status, apply_note, count(*) AS cnt,
       max(event_at) AS 최근
FROM latpeed_events
GROUP BY type, status, apply_note
ORDER BY 최근 DESC NULLS LAST
LIMIT 30;

-- 위 결과에서 "구독 취소"에 해당하는 type/status를 찾으면
-- (보통 apply_note가 'skipped (type=..., status=...)' 로 찍혀있음)
-- 그 type/status를 웹훅 index.ts 에 핸들러로 추가하면 됩니다.
-- 취소된 이메일들의 원본도 직접 보려면:
-- SELECT email, type, status, apply_note, raw->'payment'->>'status' AS pay_status, event_at
-- FROM latpeed_events
-- WHERE email IN ('ines@kdlab.kr','unemje@naver.com','eszzangzz@gmail.com')
-- ORDER BY event_at DESC;
