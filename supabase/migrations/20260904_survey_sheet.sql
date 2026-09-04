-- ============================================================
-- 1일1비, 운영자 시트 뷰용: Day1 설문(survey_responses) 운영자 전용 조회 RPC
-- 실행: Supabase Dashboard > SQL Editor > 통째로 RUN
-- 날짜: 2026-09-04
--
-- survey_responses 는 RLS 로 전면 차단(sr_block)돼 있어 운영자 화면에서도
-- 직접 SELECT 가 안 된다. 운영자 이메일 검증(_is_operator_email) 뒤에만
-- 돌려주는 SECURITY DEFINER 함수를 하나 둔다. 읽기 전용.
-- 의존: 20260627_content_edits.sql 의 _is_operator_email()
-- ============================================================

CREATE OR REPLACE FUNCTION list_survey_responses(p_email TEXT, p_limit INT DEFAULT 1000)
RETURNS SETOF survey_responses
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT _is_operator_email(p_email) THEN
    RAISE EXCEPTION 'not operator';
  END IF;
  RETURN QUERY
    SELECT * FROM survey_responses
     ORDER BY created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000));
END;
$$;
GRANT EXECUTE ON FUNCTION list_survey_responses(TEXT, INT) TO anon, authenticated;

-- 확인: SELECT count(*) FROM list_survey_responses('운영자이메일');
