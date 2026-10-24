-- ============================================================
-- 2026-10-24 래피드 장기권(단건 상품) 소급 적용 + 계정 연결 즉시 반영
--
-- 문제 1: 결제 이메일 ≠ 가입 이메일인 사람은 웹훅이 users 를 못 찾아 latpeed_unmatched 에만 올라간다.
--         운영자가 "계정 연결(별칭)" 을 해도 예전엔 다음날 07:00 시트 동기화 때까지 기다려야 했다.
-- 문제 2: 가입 전에 결제한 사람이 나중에 가입하면 latpeed_apply_pending 이 돌지만, 그 함수는
--         월 구독(MEMBERSHIP_PAYMENT + 31일)만 알고 장기권(NORMAL_PAYMENT, N개월)은 모른다.
--
-- 해결:
--   1) latpeed_apply_pending(p_email) 을 다시 쓴다
--      · 월 구독: 예전처럼 +31일 (subscription.finishedAt 이 raw 에 있으면 그걸 우선)
--      · 장기권: option_text 의 "N개월" (없으면 금액) 만큼, 기존 만료일·체험 종료일·지금 중 늦은 쪽에 이어 붙인다
--      · 별칭(latpeed_aliases)으로 들어온 결제도 함께 찾는다
--      · 미적용 이벤트가 여러 개면 오래된 것부터 전부 순서대로 적용한다 (3개월 + 6개월 둘 다 샀으면 9개월)
--   2) latpeed_aliases 에 행이 생기면(운영자 계정 연결) 그 자리에서 바로 소급 적용하는 트리거
--   3) 운영자 뷰가 부를 수 있는 RPC: apply_latpeed_pending(p_op_email, p_target_email)
--
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN (개인정보·키 없음)
-- 의존: 20260907_latpeed_retro_apply.sql (users 가입 트리거 _trg_users_latpeed_retro 는 그대로 이 함수를 부른다)
--       20261003_latpeed_aliases.sql, 20260627_content_edits.sql 의 _is_operator_email()
-- ============================================================

create or replace function latpeed_apply_pending(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  u          users%rowtype;
  ev         record;
  n_applied  int := 0;
  base       timestamptz;
  ends       timestamptz;
  months     int;
  trial_end  timestamptz;
  notes      text := '';
  month_price int := 16900;
begin
  if p_email is null or p_email = '' then return 'no_email'; end if;

  select * into u from users where lower(email) = lower(p_email) limit 1;
  if u.email is null then return 'user_not_found'; end if;

  -- 체험 회원이면 체험 종료일(가입 + 7일)도 이어붙이기 기준에 넣는다
  if coalesce(u.cohort, '') like 'trial%' and u.signup_date is not null then
    trial_end := u.signup_date + interval '7 days';
  end if;

  -- 이 사람 앞으로 온 미적용 결제 성공 이벤트: 본인 이메일 + 별칭으로 들어온 것, 오래된 순
  for ev in
    select e.id, e.type, e.amount, e.option_text, e.event_at, e.raw
      from latpeed_events e
     where e.applied = false
       and (e.raw->>'subtype' = 'PAYMENT_SUCCESS' or (e.raw->>'subtype' is null and upper(e.status) = 'SUCCESS'))
       and (
         lower(e.email) = lower(u.email)
         or lower(e.email) in (select lower(a.latpeed_email) from latpeed_aliases a where lower(a.app_email) = lower(u.email))
       )
     order by e.event_at asc nulls last, e.received_at asc
  loop
    base := greatest(coalesce(u.membership_ends_at, now()), coalesce(trial_end, now()), now());

    if ev.type = 'NORMAL_PAYMENT' then
      -- 장기권: 옵션명 "N개월" → 없으면 금액
      months := nullif((regexp_match(coalesce(ev.option_text, ''), '(\d+)\s*개월'))[1], '')::int;
      if months is null then
        months := case
          when ev.amount between 284500 and 285500 then 12
          when ev.amount between 178500 and 179500 then 6
          when ev.amount between 94400  and 95400  then 6
          when ev.amount between 49400  and 50400  then 3
          else null end;
      end if;
      if months is null then
        update latpeed_events set apply_note = coalesce(apply_note, '') || ' | retro_skipped_cannot_parse_months' where id = ev.id;
        continue;
      end if;
      ends := base + make_interval(months => months);
      update users set
        cohort = 'member', unlocked = true,
        membership_ends_at = ends, membership_cancel_at = null, membership_cancel_reason = null,
        preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object(
          'pay_source', 'latpeed', 'last_paid_at', coalesce(ev.event_at, now()),
          'pay_count', coalesce((preferences->>'pay_count')::int, 0) + 1,
          'plan', split_part(coalesce(ev.option_text, ''), '·', 1),
          'plan_months', months, 'plan_option', ev.option_text, 'plan_amount', ev.amount,
          'plan_paid_at', coalesce(ev.event_at, now()), 'prev_cohort', u.cohort)
      where email = u.email;
      update latpeed_events set applied = true,
        apply_note = 'retro_longpass_' || months || 'mo_until_' || to_char(ends at time zone 'Asia/Seoul', 'YYYY-MM-DD')
      where id = ev.id;
      notes := notes || months || '개월→' || to_char(ends at time zone 'Asia/Seoul', 'MM/DD') || ' ';
    else
      -- 월 구독: 래피드가 준 이용기간 종료일이 있으면 그걸, 없으면 결제일 + 31일
      ends := coalesce((ev.raw->'subscription'->>'finishedAt')::timestamptz, coalesce(ev.event_at, now()) + interval '31 days');
      if ends < now() then
        update latpeed_events set apply_note = coalesce(apply_note, '') || ' | retro_skipped_expired' where id = ev.id;
        continue;
      end if;
      update users set
        cohort = 'member', unlocked = true,
        membership_ends_at = greatest(coalesce(membership_ends_at, ends), ends),
        membership_cancel_at = null, membership_cancel_reason = null,
        preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object(
          'pay_source', 'latpeed', 'last_paid_at', coalesce(ev.event_at, now()),
          'pay_count', coalesce((preferences->>'pay_count')::int, 0) + 1)
      where email = u.email;
      update latpeed_events set applied = true,
        apply_note = 'retro_membership_until_' || to_char(ends at time zone 'Asia/Seoul', 'YYYY-MM-DD')
      where id = ev.id;
      notes := notes || '월구독→' || to_char(ends at time zone 'Asia/Seoul', 'MM/DD') || ' ';
    end if;

    n_applied := n_applied + 1;
    select * into u from users where email = u.email;   -- 다음 이벤트는 갱신된 만료일 위에 쌓는다
  end loop;

  if n_applied = 0 then return 'no_pending_event'; end if;

  -- 계정 없는 결제자 목록에서 해결됨 표시
  update latpeed_unmatched set resolved_at = now()
   where resolved_at is null
     and (lower(latpeed_email) = lower(u.email)
          or lower(latpeed_email) in (select lower(a.latpeed_email) from latpeed_aliases a where lower(a.app_email) = lower(u.email)));

  return 'applied ' || n_applied || '건: ' || trim(notes);
end $$;
revoke all on function latpeed_apply_pending(text) from public, anon, authenticated;

-- 2) 운영자가 계정을 이어주면(별칭 추가·수정) 그 자리에서 소급 적용
create or replace function _trg_aliases_latpeed_retro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform latpeed_apply_pending(new.app_email);
  return new;
end $$;
drop trigger if exists trg_aliases_latpeed_retro on latpeed_aliases;
create trigger trg_aliases_latpeed_retro
  after insert or update of app_email on latpeed_aliases
  for each row execute function _trg_aliases_latpeed_retro();

-- 3) 운영자 뷰에서 손으로 다시 돌릴 수 있는 RPC (회원 행의 "결제 다시 맞추기" 버튼용)
create or replace function apply_latpeed_pending(p_op_email text, p_target_email text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not _is_operator_email(coalesce(nullif(auth.email(), ''), p_op_email)) then
    raise exception 'not operator';
  end if;
  return latpeed_apply_pending(p_target_email);
end $$;
revoke all on function apply_latpeed_pending(text, text) from public;
grant execute on function apply_latpeed_pending(text, text) to anon, authenticated;

-- 확인: select latpeed_apply_pending('가입이메일');

-- ============================================================
-- 4) 결제 옮기기: 옛 이메일로 결제가 들어가 '다른 계정'에 적용됐을 때, 그 결제를 새 계정으로 옮긴다
--    예) 옛 계정(만료) rbxo@... 로 결제, 새 계정 kyugaby@... 로 재가입 → 웹훅이 옛 계정에 넣음
--    하는 일: (a) 별칭 등록 (래피드 이메일 → 새 앱 이메일, 다음 결제부터 자동)
--             (b) 옛 계정에서 가장 최근 적용된 결제 성공 1건을 되돌림 (장기권: N개월 뺌 / 월구독: 그 이벤트 전 만료일로)
--             (c) 그 이벤트를 미적용으로 돌리고 새 계정에 소급 적용
-- ============================================================
create or replace function latpeed_move_last_payment(p_latpeed_email text, p_app_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  ev      record;
  old_u   users%rowtype;
  months  int;
  res     text;
begin
  if p_latpeed_email is null or p_app_email is null then return 'no_email'; end if;
  if lower(p_latpeed_email) = lower(p_app_email) then return 'same_email'; end if;
  if not exists (select 1 from users where lower(email) = lower(p_app_email)) then return 'target_user_not_found'; end if;

  -- (a) 별칭. 트리거(_trg_aliases_latpeed_retro)가 돌지만 아직 미적용 이벤트가 없어 no-op 이다.
  insert into latpeed_aliases(latpeed_email, app_email, note)
    values (lower(trim(p_latpeed_email)), lower(trim(p_app_email)), 'moved_payment ' || to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'))
  on conflict (latpeed_email) do update set app_email = excluded.app_email, note = excluded.note;

  -- (b) 옛 계정에 적용된 최근 결제 성공 1건
  select * into old_u from users where lower(email) = lower(p_latpeed_email) limit 1;
  select e.* into ev from latpeed_events e
   where lower(e.email) = lower(p_latpeed_email)
     and e.applied = true
     and (e.raw->>'subtype' = 'PAYMENT_SUCCESS' or (e.raw->>'subtype' is null and upper(e.status) = 'SUCCESS'))
     and coalesce(e.apply_note, '') not like '%via_alias%'
   order by e.received_at desc limit 1;
  if ev.id is null then return 'no_applied_payment_on_old_account (별칭만 등록함)'; end if;

  if old_u.email is not null then
    if ev.type = 'NORMAL_PAYMENT' then
      months := coalesce(nullif((regexp_match(coalesce(ev.option_text, ''), '(\d+)\s*개월'))[1], '')::int,
                         (old_u.preferences->>'plan_months')::int, 0);
      update users set
        membership_ends_at = case when membership_ends_at is null then null else membership_ends_at - make_interval(months => months) end,
        cohort = coalesce(nullif(preferences->>'prev_cohort', ''), cohort),
        preferences = (preferences - 'plan' - 'plan_months' - 'plan_option' - 'plan_amount' - 'plan_paid_at' - 'plan_order_id')
                      || jsonb_build_object('pay_count', greatest(coalesce((preferences->>'pay_count')::int, 1) - 1, 0),
                                            'moved_payment_to', lower(p_app_email), 'moved_at', now())
      where email = old_u.email;
    else
      -- 월 구독: 그 결제 전 만료일을 모르니 결제 시각으로 되돌린다 (= 그 결제분만 뺀 효과)
      update users set
        membership_ends_at = least(membership_ends_at, coalesce(ev.event_at, now())),
        preferences = preferences || jsonb_build_object('pay_count', greatest(coalesce((preferences->>'pay_count')::int, 1) - 1, 0),
                                                        'moved_payment_to', lower(p_app_email), 'moved_at', now())
      where email = old_u.email;
    end if;
  end if;

  -- (c) 이벤트를 미적용으로 돌리고 새 계정에 적용
  update latpeed_events set applied = false,
    apply_note = coalesce(apply_note, '') || ' | moved_from_' || lower(p_latpeed_email) || '_to_' || lower(p_app_email)
  where id = ev.id;
  res := latpeed_apply_pending(p_app_email);
  insert into ops_log(email, action, detail, by_email)
    values (lower(p_app_email), 'latpeed_move_payment', jsonb_build_object('from', lower(p_latpeed_email), 'event_id', ev.id, 'result', res), 'system')
  on conflict do nothing;
  return 'moved: ' || res;
exception when undefined_table then
  return 'moved: ' || res;
end $$;
revoke all on function latpeed_move_last_payment(text, text) from public, anon, authenticated;

create or replace function move_latpeed_payment(p_op_email text, p_latpeed_email text, p_app_email text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not _is_operator_email(coalesce(nullif(auth.email(), ''), p_op_email)) then raise exception 'not operator'; end if;
  return latpeed_move_last_payment(p_latpeed_email, p_app_email);
end $$;
revoke all on function move_latpeed_payment(text, text, text) from public;
grant execute on function move_latpeed_payment(text, text, text) to anon, authenticated;

-- 쓰는 법: select move_latpeed_payment('운영자이메일', '래피드결제이메일', '앱가입이메일');
