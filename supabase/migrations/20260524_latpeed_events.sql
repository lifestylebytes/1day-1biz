-- ============================================================
-- 1일1비, 래피드 웹훅 수신 인프라
-- 실행: Supabase Dashboard, SQL Editor, 통째로 RUN
--
-- 포함:
--   1) latpeed_events 테이블 (수신 이벤트 전체 로그, 디버깅·감사용)
--   2) users.membership_cancel_reason 컬럼 (환불 사유 기록)
-- ============================================================

CREATE TABLE IF NOT EXISTS latpeed_events (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT,
  type         TEXT,              -- 'NORMAL_PAYMENT' | 'MEMBERSHIP_PAYMENT'
  status       TEXT,              -- 'SUCCESS' | 'CANCEL'
  amount       INT,
  event_at     TIMESTAMPTZ,       -- 래피드가 보낸 payment.date
  option_text  TEXT,              -- 래피드 payment.option (구독 플랜 구분용)
  raw          JSONB NOT NULL,    -- 원본 페이로드 전체
  received_at  TIMESTAMPTZ DEFAULT NOW(),
  applied      BOOLEAN DEFAULT false,  -- users 테이블 반영 여부
  apply_note   TEXT                    -- 반영 결과/스킵 사유
);

CREATE INDEX IF NOT EXISTS idx_latpeed_events_email    ON latpeed_events(email);
CREATE INDEX IF NOT EXISTS idx_latpeed_events_received ON latpeed_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_latpeed_events_type     ON latpeed_events(type, status);

ALTER TABLE latpeed_events ENABLE ROW LEVEL SECURITY;
-- anon은 읽기/쓰기 불가. Edge Function은 service_role로 호출하니 통과.
DROP POLICY IF EXISTS latpeed_events_block ON latpeed_events;
CREATE POLICY latpeed_events_block ON latpeed_events FOR ALL USING (false) WITH CHECK (false);

-- users 컬럼 보강
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_cancel_reason TEXT;

-- 검증
-- SELECT * FROM latpeed_events ORDER BY received_at DESC LIMIT 10;
