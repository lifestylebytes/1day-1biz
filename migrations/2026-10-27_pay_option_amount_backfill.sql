-- ============================================================
-- 1일1비, 운영자 뷰 '구매 옵션 · 결제 금액' 표시용 백필 (2026-10-27)
-- 실행: Supabase Dashboard, SQL Editor, 통째로 RUN (여러 번 돌려도 같은 결과)
--
-- 장기권(단건) 결제자는 웹훅이 이미 preferences.plan_option / plan_amount 를 남겨서 따로 할 게 없다.
-- 월 구독 결제자는 지금까지 금액·옵션을 안 남겼으니, 래피드 웹훅 로그(latpeed_events)의
-- 마지막 성공 결제에서 last_option / last_amount 를 채운다. 장기권 기록이 있는 계정은 건드리지 않는다.
-- ============================================================

WITH last_pay AS (
  SELECT DISTINCT ON (lower(e.email))
    lower(e.email) AS email,
    e.amount,
    NULLIF(COALESCE(NULLIF(e.option_text, 'sheet-sync'), e.raw->'membership'->>'name'), '') AS option_text
  FROM latpeed_events e
  WHERE e.type = 'MEMBERSHIP_PAYMENT'
    AND (e.status = 'SUCCESS' OR e.raw->>'subtype' IN ('PAYMENT_SUCCESS', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_RECOVERED'))
    AND e.amount IS NOT NULL
  ORDER BY lower(e.email), e.event_at DESC NULLS LAST, e.id DESC
)
UPDATE users u
SET preferences = COALESCE(u.preferences, '{}'::jsonb)
  || jsonb_build_object('last_amount', lp.amount)
  || CASE WHEN lp.option_text IS NOT NULL THEN jsonb_build_object('last_option', lp.option_text) ELSE '{}'::jsonb END
FROM last_pay lp
WHERE lower(u.email) = lp.email
  AND u.cohort = 'member'
  AND (u.preferences->>'plan_amount') IS NULL
  AND (u.preferences->>'last_amount') IS NULL;

-- 확인
-- SELECT email, preferences->>'plan_option', preferences->>'plan_amount', preferences->>'last_option', preferences->>'last_amount'
-- FROM users WHERE cohort = 'member' ORDER BY (preferences->>'last_paid_at') DESC NULLS LAST LIMIT 20;
