-- ============================================================
-- 1일1비 피드백 테이블
-- 사용자가 mainboard 우상단 버튼으로 보낸 피드백 저장.
-- 운영자 페이지에서 모아보기.
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT,                       -- 익명 가능 (NULL 허용)
  name        TEXT,                       -- 보낸 사람 이름 (선택)
  day         INT,                        -- 보낸 시점 학습 Day
  category    TEXT DEFAULT 'general',     -- 'bug' | 'suggestion' | 'content' | 'general'
  message     TEXT NOT NULL,
  context     JSONB,                      -- 브라우저/페이지 등 부가 정보
  resolved    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created   ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_resolved  ON feedback(resolved, created_at DESC);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- 모두 INSERT 가능 (로그인 안 한 사람도 보낼 수 있게)
DROP POLICY IF EXISTS feedback_insert ON feedback;
CREATE POLICY feedback_insert ON feedback FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 모두 SELECT 가능 (운영자가 anon key로 운영자 페이지에서 읽음, 권한 검증은 클라이언트단)
DROP POLICY IF EXISTS feedback_select ON feedback;
CREATE POLICY feedback_select ON feedback FOR SELECT TO anon, authenticated USING (true);

-- 운영자 페이지에서 resolved 토글 + 삭제용
DROP POLICY IF EXISTS feedback_update ON feedback;
CREATE POLICY feedback_update ON feedback FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS feedback_delete ON feedback;
CREATE POLICY feedback_delete ON feedback FOR DELETE TO anon, authenticated USING (true);

-- 검증
-- INSERT INTO feedback (email, message, category) VALUES ('test@x.com', 'hello', 'general');
-- SELECT * FROM feedback ORDER BY created_at DESC LIMIT 5;
