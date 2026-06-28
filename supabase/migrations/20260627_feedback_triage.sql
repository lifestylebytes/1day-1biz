-- 피드백 AI 분류(triage) 추적
-- 2026-06-27. feedback-triage 함수가 새 피드백을 처리하면 triaged_at/triage_note 기록.
--   actionable한 콘텐츠 수정이면 content_edits(pending) 제안을 만든다.

alter table feedback add column if not exists triaged_at timestamptz;
alter table feedback add column if not exists triage_note text;

create index if not exists idx_feedback_untriaged on feedback(created_at) where triaged_at is null;
