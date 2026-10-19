-- ============================================================
-- 2026-10-19 출근 달력: 날짜 기록 없는 Day 를 추정 날짜로 채우기
-- 문제: 10/8 전에 '문장만 내고' 또는 '일정 4개로만' 끝낸 Day 는 완주 시각 · 일지 시각이 없어서
--       달력 칸에 못 들어가고 '날짜 기록 없음' 으로 따로 모였다.
-- 해결: get_attendance_calendar 의 Day 날짜를 아래 순서로 채운다 (앞에 있을수록 정확).
--   1) task_progress.completed_at   서버 완주 시각          src = 'server'
--   2) journals.first_saved_at      일지 처음 작성 시각      src = 'journal'
--   3) submissions.submitted_at     문장 제출 시각 (추정)    src = 'submission'
--   4) task_progress.updated_at     일정 마지막 저장 (추정)  src = 'progress'
--   3) · 4) 는 추정이다. 기기 기록을 한꺼번에 올린 경우 실제 공부한 날과 다를 수 있다.
--   운영자 뷰는 추정 칩을 점선 + '추정' 으로, 회원 화면은 일반 날짜와 똑같이 보여준다.
-- 나머지(signup, att, items, acts)는 20261008_attendance_calendar.sql 과 같다.
-- 실행: Supabase Dashboard -> SQL Editor -> 통째로 RUN. 웹 배포 전후 아무 때나 (옛 화면도 그대로 동작). 개인정보·키 없음.
-- ============================================================

create or replace function get_attendance_calendar(p_email text)
returns jsonb
language sql security definer stable set search_path = public
as $$
  with done as (
    select day from submissions s where lower(s.email) = lower(p_email) and coalesce(s.answer_text, '') <> ''
    union
    select day from journals j where lower(j.email) = lower(p_email) and coalesce(j.text, '') <> ''
    union
    select day from task_progress tp where lower(tp.email) = lower(p_email) and _tp_done_count(tp.tasks) >= 4
  ),
  dd as (
    select d.day,
           tp.completed_at,
           j.first_saved_at,
           (select min(coalesce(s.submitted_at, s.updated_at)) from submissions s
             where lower(s.email) = lower(p_email) and s.day = d.day and coalesce(s.answer_text, '') <> '') as sub_at,
           case when _tp_done_count(tp.tasks) >= 4 then tp.updated_at end as tp_at
      from done d
      left join task_progress tp on lower(tp.email) = lower(p_email) and tp.day = d.day
      left join journals j on lower(j.email) = lower(p_email) and j.day = d.day and coalesce(j.text, '') <> ''
  )
  select jsonb_build_object(
    'signup', (select signup_date from users where lower(email) = lower(p_email) limit 1),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
                'day', day,
                'at', coalesce(completed_at, first_saved_at, sub_at, tp_at),
                'src', case when completed_at is not null then 'server'
                            when first_saved_at is not null then 'journal'
                            when sub_at is not null then 'submission'
                            when tp_at is not null then 'progress' end) order by day), '[]'::jsonb)
             from dd),
    'att', (select coalesce(jsonb_agg(distinct substr(e.key, 5)), '[]'::jsonb)
              from exp_events e where e.email = lower(p_email) and e.key like 'att:____-__-__'),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item', item, 'dates', dates, 'used_at', used_at) order by used_at), '[]'::jsonb)
                from item_uses where lower(email) = lower(p_email)),
    'acts', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'activity', activity, 'at', at, 'client_at', client_at, 'detail', detail) order by day, at), '[]'::jsonb)
               from activity_log where lower(email) = lower(p_email))
  );
$$;
revoke all on function get_attendance_calendar(text) from public;
grant execute on function get_attendance_calendar(text) to anon, authenticated;

-- 확인 (아무 이메일이나): src 가 submission / progress 인 Day 가 추정 날짜
-- select x->>'day' as day, x->>'at' as at, x->>'src' as src
--   from jsonb_array_elements(get_attendance_calendar('you@example.com')->'days') x
--  where x->>'src' in ('submission', 'progress') or x->>'at' is null;
