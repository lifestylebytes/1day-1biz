-- ============================================================
-- 1일1비 추가 마이그레이션, Day 진도 + 공지 읽음 영속화
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- 의존: 20260519_normalize_learning.sql 먼저 RUN 돼있어야 함
--
-- 이번 추가:
--   1) save_day_progress RPC, day_in_company 저장을 RLS 우회 RPC로
--   2) notice_reads_v2 테이블 (DB·하드코딩 공지 통합), email + notice_key
--   3) mark_notice_read RPC
--   4) get_notice_reads RPC (사용자별 읽은 공지 ID 목록)
-- ============================================================

-- ====================
-- 1. Day 진도 저장 RPC
-- ====================
CREATE OR REPLACE FUNCTION save_day_progress(p_email TEXT, p_day INT)
RETURNS users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r users;
BEGIN
  IF p_email IS NULL OR p_day IS NULL OR p_day < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;
  UPDATE users
     SET day_in_company = GREATEST(COALESCE(day_in_company, 1), p_day),
         last_active = NOW(),
         updated_at = NOW()
   WHERE email = p_email
   RETURNING * INTO r;
  IF r IS NULL THEN
    RAISE EXCEPTION 'user not found: %', p_email;
  END IF;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION save_day_progress(TEXT, INT) TO anon, authenticated;


-- ====================
-- 2. 공지 읽음 통합 테이블 (DB·하드코딩 공지 모두)
-- 기존 notice_reads는 그대로 둠 (FK 있는 기록 보존), 신규 사용은 v2로 통일
-- ====================
CREATE TABLE IF NOT EXISTS notice_reads_v2 (
  email      TEXT NOT NULL,
  notice_key TEXT NOT NULL,            -- "db-123" 또는 "buddy-001" 같은 클라이언트 id
  read_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email, notice_key)
);
CREATE INDEX IF NOT EXISTS idx_nrv2_email ON notice_reads_v2(email);

ALTER TABLE notice_reads_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nrv2_block ON notice_reads_v2;
CREATE POLICY nrv2_block ON notice_reads_v2 FOR ALL USING (false) WITH CHECK (false);


-- ====================
-- 3. 공지 읽음 마킹 RPC
-- ====================
CREATE OR REPLACE FUNCTION mark_notice_read(p_email TEXT, p_notice_key TEXT)
RETURNS notice_reads_v2
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r notice_reads_v2;
BEGIN
  IF p_email IS NULL OR COALESCE(p_notice_key,'') = '' THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  INSERT INTO notice_reads_v2(email, notice_key)
  VALUES (p_email, p_notice_key)
  ON CONFLICT (email, notice_key) DO UPDATE SET read_at = notice_reads_v2.read_at
  RETURNING * INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_notice_read(TEXT, TEXT) TO anon, authenticated;


-- ====================
-- 4. 공지 읽음 조회 RPC
-- ====================
CREATE OR REPLACE FUNCTION get_notice_reads(p_email TEXT)
RETURNS TABLE(notice_key TEXT, read_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT notice_key, read_at
    FROM notice_reads_v2
   WHERE email = p_email
   ORDER BY read_at DESC;
$$;
GRANT EXECUTE ON FUNCTION get_notice_reads(TEXT) TO anon, authenticated;


-- ====================
-- 5. users 테이블 직접 update 차단 (RPC만 통로)
-- 단, 본인 가입 INSERT는 허용 유지 (기존 정책)
-- 운영자(service_role)은 RLS 무시
-- ====================
-- 기존 users_update 정책을 차단으로 교체. 이제 day_in_company는 save_day_progress RPC로만.
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_update_self ON users;
DROP POLICY IF EXISTS users_update_blocked ON users;
CREATE POLICY users_update_blocked ON users
  FOR UPDATE TO anon, authenticated
  USING (false);


-- ====================
-- 검증
-- ====================
-- SELECT save_day_progress('dmsgktn0523@gmail.com', 1);
-- SELECT mark_notice_read('dmsgktn0523@gmail.com', 'test-notice-1');
-- SELECT * FROM get_notice_reads('dmsgktn0523@gmail.com');

-- ============================================================
-- 끝. 이걸 RUN하고 나면 클라이언트는 더이상 users 테이블을 직접 UPDATE 못함.
-- 모든 변경은 RPC를 통해서만 가능. JSONB 통째 덮어쓰기로 인한 부분 손실 원천 차단.
-- ============================================================
