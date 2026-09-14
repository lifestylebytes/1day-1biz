-- 이번 주 출근한 동료 표시 (동기의 존재)
-- 기준: 최근 7일 안에 출근 도장(checkin)이 찍힌 사람. 하루 단위면 오전에 2~3명이라 늘 비어 보인다.
--       "이 회사에 사람이 이만큼 다닌다"가 소속감을 주는 숫자라 주 단위가 더 맞다.
-- 이름은 성 한 글자만 남기고 마스킹. 이메일 등 식별정보는 절대 내려보내지 않는다.
-- 순수 테스트 계정만 제외 (운영자·지흔도 실제 학습자라 포함).
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
    where tp.updated_at >= now() - interval '7 days'
      and coalesce(tp.tasks->>'checkin', '') = 'true'
      and coalesce(u.is_tester, false) = false
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
