-- ============================================================
-- 베타테스터 7명 종료일 통일: 2026-07-10 (KST 자정까지)
-- 김가연, 이근나, 김원미, 진여송, 정주혜, 김민희 + 이규태
-- 두 번 실행해도 같은 값이라 안전 (날짜 고정 방식).
-- 실행 위치: Supabase Dashboard > SQL Editor
-- ============================================================
UPDATE users
SET membership_ends_at = '2026-07-10T23:59:59+09:00'
WHERE email IN (
  'rlarkdus8627@gmail.com',  -- 김가연
  'dev-lena@kakao.com',      -- 이근나
  'mydream354@naver.com',    -- 김원미
  'hisong5430@naver.com',    -- 진여송
  'juhyejoung@gmail.com',    -- 정주혜
  'pheobe2323@naver.com'     -- 김민희
)
   OR name = '이규태'          -- 이메일 미확보, 이름 매칭
RETURNING name, email, membership_ends_at;

-- 결과가 7행이면 성공. 6행이면 '이규태' 이름 표기를 확인하세요:
-- SELECT name, email FROM users WHERE name LIKE '%규태%';
