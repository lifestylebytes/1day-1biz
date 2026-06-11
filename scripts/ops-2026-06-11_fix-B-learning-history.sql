-- ============================================================
-- [B] learning_history 구버전 정책 제거
-- 데이터는 한 줄도 안 지웁니다. 구버전 "문 항상 열림" 정책만 뗍니다.
--
-- 현재 이 테이블의 정책 4개:
--   (좋음) learning_history_select_own : 본인 또는 운영자만 조회  ← 남김
--   (좋음) learning_history_insert     : 본인 이메일로만 삽입      ← 남김
--   (구버전) lh_select : 누구나 전체 조회 (true)                  ← 제거
--   (구버전) lh_insert : 누구나 아무 이메일로 삽입 (true)         ← 제거
--
-- lh_select/lh_insert만 떼면, 남은 좋은 정책이 제대로 작동합니다.
-- (RLS는 정책을 OR로 합치므로 true 정책 하나가 나머지를 무력화하던 상태)
-- ============================================================

DROP POLICY IF EXISTS lh_select ON learning_history;
DROP POLICY IF EXISTS lh_insert ON learning_history;

-- ============================================================
-- 적용 직후 점검:
--   a. 앱에서 학습을 한 번 진행 → 정상 저장/진행되면 OK
--      (learning_history_insert 정책이 본인 이메일 삽입을 계속 허용)
--   b. operator.html에서 학습 통계가 평소처럼 보이면 OK (is_op로 조회)
-- 남은 정책 확인용 (선택):
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename = 'learning_history';
--   → learning_history_select_own, learning_history_insert 2개만 남아야 정상
-- ============================================================
