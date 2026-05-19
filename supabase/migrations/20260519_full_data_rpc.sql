-- ============================================================
-- 1일1비, cross-device hydrate용 통합 조회 RPC
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- 의존: 20260519_normalize_learning.sql + 20260519_day_and_notices.sql
--
-- 목적:
--   mainboard 진입 시 사용자의 학습 데이터 전부를 한 번의 RPC로 가져옴.
--   submissions / notes / journals / notice_reads_v2 통합.
--   클라이언트는 이걸 localStorage 형식으로 변환해서 hydrate.
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_full_data(p_email TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'submissions',
      (SELECT COALESCE(jsonb_agg(row_to_json(s.*) ORDER BY s.day), '[]'::jsonb)
         FROM submissions s WHERE s.email = p_email),
    'notes',
      (SELECT COALESCE(jsonb_agg(row_to_json(n.*) ORDER BY n.day, n.created_at), '[]'::jsonb)
         FROM notes n WHERE n.email = p_email),
    'journals',
      (SELECT COALESCE(jsonb_agg(row_to_json(j.*) ORDER BY j.day), '[]'::jsonb)
         FROM journals j WHERE j.email = p_email),
    'notice_reads',
      (SELECT COALESCE(jsonb_agg(notice_key), '[]'::jsonb)
         FROM notice_reads_v2 WHERE email = p_email)
  );
$$;

GRANT EXECUTE ON FUNCTION get_user_full_data(TEXT) TO anon, authenticated;

-- 검증
-- SELECT get_user_full_data('yoogabrielle@gmail.com');
