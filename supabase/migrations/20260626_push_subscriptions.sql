-- 웹 푸시 구독 저장 (PWA 알림)
-- 2026-06-26. 사용자 단말의 PushSubscription을 보관, push-send 함수가 여기서 읽어 발송.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_push_sub_email on push_subscriptions(email);

-- anon 직접 접근 차단, RPC(save_push_subscription) / 서비스롤(push-send 함수)로만 접근
alter table push_subscriptions enable row level security;

-- 구독 저장 (endpoint 기준 upsert). 같은 단말이 재구독하면 갱신.
create or replace function save_push_subscription(p_email text, p_subscription jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint text;
begin
  v_endpoint := p_subscription->>'endpoint';
  if v_endpoint is null or v_endpoint = '' then
    raise exception 'subscription has no endpoint';
  end if;
  insert into push_subscriptions(email, endpoint, subscription)
  values (lower(trim(p_email)), v_endpoint, p_subscription)
  on conflict (endpoint) do update
    set email = excluded.email,
        subscription = excluded.subscription,
        updated_at = now();
  return jsonb_build_object('ok', true, 'endpoint', v_endpoint);
end;
$$;

grant execute on function save_push_subscription(text, jsonb) to anon, authenticated;
