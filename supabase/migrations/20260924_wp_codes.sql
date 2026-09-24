-- ============================================================
-- 2026-09-24 복지몰 이벤트 코드 + 이메일 지정 지급
-- 1) wp_codes: 코드 하나 = 포인트·기간·총 사용 상한. 계정당 1회.
-- 2) wp_grants: 특정 이메일에 지급 예약. 그 사람이 접속하면 앱이 받아가고 claimed 로 바뀜.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN. 개인정보·키 없음.
-- ============================================================

create table if not exists wp_codes (
  code        text primary key,               -- 대문자로 저장 (입력은 대소문자 무시)
  points      int  not null,
  label       text not null default '이벤트',   -- 장부에 찍히는 이름 (예: 릴스 댓글 이벤트)
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,                     -- null 이면 무기한
  max_uses    int,                             -- null 이면 무제한
  uses        int  not null default 0,
  active      boolean not null default true
);
create table if not exists wp_code_redemptions (
  email  text not null,
  code   text not null,
  at     timestamptz not null default now(),
  primary key (email, code)
);
alter table wp_codes enable row level security;
alter table wp_code_redemptions enable row level security;
drop policy if exists wp_codes_block on wp_codes;
create policy wp_codes_block on wp_codes for all to public using (false) with check (false);
drop policy if exists wp_red_block on wp_code_redemptions;
create policy wp_red_block on wp_code_redemptions for all to public using (false) with check (false);

-- 코드 사용. 반환: {ok, points, label, reason}  reason: no_code | not_started | expired | sold_out | already | no_user
create or replace function redeem_wp_code(p_email text, p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c wp_codes; em text := lower(trim(coalesce(p_email, ''))); cd text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
begin
  if em = '' or cd = '' then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if not exists (select 1 from users u where lower(u.email) = em) then return jsonb_build_object('ok', false, 'reason', 'no_user'); end if;
  select * into c from wp_codes where code = cd and active for update;
  if c.code is null then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;
  if now() < c.starts_at then return jsonb_build_object('ok', false, 'reason', 'not_started'); end if;
  if c.ends_at is not null and now() > c.ends_at then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if exists (select 1 from wp_code_redemptions r where r.email = em and r.code = cd) then return jsonb_build_object('ok', false, 'reason', 'already', 'points', c.points, 'label', c.label); end if;
  if c.max_uses is not null and c.uses >= c.max_uses then return jsonb_build_object('ok', false, 'reason', 'sold_out'); end if;
  insert into wp_code_redemptions(email, code) values (em, cd);
  update wp_codes set uses = uses + 1 where code = cd;
  return jsonb_build_object('ok', true, 'points', c.points, 'label', c.label, 'code', cd);
end $$;
revoke all on function redeem_wp_code(text, text) from public;
grant execute on function redeem_wp_code(text, text) to anon, authenticated;

-- 이메일 지정 지급 (운영자가 미리 넣어두면 접속 때 자동 지급)
create table if not exists wp_grants (
  id         bigserial primary key,
  email      text not null,
  key        text not null,                 -- 멱등키 (예: signup-event-2026-10). 같은 사람에게 같은 키는 한 번만
  points     int  not null,
  label      text not null default '운영팀 지급',
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  unique (email, key)
);
alter table wp_grants enable row level security;
drop policy if exists wp_grants_block on wp_grants;
create policy wp_grants_block on wp_grants for all to public using (false) with check (false);

-- 접속한 사람의 미수령 지급을 넘겨주고 claimed 처리. 반환: [{key, points, label}]
create or replace function claim_wp_grants(p_email text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  em text := lower(trim(coalesce(p_email, ''))); out jsonb;
begin
  if em = '' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', g.key, 'points', g.points, 'label', g.label)), '[]'::jsonb) into out
  from wp_grants g where lower(g.email) = em and g.claimed_at is null;
  update wp_grants set claimed_at = now() where lower(email) = em and claimed_at is null;
  return out;
end $$;
revoke all on function claim_wp_grants(text) from public;
grant execute on function claim_wp_grants(text) to anon, authenticated;

-- ── 운영: 코드 만들기 / 지급 예약 예시 ──
-- 릴스 댓글 이벤트: 500P · 2주 · 300명
-- insert into wp_codes(code, points, label, ends_at, max_uses) values ('REELS500', 500, '릴스 댓글 이벤트', now() + interval '14 days', 300);
-- 특정 이메일 500P 지급 예약:
-- insert into wp_grants(email, key, points, label) values ('someone@example.com', 'signup-event-2026-10', 500, '가입 이벤트') on conflict do nothing;
-- 현황: select code, points, uses, max_uses, ends_at, active from wp_codes;
--       select email, key, points, claimed_at from wp_grants order by created_at desc;
