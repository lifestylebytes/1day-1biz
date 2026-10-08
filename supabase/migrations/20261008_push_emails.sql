-- ============================================================
-- 2026-10-08 운영자 뷰 '알림' 칸: 브라우저 푸시 구독이 있는 이메일 목록
-- push_subscriptions 는 RLS 로 막혀 있어 운영자 화면이 직접 못 읽는다. 이메일만 돌려주는 RPC.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================
create or replace function get_push_emails()
returns jsonb
language sql security definer stable set search_path = public
as $$
  select coalesce(jsonb_agg(distinct lower(email)), '[]'::jsonb) from push_subscriptions;
$$;
revoke all on function get_push_emails() from public;
grant execute on function get_push_emails() to anon, authenticated;
-- 확인: select get_push_emails();
