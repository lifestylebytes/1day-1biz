-- ============================================================
-- 2026-10-13 운영자 뷰 '결제했는데 앱 계정 없는 사람' 칸
-- 문제: 래피드로 결제했는데 같은 이메일로 앱 가입을 안 한 사람은 users 에 행이 없어 운영자 뷰에 아예 안 보였다.
--       매일 07:00 시트 동기화(latpeed-sheet-sync)가 이런 사람을 찾아도 결과는 Apps Script 로그로만 가고,
--       결제한 지 한 달이 지난 사람은 기록조차 안 남았다. (10/12 대조 때 결제 중인데 이용 못 하는 회원이 여럿 나옴)
-- 해결: 동기화가 찾은 '계정 없는 결제자' 를 이 표에 매일 덮어 쓴다. 운영자 뷰는 운영자 전용 RPC 로만 읽는다.
--       운영자는 화면에서 (a) 다른 이메일로 가입한 계정과 잇기(latpeed_aliases), (b) 연락 끝난 사람 접어 두기 를 할 수 있다.
-- 의존: 20260627_content_edits.sql 의 _is_operator_email(), 20261003_latpeed_aliases.sql 의 latpeed_aliases, ops_log
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN (개인정보·키 없음)
-- ============================================================
create table if not exists latpeed_unmatched (
  latpeed_email text primary key,            -- 래피드(시트)에 찍힌 결제 이메일 (소문자)
  name          text,
  phone         text,                         -- 숫자만
  first_paid_at timestamptz,
  last_paid_at  timestamptz,
  pay_count     int not null default 0,       -- '결제 완료' 건수
  last_amount   int,
  name_matches  jsonb not null default '[]'::jsonb, -- 전화번호·이름이 같은 앱 계정 이메일 후보
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  resolved_at   timestamptz,                  -- 다음 동기화에서 계정이 잡혔거나(가입·별칭) 시트에서 사라짐
  dismissed_at  timestamptz,                  -- 운영자가 '확인 완료' 로 접어 둠
  dismissed_by  text
);
alter table latpeed_unmatched enable row level security;
drop policy if exists latpeed_unmatched_block on latpeed_unmatched;
create policy latpeed_unmatched_block on latpeed_unmatched for all to public using (false) with check (false);

-- 운영자 확인: 로그인 세션이 있으면 그 이메일로, 없으면 화면이 넘긴 이메일로 본다
create or replace function _latpeed_op_ok(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select _is_operator_email(coalesce(nullif(auth.email(), ''), p_email));
$$;
revoke all on function _latpeed_op_ok(text) from public, anon, authenticated;

-- 1) 목록: 아직 계정이 안 잡힌 사람 (접어 둔 사람 포함, 화면에서 나눠 보여 준다)
create or replace function get_latpeed_unmatched(p_email text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not _latpeed_op_ok(p_email) then raise exception 'not operator'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.last_paid_at desc nulls last)
    from latpeed_unmatched t where t.resolved_at is null
  ), '[]'::jsonb);
end $$;
revoke all on function get_latpeed_unmatched(text) from public;
grant execute on function get_latpeed_unmatched(text) to anon, authenticated;

-- 2) 확인 완료 (접기) / 되돌리기
create or replace function dismiss_latpeed_unmatched(p_email text, p_latpeed_email text, p_dismiss boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _latpeed_op_ok(p_email) then raise exception 'not operator'; end if;
  update latpeed_unmatched
     set dismissed_at = case when p_dismiss then now() else null end,
         dismissed_by = case when p_dismiss then lower(coalesce(nullif(auth.email(), ''), p_email)) else null end
   where latpeed_email = lower(trim(p_latpeed_email));
  insert into ops_log(email, action, detail, by_email)
    values (lower(trim(p_latpeed_email)), case when p_dismiss then 'unmatched_dismiss' else 'unmatched_undismiss' end, null, lower(coalesce(nullif(auth.email(), ''), p_email)));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function dismiss_latpeed_unmatched(text, text, boolean) from public;
grant execute on function dismiss_latpeed_unmatched(text, text, boolean) to anon, authenticated;

-- 3) 계정 연결: 래피드 이메일 → 이미 가입한 앱 계정. 다음 07:00 동기화가 결제를 그 계정에 반영한다
create or replace function link_latpeed_alias(p_email text, p_latpeed_email text, p_app_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_app text := lower(trim(p_app_email)); v_lp text := lower(trim(p_latpeed_email)); v_name text;
begin
  if not _latpeed_op_ok(p_email) then raise exception 'not operator'; end if;
  if v_lp = '' or v_app = '' then raise exception 'empty email'; end if;
  if not exists (select 1 from users where lower(email) = v_app) then raise exception 'app account not found'; end if;
  select name into v_name from latpeed_unmatched where latpeed_email = v_lp;
  insert into latpeed_aliases(latpeed_email, app_email, note)
    values (v_lp, v_app, coalesce(v_name, '') || ' (운영자뷰 연결)')
    on conflict (latpeed_email) do update set app_email = excluded.app_email, note = excluded.note;
  update latpeed_unmatched set resolved_at = now() where latpeed_email = v_lp;
  insert into ops_log(email, action, detail, by_email)
    values (v_app, 'latpeed_alias_link', jsonb_build_object('latpeed_email', v_lp), lower(coalesce(nullif(auth.email(), ''), p_email)));
  return jsonb_build_object('ok', true, 'app_email', v_app);
end $$;
revoke all on function link_latpeed_alias(text, text, text) from public;
grant execute on function link_latpeed_alias(text, text, text) to anon, authenticated;

-- 확인: select get_latpeed_unmatched('운영자이메일');
--       select latpeed_email, name, last_paid_at, pay_count, dismissed_at from latpeed_unmatched where resolved_at is null order by last_paid_at desc;
