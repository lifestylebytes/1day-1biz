-- ============================================================
-- 2026-10-17 대리 직급 저장
-- 문제: 서버에는 '대리' 직급이 따로 저장되지 않았다 (users.level 은 수습 / 사원까지만). 앱이 학습 Day 로만 대리를 계산했다.
-- 해결: 1) complete_senior: 대리 진급 평가를 마무리하면 앱이 부른다. level = 대리 + 받은 시각 · 점수.
--       2) (라이브 때만) 실제 학습 Day 91 이상(완주한 Day 90개 이상)인 사원을 한 번에 대리로.
-- 실행: Supabase Dashboard → SQL Editor.
--   1) 은 지금 실행해도 된다 (함수만 만든다. 개발 뷰에서 대리 평가를 마친 계정만 부른다).
--   2) 는 라이브 하는 날 주석을 풀고 실행.
-- ============================================================

-- 1) 대리 진급 저장
create or replace function complete_senior(p_email text, p_score int default null)
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
    level = jsonb_build_object('id', 'senior', 'ko', '대리', 'en', 'Senior Associate', 'at', now(), 'score', p_score),
    -- 수습에서 바로 대리 평가를 본 경우(Day 90 지나 수습)도 사원 기록을 같이 남긴다
    levelup_completed_at = coalesce(levelup_completed_at, now()),
    last_active = now()
  where lower(email) = v_email;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function complete_senior(text, int) from public;
grant execute on function complete_senior(text, int) to anon, authenticated;

-- 2) 라이브 때: 실제 학습 Day 91 이상 사원 → 대리 (평가 없이, 그동안 대리 저장이 없어서 생긴 공백 메우기)
--    실제 학습 Day = 앱과 같은 완주 기준(일지 또는 일정 4개 이상)으로 끝낸 Day 수. 90개 이상이면 Day 91 이상.
--    수습(아직 사원도 안 된 회원)은 빼고, 앱에서 대리 진급 평가 하나만 보게 한다.
-- update users u set level = jsonb_build_object('id', 'senior', 'ko', '대리', 'en', 'Senior Associate', 'at', now(), 'by', 'backfill')
--  where coalesce(u.level->>'id', 'probation') = 'fulltime'
--    and coalesce(u.is_operator, false) = false
--    and (select count(distinct day) from (
--          select tp.day from task_progress tp
--           where lower(tp.email) = lower(u.email)
--             and (select count(*) from jsonb_each_text(tp.tasks) e where e.value = 'true' and left(e.key, 1) <> '_') >= 4
--          union
--          select j.day from journals j where lower(j.email) = lower(u.email) and coalesce(j.text, '') <> ''
--        ) z) >= 90;
