-- ============================================================
-- 2026-10-09 회원별 운영 메모 (운영자 뷰)
-- "10기 혜택: 해지할 때 7일 연장" 같은 약속·특이사항을 회원 행에 직접 적어 둔다.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================
alter table users add column if not exists ops_memo text;
alter table users add column if not exists ops_memo_at timestamptz;
alter table users add column if not exists ops_memo_by text;

-- 메모 저장 (빈 문자열이면 지움). 바뀐 내용은 ops_log(운영 이력)에도 남긴다.
create or replace function set_ops_memo(p_email text, p_memo text, p_by text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_memo text := nullif(trim(coalesce(p_memo, '')), '');
  v_prev text;
begin
  select ops_memo into v_prev from users where lower(email) = lower(trim(p_email)) limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'no user'); end if;
  update users
     set ops_memo = v_memo,
         ops_memo_at = case when v_memo is null then null else now() end,
         ops_memo_by = case when v_memo is null then null else p_by end
   where lower(email) = lower(trim(p_email));
  begin
    perform add_ops_log(p_email => lower(trim(p_email)), p_action => 'memo', p_detail => jsonb_build_object('memo', v_memo, 'prev', v_prev), p_by => p_by);
  exception when others then null;   -- add_ops_log 가 없어도 메모 저장은 된다
  end;
  return jsonb_build_object('ok', true, 'memo', v_memo, 'at', now(), 'by', p_by);
end $$;
revoke all on function set_ops_memo(text, text, text) from public;
grant execute on function set_ops_memo(text, text, text) to anon, authenticated;

-- 확인: select email, ops_memo, ops_memo_at, ops_memo_by from users where ops_memo is not null;
