-- 리텐션 엔진: 순위판 백필 (2026-09-14)
-- 목적: EXP 는 각자 앱을 열 때 기기에서 계산돼 올라오는데, 개발 뷰를 켠 사람만 계산한다.
--       그래서 지금은 순위판에 운영자만 보인다. 서버에 이미 있는 일정 체크 기록(task_progress)으로
--       최근 N일치 EXP 를 미리 채워 넣어, 활성 학습자가 전부 순위판에 보이게 한다.
-- 규칙(앱과 동일): 출근 25 · 시추에이션 100 · 미니 퀴즈 50 · 퇴근 25 · 연속 출근(전날도 완주) 50
-- 멱등키도 앱과 같아서(task:<day>:<k>, streak:<day>) 나중에 앱이 같은 걸 올려도 중복되지 않는다.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN (마지막 select 가 백필 실행 + 결과 확인)

-- 0) 같은 활동을 앱이 다시 올릴 때 시각이 더 최근이면 갱신 (예전 버전이 '가입일 + Day' 로 추정한 옛 날짜를 덮어씀)
create or replace function add_exp_event(p_email text, p_key text, p_exp int, p_kind text, p_day int, p_at timestamptz)
returns void
language sql security definer set search_path = public
as $$
  insert into exp_events (email, key, exp, kind, day, at)
  values (lower(p_email), p_key, coalesce(p_exp, 0), p_kind, p_day, coalesce(p_at, now()))
  on conflict (email, key) do update set at = greatest(exp_events.at, excluded.at);
$$;

create or replace function backfill_exp_events(p_days int default 7)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  n_task int := 0; n_streak int := 0;
begin
  -- v2: 그 Day 를 '한 시각' = 시추에이션 제출 시각 > 일지 저장 시각 > 일정 행 갱신 시각 순으로 고른다.
  --     (일정 행 갱신 시각은 복기·'이미 알아요' 저장으로도 바뀌어서, 옛 Day 가 이번 주에 한 것처럼 잡히는 걸 막는다)
  --     이미 들어간 항목도 더 이른(정확한) 시각으로 바로잡는다.
  with src as (
    select lower(tp.email) as email, tp.day, tp.tasks,
           coalesce(s.submitted_at, j.saved_at, tp.updated_at) as day_at
    from task_progress tp
    join users u on lower(u.email) = lower(tp.email)
    left join submissions s on lower(s.email) = lower(tp.email) and s.day = tp.day
    left join journals j on lower(j.email) = lower(tp.email) and j.day = tp.day
    where tp.updated_at >= now() - (p_days || ' days')::interval
      and coalesce(u.is_tester, false) = false
  ),
  rows_ as (
    select email, day, 'task:' || day || ':checkin'  as key, 25  as exp, 'task' as kind, day_at from src where coalesce(tasks->>'checkin','')  = 'true'
    union all
    select email, day, 'task:' || day || ':scenario' as key, 100 as exp, 'task', day_at from src where coalesce(tasks->>'scenario','') = 'true'
    union all
    select email, day, 'task:' || day || ':wrapup'   as key, 25  as exp, 'task', day_at from src where coalesce(tasks->>'wrapup','')   = 'true'
    union all
    select email, day, 'task:' || day || ':quiz'     as key, 50  as exp, 'task', day_at from src
     where coalesce(tasks->>'mission','') = 'true' or coalesce(tasks->>'afternoon','') = 'true'
        or coalesce(tasks->>'lunch','') = 'true' or coalesce(tasks->>'recap','') = 'true'
  ),
  ins as (
    insert into exp_events (email, key, exp, kind, day, at)
    select email, key, exp, kind, day, day_at from rows_
    on conflict (email, key) do update set at = least(exp_events.at, excluded.at)
    returning 1
  )
  select count(*) into n_task from ins;

  -- 연속 출근: 그 Day 와 전날 Day 둘 다 완주(체크 4개 이상)
  with done as (
    select lower(tp.email) as email, tp.day,
           coalesce(s.submitted_at, j.saved_at, tp.updated_at) as day_at
    from task_progress tp
    join users u on lower(u.email) = lower(tp.email)
    left join submissions s on lower(s.email) = lower(tp.email) and s.day = tp.day
    left join journals j on lower(j.email) = lower(tp.email) and j.day = tp.day
    where coalesce(u.is_tester, false) = false
      and (select count(*) from jsonb_each_text(tp.tasks) t where t.value = 'true' and left(t.key, 1) <> '_') >= 4
  ),
  pairs as (
    select d.email, d.day, d.day_at
    from done d
    join done p on p.email = d.email and p.day = d.day - 1
    where d.day_at >= now() - (p_days || ' days')::interval
  ),
  ins2 as (
    insert into exp_events (email, key, exp, kind, day, at)
    select email, 'streak:' || day, 50, 'streak', day, day_at from pairs
    on conflict (email, key) do update set at = least(exp_events.at, excluded.at)
    returning 1
  )
  select count(*) into n_streak from ins2;

  return jsonb_build_object('touched_task', n_task, 'touched_streak', n_streak,
    'people_on_board', (select count(distinct email) from exp_events where at >= now() - interval '7 days'));
end;
$$;
revoke all on function backfill_exp_events(int) from public;   -- 운영자가 SQL Editor 에서만 실행 (anon 에 안 줌)

-- 실행 + 결과 (최근 7일)
select backfill_exp_events(7);

-- 확인: 순위판 상위 20
select get_weekly_board(null, 20);

-- 진단: 최근 7일 EXP 가 있는데 순위판에 안 보이는 사람 찾기 (is_tester 이거나 users 에 없는 이메일)
select e.email, sum(e.exp) as exp7, u.name, u.is_tester, (u.email is null) as not_in_users
  from exp_events e left join users u on lower(u.email) = e.email
 where e.at >= now() - interval '7 days'
 group by e.email, u.name, u.is_tester, u.email
 order by exp7 desc;
