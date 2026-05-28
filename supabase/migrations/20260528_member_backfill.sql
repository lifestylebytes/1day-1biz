-- ============================================================
-- 1일1비 정식 회원 backfill (래피드 CSV, 2026-05-28 기준)
-- 총 42명 (구독 중 39 / 구독 취소 2 / 구독 종료 1)
--
-- 의존: 20260524_latpeed_events.sql 먼저 RUN
-- ============================================================

-- 1) users 테이블 업데이트
UPDATE users u SET
  cohort = 'member',
  unlocked = true,
  membership_ends_at = v.ends_at,
  membership_cancel_reason = v.cancel_reason
FROM (VALUES
  ('tjgmldjssl12@naver.com', '2026-06-27 23:59:59+09'::timestamptz, NULL),  -- 박채린
  ('suej.baek@gmail.com', '2026-06-27 23:59:59+09'::timestamptz, NULL),  -- 백수정
  ('hyoon929@gmail.com', '2026-06-26 23:59:59+09'::timestamptz, NULL),  -- 윤현서
  ('gloriak1993@gmail.com', '2026-06-26 23:59:59+09'::timestamptz, NULL),  -- 김하연
  ('silviapark292@gmail.com', '2026-06-24 23:59:59+09'::timestamptz, NULL),  -- 박은실
  ('gowoon.mia.jeong@gmail.com', '2026-06-23 23:59:59+09'::timestamptz, NULL),  -- 정고운
  ('bommme13@gmail.com', '2026-06-23 23:59:59+09'::timestamptz, NULL),  -- 손보미
  ('oliviaha.hj@gmail.com', '2026-06-22 23:59:59+09'::timestamptz, NULL),  -- 하현주
  ('jangyoungjoo92@gmail.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 장영주
  ('ms.juliawon@gmail.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 원지수
  ('hj.choi7659@gmail.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 최현진
  ('nikkanstudio@gmail.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- nikkanstudio@gmail.com
  ('movmeh@gmail.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 황혜민
  ('jjanga208@naver.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 한혜정
  ('ines@kdlab.kr', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 김혜인
  ('qjadl1153@naver.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 이윤범
  ('hyunsungsho@gmail.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 이수안
  ('dam6317@naver.com', '2026-06-21 23:59:59+09'::timestamptz, NULL),  -- 이연진
  ('sykwon024@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 권서윤
  ('ashygy@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 유가영
  ('heylimit6634@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 김혜림
  ('youngkang.design@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 강영화
  ('soyoon720@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 이소윤
  ('mekids09@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 심다솔
  ('ekekqls852@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 최다빈
  ('qhdrn67@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 최은정
  ('dmsghddk@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 황은홍
  ('owenable@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 장희정
  ('eszzangzz@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 김은선
  ('yangjoohee96@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 양주희
  ('pyj5859@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 박연진
  ('unemje@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 이정언
  ('naeun9910@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 김나은
  ('cyjnos7572@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 최유진
  ('pink1010@naver.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 박진솔
  ('dewyi@kakao.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 이슬
  ('juheepretty135@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 서주희
  ('taeshindev@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 신태림
  ('rbxo4119@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, NULL),  -- 이규태
  ('seunghee4371@gmail.com', '2026-06-21 23:59:59+09'::timestamptz, 'latpeed_subscription_cancelled'),  -- 양승희
  ('236979@gmail.com', '2026-06-20 23:59:59+09'::timestamptz, 'latpeed_subscription_cancelled'),  -- 박채은
  ('youbuddy.co@gmail.com', '2026-05-20 23:59:59+09'::timestamptz, 'latpeed_subscription_ended')   -- 유버디
) AS v(email, ends_at, cancel_reason)
WHERE LOWER(u.email) = v.email;

-- 2) latpeed_events 에 히스토리 기록
INSERT INTO latpeed_events (email, type, status, event_at, raw, applied, apply_note)
VALUES
  ('tjgmldjssl12@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-27 21:03:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "박채린", "csv_status": "구독 중", "next_payment": "26.06.27", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('suej.baek@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-27 17:33:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "백수정", "csv_status": "구독 중", "next_payment": "26.06.27", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('hyoon929@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-26 11:19:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "윤현서", "csv_status": "구독 중", "next_payment": "26.06.26", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('gloriak1993@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-26 08:51:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "김하연", "csv_status": "구독 중", "next_payment": "26.06.26", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('silviapark292@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-24 16:15:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "박은실", "csv_status": "구독 중", "next_payment": "26.06.24", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('gowoon.mia.jeong@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-23 20:10:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "정고운", "csv_status": "구독 중", "next_payment": "26.06.23", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('bommme13@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-23 14:34:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "손보미", "csv_status": "구독 중", "next_payment": "26.06.23", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('oliviaha.hj@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-22 12:55:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "하현주", "csv_status": "구독 중", "next_payment": "26.06.22", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('jangyoungjoo92@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 20:48:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "장영주", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('ms.juliawon@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 20:05:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "원지수", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('hj.choi7659@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 19:39:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "최현진", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('nikkanstudio@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 17:10:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "nikkanstudio@gmail.com", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('movmeh@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 11:48:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "황혜민", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('jjanga208@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 11:29:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "한혜정", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('ines@kdlab.kr', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 08:54:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "김혜인", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('qjadl1153@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 08:24:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "이윤범", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('hyunsungsho@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 02:00:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "이수안", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('dam6317@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 01:12:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "이연진", "csv_status": "구독 중", "next_payment": "26.06.21", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('sykwon024@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 23:41:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "권서윤", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('ashygy@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 23:40:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "유가영", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('heylimit6634@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 23:22:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "김혜림", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('youngkang.design@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 23:08:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "강영화", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('soyoon720@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 22:47:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "이소윤", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('mekids09@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 22:23:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "심다솔", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('ekekqls852@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 22:14:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "최다빈", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('qhdrn67@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:58:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "최은정", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('dmsghddk@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:47:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "황은홍", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('owenable@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:46:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "장희정", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('eszzangzz@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:30:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "김은선", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('yangjoohee96@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:27:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "양주희", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('pyj5859@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:20:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "박연진", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('unemje@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:19:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "이정언", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('naeun9910@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:19:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "김나은", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('cyjnos7572@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:10:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "최유진", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('pink1010@naver.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:08:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "박진솔", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('dewyi@kakao.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:06:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "이슬", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('juheepretty135@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:01:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "서주희", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('taeshindev@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 20:56:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "신태림", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('rbxo4119@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 20:54:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "이규태", "csv_status": "구독 중", "next_payment": "26.06.20", "cancel_eta": "-", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('seunghee4371@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-21 07:08:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "양승희", "csv_status": "구독 취소", "next_payment": "-", "cancel_eta": "26.06.21", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('236979@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 21:43:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "박채은", "csv_status": "구독 취소", "next_payment": "-", "cancel_eta": "26.06.20", "end_date": "-"}'::jsonb, true, 'csv_backfill_20260528'),
  ('youbuddy.co@gmail.com', 'MEMBERSHIP_PAYMENT', 'SUCCESS', '2026-05-20 20:36:00+09'::timestamptz, '{"source": "csv_backfill_20260528", "name": "유버디", "csv_status": "구독 종료", "next_payment": "-", "cancel_eta": "-", "end_date": "26.05.20"}'::jsonb, true, 'csv_backfill_20260528');

-- 3) 검증
SELECT email, name, cohort, membership_ends_at,
       (membership_ends_at::date - CURRENT_DATE) AS days_left,
       membership_cancel_reason
  FROM users
 WHERE cohort = 'member'
 ORDER BY membership_ends_at DESC NULLS LAST;
