# 래피드 시트 → Supabase 멤버십 매일 07:00 자동 동기화

왜: 래피드 웹훅이 가끔 안 오거나 가입 전 결제여서 운영자 페이지의 만료일이 시트와 어긋났다. 시트는 래피드가 매번 채우므로, 시트를 기준으로 매일 아침 한 번 맞춘다. 웹훅은 그대로 두고 이건 안전망이다.

규칙 (운영자 뷰의 CSV 대조 패널과 같음)
- 이메일별 가장 최근 "결제 완료" 일시 + 1개월 그날 23:59 KST = 만료일. DB 만료일이 이보다 이르거나 비어 있으면 연장하고 cohort=member, unlocked=true, 해지마커 해제.
- 그 결제 뒤에 "결제 취소"가 있으면 만료일을 취소 시각으로 당기고 해지마커(latpeed_refund)를 세운다.
- "결제 실패"는 건드리지 않는다.
- 결제한 지 한 달이 지난 사람(시트 기준 만료)은 건드리지 않는다. 만료일은 줄이지 않는다.
- 아직 가입 안 한 이메일은 latpeed_events 에 넣어 두고, 가입하는 순간 기존 트리거(latpeed_apply_pending)가 소급 적용한다. 로그의 pending 에 같은 이름의 가입 계정이 nameMatches 로 같이 나온다.
- 래피드 결제 이메일과 앱 가입 이메일이 다른 사람은 latpeed_aliases 표에 한 줄 넣어 두면 그 뒤로 자동으로 이어진다 (migrations/2026-10-03_latpeed_aliases.sql).
- 운영자, Dev, 탈퇴 계정, youbuddy.co@gmail.com 은 건너뛴다.
- 바뀐 사람은 ops_log 에 sheet_sync 로 남는다 (운영자 페이지 "이력 보기"에 보임).

## 1. Supabase 쪽 (한 번만)
```
supabase functions deploy latpeed-sheet-sync --no-verify-jwt
```
Dashboard → Edge Functions → Secrets 에 `SHEET_SYNC_SECRET` 추가. 값은 아무 긴 랜덤 문자열 (예: 터미널에서 `openssl rand -hex 24`). 이 값은 아래 Apps Script 속성에 똑같이 넣는다. 저한테는 보내지 않아도 됩니다.

## 2. 구글 시트 쪽 (한 번만)
1. 시트 "1일1비 구매관리" 열기 → 확장 프로그램 → Apps Script
2. Code.gs 내용을 지우고 이 폴더의 `Code.gs` 를 통째로 붙여 저장
3. 왼쪽 ⚙ 프로젝트 설정 → 스크립트 속성 → 속성 `SHEET_SYNC_SECRET`, 값은 1번과 같은 문자열. 같은 화면에서 시간대가 Asia/Seoul 인지 확인
4. 편집기 상단에서 함수 `dryRun` 선택 → 실행 → 처음 한 번 권한 허용 → 실행 로그에서 `applied`(연장될 사람), `cancelled`(환불로 당겨질 사람), `pending`(미가입) 확인
5. 이상 없으면 `syncToSupabase` 선택 → 실행 (실제 반영)
6. 왼쪽 ⏰ 트리거 → 트리거 추가 → 함수 `syncToSupabase`, 이벤트 소스 "시간 기반", 유형 "일 단위 타이머", 시간 "오전 7시~8시" → 저장

끝. 이후 매일 07:00~08:00 사이에 한 번 돌고, 바뀐 게 있으면 ops_log 에 남는다.

## 확인 SQL
```sql
select at, detail from ops_log where action = 'sheet_sync' order by at desc limit 10;
select email, name, membership_ends_at, cohort, unlocked, preferences->>'pay_source' from users where preferences->>'pay_source' = 'latpeed_sheet' order by membership_ends_at desc;
```

## 안 될 때
- 로그에 `403 forbidden`: 두 쪽 SHEET_SYNC_SECRET 값이 다르다.
- `503 SHEET_SYNC_SECRET_not_set`: Supabase Secret 을 아직 안 넣었다.
- `이메일/상태/일시 열을 못 찾았습니다`: 래피드 탭 첫 줄 머리글 이름이 바뀌었다. Code.gs 의 col([...]) 후보에 새 이름을 추가.
