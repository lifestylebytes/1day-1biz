-- 멤버십 상태 조회 RPC (2026-08-18)
-- 배경: 로그인 세션이 없으면 users 테이블 직접 조회가 RLS에 막혀 빈 결과가 되고,
--       membership_ends_at이 사용자 브라우저로 동기화되지 않아 구독 종료자가
--       만료 잠금 없이 계속 이용하는 구멍이 있었음 (fail-open).
-- 해결: 이메일 + 사번(emp_number)이 모두 일치할 때만 본인 row를 돌려주는
--       SECURITY DEFINER RPC. 타인 이메일만으로는 조회 불가.
-- Supabase SQL Editor에서 실행.

create or replace function get_membership_status(p_email text, p_emp text)
returns setof users
language sql
security definer
set search_path = public
as $$
  select * from users
  where lower(email) = lower(trim(p_email))
    and (emp_number = p_emp)
  limit 1;
$$;

grant execute on function get_membership_status(text, text) to anon, authenticated;
