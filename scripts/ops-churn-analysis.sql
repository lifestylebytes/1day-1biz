-- ============================================================
-- 이탈(취소) 분석 (읽기 전용, 운영자만 SQL Editor에서 실행)
-- 매주 돌려서 "누가 / 며칠차에 / 왜 / 얼마나 쓰고" 나갔는지 본다.
-- ※ 아무것도 변경하지 않음. SELECT 만 있음.
-- ============================================================

-- [1] 취소자 전체 리스트 (이탈 인터뷰 대상)
--    membership_cancel_reason 있거나 withdrawn_at 있으면 이탈로 간주.
SELECT
  name,
  email,
  cohort,
  day_in_company                              AS 이탈시_Day,
  signup_date::date                           AS 가입일,
  COALESCE(withdrawn_at, membership_ends_at)::date AS 이탈처리일,
  membership_cancel_reason                    AS 취소사유,
  last_active::date                           AS 마지막활동,
  -- 실제로 며칠이나 함께했나 (가입 ~ 마지막 활동)
  GREATEST(0, (last_active::date - signup_date::date)) AS 함께한_일수
FROM users
WHERE (membership_cancel_reason IS NOT NULL OR withdrawn_at IS NOT NULL)
  AND COALESCE(is_operator, false) = false
  AND COALESCE(is_dev_mode, false) = false
ORDER BY COALESCE(withdrawn_at, membership_ends_at) DESC NULLS LAST;


-- [2] 이탈 시점 분포: 어느 구간에서 많이 나가나
--    (첫 주 이탈 = 온보딩 문제 / 갱신 시점 이탈 = 가치 소진)
SELECT
  CASE
    WHEN day_in_company <= 7  THEN '1) 첫 주 (1-7일)'
    WHEN day_in_company <= 14 THEN '2) 2주차 (8-14일)'
    WHEN day_in_company <= 30 THEN '3) 3-4주차 (15-30일)'
    ELSE '4) 한 달 이후 (31일+)'
  END AS 이탈_구간,
  COUNT(*) AS 인원
FROM users
WHERE (membership_cancel_reason IS NOT NULL OR withdrawn_at IS NOT NULL)
  AND COALESCE(is_operator, false) = false
  AND COALESCE(is_dev_mode, false) = false
GROUP BY 1
ORDER BY 1;


-- [3] 주별 이탈 추세: 가속하는지 잦아드는지
SELECT
  date_trunc('week', COALESCE(withdrawn_at, membership_ends_at))::date AS 주_시작,
  COUNT(*) AS 이탈자수
FROM users
WHERE (membership_cancel_reason IS NOT NULL OR withdrawn_at IS NOT NULL)
  AND COALESCE(is_operator, false) = false
  AND COALESCE(is_dev_mode, false) = false
GROUP BY 1
ORDER BY 1;


-- [4] 한눈에 보는 이탈률 요약
--    전체 결제 회원 대비 취소 비율 (지금 48명 중 8명 = 16.7%)
SELECT
  COUNT(*) FILTER (WHERE cohort = 'member')                                  AS 전체_결제회원,
  COUNT(*) FILTER (WHERE cohort = 'member' AND
        (membership_cancel_reason IS NOT NULL OR withdrawn_at IS NOT NULL))  AS 취소자,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cohort = 'member' AND
        (membership_cancel_reason IS NOT NULL OR withdrawn_at IS NOT NULL))
    / NULLIF(COUNT(*) FILTER (WHERE cohort = 'member'), 0)
  , 1) AS 누적_이탈률_퍼센트
FROM users
WHERE COALESCE(is_operator, false) = false
  AND COALESCE(is_dev_mode, false) = false;

-- 읽는 법:
-- [1] 인터뷰 대상 + "며칠차에 나갔나" 한눈에
-- [2] 이탈이 첫 주에 몰리면 온보딩/기대불일치, 한 달 이후면 가치 소진
-- [3] 주별 숫자가 늘면 🔴, 초반에 몰리고 잦아들면 정상
-- [4] 누적 이탈률 한 줄 (n이 작아 한 명당 ~2%씩 움직이는 점 감안)
