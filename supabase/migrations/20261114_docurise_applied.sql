-- ============================================================
-- 2026-11-14 다큐라이즈 결제 → 이용 기간 자동 반영 (docurise-sheet-sync) 의 "이미 반영한 결제" 기록
-- 같은 결제를 두 번 연장하지 않게 키(주문번호, 없으면 이메일|결제일시|상품)를 남긴다.
-- 실행: Supabase Dashboard → SQL Editor → 통째로 RUN
-- ============================================================
create table if not exists docurise_applied (
  key        text primary key,
  email      text not null,
  months     int  not null,
  product    text,
  paid_at    timestamptz,
  ends_to    timestamptz,
  applied_at timestamptz not null default now()
);
alter table docurise_applied enable row level security;   -- 정책 없음 = 브라우저(anon/authenticated)에서는 못 읽고 못 쓴다. service_role(엣지 함수)만.

-- ★ 이미 손으로 SQL 반영한 다큐라이즈 결제는 아래처럼 키를 미리 넣어 두면 자동 동기화가 다시 붙이지 않는다.
--   (연동을 켠 뒤 dryRun 결과의 applied 목록을 보고, 이미 반영한 사람만 골라 넣으면 된다)
-- insert into docurise_applied (key, email, months, product, paid_at) values
--   ('<dryRun 결과의 key 형식과 같게>', '<이메일>', 12, '임원 트랙', '2026-11-14 11:17+09');

-- 확인: select * from docurise_applied order by applied_at desc limit 20;
