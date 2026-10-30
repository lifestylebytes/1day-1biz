-- 체험 며칠째에 결제했는지 (읽기 전용, 2026-10-30)
-- 체험으로 시작해서 결제한 회원: preferences.prev_cohort 가 trial 로 시작 (래피드 웹훅이 결제 때 남김)
-- 결제일 = preferences.plan_paid_at (장기권), 없으면 last_paid_at
-- paid_trial_day = 결제 날짜 - 가입 날짜 + 1 (한국 시간). 1~7 이면 체험 중 결제, 8 이상이면 체험 끝난 뒤 결제
select
  u.email,
  u.preferences->>'prev_cohort'                                         as prev_cohort,
  (u.signup_date at time zone 'Asia/Seoul')::date                       as signup_kst,
  (coalesce(u.preferences->>'plan_paid_at', u.preferences->>'last_paid_at')::timestamptz at time zone 'Asia/Seoul')::date as paid_kst,
  ((coalesce(u.preferences->>'plan_paid_at', u.preferences->>'last_paid_at')::timestamptz at time zone 'Asia/Seoul')::date
    - (u.signup_date at time zone 'Asia/Seoul')::date) + 1              as paid_trial_day,
  u.preferences->>'plan'                                                 as plan
from users u
where u.preferences->>'prev_cohort' like 'trial%'
  and coalesce(u.preferences->>'plan_paid_at', u.preferences->>'last_paid_at') is not null
order by paid_kst desc;

-- 일차별로 몇 명이 결제했는지
-- select paid_trial_day, count(*) from (위 쿼리) t group by 1 order by 1;

-- Day 8 결제 이유 설문 답 (앱 팝업, survey_responses)
-- select email, created_at, responses->>'paidTrialDay' as paid_trial_day, responses->'reasons' as reasons,
--        responses->>'top' as top_reason, responses->>'other' as other
--   from survey_responses where survey_key = 'trial_paid_reason' order by created_at desc;
