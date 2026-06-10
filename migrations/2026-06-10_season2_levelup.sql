-- ============================================================
-- 시즌 2 (Day 31-60) 마이그레이션
-- 실행 위치: Supabase Dashboard > SQL Editor
-- 안전: ADD COLUMN IF NOT EXISTS 만 사용. 기존 데이터 변경 없음.
-- ============================================================

-- 레벨업(수습 → 정직원) 추적
ALTER TABLE users ADD COLUMN IF NOT EXISTS levelup_completed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS levelup_test_score INT;

-- 정직원 60일 특별 면담 추적용 (Phase 4)
ALTER TABLE users ADD COLUMN IF NOT EXISTS day60_completed_at TIMESTAMPTZ;

-- 확인용 쿼리 (실행 후 컬럼 존재 확인)
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'users'
--    AND column_name IN ('levelup_completed_at', 'levelup_test_score', 'day60_completed_at');
