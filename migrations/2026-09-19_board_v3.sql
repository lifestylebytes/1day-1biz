-- 순위판 v3 (2026-09-19)
-- · 직급 표시를 앱과 같은 규칙으로: DB level 과 진도(day_in_company) 중 높은 쪽
--   (앱: Day 31+ 사원, Day 90+ 대리. DB level 이 더 높으면 그걸 유지)
--   v2 는 DB level 만 봐서, 승급 의례를 안 거친 회원이 Day 100 이어도 '사원/수습' 으로 나왔다.
-- · 나머지(rows/me, 20위 밖 내 순위, 테스터 제외)는 v2 와 같다. 통째로 RUN.
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
           case
             when coalesce(u.level->>'id', 'probation') = 'senior' or coalesce(u.day_in_company, 1) >= 90 then '대리'
             when coalesce(u.level->>'id', 'probation') = 'fulltime' or coalesce(u.day_in_company, 1) >= 31 then '사원'
             else '수습'
           end as rank_label
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
