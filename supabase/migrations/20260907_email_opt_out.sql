-- 2026-09-07 이메일 수신거부 목록 (링크 한 번 수신거부). 발송 함수가 보내기 전에 여기 있는지 확인한다.
create table if not exists email_opt_out (
  email  text primary key,
  at     timestamptz not null default now(),
  source text
);
alter table email_opt_out enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가. Edge Function(service_role)만 읽고 쓴다.
