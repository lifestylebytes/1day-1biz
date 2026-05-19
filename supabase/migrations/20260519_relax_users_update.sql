-- ============================================================
-- 1일1비, Migration 2 보완: users update 정책 완화
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- 의존: 20260519_normalize_learning.sql + 20260519_day_and_notices.sql 먼저 RUN
--
-- 배경:
--   Migration 2에서 users 테이블 직접 UPDATE를 완전 차단했는데,
--   simulator.html의 unlock 처리(cohort sync), supabase-client.js의
--   cancelMembership / restoreMembership 같은 정상 흐름까지 막혀버림.
--
-- 이번 정정:
--   1) users_update_blocked 정책 제거, USING (true)로 다시 개방
--   2) 단, 학습 컬럼(scenarios_completed, saved_notes, daily_journals)은
--      이제 클라이언트가 새 RPC 경로(save_submission/note/journal)로만 사용하므로
--      직접 update 위험은 클라이언트 코드 측에서 차단된 상태.
-- ============================================================

-- 기존 차단 정책 제거
DROP POLICY IF EXISTS users_update_blocked ON users;
DROP POLICY IF EXISTS users_update_self    ON users;

-- 다시 개방 (v1 정책 부활)
CREATE POLICY users_update_open ON users
  FOR UPDATE TO anon, authenticated
  USING (true);

-- 검증
-- SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'users'::regclass;
