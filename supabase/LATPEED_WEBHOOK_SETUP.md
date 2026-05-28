# 래피드 웹훅 연동 설정 가이드

월간 멤버십 결제·환불 이벤트를 래피드에서 받아서 `users.membership_ends_at`을
자동으로 갱신합니다.

## 1. 마이그레이션 실행

Supabase Dashboard → SQL Editor → `supabase/migrations/20260524_latpeed_events.sql` 내용 붙여넣고 RUN.

체크: `SELECT * FROM latpeed_events LIMIT 1;` 가 에러 안 나면 OK.

## 2. Supabase CLI 설치 (한 번만)

```
brew install supabase/tap/supabase
```

설치되어 있으면 `supabase --version` 으로 확인.

## 3. 프로젝트 링크 (한 번만)

```
cd ~/Projects/1day-1biz
supabase login                       # 브라우저로 인증
supabase link --project-ref <PROJECT_REF>
```

`<PROJECT_REF>`는 Supabase 대시보드 URL의 `https://supabase.com/dashboard/project/<여기>` 부분.

## 4. 함수 배포

```
cd ~/Projects/1day-1biz
supabase functions deploy latpeed-webhook
```

`config.toml`에 `verify_jwt = false`가 박혀 있어서 인증 헤더 없이도 호출됩니다.

배포 성공하면 함수 URL이 출력돼요. 형식:
```
https://<PROJECT_REF>.supabase.co/functions/v1/latpeed-webhook
```

## 5. 래피드에 웹훅 URL 등록

래피드 → 상품(혹은 멤버십) 관리 → 외부 툴 연동 → Webhook 카드 [연결하기]
→ 위에서 받은 함수 URL 붙여넣기 → 저장.

## 6. 동작 테스트

(a) 운영자 본인이 멤버십 한 번 결제해보거나, 래피드 측에 테스트 호출 요청.

(b) Supabase Dashboard → Table Editor → `latpeed_events` 에 row가 쌓이는지 확인.
   - `raw` 컬럼: 래피드가 보낸 원본 payload
   - `apply_note`: 처리 결과 (예: `extended_until_2026-07-01T...`, `user_not_found_yet`)
   - `applied`: users 테이블에 실제 반영됐는지

(c) `SELECT email, membership_ends_at FROM users WHERE email = 'test@...';`
   로 만료일이 결제일+31일로 박혔는지 확인.

## 동작 룰

| 래피드 이벤트 | 우리 시스템 반응 |
|---|---|
| `MEMBERSHIP_PAYMENT` + `SUCCESS` | `membership_ends_at = 결제일 + 31일`, cohort=member |
| `MEMBERSHIP_PAYMENT` + `CANCEL`  | `membership_ends_at = NOW()` (즉시 만료), cancel_reason 기록 |
| `NORMAL_PAYMENT` 등 그 외        | 로그만 (멤버십 게이트와 무관) |

자동 갱신을 사용자가 끄면 래피드가 다음 달에 SUCCESS를 안 보내요. 그러면
`membership_ends_at`이 갱신되지 않고, 자연스럽게 그 날짜 지나면 mainboard가
만료 처리합니다.

## 문제 해결

**래피드에서 "연동 오류" 뜸**
- `latpeed_events` 테이블이 안 만들어졌는지 확인 (1번 마이그레이션 누락)
- 함수 로그 확인: `supabase functions logs latpeed-webhook`

**이벤트는 오는데 users가 안 바뀜**
- `latpeed_events.apply_note` 확인.
- `user_not_found_yet` → 결제는 됐는데 1day-1biz에 가입 안 한 이메일. 그 사람이 가입하면 새로 결제 처리 필요 OR 가입 흐름에서 lookup 추가.
- `update_error: ...` → users 테이블 RLS나 컬럼 문제.

**구독 주기를 31일이 아닌 값으로 바꾸고 싶음**

함수 환경변수 추가:
```
supabase secrets set MEMBERSHIP_DAYS=366   # 연간이면
```
그 뒤 재배포: `supabase functions deploy latpeed-webhook`
