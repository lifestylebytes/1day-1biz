-- ============================================================
-- 1day-1biz Supabase Schema
-- 실행: Supabase 프로젝트 → SQL Editor → 통째로 붙여넣고 RUN
-- ============================================================

-- ====================
-- USERS 테이블
-- ====================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 신원 (실제)
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  signup_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 신원 (게임 내)
  emp_number TEXT UNIQUE,
  department JSONB,
  mentor JSONB,
  coworkers JSONB DEFAULT '[]'::jsonb,

  -- 진도
  level JSONB DEFAULT '{"id":"probation","ko":"수습","en":"Probation"}'::jsonb,
  day_in_company INT DEFAULT 1,
  scenarios_completed JSONB DEFAULT '[]'::jsonb,
  words_studied JSONB DEFAULT '[]'::jsonb,

  -- 학습 과학 측정 (P1, P3)
  production_attempts JSONB DEFAULT '{"correct":0,"total":0}'::jsonb,
  novelty_events JSONB DEFAULT '[]'::jsonb,

  -- 활동
  last_active TIMESTAMPTZ DEFAULT NOW(),
  total_sessions INT DEFAULT 1,
  total_session_ms BIGINT DEFAULT 0,

  -- 설정
  preferences JSONB DEFAULT '{"notifications":true,"timezone":"Asia/Seoul"}'::jsonb,

  -- 운영 메타
  onboarding_motivation TEXT,
  cohort TEXT,
  schema_version INT DEFAULT 1,

  -- 권한 / 마킹
  is_operator BOOLEAN DEFAULT FALSE,
  is_pilot_hire BOOLEAN DEFAULT FALSE,
  is_dev_mode BOOLEAN DEFAULT FALSE,
  is_tester BOOLEAN DEFAULT FALSE,

  -- 로그인 (선택, Supabase Auth 연동 시 별도 처리)
  password_hash TEXT,
  password_salt TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);

-- 운영자 이메일 자동 마킹
CREATE OR REPLACE FUNCTION auto_mark_operator()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IN ('dmsgktn0523@gmail.com', 'buddy@youbuddy.co.kr') THEN
    NEW.is_operator := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_mark_operator ON users;
CREATE TRIGGER trigger_auto_mark_operator
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION auto_mark_operator();


-- ====================
-- PILOT_CODES 테이블 (베타 초대 코드 화이트리스트)
-- 클라이언트 정규식만으로는 'PILOT-XXXX' 같은 placeholder도 통과되므로,
-- 실제 발급된 코드인지 서버에서 SELECT로 검증한다.
-- ====================
CREATE TABLE IF NOT EXISTS pilot_codes (
  code TEXT PRIMARY KEY,
  label TEXT,
  active BOOLEAN DEFAULT TRUE,
  cohort TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_count INT DEFAULT 0
);

-- 1기 베타 통일 코드 시드
INSERT INTO pilot_codes (code, label, cohort) VALUES
  ('PILOT-2026', '1기 베타 통일 코드', 'season-2026-1')
ON CONFLICT (code) DO NOTHING;

-- RLS: 익명 사용자도 활성 코드 존재 여부는 SELECT 가능 (검증용),
-- 코드 발급/수정은 운영자(service_role)만 가능
ALTER TABLE pilot_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pilot_codes_anon_read ON pilot_codes;
CREATE POLICY pilot_codes_anon_read ON pilot_codes
  FOR SELECT TO anon, authenticated
  USING (active = TRUE);


-- ====================
-- EVENTS 테이블 (학습·활동 로그)
-- ====================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  type TEXT NOT NULL,
  -- 예: 'signup', 'scenario_started', 'word_attempted', 'production_correct',
  --     'production_wrong', 'novelty_event_shown', 'notice_read',
  --     'level_up', 'session_start', 'session_end', 'day_advanced'

  payload JSONB DEFAULT '{}'::jsonb,
  happened_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_user_time ON events(user_id, happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, happened_at DESC);


-- ====================
-- WAITLIST 테이블 (대기 등록, 정식 오픈 전 신청자)
-- ====================
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  prior_cohorts JSONB DEFAULT '[]'::jsonb,  -- ["yubichal-1","yubichal-3"] 또는 ["none"]

  -- 페르소나·니즈 데이터 (선택)
  current_env TEXT,                          -- "foreign-junior" | "korean-only" | etc.
  english_usage JSONB DEFAULT '[]'::jsonb,   -- ["meeting","email","messenger"] 등 다중
  study_methods JSONB DEFAULT '[]'::jsonb,   -- ["academy","video-tutor","ai"] 등 다중
  pain_points JSONB DEFAULT '[]'::jsonb,     -- ["meeting","email-tone"] 등 다중
  goal TEXT,                                 -- "foreign-job" | "current-conf" | etc.
  goal_detail TEXT,                          -- 자유 입력
  message TEXT,                              -- 한 줄 메시지
  heard_from TEXT,                           -- 인스타 / 유비챌 / 친구 추천 등

  source TEXT,                               -- "waitlist-page" | etc.
  user_agent TEXT,
  notified_at TIMESTAMPTZ,                   -- 정식 오픈 안내 보낸 시점
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 이미 waitlist 테이블이 있으면 컬럼만 추가 (마이그레이션)
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS current_env TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS english_usage JSONB DEFAULT '[]'::jsonb;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS study_methods JSONB DEFAULT '[]'::jsonb;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS pain_points JSONB DEFAULT '[]'::jsonb;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS goal_detail TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS heard_from TEXT;
-- 만약 이전 버전에서 current_role 컬럼이 만들어졌다면 rename
-- ("current_role"은 PG 예약어라 반드시 큰따옴표로 감싸야 컬럼명으로 인식됨)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='waitlist' AND column_name='current_role') THEN
    EXECUTE 'ALTER TABLE waitlist RENAME COLUMN "current_role" TO current_env';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);


-- ====================
-- NOTICES 테이블 (운영자 발송 공지)
-- ====================
CREATE TABLE IF NOT EXISTS notices (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,  -- 'notice' | 'event' | 'ceo' | 'event-novelty'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  from_name TEXT DEFAULT '유버디 (Buddy)',
  audience TEXT DEFAULT 'all',  -- 'all' | 'level:probation' | 'cohort:xxx' 등
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_notices_sent ON notices(sent_at DESC);


-- ====================
-- NOTICE_READS (사용자별 읽음 상태)
-- ====================
CREATE TABLE IF NOT EXISTS notice_reads (
  notice_id BIGINT REFERENCES notices(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (notice_id, user_id)
);


-- ====================
-- updated_at 자동 갱신
-- ====================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ====================
-- Row Level Security (RLS)
-- ====================
-- v1엔 단순화: 누구나 INSERT/SELECT 가능 (anon key로)
-- v1.5에 Supabase Auth 붙이고 사용자별 격리로 강화

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- waitlist, 누구나 INSERT, 운영자만 SELECT (v1.5에서 강화)
DROP POLICY IF EXISTS waitlist_insert ON waitlist;
CREATE POLICY waitlist_insert ON waitlist FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS waitlist_select ON waitlist;
CREATE POLICY waitlist_select ON waitlist FOR SELECT USING (true);

-- users, 모두 INSERT (가입), 모두 SELECT (운영자 뷰)
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE USING (true);

-- events, 모두 INSERT, 모두 SELECT
DROP POLICY IF EXISTS events_insert ON events;
CREATE POLICY events_insert ON events FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS events_select ON events;
CREATE POLICY events_select ON events FOR SELECT USING (true);

-- notices, 모두 SELECT, 운영자만 INSERT (v1.5에 강화)
DROP POLICY IF EXISTS notices_select ON notices;
CREATE POLICY notices_select ON notices FOR SELECT USING (true);

DROP POLICY IF EXISTS notices_insert ON notices;
CREATE POLICY notices_insert ON notices FOR INSERT WITH CHECK (true);

-- notice_reads, 모두
DROP POLICY IF EXISTS notice_reads_all ON notice_reads;
CREATE POLICY notice_reads_all ON notice_reads FOR ALL USING (true);


-- ====================
-- 운영자 뷰용 집계
-- ====================
CREATE OR REPLACE VIEW operator_stats AS
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '24 hours') AS active_24h,
  COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '7 days') AS active_7d,
  AVG(day_in_company) AS avg_day,
  COUNT(*) FILTER (WHERE day_in_company >= 14) AS reached_day14,
  COUNT(*) FILTER (WHERE day_in_company >= 30) AS reached_day30,
  COUNT(*) FILTER (WHERE day_in_company >= 180) AS reached_day180
FROM users
WHERE NOT is_operator AND NOT is_dev_mode;


-- ============================================================
-- 끝. SQL Editor에서 RUN.
-- 성공 시 좌측 Table Editor에서 users / events / notices / notice_reads 4개 보임.
-- ============================================================
