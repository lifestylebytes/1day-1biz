-- 오늘 출근한 동료 표시 (동기의 존재)
-- 기준: 오늘(KST) task_progress 에 출근 도장(checkin)이 찍힌 사람.
--       단순 접속이 아니라 실제로 하루를 시작한 사람만 센다.
-- 이름은 성 한 글자만 남기고 마스킹. 이메일 등 식별정보는 절대 내려보내지 않는다.
-- 운영자/테스터/개발모드 계정은 제외.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN

create or replace function get_office_today(p_limit int default 10)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with t as (
    select distinct on (lower(tp.email))
           lower(tp.email) as em, u.name, u.day_in_company, tp.updated_at
    from task_progress tp
    join users u on lower(u.email) = lower(tp.email)
    where tp.updated_at >= ((date_trunc('day', (now() at time zone 'Asia/Seoul'))) at time zone 'Asia/Seoul')
      and coalesce(tp.tasks->>'checkin', '') = 'true'
      and coalesce(u.is_operator, false) = false
      and coalesce(u.is_tester, false) = false
      and coalesce(u.is_dev_mode, false) = false
      and coalesce(u.name, '') <> ''
    order by lower(tp.email), tp.updated_at desc
  ),
  top as (
    select * from t order by updated_at desc limit greatest(coalesce(p_limit, 10), 1)
  )
  select jsonb_build_object(
    'count', (select count(*) from t),
    'people', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'initial', left(name, 1),
          'masked', left(name, 1) || repeat('○', greatest(char_length(name) - 1, 1)),
          'day', day_in_company
        )
        order by updated_at desc
      )
      from top
    ), '[]'::jsonb)
  );
$$;

revoke all on function get_office_today(int) from public;
grant execute on function get_office_today(int) to anon, authenticated;
