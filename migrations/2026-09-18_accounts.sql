-- 계정 역할 정리 (2026-09-18)
-- 운영자: 이지흔2 · 운영팀  → is_operator = true (운영자 뷰 · dev 패널 · 개발 뷰 토글)
-- 테스트 계정: 10명 → is_tester = true, is_operator = false (통계·순위판 제외, 화면은 회원과 동일)
update users set is_operator = true, is_tester = false where lower(email) in ('jeheunlee.jen@gmail.com', 'dmsgktn0523@naver.com');
update users set is_tester = true, is_operator = false
 where name in ('이지흔', '유버디2', '유미니', '0821 테스트', '안녕', '모모', '가입테스트', '제발', '이규태씨', '테스트2');

-- 확인
select name, email, is_operator, is_dev_mode, is_tester from users
 where is_operator = true or is_tester = true or is_dev_mode = true
 order by is_operator desc, is_tester, name;
