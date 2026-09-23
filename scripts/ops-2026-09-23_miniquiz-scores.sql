-- 미니 퀴즈 점수 분포 (2026-09-23 이후 기록부터 쌓임. task_progress.tasks->'_qzs' = 첫 시도 s/t, 마지막 시도 ls, 시도 횟수 n)
-- Supabase SQL Editor 에서 실행. 개인정보 없음(이메일은 집계에만 씀).

-- 1) 첫 시도 점수별 인원·비율 (10문제 기준)
with q as (
  select tp.email, tp.day,
         (tp.tasks->'_qzs'->>'s')::int as s, (tp.tasks->'_qzs'->>'t')::int as t,
         (tp.tasks->'_qzs'->>'n')::int as n, (tp.tasks->'_qzs'->>'at')::timestamptz as at
  from task_progress tp
  join users u on lower(u.email) = lower(tp.email)
  where tp.tasks ? '_qzs' and coalesce(u.is_operator,false) = false
)
select s as 첫시도_점수, count(*) as 건수, round(100.0 * count(*) / sum(count(*)) over (), 1) as 비율
from q where t = 10
group by s order by s desc;

-- 2) 요약: 만점 비율 · 8점 이상 비율 · 평균 · 재시도한 비율
with q as (
  select (tp.tasks->'_qzs'->>'s')::int as s, (tp.tasks->'_qzs'->>'t')::int as t, (tp.tasks->'_qzs'->>'n')::int as n
  from task_progress tp join users u on lower(u.email) = lower(tp.email)
  where tp.tasks ? '_qzs' and coalesce(u.is_operator,false) = false
)
select count(*) as 전체,
       round(100.0 * count(*) filter (where s >= t) / nullif(count(*),0), 1) as 만점_비율,
       round(100.0 * count(*) filter (where s::numeric / t >= 0.8) / nullif(count(*),0), 1) as 팔점이상_비율,
       round(avg(s::numeric / t * 10), 2) as 평균_10점환산,
       round(100.0 * count(*) filter (where n > 1) / nullif(count(*),0), 1) as 재시도_비율
from q;

-- 3) 어떤 유형에서 틀리는지는 아직 서버에 없음 (틀린 단어만 _qzw 로 옴). 필요하면 유형별 오답도 올리게 바꿀 수 있음.
