-- 동기 문장 엿보기 (PERK, 2026-09-14): 같은 Day 다른 회원 문장 3개를 익명으로.
-- 이름·이메일은 안 나간다. 테스터 제외, 너무 짧은 문장 제외, 무작위.
create or replace function peek_day_sentences(p_email text, p_day int, p_n int default 3)
returns jsonb
language sql security definer stable set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('text', answer_text, 'rank', rank_label)), '[]'::jsonb)
  from (
    select s.answer_text,
           case when coalesce(u.level->>'id', 'probation') = 'senior' then '대리' when coalesce(u.level->>'id', 'probation') = 'fulltime' then '사원' else '수습' end as rank_label
    from submissions s
    join users u on lower(u.email) = lower(s.email)
    where s.day = p_day
      and lower(s.email) <> lower(coalesce(p_email, ''))
      and coalesce(u.is_tester, false) = false
      and length(coalesce(s.answer_text, '')) >= 15
    order by random()
    limit greatest(coalesce(p_n, 3), 1)
  ) x;
$$;
revoke all on function peek_day_sentences(text, int, int) from public;
grant execute on function peek_day_sentences(text, int, int) to anon, authenticated;
