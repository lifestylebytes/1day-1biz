-- 진급 리포트 '그때 한 말' · 순위판 기록 (2026-10-16, 개발 뷰)
-- 로그인한 본인 것만 돌려준다 (auth.email() = p_email). 다른 사람 이메일을 넣으면 ok:false.
--  motivation : 입사 지원 동기 (users.onboarding_motivation)
--  surveys    : 내가 낸 설문 (feedback 의 survey · graduation)
--  weeks      : 주(월요일 시작, 한국 시간)별 내 EXP · 그 주 순위 · 그 주 인원
create or replace function get_promo_extra(p_email text)
returns jsonb
language sql security definer stable set search_path = public
as $$
  with me as (select lower(coalesce(nullif(auth.email(), ''), '')) as em),
  ok as (select em from me where em <> '' and em = lower(coalesce(p_email, ''))),
  wk as (
    select date_trunc('week', (e.at at time zone 'Asia/Seoul'))::date as w, lower(e.email) as email, sum(e.exp) as exp
    from exp_events e
    join users u on lower(u.email) = lower(e.email)
    where coalesce(u.is_tester, false) = false or lower(e.email) = (select em from me)
    group by 1, 2
  ),
  rk as (select w, email, exp, rank() over (partition by w order by exp desc) as rank, count(*) over (partition by w) as n from wk)
  select case when not exists (select 1 from ok) then jsonb_build_object('ok', false) else jsonb_build_object(
    'ok', true,
    'motivation', (select to_jsonb(u.onboarding_motivation) from users u where lower(u.email) = (select em from ok) limit 1),
    'surveys', coalesce((select jsonb_agg(jsonb_build_object('at', f.created_at, 'day', f.day, 'message', left(f.message, 400)) order by f.created_at)
                         from feedback f where lower(f.email) = (select em from ok) and f.category in ('survey', 'graduation')), '[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(jsonb_build_object('week', w, 'exp', exp, 'rank', rank, 'n', n) order by w)
                       from rk where email = (select em from ok)), '[]'::jsonb)
  ) end;
$$;
revoke all on function get_promo_extra(text) from public;
grant execute on function get_promo_extra(text) to authenticated;
