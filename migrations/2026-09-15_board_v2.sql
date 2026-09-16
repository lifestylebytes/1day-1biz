-- 순위판 v2 (2026-09-15)
-- · 직급 표시(rank_label: 수습/사원/대리) · 내가 목록(상위 N) 밖이면 me 로 내 순위를 따로 준다
-- · 반환이 배열 → { rows, me } 객체로 바뀐다 (앱은 둘 다 읽음)
create or replace function get_weekly_board(p_email text, p_limit int default 50)
returns jsonb
language sql security definer stable set search_path = public
as $$
  with wk as (select now() - interval '7 days' as start_at),
  agg as (
    select e.email, sum(e.exp) as exp
    from exp_events e, wk
    where e.at >= wk.start_at
    group by e.email
  ),
  vis as (
    select a.email, a.exp, u.name, u.day_in_company,
           case when coalesce(u.level->>'id', 'probation') = 'senior' then '대리'
                when coalesce(u.level->>'id', 'probation') = 'fulltime' then '사원' else '수습' end as rank_label
    from agg a
    join users u on lower(u.email) = a.email
    where coalesce(u.is_tester, false) = false
  ),
  ranked as (select *, rank() over (order by exp desc) as rk from vis),
  rowj as (
    select rk, jsonb_build_object(
      'rank', rk,
      'masked', case when name is null or name = '' then '익명' else left(name, 1) || repeat('○', greatest(char_length(name) - 1, 1)) end,
      'exp', exp, 'day', day_in_company, 'rank_label', rank_label,
      'is_me', (p_email is not null and email = lower(p_email)),
      'badge', case when rk = 1 then '1위' else null end
    ) as j, email
    from ranked
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(j order by rk) from (select * from rowj order by rk limit greatest(coalesce(p_limit, 50), 1)) x), '[]'::jsonb),
    'me', (select j from rowj where p_email is not null and email = lower(p_email)
             and rk > greatest(coalesce(p_limit, 50), 1) limit 1)
  );
$$;
revoke all on function get_weekly_board(text, int) from public;
grant execute on function get_weekly_board(text, int) to anon, authenticated;
