-- 해외결제(Lemon Squeezy) 감사 로그 + 멤버십 확인 RPC
-- 2026-06-27.

-- 결제 이벤트 원본 로그 (감사/디버깅). 서비스롤(웹훅)만 기록, anon 접근 차단.
create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text,
  email text,
  payload jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_payment_events_email on payment_events(email);
alter table payment_events enable row level security;
-- (정책 없음 = anon/authenticated 차단, 서비스롤만 접근)

-- 멤버십 상태만 조회 (테스트 페이지 확인용). 학습 데이터는 노출 안 함.
create or replace function get_membership_status(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select cohort, membership_ends_at into r
    from users where lower(email) = lower(trim(p_email)) limit 1;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'cohort', r.cohort,
    'membership_ends_at', r.membership_ends_at,
    'active', (r.cohort = 'member' and (r.membership_ends_at is null or r.membership_ends_at > now()))
  );
end;
$$;

grant execute on function get_membership_status(text) to anon, authenticated;
