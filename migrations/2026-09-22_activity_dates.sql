-- ============================================================
-- 2026-09-22 출근 날짜 서버 복원 RPC
-- 문제: 일정 완주 "시각"(__OD_TASKS_DAY_n_ts)은 기기 localStorage 에만 있어서, 새 기기·새 브라우저·캐시 삭제 뒤
--       첫 접속이면 앱이 "가입일 + Day 순번" 으로 날짜를 지어냈다 → 연속 출근·결근 판정·내 목표가 어긋남.
-- 해결: exp_events 에 이미 쌓여 있는 실제 완주 시각(task:<day>:*)과 아이템 방어로 인정된 날(att:<date>)을 내려준다.
--       앱은 기기에 비어 있는 날짜만 이걸로 채운다.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN. 개인정보·키 없음.
-- ============================================================

create or replace function get_activity_dates(p_email text)
returns jsonb
language sql security definer stable set search_path = public
as $$
  select jsonb_build_object(
    'task_days',
      (select coalesce(jsonb_object_agg(t.day::text, jsonb_build_object('n', t.n, 'at', t.at)), '{}'::jsonb)
         from (
           select e.day, count(distinct e.key) as n, max(e.at) as at
           from exp_events e
           where e.email = lower(p_email)
             and e.kind = 'task' and e.day is not null and e.key like 'task:%'
           group by e.day
         ) t),
    'att',
      (select coalesce(jsonb_agg(substr(e.key, 5) order by e.key), '[]'::jsonb)
         from exp_events e
         where e.email = lower(p_email) and e.key like 'att:____-__-__')
  );
$$;
revoke all on function get_activity_dates(text) from public;
grant execute on function get_activity_dates(text) to anon, authenticated;

-- 확인 (아무 이메일이나): select get_activity_dates('you@example.com');
