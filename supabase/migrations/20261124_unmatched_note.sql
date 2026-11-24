-- ============================================================
-- 2026-11-24 '결제했는데 앱 계정 없는 사람' 확인 완료에 이유(메모) 남기기
-- 문제: 접어 둔 사람 옆에 '11/24 확인' 만 보여서 왜 접었는지(환불인지, 연락 끝났는지) 알 수 없었다.
-- 해결: dismiss_note 칸 추가. 운영자가 접을 때 이유를 고르고, 시트 동기화는 환불된 사람을 'MM/DD 환불 완료' 로 접는다.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN (개인정보·키 없음)
-- ============================================================
alter table latpeed_unmatched add column if not exists dismiss_note text;

create or replace function dismiss_latpeed_unmatched_note(p_email text, p_latpeed_email text, p_dismiss boolean default true, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _latpeed_op_ok(p_email) then raise exception 'not operator'; end if;
  update latpeed_unmatched
     set dismissed_at = case when p_dismiss then now() else null end,
         dismissed_by = case when p_dismiss then lower(coalesce(nullif(auth.email(), ''), p_email)) else null end,
         dismiss_note = case when p_dismiss then nullif(trim(coalesce(p_note, '')), '') else null end
   where latpeed_email = lower(trim(p_latpeed_email));
  insert into ops_log(email, action, detail, by_email)
    values (lower(trim(p_latpeed_email)), case when p_dismiss then 'unmatched_dismiss' else 'unmatched_undismiss' end,
            case when p_note is null then null else jsonb_build_object('note', p_note) end, lower(coalesce(nullif(auth.email(), ''), p_email)));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function dismiss_latpeed_unmatched_note(text, text, boolean, text) from public;
grant execute on function dismiss_latpeed_unmatched_note(text, text, boolean, text) to anon, authenticated;
