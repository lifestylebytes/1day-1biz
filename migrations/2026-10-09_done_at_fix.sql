-- ============================================================
-- 2026-10-09 완주 시각(task_progress.completed_at) 보정
-- 문제: 배포 전에 완주한 Day 를 다른 기기가 다시 저장하면 서버는 '처음 완주' 로 보고 지금 시각을 적었다.
--       앱이 그 시각을 받아 옛 Day 의 출근 날짜를 오늘로 옮겨 연속 출근이 끊기고 내 목표가 실패 처리됐다.
-- 해결: 기기가 보낸 완주 시각이 48시간보다 오래된 것이면(= 예전에 끝낸 Day) 시각을 적지 않고 비워 둔다 (지어내지 않음).
--       48시간 안이면 그 시각, 없으면 서버 도착 시각 (기존과 같음).
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================
create or replace function save_task_progress(p_email text, p_day int, p_tasks jsonb, p_done_at timestamptz default null)
returns task_progress
language plpgsql security definer set search_path = public
as $$
declare
  r task_progress;
  was_done boolean := false;
begin
  if p_email is null or p_day is null then
    raise exception 'invalid input';
  end if;
  select _tp_done_count(tp.tasks) >= 4 into was_done
    from task_progress tp where tp.email = p_email and tp.day = p_day;
  was_done := coalesce(was_done, false);

  insert into task_progress(email, day, tasks)
  values (p_email, p_day, coalesce(p_tasks, '{}'::jsonb))
  on conflict (email, day) do update set
    tasks = task_progress.tasks || excluded.tasks,
    updated_at = now()
  returning * into r;

  if not was_done and r.completed_at is null and _tp_done_count(r.tasks) >= 4 then
    update task_progress
       set completed_at = case
             when p_done_at is null then now()                                   -- 시각 없이 왔으면 도착 시각
             when p_done_at < now() - interval '48 hours' then null              -- 예전에 끝낸 Day: 지어내지 않는다
             when p_done_at <= now() + interval '5 minutes' then least(p_done_at, now())
             else now()
           end
     where email = p_email and day = p_day
    returning * into r;
  elsif r.completed_at is not null and _tp_done_count(r.tasks) < 4 then
    update task_progress set completed_at = null
     where email = p_email and day = p_day
    returning * into r;
  end if;
  return r;
end;
$$;
revoke all on function save_task_progress(text, int, jsonb, timestamptz) from public;
grant execute on function save_task_progress(text, int, jsonb, timestamptz) to anon, authenticated;

-- 이미 잘못 찍힌 것 정리: 배포(10/08) 이후에 적힌 완주 시각인데 그 Day 가 배포 전에 이미 완주돼 있던 경우.
-- 앱의 exp_events 에 task:<day> 기록(실제 완주 날)이 completed_at 보다 하루 이상 이르면 completed_at 을 지운다.
update task_progress tp
   set completed_at = null
 where tp.completed_at is not null
   and exists (
     select 1 from exp_events e
      where e.email = lower(tp.email)
        and e.key like 'task:' || tp.day || ':%'
        and e.at < tp.completed_at - interval '1 day'
   );
-- 확인: select email, day, completed_at from task_progress where completed_at is not null order by completed_at desc limit 30;
