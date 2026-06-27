-- 콘텐츠 자동수정: AI 제안 → 운영자 승인 → 라이브 오버라이드
-- 2026-06-27.
-- content_edits: 시나리오 콘텐츠(예문/뜻/모범답안/사수팁/버디답변 등) 수정 제안.
--   status=pending(제안) → approved(앱이 읽어 SCENARIOS에 덮어씀) / rejected.
-- field는 dot path: "quote", "meaning", "sampleAnswer", "mentorTip", "buddyAnswers.example" 등.

create table if not exists content_edits (
  id uuid primary key default gen_random_uuid(),
  day int not null,
  field text not null,
  old_value text,
  new_value text not null,
  reason text,
  type text,                         -- korean_mix / vocab / typo / buddy_align
  source text default 'ai_scan',     -- ai_scan / feedback
  status text default 'pending',     -- pending / approved / rejected
  created_at timestamptz default now(),
  decided_at timestamptz,
  decided_by text
);
create index if not exists idx_content_edits_status on content_edits(status);

alter table content_edits enable row level security;

-- 앱: 승인된 편집만 공개 읽기 (승인된 콘텐츠는 공개돼도 무방). pending은 anon이 못 봄.
drop policy if exists content_edits_read_approved on content_edits;
create policy content_edits_read_approved on content_edits
  for select to anon, authenticated using (status = 'approved');

-- 운영자 검증 헬퍼 (이메일 기준)
create or replace function _is_operator_email(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from users where lower(email) = lower(trim(p_email)) and is_operator = true);
$$;

-- pending 제안 조회 (운영자 전용)
create or replace function get_pending_content_edits(p_email text)
returns setof content_edits language plpgsql security definer set search_path = public as $$
begin
  if not _is_operator_email(p_email) then raise exception 'not operator'; end if;
  return query select * from content_edits where status = 'pending' order by day, created_at;
end;
$$;

-- 승인/거부 (운영자 전용)
create or replace function decide_content_edit(p_id uuid, p_email text, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_operator_email(p_email) then raise exception 'not operator'; end if;
  update content_edits
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = lower(trim(p_email))
   where id = p_id and status = 'pending';
  return jsonb_build_object('ok', true);
end;
$$;

-- 제안 적재 (운영자/스캐너용)
create or replace function insert_content_edit(
  p_email text, p_day int, p_field text, p_old text, p_new text,
  p_reason text, p_type text, p_source text default 'ai_scan'
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_operator_email(p_email) then raise exception 'not operator'; end if;
  insert into content_edits(day, field, old_value, new_value, reason, type, source)
  values (p_day, p_field, p_old, p_new, p_reason, p_type, p_source);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function get_pending_content_edits(text) to anon, authenticated;
grant execute on function decide_content_edit(uuid, text, boolean) to anon, authenticated;
grant execute on function insert_content_edit(text, int, text, text, text, text, text, text) to anon, authenticated;
