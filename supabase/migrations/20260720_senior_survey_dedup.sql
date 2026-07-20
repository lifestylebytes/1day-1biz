-- ============================================================
-- Day 60 대리 트랙 설문(senior_survey) 이메일당 1회 보장
-- 실행: Supabase Dashboard, SQL Editor, 통째로 RUN
--
-- 배경: Day 60 팝업 설문이 기기 바꾸거나 재진입 시 여러 번 제출돼
--       운영자 피드함에 같은 사람 메시지가 중복으로 쌓임.
-- 해결: SECURITY DEFINER RPC로 "그 이메일의 senior_survey가 이미 있으면 skip".
--       원자적으로 처리해서 기기/횟수 무관 딱 1건만 남음.
-- ============================================================

create or replace function submit_senior_survey(
  p_email   text,
  p_name    text,
  p_message text,
  p_context jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 이메일 없으면 익명 제출로 그냥 기록 (중복 판단 불가)
  if p_email is null or length(trim(p_email)) = 0 then
    insert into feedback (email, name, day, category, message, context)
      values (null, p_name, 60, 'senior_survey', p_message, p_context);
    return jsonb_build_object('ok', true, 'duplicate', false);
  end if;

  -- 이미 그 이메일의 senior_survey가 있으면 재제출 무시
  if exists (
    select 1 from feedback
    where lower(trim(email)) = lower(trim(p_email))
      and category = 'senior_survey'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  insert into feedback (email, name, day, category, message, context)
    values (p_email, p_name, 60, 'senior_survey', p_message, p_context);
  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

grant execute on function submit_senior_survey(text, text, text, jsonb) to anon, authenticated;
