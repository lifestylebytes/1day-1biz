-- ============================================================
-- notices RLS 정비 (2026-06-11)
-- 1) 1:1 공지: 본인 + 운영자만 조회 (이수안 사고 원천 차단)
-- 2) 수정/삭제: 운영자만 (현재 anon 누구나 가능한 상태, 심각)
--
-- ⚠️ 실행 전 필수 확인: 운영자 브라우저(operator.html 쓰는 그 브라우저)에서
--    mainboard에 OTP 로그인이 돼 있어야 해요. 이 정책들은 "로그인된
--    세션의 이메일"로 운영자인지 판별하기 때문에, 로그인 안 된 브라우저의
--    operator.html은 적용 후 공지 관리가 막힙니다. (그때는 mainboard에서
--    한 번 로그인하면 해결)
-- ============================================================

-- 운영자 판별 헬퍼 (정책 3곳에서 재사용)
CREATE OR REPLACE FUNCTION is_op()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      AND (u.is_operator = true OR u.is_dev_mode = true)
  );
$$;

-- 1) SELECT: 전체 공지는 누구나, 1:1은 본인 + 운영자만
DROP POLICY IF EXISTS notices_select ON notices;
CREATE POLICY notices_select ON notices
FOR SELECT
USING (
  target_emails IS NULL
  OR EXISTS (
       SELECT 1 FROM unnest(target_emails) AS e
       WHERE lower(e) = lower(coalesce(auth.jwt() ->> 'email', ''))
     )
  OR is_op()
);

-- 2) UPDATE / DELETE: 운영자만
DROP POLICY IF EXISTS notices_update ON notices;
CREATE POLICY notices_update ON notices
FOR UPDATE USING (is_op()) WITH CHECK (is_op());

DROP POLICY IF EXISTS notices_delete ON notices;
CREATE POLICY notices_delete ON notices
FOR DELETE USING (is_op());

-- 3) (선택, 추천) INSERT도 운영자만. 현재 public insert가 열려있으면
--    아무나 가짜 공지를 만들 수 있어요. 운영자 로그인 확인 후 실행.
-- DROP POLICY IF EXISTS notices_insert_op ON notices;
-- CREATE POLICY notices_insert_op ON notices
-- FOR INSERT WITH CHECK (is_op());

-- ============================================================
-- 적용 후 점검 체크리스트
-- a. 운영자 브라우저: operator.html에서 공지 목록·발송·삭제 정상?
-- b. 일반 계정: mainboard에서 본인 1:1 답장 보임?
-- c. 시크릿 창(비로그인): 1:1 공지 안 보임? (전체 공지만 보여야 정상)
-- 문제가 생기면 말해주세요. 정책 즉시 롤백 가능합니다.
-- ============================================================
