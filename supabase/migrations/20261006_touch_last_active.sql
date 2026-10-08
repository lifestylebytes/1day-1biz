-- ============================================================
-- 2026-10-06 마지막 접속(last_active) = 실제 접속
-- 앱 화면(mainboard)이 열리거나 다시 앞으로 올 때 부른다. 5분 안에 또 오면 무시 (DB 쓰기 줄이기)
-- 운영 작업(퇴직·복직)과 결제 웹훅은 이제 last_active 를 안 바꾸고 ops_log(운영 이력)에 남는다 (JS·웹훅 쪽 변경)
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================
create or replace function touch_last_active(p_email text)
returns void
language sql security definer set search_path = public
as $$
  update users
     set last_active = now()
   where lower(email) = lower(trim(p_email))
     and (last_active is null or last_active < now() - interval '5 minutes');
$$;
revoke all on function touch_last_active(text) from public;
grant execute on function touch_last_active(text) to anon, authenticated;
