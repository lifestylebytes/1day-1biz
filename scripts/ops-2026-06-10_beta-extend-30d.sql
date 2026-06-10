-- ============================================================
-- 베타 30일 연장: 정주혜, 진여송, 이근나, 김가연, 김원미
-- 실행 위치: Supabase Dashboard > SQL Editor
-- 원리: PILOT 사용자는 membership_ends_at이 미래면 베타 만료 화면이
--       안 뜨고, 운영자 뷰에 "🟢 베타 연장"으로 표시됨.
-- ============================================================

-- 1) 먼저 확인: 정확히 5명인지, 이름 오타·동명이인 없는지
SELECT name, email, day_in_company, membership_ends_at, cohort, is_pilot_hire
FROM users
WHERE name IN ('정주혜', '진여송', '이근나', '김가연', '김원미');

-- 2) 5명 맞으면 실행: 30일 연장
--    이미 연장이 남아있으면 그 종료일부터 +30일, 없거나 지났으면 오늘부터 +30일.
--    정식 결제 회원(cohort='member')은 제외 (ends_at이 결제일 의미라서).
UPDATE users
SET membership_ends_at = GREATEST(COALESCE(membership_ends_at, NOW()), NOW()) + INTERVAL '30 days'
WHERE name IN ('정주혜', '진여송', '이근나', '김가연', '김원미')
  AND COALESCE(cohort, '') <> 'member'
RETURNING name, email, membership_ends_at;
