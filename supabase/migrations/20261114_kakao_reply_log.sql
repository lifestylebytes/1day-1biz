-- ============================================================
-- 2026-11-14 피드백 답장 알림톡 기록 (Edge Function feedback-reply-notify)
-- 같은 쪽지로 알림톡이 두 번 나가지 않게 막고, 성공/실패를 남긴다.
-- 실행: Supabase Dashboard > SQL Editor > 통째로 RUN
-- ============================================================
create table if not exists kakao_reply_log (
  notice_id text primary key,
  email     text not null,
  status    text not null,          -- sent | error
  detail    jsonb,
  sent_at   timestamptz not null default now()
);
alter table kakao_reply_log enable row level security;
drop policy if exists kakao_reply_log_block on kakao_reply_log;
create policy kakao_reply_log_block on kakao_reply_log for all to public using (false) with check (false);
-- 서비스 키(Edge Function)만 읽고 쓴다.

-- 확인: select * from kakao_reply_log order by sent_at desc limit 20;
