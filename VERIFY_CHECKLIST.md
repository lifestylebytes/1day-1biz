# 1일1비, 오픈 전 검증 체크리스트

작업한 코드 변경이 모두 정상 작동하는지 확인하는 절차. 순서대로.

## A. 추가 마이그레이션 SQL RUN (5분)

Supabase Dashboard → SQL Editor → New query → 통째로 붙여넣고 RUN:
`supabase/migrations/20260519_day_and_notices.sql`

기대:
- 새 RPC 함수 4개 등록 (save_day_progress, mark_notice_read, get_notice_reads, 기존 + 새 정책)
- notice_reads_v2 테이블 생성
- users 테이블 직접 UPDATE 차단 (이제 RPC만 통로)

검증:
```sql
SELECT save_day_progress('dmsgktn0523@gmail.com', 1);
SELECT mark_notice_read('dmsgktn0523@gmail.com', 'test-1');
SELECT * FROM get_notice_reads('dmsgktn0523@gmail.com');
```
세 줄 다 에러 없이 결과 나오면 OK.

## B. (선택) Slack 미러 채널 설정 (10분)

운영자만 들어있는 Slack 채널 새로 만들고 (예: `#1day1biz-mirror`).

Slack → workspace → Apps → "Incoming Webhooks" 추가 → 채널 선택 → Webhook URL 복사.

`lib/integrations-config.example.js`를 복사:
```
cp lib/integrations-config.example.js lib/integrations-config.js
```

`lib/integrations-config.js` 안의 slackWebhookUrl 값을 복사한 URL로 교체.

검증: 사이트에서 새 학습 한 번 제출하면 Slack 채널에 JSON 메시지 도착.

## C. 새 가입자 1명 흐름 테스트 (10분)

가장 중요한 단계.

1. 시크릿 모드 / 다른 브라우저에서 `https://1day-1biz.youbuddy.co.kr/onboarding.html` 접속
2. 평소처럼 가입 끝까지 (PILOT-2026 또는 새 코드)
3. mainboard 진입
4. F12 → Console → `window.OD?.enabled` 입력 → `true` 떠야 함. false면 supabase-client.js 로드 실패.
5. 1일차 시나리오 영작 작성·제출
6. 단어 노트 1개 저장 (Buddy 채팅)
7. 업무일지 1줄 작성·저장
8. 공지 1개 클릭해서 읽음 처리

서버 측 검증, Supabase SQL Editor에서:
```sql
SELECT * FROM submissions WHERE email = '방금가입한이메일';
SELECT * FROM submissions_history WHERE email = '방금가입한이메일';
SELECT * FROM notes WHERE email = '방금가입한이메일';
SELECT * FROM journals WHERE email = '방금가입한이메일';
SELECT * FROM notice_reads_v2 WHERE email = '방금가입한이메일';
SELECT day_in_company FROM users WHERE email = '방금가입한이메일';
SELECT get_user_health('방금가입한이메일');
```

기대:
- submissions 1행, submissions_history 1행 이상
- notes 1행
- journals 1행
- notice_reads_v2 1행
- day_in_company = 1 (오늘 가입이라)
- get_user_health에서 모든 카운트가 0이 아님

하나라도 0이면 그 부분 sync 실패. Console에 [Supabase] 로그 확인하고 알려줘.

## D. cross-device 보호 확인 (5분)

같은 계정으로 다른 브라우저(또는 시크릿 모드)에서 다시 매직링크 로그인 후 mainboard 진입.

기대:
- localStorage가 빈 상태로 들어왔는데도 hydrateFromDb로 DB의 학습이 복원돼 화면에 보임
- 다시 빈 상태로 push 안 함 (mergedCompleted가 dbCompleted를 보존)

검증: 출근부에서 1일차 표시 / Buddy 채팅 노트 보임 / 업무일지 작성된 내용 보임.

## E. Outbox 동작 확인 (3분)

비행기 모드 또는 네트워크 차단 후 학습 제출 → 상단에 노란 배지 "저장 대기 N건" 표시 확인.
네트워크 복구 후 60초 내 배지 사라지면 OK.

## F. 운영자 조회 카드 확인 (2분)

`operator.html` 접속 → 상단 "📚 학습 데이터 조회" 카드 → 방금 가입한 이메일 입력 + Day 1 → 조회.

기대: 시나리오 영작 / 노트 / 일지 / submission history 다 보임.

이제 "OOO님 6일차 영작 알려줘" 같은 요청에 즉시 답 가능.

## G. Edge Function 일일 백업 deploy (15분)

### 1. Resend 가입 + API Key

https://resend.com → Sign up → API Keys → Create API Key → 복사

### 2. Resend 도메인 추가 (선택, 자체 도메인 발신)

Domains → Add `youbuddy.co.kr` → 안내된 DNS TXT/MX 레코드 4개를 도메인 DNS에 추가 → "Verify" 클릭. 1시간 안에 됨.

빠르게 가려면 `onboarding@resend.dev` 임시 발신자 주소 사용 가능 (도메인 검증 스킵).

### 3. Edge Function 배포

옵션 A (Supabase CLI 있으면):
```
supabase functions deploy daily-backup
```

옵션 B (Dashboard 수동):
- Dashboard → Edge Functions → Create Function → 이름 `daily-backup`
- 코드 부분에 `supabase/functions/daily-backup/index.ts` 통째로 붙여넣기
- Deploy

### 4. Secret 등록

Dashboard → Edge Functions → daily-backup → Settings → Secrets → 다음 추가:
- `RESEND_API_KEY` = (위에서 복사한 키)
- `BACKUP_TO_EMAIL` = `dmsgktn0523@gmail.com`
- `FROM_EMAIL` = `noreply@youbuddy.co.kr` (또는 `onboarding@resend.dev`)

(SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY는 자동 주입됨)

### 5. Cron 등록

Dashboard → Edge Functions → daily-backup → Schedule → 추가
- Cron expression: `0 15 * * *` (UTC 15:00 = KST 자정)

### 6. 즉시 1회 테스트 실행

Dashboard → daily-backup → Run 버튼 또는 curl:
```
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/daily-backup \
  -H "Authorization: Bearer <ANON_KEY>"
```

기대: 5초 안에 응답 + 본인 메일함에 `[1일1비] 일일 학습 데이터 백업 YYYY-MM-DD` 메일 도착 + JSON 첨부 파일에 모든 row.

## H. 오픈 직전 마지막 점검

- [ ] A 끝, B 끝 (Slack URL 설정), C 다 OK, D OK, E OK, F OK, G 첫 메일 도착
- [ ] Auth Rate Limits 30+ 로 조정됐는지
- [ ] 본인 baseline 잡기: 본인 계정으로 1일차 영작 한 번 더 제출 → DB 잘 들어가는지 마지막 확인
- [ ] 베타 10명에게 받은 localStorage JSON으로 백필 (별도, 운영자가 service_role로 INSERT)
- [ ] operator.html에서 신규 가입 추적 시작

## I. 오픈 후 매일 아침 1분 헬스 체크

```sql
SELECT
  COUNT(*) AS users_total,
  COUNT(*) FILTER (WHERE signup_date > NOW() - INTERVAL '24 hours') AS new_24h
FROM users;

SELECT COUNT(*) AS subs_today FROM submissions
 WHERE submitted_at > NOW() - INTERVAL '24 hours';

SELECT COUNT(*) AS history_today FROM submissions_history
 WHERE created_at > NOW() - INTERVAL '24 hours';
```

submissions가 늘고 history가 그보다 더 늘고 있으면 정상. submissions만 늘고 history가 정체면 비정상 (RPC 우회된 직접 INSERT). 즉시 점검.
