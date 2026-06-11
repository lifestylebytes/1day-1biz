-- ============================================================
-- 공지 이메일 발송용 수신자 리스트 추출 (읽기 전용)
-- Supabase Dashboard > SQL Editor 에서 실행 → 결과 CSV로 export
-- ※ 마케팅·운영 메일은 수신 동의 범위 안에서만 발송하세요.
-- ============================================================

-- [A] 가장 무난한 기준: 탈퇴 안 한 모든 실사용자
--    (운영자/Dev/테스터 제외, 이메일 있는 사람)
SELECT name, email, day_in_company, cohort, last_active
FROM users
WHERE email IS NOT NULL
  AND withdrawn_at IS NULL
  AND COALESCE(is_operator, false) = false
  AND COALESCE(is_dev_mode, false) = false
  AND COALESCE(is_tester,  false) = false
ORDER BY last_active DESC NULLS LAST;


-- [B] "최근 학습 중"으로 좁히기: 최근 14일 안에 활동한 사람만
--    (위 결과가 너무 많거나, 휴면 유저 빼고 싶을 때)
-- SELECT name, email, day_in_company, last_active
-- FROM users
-- WHERE email IS NOT NULL
--   AND withdrawn_at IS NULL
--   AND COALESCE(is_operator, false) = false
--   AND COALESCE(is_dev_mode, false) = false
--   AND COALESCE(is_tester,  false) = false
--   AND last_active >= NOW() - INTERVAL '14 days'
-- ORDER BY last_active DESC;


-- [C] 베타(PILOT) 참여자만
-- SELECT name, email, day_in_company, membership_ends_at
-- FROM users
-- WHERE email IS NOT NULL
--   AND withdrawn_at IS NULL
--   AND is_pilot_hire = true
-- ORDER BY day_in_company DESC;


-- [D] 이메일만 한 줄로 (메일 클라이언트에 바로 붙여넣기용, 콤마 구분)
-- SELECT string_agg(email, ', ' ORDER BY email) AS recipients
-- FROM users
-- WHERE email IS NOT NULL
--   AND withdrawn_at IS NULL
--   AND COALESCE(is_operator, false) = false
--   AND COALESCE(is_dev_mode, false) = false
--   AND COALESCE(is_tester,  false) = false;

-- 발송 팁: 단체 메일은 받는 사람을 BCC(숨은참조)에 넣으세요.
-- 서로의 이메일이 노출되지 않습니다.
