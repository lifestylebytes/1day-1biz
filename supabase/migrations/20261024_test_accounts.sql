-- 2026-10-24 테스트 계정 정리 (통째로 RUN)
-- 1) 테스트 계정 판별 함수: 운영자뷰 X 버튼과 순위판 제외가 같은 기준을 쓴다
--    · users.is_tester = true
--    · dev 상세페이지 테스트 메일: testtestlogin@gmail.com, testtestlogin+xxxx@gmail.com
--    · 메일 인증까지 해보는 테스트 메일: dmsgktn0523+1b…@gmail.com
-- 2) 순위판 v6: 테스트 계정 제외 (v5 에서는 is_tester 포함이었음, 2026-10-24 버디님 요청으로 뺀다)
-- 3) delete_test_user: 운영자뷰 X 버튼. 테스트 계정이 아니면 거절한다 (실수로 회원 지우는 일 방지)
--    지우는 것: users 행 + 이메일로 묶인 학습 기록 + Supabase Auth 계정 (같은 메일로 다시 가입 가능)
--    남기는 것: latpeed_events (결제 로그), ops_log (여기에 삭제 기록)

create or replace function _is_test_account_email(p_email text)
returns boolean language sql stable as $$
  select lower(coalesce(p_email, '')) ~ '^(testtestlogin(\+[a-z0-9]+)?@gmail\.com|dmsgktn0523\+1b[a-z0-9]*@gmail\.com)$'
      or exists (select 1 from users u where lower(u.email) = lower(coalesce(p_email, '')) and coalesce(u.is_tester, false));
$$;

-- ── 순위판 v6 ──────────────────────────────────────────────
create or replace function get_weekly_board(p_email text, p_limit int default 50)
returns jsonb
language sql security definer stable set search_path = public
as $$
  with wk as (
    select ((date_trunc('day', now() at time zone 'Asia/Seoul') - interval '6 days') at time zone 'Asia/Seoul') as start_at,
           (date_trunc('day', now() at time zone 'Asia/Seoul'))::date as today_kst
  ),
  ev as (
    select e.email, e.exp, e.kind, e.at, (e.at at time zone 'Asia/Seoul')::date as d
    from exp_events e
  ),
  agg as (
    select v.email, sum(v.exp) as exp, max(v.at) as last_at,
           count(distinct v.d) filter (where v.kind = 'task') as task_days
    from ev v, wk
    where v.at >= wk.start_at
    group by v.email
  ),
  tdays as (select distinct email, d from ev where kind = 'task'),
  isl as (select email, d, d - (row_number() over (partition by email order by d))::int as grp from tdays),
  cur as (
    select i.email, i.grp from isl i, wk
    where i.d in (wk.today_kst, wk.today_kst - 1)
    group by i.email, i.grp
  ),
  streak as (
    select i.email, count(*) as days
    from isl i join cur c on c.email = i.email and c.grp = i.grp
    group by i.email
  ),
  vis as (
    select a.email, a.exp, a.last_at, a.task_days, coalesce(s.days, 0) as streak_days, u.name, u.day_in_company,
           case
             when coalesce(u.level->>'id', 'probation') = 'senior' or coalesce(u.day_in_company, 1) >= 90 then '대리'
             when coalesce(u.level->>'id', 'probation') = 'fulltime' or coalesce(u.day_in_company, 1) >= 31 then '사원'
             else '수습'
           end as rank_label
    from agg a
    join users u on lower(u.email) = a.email
    left join streak s on s.email = a.email
    where coalesce(u.is_operator, false) = false
      and coalesce(u.is_dev_mode, false) = false
      and coalesce(u.is_tester, false) = false
      and not _is_test_account_email(u.email)
  ),
  ranked as (select *, row_number() over (order by exp desc, streak_days desc, last_at asc) as rk from vis),
  rowj as (
    select rk, jsonb_build_object(
      'rank', rk,
      'masked', case when name is null or name = '' then '익명' else left(name, 1) || repeat('○', greatest(char_length(name) - 1, 1)) end,
      'exp', exp, 'day', day_in_company, 'rank_label', rank_label, 'streak', streak_days,
      'is_me', (p_email is not null and email = lower(p_email)),
      'badge', case when task_days >= 7 then '이번 주 개근' when rk = 1 then '1위' else null end
    ) as j, email
    from ranked
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(j order by rk) from (select * from rowj order by rk limit greatest(coalesce(p_limit, 50), 1)) x), '[]'::jsonb),
    'me', (select j from rowj where p_email is not null and email = lower(p_email)
             and rk > greatest(coalesce(p_limit, 50), 1) limit 1)
  );
$$;
revoke all on function get_weekly_board(text, int) from public;
grant execute on function get_weekly_board(text, int) to anon, authenticated;

-- ── 테스트 계정 삭제 ──────────────────────────────────────────
create or replace function delete_test_user(p_op_email text, p_target_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  op      text := lower(coalesce(nullif(auth.email(), ''), p_op_email, ''));
  target  text := lower(trim(coalesce(p_target_email, '')));
  u       users%rowtype;
  t       text;
  n       int;
  total   int := 0;
  detail  jsonb := '{}'::jsonb;
  tables  text[] := array[
    'task_progress','submissions','submissions_history','journals','notes','survey_responses','feedback',
    'activity_log','exp_events','item_uses','wp_grants','wp_code_redemptions','kakao_send_log','kakao_absent_log',
    'reengagement_log','push_subscriptions','ai_usage','email_opt_out','notice_reads','ret_state','content_edits'
  ];
begin
  if not _is_operator_email(op) then raise exception 'not operator'; end if;
  if target = '' then raise exception 'no target email'; end if;

  select * into u from users where lower(email) = target limit 1;
  if u.email is null then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;
  if coalesce(u.is_operator, false) then return jsonb_build_object('ok', false, 'error', 'cannot_delete_operator'); end if;
  if not _is_test_account_email(target) then return jsonb_build_object('ok', false, 'error', 'not_test_account'); end if;

  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      begin
        execute format('delete from %I where lower(email) = $1', t) using target;
        get diagnostics n = row_count;
        if n > 0 then detail := detail || jsonb_build_object(t, n); total := total + n; end if;
      exception when undefined_column then null;
      end;
    end if;
  end loop;

  if to_regclass('public.latpeed_aliases') is not null then
    delete from latpeed_aliases where lower(latpeed_email) = target or lower(app_email) = target;
  end if;
  if to_regclass('public.latpeed_unmatched') is not null then
    delete from latpeed_unmatched where lower(latpeed_email) = target;
  end if;

  delete from users where lower(email) = target;
  get diagnostics n = row_count; detail := detail || jsonb_build_object('users', n); total := total + n;

  begin
    delete from auth.users where lower(email) = target;
    get diagnostics n = row_count;
    detail := detail || jsonb_build_object('auth_users', n);
  exception when others then
    detail := detail || jsonb_build_object('auth_users', 'skipped: ' || sqlerrm);
  end;

  begin
    insert into ops_log(email, action, detail, by_email)
      values (target, 'delete_test_user', jsonb_build_object('name', u.name, 'cohort', u.cohort, 'rows', detail), op);
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'email', target, 'rows_deleted', total, 'detail', detail);
end $$;
revoke all on function delete_test_user(text, text) from public;
grant execute on function delete_test_user(text, text) to anon, authenticated;
