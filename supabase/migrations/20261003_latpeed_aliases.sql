-- ============================================================
-- 2026-10-03 래피드 결제 이메일 ≠ 1일1비 가입 이메일 잇기
-- 예: 최미숙님이 래피드엔 A 메일로 결제하고 앱엔 B 메일로 가입 → 시트 동기화가 못 찾아 pending 으로만 남는다.
-- 이 표에 한 줄 넣어 두면 매일 07:00 동기화가 A 결제를 B 계정에 반영한다. 운영자가 한 번만 넣으면 끝.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================
create table if not exists latpeed_aliases (
  latpeed_email text primary key,          -- 래피드(시트)에 찍히는 이메일 (소문자)
  app_email     text not null,             -- 1일1비 users.email (소문자)
  note          text,
  created_at    timestamptz not null default now()
);
alter table latpeed_aliases enable row level security;
drop policy if exists latpeed_aliases_block on latpeed_aliases;
create policy latpeed_aliases_block on latpeed_aliases for all to public using (false) with check (false);

-- 넣는 법 (예시, 실제 이메일로 바꿔서):
-- insert into latpeed_aliases(latpeed_email, app_email, note) values ('래피드메일@gmail.com', '앱가입메일@naver.com', '최미숙') on conflict (latpeed_email) do update set app_email = excluded.app_email, note = excluded.note;
-- 현황: select * from latpeed_aliases order by created_at desc;
