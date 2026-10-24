-- 2026-10-24 테스트 계정 휴지통 (통째로 RUN. 20261024_test_accounts.sql 다음에)
-- ✕ 로 지운 계정을 바로 없애지 않고 deleted_users 에 통째로 담아 둔다. 운영자뷰 "🗑 휴지통" 에서 복구 버튼으로 되돌린다.
-- 담는 것: users 행 + 이메일로 묶인 모든 표의 행 + auth.users / auth.identities 행 (JSON 그대로)
-- 복구: 담아 둔 JSON 을 같은 표에 다시 넣는다. 표 구조가 그새 바뀌어도 있는 컬럼만 들어간다.
-- 지운 지 30일 지난 건 purge_user_trash() 로 비운다 (자동 아님, 운영자뷰 버튼).

create table if not exists deleted_users (
  id bigserial primary key,
  email text not null,
  name text,
  cohort text,
  deleted_at timestamptz not null default now(),
  deleted_by text,
  payload jsonb not null,          -- { "users": [...], "task_progress": [...], ..., "auth_users": [...], "auth_identities": [...] }
  restored_at timestamptz,
  restored_by text,
  restore_note jsonb
);
alter table deleted_users enable row level security;

-- 지우기 (휴지통에 담고 삭제). 운영자뷰 ✕ 버튼이 부른다. 이름은 그대로 delete_test_user
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
  payload jsonb := '{}'::jsonb;
  rows    jsonb;
  trash_id bigint;
  tables  text[] := array[
    'task_progress','submissions','submissions_history','journals','notes','survey_responses','feedback',
    'activity_log','exp_events','item_uses','wp_grants','wp_code_redemptions','kakao_send_log','kakao_absent_log',
    'reengagement_log','push_subscriptions','ai_usage','email_opt_out','notice_reads','ret_state','content_edits',
    'latpeed_aliases','latpeed_unmatched'
  ];
begin
  if not _is_operator_email(op) then raise exception 'not operator'; end if;
  if target = '' then raise exception 'no target email'; end if;

  select * into u from users where lower(email) = target limit 1;
  if u.email is null then return jsonb_build_object('ok', false, 'error', 'user_not_found'); end if;
  if coalesce(u.is_operator, false) then return jsonb_build_object('ok', false, 'error', 'cannot_delete_operator'); end if;
  if not _is_test_account_email(target) then return jsonb_build_object('ok', false, 'error', 'not_test_account'); end if;

  -- 1) 담기
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into rows from users x where lower(x.email) = target;
  payload := payload || jsonb_build_object('users', rows);
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      begin
        if t = 'latpeed_aliases' then
          execute 'select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from latpeed_aliases x where lower(x.latpeed_email) = $1 or lower(x.app_email) = $1' into rows using target;
        elsif t = 'latpeed_unmatched' then
          execute 'select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from latpeed_unmatched x where lower(x.latpeed_email) = $1' into rows using target;
        else
          execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from %I x where lower(x.email) = $1', t) into rows using target;
        end if;
        if jsonb_array_length(rows) > 0 then payload := payload || jsonb_build_object(t, rows); end if;
      exception when undefined_column then null;
      end;
    end if;
  end loop;
  begin
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into rows from auth.users x where lower(x.email) = target;
    payload := payload || jsonb_build_object('auth_users', rows);
    select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into rows from auth.identities i join auth.users x on x.id = i.user_id where lower(x.email) = target;
    payload := payload || jsonb_build_object('auth_identities', rows);
  exception when others then
    detail := detail || jsonb_build_object('auth_snapshot', 'skipped: ' || sqlerrm);
  end;

  insert into deleted_users(email, name, cohort, deleted_by, payload)
    values (target, u.name, u.cohort, op, payload) returning id into trash_id;

  -- 2) 지우기
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null and payload ? t then
      begin
        if t = 'latpeed_aliases' then
          delete from latpeed_aliases where lower(latpeed_email) = target or lower(app_email) = target;
        elsif t = 'latpeed_unmatched' then
          delete from latpeed_unmatched where lower(latpeed_email) = target;
        else
          execute format('delete from %I where lower(email) = $1', t) using target;
        end if;
        get diagnostics n = row_count;
        if n > 0 then detail := detail || jsonb_build_object(t, n); total := total + n; end if;
      exception when undefined_column then null;
      end;
    end if;
  end loop;
  delete from users where lower(email) = target;
  get diagnostics n = row_count; detail := detail || jsonb_build_object('users', n); total := total + n;
  begin
    delete from auth.users where lower(email) = target;
    get diagnostics n = row_count; detail := detail || jsonb_build_object('auth_users', n);
  exception when others then
    detail := detail || jsonb_build_object('auth_users', 'skipped: ' || sqlerrm);
  end;

  begin
    insert into ops_log(email, action, detail, by_email)
      values (target, 'delete_test_user', jsonb_build_object('trash_id', trash_id, 'name', u.name, 'cohort', u.cohort, 'rows', detail), op);
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'email', target, 'trash_id', trash_id, 'rows_deleted', total, 'detail', detail);
end $$;
revoke all on function delete_test_user(text, text) from public;
grant execute on function delete_test_user(text, text) to anon, authenticated;

-- 휴지통 목록 (복구 안 된 것만)
create or replace function list_user_trash(p_op_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare op text := lower(coalesce(nullif(auth.email(), ''), p_op_email, ''));
begin
  if not _is_operator_email(op) then raise exception 'not operator'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'email', d.email, 'name', d.name, 'cohort', d.cohort,
      'deleted_at', d.deleted_at, 'deleted_by', d.deleted_by,
      'tables', (select jsonb_object_agg(k, jsonb_array_length(v)) from jsonb_each(d.payload) e(k, v))
    ) order by d.deleted_at desc)
    from deleted_users d where d.restored_at is null
  ), '[]'::jsonb);
end $$;
revoke all on function list_user_trash(text) from public;
grant execute on function list_user_trash(text) to anon, authenticated;

-- 복구 도우미: 생성 컬럼(generated)은 빼고 넣는다 (auth.users.confirmed_at 같은 것). 표가 그새 바뀌어도 있는 컬럼만.
create or replace function _restore_rows(p_schema text, p_table text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare cols text; n int;
begin
  select string_agg(quote_ident(column_name), ',' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = p_schema and table_name = p_table and is_generated = 'NEVER';
  if cols is null then raise exception 'table % . % not found', p_schema, p_table; end if;
  execute format('insert into %I.%I(%s) select %s from jsonb_populate_recordset(null::%I.%I, $1)', p_schema, p_table, cols, cols, p_schema, p_table) using p_rows;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function _restore_rows(text, text, jsonb) from public;

-- 복구
create or replace function restore_deleted_user(p_op_email text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  op   text := lower(coalesce(nullif(auth.email(), ''), p_op_email, ''));
  d    deleted_users%rowtype;
  k    text;
  v    jsonb;
  n    int;
  note jsonb := '{}'::jsonb;
  total int := 0;
begin
  if not _is_operator_email(op) then raise exception 'not operator'; end if;
  select * into d from deleted_users where id = p_id;
  if d.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if d.restored_at is not null then return jsonb_build_object('ok', false, 'error', 'already_restored'); end if;
  if exists (select 1 from users where lower(email) = d.email) then
    return jsonb_build_object('ok', false, 'error', 'email_in_use', 'hint', '같은 이메일 계정이 이미 있어요. 그 계정을 먼저 지우고 복구하세요.');
  end if;

  -- auth 먼저 (users 가 auth 를 참조할 수 있어서)
  begin
    n := _restore_rows('auth', 'users', coalesce(d.payload->'auth_users', '[]'::jsonb)); total := total + n;
    n := _restore_rows('auth', 'identities', coalesce(d.payload->'auth_identities', '[]'::jsonb)); total := total + n;
    note := note || jsonb_build_object('auth', 'ok');
  exception when others then
    note := note || jsonb_build_object('auth', 'skipped: ' || sqlerrm || ' (같은 메일로 다시 가입하면 돼요)');
  end;

  -- users 다음 나머지 표
  for k, v in select e.key, e.value from jsonb_each(d.payload) e
             where e.key not in ('auth_users', 'auth_identities')
             order by case when e.key = 'users' then 0 else 1 end loop
    if to_regclass('public.' || k) is null then
      note := note || jsonb_build_object(k, 'table_missing'); continue;
    end if;
    begin
      n := _restore_rows('public', k, v);
      note := note || jsonb_build_object(k, n); total := total + n;
    exception when others then
      note := note || jsonb_build_object(k, 'failed: ' || sqlerrm);
    end;
  end loop;

  update deleted_users set restored_at = now(), restored_by = op, restore_note = note where id = p_id;
  begin
    insert into ops_log(email, action, detail, by_email) values (d.email, 'restore_user', jsonb_build_object('trash_id', p_id, 'rows', note), op);
  exception when others then null;
  end;
  return jsonb_build_object('ok', true, 'email', d.email, 'rows_restored', total, 'detail', note);
end $$;
revoke all on function restore_deleted_user(text, bigint) from public;
grant execute on function restore_deleted_user(text, bigint) to anon, authenticated;

-- 휴지통 비우기 (30일 지난 것, 또는 p_id 하나)
create or replace function purge_user_trash(p_op_email text, p_id bigint default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare op text := lower(coalesce(nullif(auth.email(), ''), p_op_email, '')); n int;
begin
  if not _is_operator_email(op) then raise exception 'not operator'; end if;
  if p_id is not null then
    delete from deleted_users where id = p_id;
  else
    delete from deleted_users where restored_at is not null or deleted_at < now() - interval '30 days';
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'purged', n);
end $$;
revoke all on function purge_user_trash(text, bigint) from public;
grant execute on function purge_user_trash(text, bigint) to anon, authenticated;
