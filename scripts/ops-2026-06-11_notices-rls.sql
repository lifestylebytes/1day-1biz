-- ============================================================
-- 1:1 공지 DB 원천 차단 (RLS)
-- 배경: 이수안님이 이정언님 1:1 답장을 본 사고. 클라이언트 수정만으론
--       구버전 캐시/빈 세션 클라이언트를 못 막아서 DB에서 차단.
-- ⚠️ 반드시 1번 SELECT 먼저 실행해서 기존 정책 이름을 확인하고,
--    2번의 DROP POLICY 줄에 그 이름을 넣어 실행하세요.
-- ============================================================

-- 1) 기존 notices SELECT 정책 확인
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'notices';

-- 2) 기존 SELECT 정책을 지우고, 본인/운영자만 1:1을 볼 수 있는 정책으로 교체
--    (아래 "기존_SELECT_정책명" 을 1번 결과의 이름으로 바꿔서 실행)
-- DROP POLICY IF EXISTS "기존_SELECT_정책명" ON notices;

CREATE POLICY notices_select_targeted ON notices
FOR SELECT
USING (
  -- 전체 공지는 누구나
  target_emails IS NULL
  -- 1:1 공지는 로그인한 본인만
  OR lower(coalesce(auth.jwt() ->> 'email', '')) = ANY (
       SELECT lower(e) FROM unnest(target_emails) AS e
     )
  -- 운영자/Dev는 전부 (operator.html 공지 관리용)
  OR EXISTS (
       SELECT 1 FROM users u
       WHERE lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
         AND (u.is_operator = true OR u.is_dev_mode = true)
     )
);

-- 3) 확인: 익명(비로그인)으로는 1:1 공지가 안 보여야 정상
--    (적용 후 mainboard에서 본인 1:1이 잘 보이는지도 꼭 확인.
--     OTP 로그인 세션이 만료된 사용자는 재로그인 전까지 1:1이 안 보일 수 있는데,
--     이건 의도된 안전 동작입니다.)
