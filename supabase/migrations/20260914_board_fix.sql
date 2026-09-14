-- 순위판 손질 (2026-09-14 저녁)
-- 1) 순위 번호: 테스터를 뺀 뒤에 매긴다 (전엔 빼기 전에 매겨서 2위가 비는 식으로 구멍이 났다)
create or replace function get_weekly_board(p_email text, p_limit int default 50)
returns jsonb
language sql security definer stable set search_path = public
as $$
  with wk as (
    select now() - interval '7 days' as start_at
  ),
  agg as (
    select e.email, sum(e.exp) as exp
    from exp_events e, wk
    where e.at >= wk.start_at
    group by e.email
  ),
  vis as (
    select a.email, a.exp, u.name, u.day_in_company
    from agg a
    join users u on lower(u.email) = a.email
    where coalesce(u.is_tester, false) = false
  ),
  ranked as (
    select *, rank() over (order by exp desc) as rk from vis
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'rank', rk,
      'masked', case when name is null or name = '' then '익명' else left(name, 1) || repeat('○', greatest(char_length(name) - 1, 1)) end,
      'exp', exp,
      'day', day_in_company,
      'is_me', (p_email is not null and email = lower(p_email)),
      'badge', case when rk = 1 then '1위' else null end
    ) order by rk
  ), '[]'::jsonb)
  from (select * from ranked order by rk limit greatest(coalesce(p_limit, 50), 1)) x;
$$;
revoke all on function get_weekly_board(text, int) from public;
grant execute on function get_weekly_board(text, int) to anon, authenticated;

-- 2) '이지흔 2' 는 테스터가 아니라 실제 학습 계정 → 순위판에 보이게
update users set is_tester = false where lower(email) = 'jeheunlee.jen@gmail.com';

-- 3) 운영팀 계정: 서버에 올라간 최근 7일 EXP 항목 (앱의 '내 EXP 내역' 과 비교용)
select key, exp, kind, day, at
  from exp_events
 where email = 'dmsgktn0523@naver.com' and at >= now() - interval '7 days'
 order by at desc;
