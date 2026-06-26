-- 승급(정직원 전환) 영속화 RPC + 백필
-- 2026-06-26.
-- 문제: _persistLevelUp이 직접 테이블 UPDATE + select-back을 써서,
--   세션 없는(가입 후/만료) 사용자는 select RLS에 막혀 "실패"로 처리됨.
--   → DB에 levelup_completed_at이 안 남고, 새 기기/캐시 클리어 시 승급 의례(미니테스트)가 재트리거.
-- 해결: 다른 저장들처럼 SECURITY DEFINER RPC로 RLS·세션 무관하게 확실히 기록.

create or replace function complete_levelup(p_email text, p_score int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' then
    raise exception 'email required';
  end if;
  update users set
    level = '{"id":"fulltime","ko":"사원","en":"Associate"}'::jsonb,
    levelup_completed_at = coalesce(levelup_completed_at, now()),
    levelup_test_score   = coalesce(p_score, levelup_test_score),
    last_active = now()
  where lower(email) = v_email;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function complete_levelup(text, int) to anon, authenticated;

-- 백필: 이미 정직원(level.id=fulltime)인데 타임스탬프만 비어 재트리거되던 사용자 복구.
update users
   set levelup_completed_at = coalesce(levelup_completed_at, now())
 where level->>'id' = 'fulltime'
   and levelup_completed_at is null;
