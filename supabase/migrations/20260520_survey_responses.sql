-- ============================================================
-- 설문 응답 저장 (Day 2 진입 시 1일차 피드백 등 범용)
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================

CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  survey_key TEXT NOT NULL,
  responses JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sr_email ON survey_responses(email);
CREATE INDEX IF NOT EXISTS idx_sr_key ON survey_responses(survey_key, created_at DESC);

ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sr_block ON survey_responses;
CREATE POLICY sr_block ON survey_responses FOR ALL USING (false) WITH CHECK (false);

-- 응답 저장 RPC
CREATE OR REPLACE FUNCTION save_survey_response(p_email TEXT, p_key TEXT, p_responses JSONB)
RETURNS survey_responses
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r survey_responses;
BEGIN
  IF p_email IS NULL OR COALESCE(p_key,'') = '' OR p_responses IS NULL THEN
    RAISE EXCEPTION 'invalid input';
  END IF;
  INSERT INTO survey_responses(email, survey_key, responses)
  VALUES (p_email, p_key, p_responses)
  RETURNING * INTO r;
  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION save_survey_response(TEXT, TEXT, JSONB) TO anon, authenticated;
