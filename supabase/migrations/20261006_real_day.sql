-- ============================================================
-- 2026-10-06 실제 학습 Day (real_day)
-- 문제: 운영자 뷰 '앱 Day'(day_in_company)는 접속 때만 올라가고 내려가지 않아서, 회원 화면의 오늘 Day 와 어긋났다.
-- 해결: 1) users 에 real_day(회원 화면에 떠 있는 오늘 Day) + real_day_at(받은 시각) 칸 추가. day_in_company 는 그대로 둔다.
--       2) save_real_day: 앱이 보낸 값으로 덮어쓰기 (큰 값만 받는 방식 아님)
--       3) get_progress_overview: 앱과 같은 완주 기준(일지 또는 일정 4개)의 Day 목록(gate_done) 추가 → 운영자 뷰가 '저장된 값에서 이어 세기' 에 사용
--       4) 순위판(get_weekly_board, v5 대체): 직급과 Day 숫자를 real_day 기준으로. real_day 가 아직 없는 회원은 예전처럼 day_in_company
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================

-- 1) 새 칸
alter table users add column if not exists real_day int;
alter table users add column if not exists real_day_at timestamptz;

-- 2) 앱이 보내는 실제 학습 Day 받기 (덮어쓰기)
create or replace function save_real_day(p_email text, p_day int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_email is null or p_day is null or p_day < 1 or p_day > 400 then
    return;
  end if;
  update users
     set real_day = p_day,
         real_day_at = now()
   where lower(email) = lower(p_email);
end;
$$;
revoke all on function save_real_day(text, int) from public;
grant execute on function save_real_day(text, int) to anon, authenticated;

-- 3) 운영자 뷰: 완주 Day 목록(done, 기존) + 앱 기준 완주 Day 목록(gate_done, 새로) + 마지막 학습 시각
create or replace function get_progress_overview()
returns jsonb
language sql security definer stable set search_path = public
as $$
  with d as (
    select lower(email) as email, day, updated_at as at, false as gate from submissions where coalesce(answer_text, '') <> ''
    union all
    select lower(email), day, saved_at, true from journals where coalesce(text, '') <> ''
    union all
    select lower(tp.email), tp.day, tp.updated_at, true from task_progress tp
     where (select count(*) from jsonb_each_text(tp.tasks) t where t.value = 'true' and left(t.key, 1) <> '_') >= 4
  )
  select coalesce(jsonb_agg(jsonb_build_object('email', email, 'done', days, 'gate_done', gate_days, 'last_study_at', last_at)), '[]'::jsonb)
  from (
    select email,
           jsonb_agg(distinct day) as days,
           coalesce(jsonb_agg(distinct day) filter (where gate), '[]'::jsonb) as gate_days,
           max(at) as last_at
    from d group by email
  ) x;
$$;
revoke all on function get_progress_overview() from public;
grant execute on function get_progress_overview() to anon, authenticated;

-- 4) 순위판 v6 (v5 와 같고, 직급·Day 숫자만 real_day 기준. 없으면 day_in_company)
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
    select a.email, a.exp, a.last_at, a.task_days, coalesce(s.days, 0) as streak_days, u.name,
           coalesce(u.real_day, u.day_in_company) as show_day,
           case
             when coalesce(u.level->>'id', 'probation') = 'senior' or coalesce(u.real_day, u.day_in_company, 1) >= 90 then '대리'
             when coalesce(u.level->>'id', 'probation') = 'fulltime' or coalesce(u.real_day, u.day_in_company, 1) >= 31 then '사원'
             else '수습'
           end as rank_label
    from agg a
    join users u on lower(u.email) = a.email
    left join streak s on s.email = a.email
    where coalesce(u.is_operator, false) = false
  ),
  ranked as (select *, row_number() over (order by exp desc, streak_days desc, last_at asc) as rk from vis),
  rowj as (
    select rk, jsonb_build_object(
      'rank', rk,
      'masked', case when name is null or name = '' then '익명' else left(name, 1) || repeat('○', greatest(char_length(name) - 1, 1)) end,
      'exp', exp, 'day', show_day, 'rank_label', rank_label, 'streak', streak_days,
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

-- 확인: select email, day_in_company, real_day, real_day_at from users order by real_day_at desc nulls last limit 20;
