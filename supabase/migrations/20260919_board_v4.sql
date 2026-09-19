-- 순위판 v4 (2026-09-19) — v3 를 대체. 통째로 RUN (v3 를 돌렸든 아니든 상관없음)
-- · 집계 창: 한국 시간 오늘 포함 최근 7일 (앱 HUD 와 같은 창)
-- · 직급 라벨: DB level 과 진도 중 높은 쪽 (Day 31+ 사원 · Day 90+ 대리)
-- · 동점 정렬: EXP 같으면 연속 출근 일수 긴 사람 → 그다음 마지막 EXP 를 먼저 찍은 사람
-- · 배지: 창 안 7일 모두 일정 EXP 가 있으면 '이번 주 개근' (1위 배지 대신)
create or replace function get_weekly_board(p_email text, p_limit int default 50)
returns jsonb
language sql security definer stable set search_path = public
as $$
  with wk as (
    select ((date_trunc('day', now() at time zone 'Asia/Seoul') - interval '6 days') at time zone 'Asia/Seoul') as start_at,
           (date_trunc('day', now() at time zone 'Asia/Seoul'))::date as today_kst
  ),
  ev as (
    select e.email, e.exp, e.kind, e.at, (e.at at time zone 'Asia/Seoul')::date as d
    from exp_events e
  ),
  agg as (
    select v.email, sum(v.exp) as exp, max(v.at) as last_at,
           count(distinct v.d) filter (where v.kind = 'task') as task_days
    from ev v, wk
    where v.at >= wk.start_at
    group by v.email
  ),
  -- 연속 출근: 일정 EXP 가 찍힌 날짜(한국 시간)를 섬(연속 구간)으로 묶고, 오늘 또는 어제가 속한 섬의 길이
  tdays as (select distinct email, d from ev where kind = 'task'),
  isl as (select email, d, d - (row_number() over (partition by email order by d))::int as grp from tdays),
  cur as (
    select i.email, i.grp from isl i, wk
    where i.d in (wk.today_kst, wk.today_kst - 1)
    group by i.email, i.grp
  ),
  streak as (
    select i.email, count(*) as days
    from isl i join cur c on c.email = i.email and c.grp = i.grp
    group by i.email
  ),
  vis as (
    select a.email, a.exp, a.last_at, a.task_days, coalesce(s.days, 0) as streak_days, u.name, u.day_in_company,
           case
             when coalesce(u.level->>'id', 'probation') = 'senior' or coalesce(u.day_in_company, 1) >= 90 then '대리'
             when coalesce(u.level->>'id', 'probation') = 'fulltime' or coalesce(u.day_in_company, 1) >= 31 then '사원'
             else '수습'
           end as rank_label
    from agg a
    join users u on lower(u.email) = a.email
    left join streak s on s.email = a.email
    where coalesce(u.is_tester, false) = false
  ),
  ranked as (select *, row_number() over (order by exp desc, streak_days desc, last_at asc) as rk from vis),
  rowj as (
    select rk, jsonb_build_object(
      'rank', rk,
      'masked', case when name is null or name = '' then '익명' else left(name, 1) || repeat('○', greatest(char_length(name) - 1, 1)) end,
      'exp', exp, 'day', day_in_company, 'rank_label', rank_label, 'streak', streak_days,
      'is_me', (p_email is not null and email = lower(p_email)),
      'badge', case when task_days >= 7 then '이번 주 개근' when rk = 1 then '1위' else null end
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
