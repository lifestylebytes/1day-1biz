-- ============================================================
-- 1일1비 피드백 답장 시스템
-- 운영자가 피드백 보낸 사용자에게만 사내 메모 답장.
-- 답장 기록은 notices + feedback 둘 다에 저장 (영구 보존).
-- ============================================================

-- 1) notices에 target_emails 추가
--    NULL = 전체 공지 (broadcast). 배열 = 그 이메일들에게만 보임.
ALTER TABLE notices ADD COLUMN IF NOT EXISTS target_emails TEXT[];

-- 빠른 조회를 위해 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_notices_target_emails ON notices USING GIN (target_emails);

-- 2) feedback에 답장 추적 컬럼
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS reply_notice_id BIGINT REFERENCES notices(id) ON DELETE SET NULL;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- 검증
-- SELECT id, target_emails FROM notices ORDER BY sent_at DESC LIMIT 5;
-- SELECT id, email, resolved, reply_notice_id, replied_at FROM feedback ORDER BY created_at DESC LIMIT 5;
