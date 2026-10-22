-- ============================================================
-- 1일1비, 공지 사진 첨부 (2026-10-22)
-- 실행: Supabase Dashboard, SQL Editor, 통째로 RUN (여러 번 실행해도 안전)
--
-- 포함 내용:
--   1) notices.image_urls 컬럼 (사진 공개 주소 목록, 최대 4장)
--   2) Storage 버킷 'notice-images' (공개 읽기, 5MB 이하 이미지만)
--   3) 업로드·삭제 정책: 로그인한 운영자(users.is_operator = true)만
--
-- 참고:
--   _is_operator_email 함수는 supabase/migrations/20260627_content_edits.sql 에서 이미 만들어져 있음.
--   버킷이 공개라서 회원 화면은 로그인 없이도 사진 주소로 바로 볼 수 있음 (목록 조회는 막혀 있음).
-- ============================================================

-- 1) 사진 주소 컬럼
ALTER TABLE notices ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- 2) 버킷
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('notice-images', 'notice-images', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) 운영자만 올리기·지우기
DROP POLICY IF EXISTS notice_images_insert ON storage.objects;
CREATE POLICY notice_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notice-images' AND public._is_operator_email(auth.email()));

DROP POLICY IF EXISTS notice_images_delete ON storage.objects;
CREATE POLICY notice_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'notice-images' AND public._is_operator_email(auth.email()));

-- 검증
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'notice-images';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'notices' AND column_name = 'image_urls';
