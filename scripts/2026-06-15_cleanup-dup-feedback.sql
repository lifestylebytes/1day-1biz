-- ============================================================
-- 중복 정리: 이관 INSERT 중 기존 사용자 피드백과 겹치는 3건 삭제
-- ------------------------------------------------------------
-- get_open_deadlines() 로 확인해보니 id 4/6/7 에 같은 취지의
-- 원본 사용자 피드백이 이미 있었다. 이관으로 넣은 45/47/48 은 그 요약본이라 중복.
-- 원본(4/6/7)은 남기고 이관 요약본만 지운다.
--
-- 실행: Supabase Dashboard > SQL Editor 에 붙여넣고 Run.
-- ============================================================

-- 안전 확인: 지울 대상 미리보기 (원하면 먼저 이 SELECT만 돌려보기)
-- SELECT id, name, message, context FROM feedback WHERE id IN (45, 47, 48);

DELETE FROM feedback
WHERE id IN (45, 47, 48)
  AND context->>'source' = 'TASKS.md 이관';

-- 검증
-- SELECT id, deadline, name, message FROM feedback
-- WHERE resolved = false AND deadline IS NOT NULL ORDER BY deadline, id;
