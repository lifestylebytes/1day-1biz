-- ============================================================
-- 1일1비, notices 삭제 정책 추가
-- 실행: Supabase Dashboard, SQL Editor, 통째로 RUN
--
-- 배경:
--   notices 테이블에 SELECT(true), INSERT(true) 정책만 있어서
--   anon 키로 DELETE가 막혀 있었음. 운영자 페이지에서 공지 삭제하려면
--   DELETE 정책 필요.
--
-- 참고:
--   현재 운영자 인증은 클라이언트(operator.html)에서 is_operator 확인 +
--   2차로 DB is_operator 재검증으로 보호. RLS 자체는 anon 전체 허용 구조라
--   기존 INSERT 정책과 동일한 수준으로 DELETE도 개방.
-- ============================================================

DROP POLICY IF EXISTS notices_delete ON notices;
CREATE POLICY notices_delete ON notices
  FOR DELETE TO anon, authenticated
  USING (true);

-- 검증
-- SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'notices'::regclass;
