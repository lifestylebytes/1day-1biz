-- ============================================================
-- 2026-11-14 결제 직후 48시간 임시 통과 (paid grace)
-- 다큐라이즈 결제는 웹훅이 없어서 이용 기간 반영을 사람이 SQL 로 한다.
-- 그 사이 체험이 끝난 회원이 "돈 냈는데 막힘"을 겪지 않도록, 계정당 1회 48시간 통과를 연다.
--   A. 결제 후 입사 안내 페이지(welcome.html)에 로그인 상태로 들어오면 자동으로 호출
--   B. 체험 완료(차단) 화면의 "이미 결제했어요" 버튼으로 호출
-- 앱은 users.preferences.paid_grace_at 이 48시간 안이면 체험 만료여도 통과시킨다(유료 member 는 원래 날짜 차단 없음).
-- 운영자는 ops_log(action='paid_grace')로 확인하고, 실제 결제가 없으면 무시하면 된다(48시간 뒤 자동으로 다시 막힘).
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================
create or replace function claim_paid_grace(p_email text default null, p_source text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(nullif(auth.email(), ''), p_email, '')));
  v_pref  jsonb;
  v_now   timestamptz := now();
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'error', 'no email'); end if;
  select coalesce(preferences, '{}'::jsonb) into v_pref from users where lower(email) = v_email limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'no user'); end if;
  if v_pref ? 'paid_grace_at' then
    return jsonb_build_object('ok', false, 'used', true, 'at', v_pref->>'paid_grace_at');
  end if;
  update users
     set preferences = v_pref || jsonb_build_object('paid_grace_at', v_now, 'paid_grace_src', coalesce(p_source, ''))
   where lower(email) = v_email;
  begin
    perform add_ops_log(p_email => v_email, p_action => 'paid_grace', p_detail => jsonb_build_object('source', p_source, 'until', v_now + interval '48 hours'), p_by => 'self');
  exception when others then null;
  end;
  return jsonb_build_object('ok', true, 'at', v_now, 'until', v_now + interval '48 hours');
end $$;
revoke all on function claim_paid_grace(text, text) from public;
grant execute on function claim_paid_grace(text, text) to anon, authenticated;

-- 확인: select email, preferences->>'paid_grace_at' as grace_at, preferences->>'paid_grace_src' as src
--        from users where preferences ? 'paid_grace_at' order by 2 desc;
