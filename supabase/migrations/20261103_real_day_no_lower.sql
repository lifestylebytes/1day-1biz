-- 2026-11-03 real_day 는 내려가지 않게 (통째로 RUN)
-- 캐시를 지웠거나 새 기기에서 연 앱이 Day 1 을 보내면 서버 값이 1 로 덮여서, 다른 기기까지 Day 1 로 돌아가던 사고 방지.
-- 달력 Day(가입일 기준)보다 큰 값은 앱이 보내지 않으니(게이트가 막음) 위로만 움직여도 문제 없다.
-- 운영자가 Day 를 되돌릴 땐 가입일을 바꾸므로(수동 재활성 '특정 Day 이어서') 여기와 무관하다.
create or replace function save_real_day(p_email text, p_day int)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_email is null or p_day is null or p_day < 1 or p_day > 400 then
    return;
  end if;
  update users
     set real_day = greatest(coalesce(real_day, 0), p_day),
         real_day_at = now()
   where lower(email) = lower(p_email);
end;
$$;
