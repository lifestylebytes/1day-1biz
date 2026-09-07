-- ============================================================
-- 2026-09-07 보안 점검 (YB-SEC-002) 후속 SQL
-- Supabase 대시보드 > SQL Editor 에서 섹션별로 실행.
-- 실행 순서: 1 → 2 → 3. (4는 확인 후 따로)
-- 개인정보·키 없음.
-- ============================================================

-- ------------------------------------------------------------
-- 1. AI 호출 일일 상한 (mentor-feedback 남용 방지)
--    Edge Function 이 service_role 로만 부른다. anon/authenticated 에는 실행 권한 없음.
-- ------------------------------------------------------------
create table if not exists ai_usage (
  email text not null,          -- 사용자 이메일, 전체 합계는 '*', 이메일 없는 요청은 'ip:<주소>'
  day   date not null,          -- KST 날짜
  kind  text not null,          -- 'light'(첨삭·Q&A·일지) / 'rich'(리포트·인사이트·상담)
  calls int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (email, day, kind)
);
alter table ai_usage enable row level security;
-- 정책을 하나도 안 만들면 anon/authenticated 는 아무것도 못 한다 (service_role 은 RLS 무시).

create or replace function ai_usage_bump(p_email text, p_kind text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare c int;
begin
  insert into ai_usage (email, day, kind, calls)
  values (lower(coalesce(p_email, '')), (now() at time zone 'Asia/Seoul')::date, p_kind, 1)
  on conflict (email, day, kind)
  do update set calls = ai_usage.calls + 1, updated_at = now()
  returning calls into c;
  return c;
end $$;
revoke all on function ai_usage_bump(text, text) from public, anon, authenticated;

-- 오래된 기록 정리 (선택, 월 1회 정도): delete from ai_usage where day < current_date - 60;

-- ------------------------------------------------------------
-- 2. events: 익명 SELECT 닫기 (행동 로그 열람 방지). INSERT 는 유지.
-- ------------------------------------------------------------
drop policy if exists events_select on events;
-- 운영자 페이지가 events 를 읽는다면 service_role 이나 운영자 RPC 로. 현재 클라이언트 코드는 events 를 읽지 않는다.

-- ------------------------------------------------------------
-- 3. content_edits: 익명 SELECT 를 "승인된 편집만" 으로 좁히기.
--    앱은 승인된 편집(day, field, new_value)만 읽으면 되고, 대기 중 제안(reporter_email 포함)은
--    운영자 RPC get_pending_content_edits(_is_operator_email 게이트) 로만 본다.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname from pg_policies where tablename = 'content_edits' and cmd = 'SELECT' loop
    execute format('drop policy if exists %I on content_edits', r.policyname);
  end loop;
end $$;
create policy content_edits_select_approved on content_edits
  for select to anon, authenticated
  using (status = 'approved');
-- 승인된 행의 reporter_email 도 굳이 남길 이유가 없으면 비운다 (선택):
-- update content_edits set reporter_email = null where status = 'approved';

-- ------------------------------------------------------------
-- 4. (확인 후) users 정책 현황 보기. 실행해서 결과를 캡처해 두면 다음 단계(RPC 이관) 기준이 된다.
-- ------------------------------------------------------------
select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'users'
order by cmd, policyname;

-- 참고: users_update_open (USING true) 이 살아 있으면 anon 이 아무 계정이나 수정할 수 있다.
-- 운영자 페이지(syncMembership / 수동 재활성 / 취소·복직)가 이 정책에 기대고 있어서
-- 지금 바로 닫으면 운영자 기능이 멈춘다. 순서:
--   (a) 운영자 쓰기를 _is_operator_email 게이트 RPC 로 옮긴다 (다음 작업)
--   (b) 그 뒤 아래를 실행:
--   drop policy if exists users_update_open on users;
--   create policy users_update_blocked on users for update to anon, authenticated using (false);
