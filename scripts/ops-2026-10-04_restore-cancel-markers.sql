-- 2026-10-04 시트 동기화 1차 실행(10/03)이 지운 '구독 취소' 마커 복구
-- 9/22 CSV 대조에서 구독 취소로 확인된 6명. 결제한 기간(만료일)까지는 그대로 쓰고, 만료일 지나면 휴직 화면.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
update users set membership_cancel_at = coalesce(membership_cancel_at, now()), membership_cancel_reason = coalesce(membership_cancel_reason, 'latpeed_cancelled')
where lower(email) in ('silviapark292@gmail.com', 'danajun9@gmail.com', 'hyun0254@gmail.com', 'soyoon720@gmail.com', 'rbxo4119@gmail.com', 'slee937@gmail.com');
-- 박은실 10/07 · 정다운 10/06 · 임현주 10/11 · 이소윤 10/20 · 이규태 10/20 · 이소연(Sarah) 10/21
select email, name, membership_ends_at, membership_cancel_at, membership_cancel_reason from users
where lower(email) in ('silviapark292@gmail.com', 'danajun9@gmail.com', 'hyun0254@gmail.com', 'soyoon720@gmail.com', 'rbxo4119@gmail.com', 'slee937@gmail.com') order by membership_ends_at;
