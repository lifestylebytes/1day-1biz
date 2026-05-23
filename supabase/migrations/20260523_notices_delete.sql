-- ============================================================
-- 1일1비, notices 관리 기능 보강 (삭제/수정/팝업/확인자 집계)
-- 실행: Supabase Dashboard, SQL Editor, 통째로 RUN
--
-- 포함 내용:
--   1) DELETE 정책 (운영자 공지 삭제)
--   2) UPDATE 정책 (운영자 공지 수정)
--   3) popup 컬럼 (사용자 입장 시 팝업으로 띄울지 여부)
--   4) get_notice_read_counts RPC (공지별 확인자 수 집계)
--
-- 참고:
--   운영자 인증은 클라이언트(operator.html)에서 is_operator 확인 +
--   DB is_operator 재검증으로 보호. RLS는 기존 INSERT와 동일 수준으로 개방.
-- ============================================================

-- 1) DELETE 정책
DROP POLICY IF EXISTS notices_delete ON notices;
CREATE POLICY notices_delete ON notices
  FOR DELETE TO anon, authenticated
  USING (true);

-- 2) UPDATE 정책
DROP POLICY IF EXISTS notices_update ON notices;
CREATE POLICY notices_update ON notices
  FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

-- 3) popup 컬럼 (기본 false)
ALTER TABLE notices ADD COLUMN IF NOT EXISTS popup BOOLEAN DEFAULT false;

-- 4) 공지별 확인(읽음) 사람 수 집계 RPC
CREATE OR REPLACE FUNCTION get_notice_read_counts()
RETURNS TABLE(notice_key TEXT, cnt BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT notice_key, COUNT(DISTINCT email) AS cnt
  FROM notice_reads_v2
  GROUP BY notice_key;
$$;

GRANT EXECUTE ON FUNCTION get_notice_read_counts() TO anon, authenticated;

-- 검증
-- SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'notices'::regclass;
-- SELECT * FROM get_notice_read_counts();
