-- ============================================================
-- 모닝 브리핑 D-day 체크리스트를 SQL과 연동
-- ------------------------------------------------------------
-- 배경:
--   feedback 테이블은 ops-2026-06-11_fix-A-feedback.sql 이후
--   SELECT/UPDATE/DELETE 가 운영자(is_op()) 전용이다.
--   모닝 브리핑 스케줄 작업은 publishable(anon) 키로 도는 비-운영자라
--   feedback 을 못 읽어서 D-day 체크리스트가 항상 0건으로 떨어졌다.
--
-- 해법:
--   민감 컬럼(email, context 등) 빼고 브리핑에 필요한 최소 필드만
--   돌려주는 SECURITY DEFINER 함수 2개를 만든다.
--   SECURITY DEFINER 라서 함수 소유자(postgres) 권한으로 실행되어
--   op-only SELECT 정책을 안전하게 우회한다. anon 도 호출 가능.
--
-- 실행: Supabase Dashboard > SQL Editor 에 통째로 붙여넣고 Run.
--   (SQL Editor 는 postgres 권한이라 RLS 무시하고 실행됨)
-- ============================================================

-- 1) 미해결 + 마감일 있는 항목 (D-day 체크리스트 소스)
CREATE OR REPLACE FUNCTION get_open_deadlines()
RETURNS TABLE (
  id        bigint,
  name      text,
  category  text,
  deadline  date,
  day       int,
  message   text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, name, category, deadline, day, message
  FROM feedback
  WHERE resolved = false
    AND deadline IS NOT NULL
  ORDER BY deadline ASC;
$$;

GRANT EXECUTE ON FUNCTION get_open_deadlines() TO anon, authenticated;

-- 2) 특정 기간에 들어온 피드백 (어제 새 피드백 섹션 소스)
CREATE OR REPLACE FUNCTION get_feedback_between(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  id          bigint,
  name        text,
  category    text,
  day         int,
  message     text,
  created_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, name, category, day, message, created_at
  FROM feedback
  WHERE created_at >= p_from
    AND created_at <  p_to
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_feedback_between(timestamptz, timestamptz) TO anon, authenticated;

-- ============================================================
-- 3) (선택) 지금 TASKS.md 에 있는 마감 항목 6개를 feedback 으로 이관.
--    이미 처리됐거나 ops 성격(해외결제 등)이라 빼고 싶으면 해당 줄을 지우세요.
--    운영자는 이후 operator.html 에서 resolved 토글 / 마감일 수정으로 관리.
-- ============================================================
INSERT INTO feedback (name, category, message, deadline, resolved, context) VALUES
  ('김혜인', 'general',    '혜인님 카톡 답장 발송 (유비챌 대신 1일1비 고른 이유 질문, 관계 유지 + 인사이트). 답장 오면 PLANNING 포지셔닝 안건에 반영', '2026-06-16', false, '{"source":"TASKS.md 이관","type":"ops"}'),
  ('운영',   'general',    '해외결제 수단 결정 및 도입 (Latpeed 해외카드 결제 불가. MoR/Stripe 등 관리 쉬운 대안 검토)',                          '2026-06-30', false, '{"source":"TASKS.md 이관","type":"ops"}'),
  ('김원미', 'suggestion', '나만의 노트 모아보기 페이지',                                                                                  '2026-06-30', false, '{"source":"TASKS.md 이관"}'),
  ('최은정', 'suggestion', '피드백 답변 패턴 다양화 (액션 동사 외에 time-bound, specificity, tone 등으로 확장)',                           '2026-06-30', false, '{"source":"TASKS.md 이관"}'),
  ('김원미', 'content',    '숫자 콘텐츠 추가 (단어 풀: ten million/hundred million 등, 정직원 레벨업 후 시추에이션 연결)',                 '2026-06-30', false, '{"source":"TASKS.md 이관"}'),
  ('진여송', 'suggestion', '음성 녹음 기능 아이디어 회의/설계 정리 (녹음만이 아니라 발음 피드백/자연스러움 체크까지 어떻게 짤지)',        '2026-06-30', false, '{"source":"TASKS.md 이관"}');

-- ============================================================
-- 검증
-- ============================================================
-- SELECT * FROM get_open_deadlines();
-- SELECT * FROM get_feedback_between('2026-06-14T00:00:00+09', '2026-06-15T00:00:00+09');
