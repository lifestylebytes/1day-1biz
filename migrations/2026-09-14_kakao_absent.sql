-- 결근 방지 알림톡 (2026-09-14)
-- users.kakao_absent_hour : 그 시각(KST, 0~23)에 "오늘 아직 출근 안 했으면" 알림. NULL = 끔
-- kakao_absent_log        : 하루 1회 중복 방지 + 결과 기록 (아침 알림 로그와 분리)
-- 실행: Supabase Dashboard → SQL Editor → RUN. 그 뒤 크론 하나 추가:
--   매시 정각  https://<project>.supabase.co/functions/v1/kakao-daily?mode=absent&key=<CRON_SECRET>

alter table users add column if not exists kakao_absent_hour int;
create index if not exists idx_users_kakao_absent_hour on users(kakao_absent_hour) where kakao_absent_hour is not null;

create table if not exists kakao_absent_log (
  id          bigserial primary key,
  email       text not null,
  sent_date   date not null,
  day         int,
  word        text,
  status      text not null default 'sent',
  detail      jsonb default '{}'::jsonb,
  created_at  timestamptz default now(),
  unique (email, sent_date)
);
alter table kakao_absent_log enable row level security;
drop policy if exists kakao_absent_block on kakao_absent_log;
create policy kakao_absent_block on kakao_absent_log for all to public using (false) with check (false);

-- 클라이언트용: 결근 알림 시각 설정 (기존 set_kakao_notify 와 별개)
create or replace function set_kakao_absent(p_email text, p_hour int)
returns void language sql security definer set search_path = public as $$
  update users set kakao_absent_hour = p_hour, kakao_notify_updated_at = now() where lower(email) = lower(p_email);
$$;
revoke all on function set_kakao_absent(text, int) from public;
grant execute on function set_kakao_absent(text, int) to anon, authenticated;
