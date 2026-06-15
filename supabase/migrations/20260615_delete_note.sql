-- ============================================================
-- 노트 삭제 RPC (delete_note)
-- 내 업무 노트에서 메모/저장 문장을 지울 수 있게.
-- notes 테이블은 RLS로 직접 접근 차단(notes_block)이라,
-- save_note 처럼 SECURITY DEFINER RPC 로만 삭제한다.
-- notes UNIQUE(email, day, text) 라서 (email, day, text) 로 정확히 1행 삭제.
-- 반환: 삭제된 행 수 (0이면 매칭 없음).
--
-- 실행: Supabase SQL Editor 에 그대로 붙여넣고 RUN.
-- ============================================================

CREATE OR REPLACE FUNCTION delete_note(
  p_email TEXT, p_day INT, p_text TEXT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n INT;
BEGIN
  IF p_email IS NULL OR p_day IS NULL OR COALESCE(p_text,'') = '' THEN
    RETURN 0;
  END IF;

  DELETE FROM notes
  WHERE email = p_email AND day = p_day AND text = p_text;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_note(TEXT, INT, TEXT) TO anon, authenticated;
