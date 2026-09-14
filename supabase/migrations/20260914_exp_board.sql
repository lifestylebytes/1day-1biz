-- 리텐션 엔진 (2026-09-14): EXP 이벤트 적재 + WEEKLY BIZ SCORE 순위판
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN

create table if not exists exp_events (
  email      text not null,
  key        text not null,          -- 멱등키 (task:12:checkin 등). 같은 활동 두 번 안 쌓임
  exp        int  not null default 0,
  kind       text,
  day        int,
  at         timestamptz not null default now(),
  primary key (email, key)
);
create index if not exists idx_exp_events_at on exp_events (at desc);
alter table exp_events enable row level security;
drop policy if exists exp_block on exp_events;
create policy exp_block on exp_events for all to public using (false) with check (false);

create or replace function add_exp_event(p_email text, p_key text, p_exp int, p_kind text, p_day int, p_at timestamptz)
returns void
language sql security definer set search_path = public
as $$
  insert into exp_events (email, key, exp, kind, day, at)
  values (lower(p_email), p_key, coalesce(p_exp, 0), p_kind, p_day, coalesce(p_at, now()))
  on conflict (email, key) do nothing;
$$;
revoke all on function add_exp_event(text, text, int, text, int, timestamptz) from public;
grant execute on function add_exp_event(text, text, int, text, int, timestamptz) to anon, authenticated;

-- 이번 주(월요일 00:00 KST 기준) EXP 순위. 이름은 성 한 글자만. 내 행은 is_me 로 표시.
create or replace function get_weekly_board(p_email text, p_limit int default 50)
returns jsonb
language sql security definer stable set search_path = public
as $$
  with wk as (
    select (date_trunc('week', (now() at time zone 'Asia/Seoul'))) at time zone 'Asia/Seoul' as start_at
  ),
  agg as (
    select e.email, sum(e.exp) as exp
    from exp_events e, wk
    where e.at >= wk.start_at
    group by e.email
  ),
  ranked as (
    select a.email, a.exp, u.name, u.day_in_company,
           coalesce(u.is_tester, false) as is_tester,
           rank() over (order by a.exp desc) as rk
    from agg a
    left join users u on lower(u.email) = a.email
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'rank', rk,
      'masked', case when name is null or name = '' then '익명' else left(name, 1) || repeat('○', greatest(char_length(name) - 1, 1)) end,
      'exp', exp,
      'day', day_in_company,
      'is_me', (p_email is not null and email = lower(p_email)),
      'badge', case when rk = 1 then '이번 주 1위' else null end
    ) order by rk
  ), '[]'::jsonb)
  from (select * from ranked where is_tester = false order by rk limit greatest(coalesce(p_limit, 50), 1)) x;
$$;
revoke all on function get_weekly_board(text, int) from public;
grant execute on function get_weekly_board(text, int) to anon, authenticated;
