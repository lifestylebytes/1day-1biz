-- ============================================================
-- [A] feedback 테이블 잠그기 (개인정보 노출 차단)
-- 데이터는 한 줄도 안 지웁니다. 정책(규칙)만 교체합니다.
-- DROP POLICY = 규칙 삭제 (데이터 삭제 아님)
--
-- 실행 전: operator.html 쓰는 브라우저에서 mainboard에 OTP 로그인 돼 있어야
--          운영자 판별이 됩니다. (is_op() 가 로그인 이메일로 운영자 확인)
--
-- 바뀌는 것:
--   - 외부인/일반 사용자: feedback 읽기·수정·삭제 불가 (지금은 누구나 가능)
--   - 운영자: operator.html에서 읽기·수정·삭제 그대로 가능
--   - 일반 사용자: 피드백 "보내기"(INSERT)는 그대로 가능
-- ============================================================

-- 1) 읽기: 운영자만 (지금은 anon true = 누구나)
DROP POLICY IF EXISTS feedback_select ON feedback;
CREATE POLICY feedback_select ON feedback
FOR SELECT USING (is_op());

-- 2) 수정: 운영자만 (지금은 anon true = 누구나)
DROP POLICY IF EXISTS feedback_update ON feedback;
CREATE POLICY feedback_update ON feedback
FOR UPDATE USING (is_op()) WITH CHECK (is_op());

-- 3) 삭제: 운영자만 (지금은 anon true = 누구나, 삭제 사고 원인)
DROP POLICY IF EXISTS feedback_delete ON feedback;
CREATE POLICY feedback_delete ON feedback
FOR DELETE USING (is_op());

-- 4) 보내기(INSERT): 그대로 누구나 (사용자가 피드백 보내야 하므로 유지)
--    기존 feedback_insert 정책은 건드리지 않습니다.

-- ============================================================
-- 적용 직후 점검 (이 두 줄로 확인):
--   a. operator.html 새로고침 → 피드백 24건 그대로 보이면 정상
--   b. 앱에서 💬 피드백 버튼으로 테스트 한 건 보내보면 정상 저장돼야 함
-- 문제 생기면 말해주세요. 정책은 1초 만에 되돌릴 수 있고
-- 데이터는 그대로라 안전합니다.
-- ============================================================
