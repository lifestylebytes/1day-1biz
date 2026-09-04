-- ============================================================
-- 재방문 넛지 발송 기록 (중복 발송 방지 + 효과 분석)
-- Supabase SQL Editor에서 실행.
-- ============================================================
CREATE TABLE IF NOT EXISTS reengagement_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL,
  kind       text NOT NULL,        -- start | day1 | comeback | comeback7 | comeback14 | renewal | transition31 | transition58 | push_update
  sent_at    timestamptz NOT NULL DEFAULT now(),
  meta       jsonb
);

CREATE INDEX IF NOT EXISTS idx_reengage_email_kind ON reengagement_log (email, kind, sent_at DESC);

-- RLS: anon/사용자는 접근 불가. Edge Function(service_role)만 씀.
ALTER TABLE reengagement_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reengage_block ON reengagement_log;
CREATE POLICY reengage_block ON reengagement_log FOR ALL TO public USING (false) WITH CHECK (false);

-- 발송 현황 보고 싶을 때 (운영자, SQL Editor에서):
-- SELECT kind, count(*), max(sent_at) FROM reengagement_log GROUP BY kind;
