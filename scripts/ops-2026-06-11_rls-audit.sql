-- ============================================================
-- RLS 점검 전용 (읽기만, 아무것도 변경하지 않음)
-- Supabase Dashboard > SQL Editor 에서 한 블록씩 실행하고
-- 결과를 그대로 복사해서 공유해주세요.
-- ============================================================

-- [1] 테이블별 RLS 켜짐/꺼짐
--    rls_enabled = false 인 테이블은 정책과 무관하게 전부 노출됨 (위험 신호)
SELECT relname AS table_name,
       relrowsecurity AS rls_enabled,
       relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
ORDER BY relname;


-- [2] 모든 정책 한눈에: 테이블 / 동작 / 대상역할 / 조건
--    여기서 봐야 할 위험 패턴:
--    - cmd=SELECT 인데 qual=true  → 누구나 전체 조회 (개인정보면 위험)
--    - cmd=UPDATE/DELETE/INSERT 인데 roles에 anon 포함 + qual=true
--      → 비로그인 누구나 수정·삭제·삽입 가능 (심각)
SELECT tablename,
       policyname,
       cmd,
       roles,
       qual        AS using_condition,
       with_check  AS check_condition
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;


-- [3] anon/authenticated 역할에 직접 부여된 테이블 권한 (GRANT)
--    RLS와 별개로, 테이블 자체 GRANT가 너무 열려있는지 점검
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
