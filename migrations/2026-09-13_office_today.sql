-- 오늘 출근한 동료 표시 (동기의 존재 = 긴장감/사회적 증거)
-- 이름은 성 한 글자만 남기고 마스킹해서 내려보냄. 이메일/식별정보는 절대 나가지 않음.
-- 운영자/테스터/개발모드 계정은 제외.

create or replace function get_office_today(p_limit int default 10)
returns jsonb
language sql
security definer
stable
as $$
  with t as (
    select name, day_in_company, last_active
    from users
    where last_active >= ((date_trunc('day', (now() at time zone 'Asia/Seoul'))) at time zone 'Asia/Seoul')
      and coalesce(is_operator, false) = false
      and coalesce(is_tester, false) = false
      and coalesce(is_dev_mode, false) = false
      and coalesce(name, '') <> ''
  ),
  top as (
    select * from t order by last_active desc limit greatest(coalesce(p_limit, 10), 1)
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
        order by last_active desc
      )
      from top
    ), '[]'::jsonb)
  );
$$;

revoke all on function get_office_today(int) from public;
grant execute on function get_office_today(int) to anon, authenticated;
