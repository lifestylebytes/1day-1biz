-- 운영자 뷰 · 전체 설문 시트의 '퀴즈 통계' · '진급 평가' · '내 문장' 탭용 (2026-10-30)
-- 읽기 전용. 운영자 이메일만 (list_survey_responses 와 같은 방식). 운영자 · DEV · 테스트 계정은 뺀다.
-- Supabase SQL Editor 에서 한 번 실행하면 된다.

-- 1) 퀴즈 · 진급 평가 기록 (task_progress 의 밑줄 메타)
--    _qzst = 미니 퀴즈 + 리뷰 퀴즈 누적 { w: 틀린 횟수, k: 맞힌 횟수 } (2026-10-17 부터 쌓임)
--    _qe   = 진급 평가 결과 { at, evalDay, kind, title, ok, total, miss: [틀린 표현], firstTry }
CREATE OR REPLACE FUNCTION list_learning_records(p_email TEXT, p_limit INT DEFAULT 20000)
RETURNS TABLE (email TEXT, name TEXT, day INT, qzst JSONB, qe JSONB, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT _is_operator_email(p_email) THEN
    RAISE EXCEPTION 'not operator';
  END IF;
  RETURN QUERY
    SELECT tp.email, u.name, tp.day, tp.tasks->'_qzst', tp.tasks->'_qe', tp.updated_at
      FROM task_progress tp
      LEFT JOIN users u ON lower(u.email) = lower(tp.email)
     WHERE (tp.tasks ? '_qzst' OR tp.tasks ? '_qe')
       AND NOT coalesce(u.is_operator, false) AND NOT coalesce(u.is_dev_mode, false) AND NOT coalesce(u.is_tester, false)
     ORDER BY tp.day, tp.email
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20000), 50000));
END;
$$;
GRANT EXECUTE ON FUNCTION list_learning_records(TEXT, INT) TO anon, authenticated;

-- 2) 회원이 Day 마다 직접 쓴 문장 (submissions) + 사수 첨삭 문장
CREATE OR REPLACE FUNCTION list_all_submissions(p_email TEXT, p_limit INT DEFAULT 20000)
RETURNS TABLE (email TEXT, name TEXT, day INT, word TEXT, answer_text TEXT, corrected TEXT, submitted_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT _is_operator_email(p_email) THEN
    RAISE EXCEPTION 'not operator';
  END IF;
  RETURN QUERY
    SELECT s.email, u.name, s.day, s.word, s.answer_text,
           (s.mentor_feedback->'aiFb'->>'corrected'), s.submitted_at
      FROM submissions s
      LEFT JOIN users u ON lower(u.email) = lower(s.email)
     WHERE coalesce(trim(s.answer_text), '') <> ''
       AND NOT coalesce(u.is_operator, false) AND NOT coalesce(u.is_dev_mode, false) AND NOT coalesce(u.is_tester, false)
     ORDER BY s.day, s.submitted_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20000), 50000));
END;
$$;
GRANT EXECUTE ON FUNCTION list_all_submissions(TEXT, INT) TO anon, authenticated;

-- 확인 (운영자 이메일로):
-- SELECT count(*) FROM list_learning_records('운영자이메일');
-- SELECT count(*) FROM list_all_submissions('운영자이메일');
