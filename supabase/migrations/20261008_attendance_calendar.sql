-- ============================================================
-- 2026-10-08 출근 날짜 바로잡기 + 운영자 뷰 출근 달력
-- 문제: 완주 "시각"이 기기에만 있어서, 새 기기·캐시 삭제 뒤엔 앱이 "가입일 + (Day-1)일" 로 날짜를 지어냈다.
--       (출근부·연속 출근·결근·아이템 판정이 이 가짜 날짜로 돌아감)
-- 해결 (배포 이후 완주분부터):
--   1) task_progress.completed_at: 그 Day 일정 4개가 "처음" 다 끝난 시각을 서버가 한 번만 적는다.
--      앱이 보낸 완주 시각(p_done_at)은 서버 도착 시각보다 이르고 48시간 이내일 때만 인정 (오프라인 완주 대응).
--      그 밖이면 서버 도착 시각. 배포 전에 이미 완주된 Day 는 비워 둔다 (과거는 지어내지 않음).
--   2) get_user_full_data 의 task_progress 에 _done_at 을 같이 실어 보낸다 ("어느 Day + 언제" 를 한 번에).
--   3) journals.first_saved_at: 일지 처음 작성 시각. 고쳐도 안 바뀜. 기존 일지는 지금 저장 시각으로 고정.
--   4) item_uses: 결근 방어에 쓴 아이템 이름(연장권·연차·휴가)과 방어한 날짜.
--   5) activity_log: 오늘 일정 활동(출근·시추에이션·14시 활동·내 시추에이션+퇴근·Review Quiz·내일 문장 쓰기)을
--      끝낸 시각과 Day 번호. 기기 시각은 1)과 같은 48시간 규칙으로 인정하고, 원본(client_at)도 같이 남긴다.
--   6) get_attendance_calendar(email): 운영자 뷰 출근 달력용 (Day별 날짜·출처, 방어일, 아이템 사용, 활동 시각).
-- 실행: Supabase Dashboard -> SQL Editor -> 통째로 RUN. 웹 배포보다 "먼저" 실행. 개인정보·키 없음.
-- ============================================================

-- 일정 체크 개수 (_ 로 시작하는 메타 키 제외, 앱·운영자 뷰와 같은 기준)
create or replace function _tp_done_count(p_tasks jsonb)
returns int
language sql immutable set search_path = public
as $$
  select count(*)::int from jsonb_each_text(coalesce(p_tasks, '{}'::jsonb)) t
   where t.value = 'true' and left(t.key, 1) <> '_';
$$;

-- 1) 완주 시각 칸
alter table task_progress add column if not exists completed_at timestamptz;

-- 1-1) save_task_progress: p_done_at 추가 (기본값 null 이라 옛 앱의 3개 인자 호출도 그대로 동작)
drop function if exists save_task_progress(text, int, jsonb);
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

  -- 이번 저장 "전에" 이미 완주였는지 (배포 전 완주 Day 를 다시 저장해도 지금 시각이 찍히지 않게)
  select _tp_done_count(tp.tasks) >= 4 into was_done
    from task_progress tp where tp.email = p_email and tp.day = p_day;
  was_done := coalesce(was_done, false);

  insert into task_progress(email, day, tasks)
  values (p_email, p_day, coalesce(p_tasks, '{}'::jsonb))
  on conflict (email, day) do update set
    tasks = task_progress.tasks || excluded.tasks,
    updated_at = now()
  returning * into r;

  -- 이번 저장으로 처음 완주가 된 경우에만, 한 번만 기록
  if not was_done and r.completed_at is null and _tp_done_count(r.tasks) >= 4 then
    update task_progress
       set completed_at = case
             when p_done_at is not null
              and p_done_at <= now() + interval '5 minutes'   -- 폰 시계가 조금 빠른 정도는 허용
              and p_done_at >= now() - interval '48 hours'
             then least(p_done_at, now())
             else now()
           end
     where email = p_email and day = p_day
    returning * into r;
  -- 일정 비우기(개발용 초기화: 체크를 false 로 덮어씀)로 완주가 풀리면 시각도 지운다 → 다시 완주하면 새로 찍힘
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

-- 2) get_user_full_data: task_progress 에 _done_at 같이 실어 보내기 (나머지는 기존과 동일)
create or replace function get_user_full_data(p_email text)
returns jsonb
language sql security definer set search_path = public
as $$
  select jsonb_build_object(
    'submissions',
      (select coalesce(jsonb_agg(row_to_json(s.*) order by s.day), '[]'::jsonb)
         from submissions s where s.email = p_email),
    'notes',
      (select coalesce(jsonb_agg(row_to_json(n.*) order by n.day, n.created_at), '[]'::jsonb)
         from notes n where n.email = p_email),
    'journals',
      (select coalesce(jsonb_agg(row_to_json(j.*) order by j.day), '[]'::jsonb)
         from journals j where j.email = p_email),
    'notice_reads',
      (select coalesce(jsonb_agg(notice_key), '[]'::jsonb)
         from notice_reads_v2 where email = p_email),
    'task_progress',
      (select coalesce(jsonb_object_agg(
                day::text,
                case when completed_at is not null
                     then tasks || jsonb_build_object('_done_at', completed_at)
                     else tasks end), '{}'::jsonb)
         from task_progress where email = p_email)
  );
$$;
grant execute on function get_user_full_data(text) to anon, authenticated;

-- 3) 일지 처음 작성 시각 (save_journal 은 이 칸을 건드리지 않으므로 처음 insert 때 기본값으로 한 번만 찍힌다)
alter table journals add column if not exists first_saved_at timestamptz;
update journals set first_saved_at = saved_at where first_saved_at is null;   -- 기존 일지: 지금 저장 시각으로 고정
alter table journals alter column first_saved_at set default now();

-- 4) 아이템 사용 기록
create table if not exists item_uses (
  id       bigserial primary key,
  email    text not null,
  item     text not null,                         -- extend(연장권) / annual(연차) / vacay(휴가)
  dates    jsonb not null default '[]'::jsonb,    -- 방어한 날짜들 ["2026-10-05", ...]
  used_at  timestamptz not null default now()
);
create unique index if not exists uq_item_uses on item_uses (lower(email), item, dates);
create index if not exists idx_item_uses_email on item_uses (lower(email));
alter table item_uses enable row level security;
drop policy if exists item_uses_block on item_uses;
create policy item_uses_block on item_uses for all using (false) with check (false);

create or replace function log_item_use(p_email text, p_item text, p_dates jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if p_email is null or p_item not in ('extend', 'annual', 'vacay')
     or p_dates is null or jsonb_typeof(p_dates) <> 'array' then
    return jsonb_build_object('ok', false);
  end if;
  insert into item_uses(email, item, dates)
  values (lower(p_email), p_item, p_dates)
  on conflict do nothing;   -- 같은 사용을 다시 보내도 한 번만
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function log_item_use(text, text, jsonb) from public;
grant execute on function log_item_use(text, text, jsonb) to anon, authenticated;

-- 5) 활동별 학습 시각 (2026-10-08 추가)
--    한 줄 = 활동 한 번. 같은 활동을 같은 기기 시각으로 다시 보내면(재전송) 한 번만 남는다.
create table if not exists activity_log (
  id          bigserial primary key,
  email       text not null,
  day         int not null,                          -- 그 활동이 속한 Day (몇 일차 것을 했는지)
  activity    text not null,                         -- checkin / scenario / slot3 / wrapup / review_quiz / pre_write
  at          timestamptz not null,                  -- 학습 시각으로 인정한 값
  client_at   timestamptz,                           -- 기기가 보낸 시각 원본 (오프라인이면 끝낸 순간)
  received_at timestamptz not null default now(),    -- 서버 도착 시각
  detail      jsonb                                  -- slot3 의 실제 활동 종류, Review Quiz 몇 번째 응시 등
);
create unique index if not exists uq_activity_log on activity_log (lower(email), day, activity, client_at);
create index if not exists idx_activity_log_email_day on activity_log (lower(email), day);
alter table activity_log enable row level security;
drop policy if exists activity_log_block on activity_log;
create policy activity_log_block on activity_log for all using (false) with check (false);

create or replace function log_activity(p_email text, p_day int, p_activity text, p_at timestamptz default null, p_detail jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if p_email is null or p_day is null or p_day < 1 or p_day > 400
     or p_activity not in ('checkin', 'scenario', 'slot3', 'wrapup', 'review_quiz', 'pre_write') then
    return jsonb_build_object('ok', false);
  end if;
  insert into activity_log(email, day, activity, at, client_at, detail)
  values (
    lower(p_email), p_day, p_activity,
    case
      when p_at is not null
       and p_at <= now() + interval '5 minutes'
       and p_at >= now() - interval '48 hours'
      then least(p_at, now())
      else now()
    end,
    p_at, p_detail)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function log_activity(text, int, text, timestamptz, jsonb) from public;
grant execute on function log_activity(text, int, text, timestamptz, jsonb) to anon, authenticated;

-- 6) 운영자 뷰 출근 달력 (한 사람분)
--    days: 완주한 Day 마다 { day, at, src }
--          src = 'server'  : 서버 완주 시각 (배포 이후 완주)
--                'journal' : 일지 처음 작성 시각 (배포 전 완주)
--                null      : 날짜 기록 없음
--    att:   아이템으로 출근 인정된 날짜 목록
--    items: 아이템 사용 기록 (배포 이후부터 쌓임)
--    acts:  활동별 학습 시각 (배포 이후부터 쌓임)
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
           j.first_saved_at
      from done d
      left join task_progress tp on lower(tp.email) = lower(p_email) and tp.day = d.day
      left join journals j on lower(j.email) = lower(p_email) and j.day = d.day and coalesce(j.text, '') <> ''
  )
  select jsonb_build_object(
    'signup', (select signup_date from users where lower(email) = lower(p_email) limit 1),
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
                'day', day,
                'at', coalesce(completed_at, first_saved_at),
                'src', case when completed_at is not null then 'server'
                            when first_saved_at is not null then 'journal' end) order by day), '[]'::jsonb)
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

-- 확인 (아무 이메일이나):
-- select get_attendance_calendar('you@example.com');
-- select day, completed_at from task_progress where email = 'you@example.com' order by day desc limit 5;
-- select day, activity, at, client_at from activity_log where email = 'you@example.com' order by at desc limit 10;
