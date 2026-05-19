-- ============================================================
-- 1일1비, 일정 체크 상태 영속화
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- 의존: 20260519_normalize_learning.sql + 20260519_full_data_rpc.sql
--
-- 목적:
--   mainboard의 4개 일정 (09:00 출근 / 10:00 시추에이션 / 14:00 미니미션 / 17:00 일지)
--   체크 상태가 그동안 __OD_TASKS_DAY_<day> localStorage 키에만 저장돼서
--   다른 기기 로그인하면 "어디까지 했는지" 안 보이는 문제 해결.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_progress (
  email      TEXT NOT NULL,
  day        INT NOT NULL,
  tasks      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email, day)
);
CREATE INDEX IF NOT EXISTS idx_tp_email ON task_progress(email);

ALTER TABLE task_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tp_block ON task_progress;
CREATE POLICY tp_block ON task_progress FOR ALL USING (false) WITH CHECK (false);

-- 일정 체크 저장 (union merge, true는 false로 다운그레이드 안 됨)
CREATE OR REPLACE FUNCTION save_task_progress(p_email TEXT, p_day INT, p_tasks JSONB)
RETURNS task_progress
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r task_progress;
BEGIN
  IF p_email IS NULL OR p_day IS NULL THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  INSERT INTO task_progress(email, day, tasks)
  VALUES (p_email, p_day, COALESCE(p_tasks, '{}'::jsonb))
  ON CONFLICT (email, day) DO UPDATE SET
    -- || 연산자로 병합. 단 기존이 true면 false로 덮어쓰지 않게 추가 가드는 클라이언트에서.
    tasks = task_progress.tasks || EXCLUDED.tasks,
    updated_at = NOW()
  RETURNING * INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION save_task_progress(TEXT, INT, JSONB) TO anon, authenticated;

-- get_user_full_data에 task_progress 통합 (전체 교체)
CREATE OR REPLACE FUNCTION get_user_full_data(p_email TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'submissions',
      (SELECT COALESCE(jsonb_agg(row_to_json(s.*) ORDER BY s.day), '[]'::jsonb)
         FROM submissions s WHERE s.email = p_email),
    'notes',
      (SELECT COALESCE(jsonb_agg(row_to_json(n.*) ORDER BY n.day, n.created_at), '[]'::jsonb)
         FROM notes n WHERE n.email = p_email),
    'journals',
      (SELECT COALESCE(jsonb_agg(row_to_json(j.*) ORDER BY j.day), '[]'::jsonb)
         FROM journals j WHERE j.email = p_email),
    'notice_reads',
      (SELECT COALESCE(jsonb_agg(notice_key), '[]'::jsonb)
         FROM notice_reads_v2 WHERE email = p_email),
    'task_progress',
      (SELECT COALESCE(jsonb_object_agg(day::text, tasks), '{}'::jsonb)
         FROM task_progress WHERE email = p_email)
  );
$$;
GRANT EXECUTE ON FUNCTION get_user_full_data(TEXT) TO anon, authenticated;
