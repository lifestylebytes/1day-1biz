-- ============================================================
-- 2026-09-24 리텐션 상태 기기 간 동기화 (내 목표 · 연차/휴가 보유 · 복지P · 결근 판정 · 출근 인정일)
-- 문제: 이 상태들이 기기 localStorage 에만 있어서 폰/PC 를 오가면 서로 다른 세상이 됐다.
--       (폰에서 어제 완주했는데 PC 가 3일 결근으로 판정해 휴가를 쓰게 하고 목표를 리셋한 사고)
-- 해결: users.ret_state jsonb 에 키별 {v, at} 로 저장. 서버는 더 최신(at) 값만 받아들이고, 앱은 접속 때 내려받아 병합.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN. (20260922_activity_dates.sql 도 아직이면 같이)
-- ============================================================

alter table users add column if not exists ret_state jsonb not null default '{}'::jsonb;

create or replace function get_ret_state(p_email text)
returns jsonb
language sql security definer stable set search_path = public
as $$
  select coalesce((select ret_state from users where lower(email) = lower(p_email) limit 1), '{}'::jsonb);
$$;
revoke all on function get_ret_state(text) from public;
grant execute on function get_ret_state(text) to anon, authenticated;

-- 키별 last-write-wins: 서버에 있는 at 보다 오래된 값은 무시 (다른 기기가 나중에 쓴 값 보호)
create or replace function set_ret_state(p_email text, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  cur jsonb; k text; v jsonb;
begin
  if p_email is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then return null; end if;
  select coalesce(ret_state, '{}'::jsonb) into cur from users where lower(email) = lower(p_email) limit 1;
  if cur is null then return null; end if;
  for k, v in select * from jsonb_each(p_patch) loop
    if jsonb_typeof(v) <> 'object' or (v->>'at') is null then continue; end if;
    if (cur->k->>'at') is null or (v->>'at') >= (cur->k->>'at') then
      cur := cur || jsonb_build_object(k, v);
    end if;
  end loop;
  update users set ret_state = cur where lower(email) = lower(p_email);
  return cur;
end $$;
revoke all on function set_ret_state(text, jsonb) from public;
grant execute on function set_ret_state(text, jsonb) to anon, authenticated;

-- 확인: select get_ret_state('you@example.com');
