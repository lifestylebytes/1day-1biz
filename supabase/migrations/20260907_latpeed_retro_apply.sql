-- ============================================================
-- 2026-09-07 래피드 결제 소급 적용
-- 문제: 회원이 래피드에서 먼저 결제하고 앱 가입은 나중에 하면, 웹훅이 왔을 때 users 행이 없어
--       latpeed_events 에 "user_not_found_yet" 으로만 남고 만료일이 영영 안 들어갔다.
-- 해결: users 에 행이 생기는 순간(가입) 그 이메일의 미적용 결제 이벤트를 찾아 만료일을 넣는다.
--       + 지금 이미 가입돼 있는데 만료일이 비어 있는 정식 회원에게 한 번 소급(백필).
-- SQL Editor 에서 전체 실행. 개인정보·키 없음.
-- ============================================================

-- 1) 소급 적용 함수: 이메일 하나에 대해 가장 최근 SUCCESS 이벤트를 찾아 users 에 반영
create or replace function latpeed_apply_pending(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  days int := 31;
  ends timestamptz;
begin
  if p_email is null or p_email = '' then return 'no_email'; end if;
  select id, event_at, amount, option_text into ev
  from latpeed_events
  where lower(email) = lower(p_email)
    and type = 'MEMBERSHIP_PAYMENT' and status = 'SUCCESS'
    and applied = false
  order by event_at desc nulls last, received_at desc
  limit 1;
  if ev.id is null then return 'no_pending_event'; end if;

  ends := coalesce(ev.event_at, now()) + make_interval(days => days);
  -- 결제가 너무 오래돼 이미 만료됐으면 반영해도 바로 잠기니 건너뛴다 (운영자가 CSV 로 판단)
  if ends < now() then
    update latpeed_events set applied = false, apply_note = coalesce(apply_note, '') || ' | retro_skipped_expired' where id = ev.id;
    return 'expired_skip';
  end if;

  update users set
    cohort = 'member',
    unlocked = true,
    membership_ends_at = ends,
    membership_cancel_at = null,
    membership_cancel_reason = null,
    preferences = coalesce(preferences, '{}'::jsonb)
      || jsonb_build_object('pay_source', 'latpeed', 'last_paid_at', coalesce(ev.event_at, now()),
                            'pay_count', coalesce((preferences->>'pay_count')::int, 0) + 1)
  where lower(email) = lower(p_email);

  update latpeed_events set applied = true,
    apply_note = 'retro_applied_on_signup_until_' || to_char(ends at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  where id = ev.id;
  return 'applied_until_' || to_char(ends at time zone 'Asia/Seoul', 'YYYY-MM-DD');
end $$;
revoke all on function latpeed_apply_pending(text) from public, anon, authenticated;

-- 2) 가입 트리거: users 에 행이 생기면 자동 실행
create or replace function _trg_users_latpeed_retro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform latpeed_apply_pending(new.email);
  return new;
end $$;
drop trigger if exists trg_users_latpeed_retro on users;
create trigger trg_users_latpeed_retro
  after insert on users
  for each row execute function _trg_users_latpeed_retro();

-- 3) 백필: 이미 가입돼 있는데 만료일이 없는 회원 중, 미적용 결제 이벤트가 있는 사람
--    (결과 표로 누가 어떻게 됐는지 보인다)
select u.email, latpeed_apply_pending(u.email) as result
from users u
where u.membership_ends_at is null
  and u.withdrawn_at is null
  and exists (
    select 1 from latpeed_events e
    where lower(e.email) = lower(u.email)
      and e.type = 'MEMBERSHIP_PAYMENT' and e.status = 'SUCCESS' and e.applied = false
  );

-- 4) 남은 구멍 확인: 정식 회원인데 만료일이 없는 사람 (여긴 웹훅 이벤트도 없는 케이스 = CSV 대조 대상)
select email, name, signup_date::date, preferences->>'plan' as plan
from users
where cohort = 'member' and membership_ends_at is null and withdrawn_at is null
  and is_operator is not true and is_dev_mode is not true and is_tester is not true
order by signup_date desc;
