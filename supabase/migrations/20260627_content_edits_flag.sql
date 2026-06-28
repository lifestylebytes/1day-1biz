-- content_edits에 신고(피드백) 출처 + 신고자 정보 (운영자가 누가/왜 신고했는지 보고, 반영 시 알림)
-- 2026-06-27.
alter table content_edits add column if not exists feedback_id uuid;
alter table content_edits add column if not exists reporter_email text;
alter table content_edits add column if not exists reporter_name text;
alter table content_edits add column if not exists original_message text;
