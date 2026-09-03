-- ============================================================
-- 1일1비, 카카오 알림톡 (오늘의 출근 알림) 준비
-- 실행: Supabase Dashboard > SQL Editor > 통째로 RUN
-- 날짜: 2026-09-03
--
-- 하는 일:
--   1) users 에 phone / kakao_notify_hour 컬럼 추가
--      (kakao_notify_hour NULL = 알림 끔, 6~22 = 그 시각(KST)에 발송)
--   2) 클라이언트용 RPC set_kakao_notify / get_kakao_notify
--      (users 직접 UPDATE 는 RLS 로 막을 예정이라 RPC 경유)
--   3) kakao_send_log : 하루 1회 중복 발송 방지 + 발송 결과 기록
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_notify_hour INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kakao_notify_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_kakao_hour ON users(kakao_notify_hour) WHERE kakao_notify_hour IS NOT NULL;

-- 발송 로그 (email + KST 날짜 유니크 → 같은 날 두 번 안 감)
CREATE TABLE IF NOT EXISTS kakao_send_log (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  sent_date   DATE NOT NULL,            -- KST 기준 날짜
  day         INT,                      -- 보낸 시점의 게이트 day
  word        TEXT,
  status      TEXT NOT NULL DEFAULT 'sent',  -- sent | dry | failed
  detail      JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email, sent_date)
);
ALTER TABLE kakao_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ksl_block ON kakao_send_log;
CREATE POLICY ksl_block ON kakao_send_log FOR ALL USING (false) WITH CHECK (false);

-- 전화번호 정규화: 숫자만 남기고 010 으로 시작하는 10~11자리만 허용
CREATE OR REPLACE FUNCTION _normalize_kr_phone(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN regexp_replace(p, '\D', '', 'g') ~ '^01[016789]\d{7,8}$' THEN regexp_replace(p, '\D', '', 'g')
    ELSE NULL END;
$$;

-- 회원이 설정 화면에서 저장 (phone 은 비우면 기존 값 유지, hour NULL 이면 끔)
CREATE OR REPLACE FUNCTION set_kakao_notify(p_email TEXT, p_phone TEXT, p_hour INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
  v_row users;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  IF p_hour IS NOT NULL AND (p_hour < 6 OR p_hour > 22) THEN
    RAISE EXCEPTION 'hour must be 6..22';
  END IF;

  v_phone := _normalize_kr_phone(p_phone);
  IF p_phone IS NOT NULL AND p_phone <> '' AND v_phone IS NULL THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;
  -- 알림을 켜려면 전화번호가 (기존이든 새로든) 있어야 함
  IF p_hour IS NOT NULL AND v_phone IS NULL THEN
    SELECT phone INTO v_phone FROM users WHERE email = p_email;
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'phone required';
    END IF;
  END IF;

  UPDATE users SET
    phone = COALESCE(v_phone, phone),
    kakao_notify_hour = p_hour,
    kakao_notify_updated_at = NOW(),
    updated_at = NOW()
  WHERE email = p_email
  RETURNING * INTO v_row;

  IF v_row.email IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'phone_masked', CASE WHEN v_row.phone IS NULL THEN NULL
                         ELSE left(v_row.phone, 3) || '****' || right(v_row.phone, 4) END,
    'hour', v_row.kakao_notify_hour
  );
END;
$$;
GRANT EXECUTE ON FUNCTION set_kakao_notify(TEXT, TEXT, INT) TO anon, authenticated;

-- 설정 화면 초기값 (전화번호는 마스킹해서 반환)
CREATE OR REPLACE FUNCTION get_kakao_notify(p_email TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'has_phone', phone IS NOT NULL,
    'phone_masked', CASE WHEN phone IS NULL THEN NULL
                         ELSE left(phone, 3) || '****' || right(phone, 4) END,
    'hour', kakao_notify_hour
  ) FROM users WHERE email = p_email;
$$;
GRANT EXECUTE ON FUNCTION get_kakao_notify(TEXT) TO anon, authenticated;

-- ── 확인용 (실행 후 따로 돌려보기) ──
-- 전화번호 커버리지: 활성 회원 중 phone 있는 사람 수
-- SELECT
--   COUNT(*) FILTER (WHERE withdrawn_at IS NULL AND (membership_ends_at IS NULL OR membership_ends_at > NOW())) AS active,
--   COUNT(*) FILTER (WHERE withdrawn_at IS NULL AND (membership_ends_at IS NULL OR membership_ends_at > NOW()) AND phone IS NOT NULL) AS with_phone,
--   COUNT(*) FILTER (WHERE kakao_notify_hour IS NOT NULL) AS notify_on
-- FROM users;
--
-- 대기 명단(waitlist)에 남긴 전화번호를 같은 이메일 회원에게 옮기기 (선택, 1회):
-- UPDATE users u SET phone = _normalize_kr_phone(w.phone)
--   FROM waitlist w
--  WHERE u.email = w.email AND u.phone IS NULL AND _normalize_kr_phone(w.phone) IS NOT NULL;
