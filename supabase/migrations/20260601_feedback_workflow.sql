-- ============================================================
-- 1일1비 피드백 워크플로우 컬럼 추가
-- - deadline: 운영자가 답장 시점에 박는 마감일
-- - completed_at, completion_notice_id: 작업 완료 시점 + 발송한 완료 알림
-- ============================================================

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS completion_notice_id BIGINT REFERENCES notices(id) ON DELETE SET NULL;

-- 마감일 조회 빠르게
CREATE INDEX IF NOT EXISTS idx_feedback_deadline ON feedback(deadline) WHERE resolved = false AND deadline IS NOT NULL;

-- 검증
-- SELECT id, email, deadline, resolved, replied_at, completed_at FROM feedback ORDER BY created_at DESC LIMIT 10;
