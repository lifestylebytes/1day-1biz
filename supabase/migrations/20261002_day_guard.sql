-- ============================================================
-- 2026-10-02 앱 Day(day_in_company) 서버 가드 + 1회 교정 + 운영자 뷰용 마지막 학습일
-- 문제: 앱이 로그인 정보를 못 읽은 순간 달력 Day 를 올려서, 학습 안 한 회원의 day_in_company 가 달력 Day 가 됐다
--       (유지연 Day 1만 완주인데 7, 권은주 20 완주인데 30 등). 회원 화면은 완주 기준 게이트라 멀쩡했고 운영자 뷰만 틀렸다.
-- 해결: 1) save_day_progress 가 "완주한 가장 큰 Day + 1" 을 넘는 값을 거부 (게이트 도입 2026-08-16 전 가입자는 예외)
--       2) 게이트 도입 후 가입자의 day_in_company 를 완주 기준으로 1회 교정
--       3) get_progress_overview 에 마지막 학습 시각(last_study_at) 추가 → 운영자 뷰 '마지막 학습일' 을 실제 기록으로
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================

-- 완주한 Day 집합 (앱·운영자 뷰와 같은 기준: 답안 OR 일지 OR 일정 체크 4개 이상)
create or replace function _done_days(p_email text)
returns table(day int, at timestamptz)
language sql stable set search_path = public
as $$
  select day, max(at) as at from (
    select s.day, s.updated_at as at from submissions s where lower(s.email) = lower(p_email) and coalesce(s.answer_text, '') <> ''
    union all
    select j.day, j.saved_at from journals j where lower(j.email) = lower(p_email) and coalesce(j.text, '') <> ''
    union all
    select tp.day, tp.updated_at from task_progress tp where lower(tp.email) = lower(p_email)
      and (select count(*) from jsonb_each_text(tp.tasks) t where t.value = 'true' and left(t.key, 1) <> '_') >= 4
  ) x group by day;
$$;

-- 1) 가드가 붙은 save_day_progress
CREATE OR REPLACE FUNCTION save_day_progress(p_email TEXT, p_day INT)
RETURNS users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r users; cap int; signup_kst date; max_done int;
BEGIN
  IF p_email IS NULL OR p_day IS NULL OR p_day < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;
  select (signup_date at time zone 'Asia/Seoul')::date into signup_kst from users where lower(email) = lower(p_email) limit 1;
  select coalesce(max(day), 0) into max_done from _done_days(p_email);
  cap := max_done + 1;
  -- 게이트 도입(2026-08-16) 전 가입자는 당시 진도를 floor 로 보존했으므로 가드를 걸지 않는다
  IF signup_kst IS NOT NULL AND signup_kst >= date '2026-08-16' AND p_day > cap THEN
    p_day := cap;
  END IF;
  UPDATE users
     SET day_in_company = GREATEST(COALESCE(day_in_company, 1), p_day),
         last_active = NOW(),
         updated_at = NOW()
   WHERE lower(email) = lower(p_email)
   RETURNING * INTO r;
  IF r IS NULL THEN
    RAISE EXCEPTION 'user not found: %', p_email;
  END IF;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION save_day_progress(TEXT, INT) TO anon, authenticated;

-- 2) 1회 교정: 게이트 도입 후 가입자 중 day_in_company 가 완주+1 보다 큰 사람 (결과 표로 누가 어떻게 바뀌는지 보인다)
with fix as (
  select u.email, u.day_in_company as before_day,
         (select coalesce(max(day), 0) from _done_days(u.email)) + 1 as cap
  from users u
  where (u.signup_date at time zone 'Asia/Seoul')::date >= date '2026-08-16'
    and coalesce(u.is_operator, false) = false and coalesce(u.is_dev_mode, false) = false
)
update users u set day_in_company = f.cap, updated_at = now()
from fix f where lower(u.email) = lower(f.email) and f.before_day > f.cap
returning u.email, u.name, f.before_day as "교정 전", u.day_in_company as "교정 후";

-- 3) 운영자 뷰: 완주 Day 목록 + 마지막 학습 시각
create or replace function get_progress_overview()
returns jsonb
language sql security definer stable set search_path = public
as $$
  with d as (
    select lower(email) as email, day, updated_at as at from submissions where coalesce(answer_text, '') <> ''
    union all
    select lower(email), day, saved_at from journals where coalesce(text, '') <> ''
    union all
    select lower(tp.email), tp.day, tp.updated_at from task_progress tp
     where (select count(*) from jsonb_each_text(tp.tasks) t where t.value = 'true' and left(t.key, 1) <> '_') >= 4
  )
  select coalesce(jsonb_agg(jsonb_build_object('email', email, 'done', days, 'last_study_at', last_at)), '[]'::jsonb)
  from (select email, jsonb_agg(distinct day) as days, max(at) as last_at from d group by email) x;
$$;
revoke all on function get_progress_overview() from public;
grant execute on function get_progress_overview() to anon, authenticated;

-- 4) 운영자 작업 이력 (멤버십 수동 변경 등). 운영자 화면이 기록한다.
create table if not exists ops_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  email text not null,
  action text not null,       -- membership_sync | manual_reactivate | day_adjust | wp_grant ...
  detail jsonb,
  by_email text
);
alter table ops_log enable row level security;
drop policy if exists ops_log_block on ops_log;
create policy ops_log_block on ops_log for all to public using (false) with check (false);
create or replace function add_ops_log(p_email text, p_action text, p_detail jsonb, p_by text)
returns void language sql security definer set search_path = public
as $$ insert into ops_log(email, action, detail, by_email) values (lower(p_email), p_action, p_detail, p_by); $$;
create or replace function get_ops_log(p_email text)
returns jsonb language sql security definer stable set search_path = public
as $$ select coalesce(jsonb_agg(jsonb_build_object('at', at, 'action', action, 'detail', detail, 'by', by_email) order by at desc), '[]'::jsonb) from ops_log where email = lower(p_email); $$;
revoke all on function add_ops_log(text, text, jsonb, text) from public; grant execute on function add_ops_log(text, text, jsonb, text) to anon, authenticated;
revoke all on function get_ops_log(text) from public; grant execute on function get_ops_log(text) to anon, authenticated;

-- 확인: select email, name, day_in_company, (select max(day) from _done_days(email)) as max_done from users order by signup_date desc limit 30;
