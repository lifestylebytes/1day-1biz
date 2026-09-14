-- 운영자 뷰 · 계정별 진도 현황 (2026-09-14)
-- 모든 계정의 '완주한 Day' 목록을 한 번에 가져온다 (밀린 Day · 빠뜨린 Day 계산용).
-- 완주 기준(앱과 동일): 시추에이션 답안 있음 OR 일지 있음 OR 일정 체크 4개 이상.
-- 학습 내용은 안 내려보내고 email + day 숫자만. 운영자 화면에서만 호출.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN

create or replace function get_progress_overview()
returns jsonb
language sql security definer stable set search_path = public
as $$
  with d as (
    select lower(email) as email, day from submissions where coalesce(answer_text, '') <> ''
    union
    select lower(email), day from journals where coalesce(text, '') <> ''
    union
    select lower(tp.email), tp.day from task_progress tp
     where (select count(*) from jsonb_each_text(tp.tasks) t where t.value = 'true' and left(t.key, 1) <> '_') >= 4
  )
  select coalesce(jsonb_agg(jsonb_build_object('email', email, 'done', days)), '[]'::jsonb)
  from (select email, jsonb_agg(day order by day) as days from d group by email) x;
$$;
revoke all on function get_progress_overview() from public;
grant execute on function get_progress_overview() to anon, authenticated;

-- ── 내부 테스트 계정 표시 (운영자 요청 2026-09-14) ──
-- 순위판 · 출근 인원 · 이탈 분석 등 모든 통계에서 빠진다. 유형 배지는 그대로.
update users set is_tester = true
 where name in ('이지흔', '유버디2', '유미니', '0821 테스트', '안녕', '모모', '가입테스트', '제발', '이규태씨', '테스트2');

-- 확인: 몇 명이 바뀌었는지 (10명이어야 함. 적으면 이름이 다르게 저장된 계정이 있는 것)
select name, email, is_tester from users where is_tester = true order by name;
