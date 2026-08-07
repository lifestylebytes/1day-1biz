# 1일1비 에이전트 온보딩 (이 프로젝트를 처음 보는 에이전트용)

> 이 문서 하나로 "무슨 제품인지, 고객이 뭘 겪는지, 코드와 운영이 어떻게 굴러가는지"를 파악한다.
> 스타일 절대 규칙과 보안 규칙은 CLAUDE.md, 살아있는 기획 백로그는 PLANNING.md 참조. 이 문서엔 개인 식별 정보를 적지 않는다.

---

## 1. 제품 한 줄

**1일1비** = 외국계 회사에 "입사"해서 90일 다니는 **출근 시뮬레이터형 비즈니스 영어 학습 서비스**.
하루 5분, 매일 단어 하나를 실제 업무 상황(회의·슬랙·메일)으로 익힌다. 월 9,900원 구독.

포지셔닝: 유버디(YouBuddy) 우산의 저가 셀프 상품. 본품인 유비챌(코호트 챌린지)로 올려보내는 **퍼널 하단** ("이거 먼저 해보고 유비챌 베이직으로").

- 라이브: https://1day-1biz.youbuddy.co.kr (GitHub Pages, **레포가 private여도 사이트는 공개**)
- 스택: 정적 HTML + React-in-browser(Babel) + Supabase(DB/인증/Edge Functions) + Latpeed(국내 결제)

## 2. 고객이 실제로 경험하는 것

### 2-1. 입사 (가입)
1. Latpeed에서 멤버십 결제 → 회원 코드(1DAY1BIZ365) 안내 받음
2. onboarding.html에서 "입사 지원": 이메일 인증(6자리 OTP) + 비밀번호 설정 + 코드 입력
3. 부서 배정, 사수(차윤아) 배정 → mainboard(사옥)로 첫 출근

로그인: 이메일+비밀번호 또는 이메일 OTP 코드. PWA(홈 화면 추가) 지원, 매일 저녁 푸시 알림(cron), iOS 강제종료 대비 쿠키 신원 복원.

### 2-2. 하루 루프 (매일 4개 일정)
1. **출근 도장 + 오늘의 단어**: 사수가 포스트잇으로 단어 줌 (word, 뜻, 발음)
2. **오늘의 시추에이션**: NPC(김 팀장/런던 Daniel/미국 클라이언트 Sarah 등)가 그 단어로 말을 걸고, 한 줄 영작 미션 제출 → AI 사수 첨삭(교정문+문법+어휘+뉘앙스+칭찬)
3. **변동 활동** (day별 순환): 미니미션 퀴즈(3지선다) / English Lunch(동료와 2턴 점심 수다, 콩글리시·과격식 함정) / 복습 퀴즈(빈칸, 문장 랜덤 변형) / 오후 업무(메일 빈칸)
4. **내 시추에이션 일지**: "이 단어 어디서 써먹을까" 회고 + AI 추천 문장

4개 다 하면 그날 "출근 완료" 도장. 출근부(캘린더 그리드)에 완료/늦은인증/놓침 표시.

### 2-3. 직급 RPG (90일 사다리)
| 구간 | 직급 | 내용 |
|---|---|---|
| Day 1-30 | 수습 | 수동적 어휘(들으면 아는). 마일스톤 7/15/21 |
| Day 30 | **승급 의례** | 30일 회고 + 영어 미니시험(10문항, 복습 풀 랜덤) + 소감 → 사원 발령 |
| Day 31-60 | 사원(Associate) | 능동적 어휘(회의 주도). 마일스톤 37/44/51, Day 60 특별 면담 |
| Day 60 | **체크포인트 팝업** | 60일 축하 + "30일 더 = 대리" + 업계/니즈 설문(주관식 포함, 이메일당 1회 DB 기록) |
| Day 61-90 | 사원(대리 승진 트랙) | 협상·설득·이해관계자·갈등중재 어휘. 마일스톤 67/74/81 |
| Day 90 | **대리 승진 시험** | 10문항(Day 61-90 풀) → 대리(Senior Associate) 승진. 단, 60일 이상 실제 완주해야 응시 |

사원증 페이지: 직급별 카드 덱(수습=기본/사원=네이비/대리=레드), 사번은 가입일 기반 통일. day는 가입일 기준 KST 자정 자동 진행(학습 안 해도 진행), 90 상한.

### 2-4. 멤버십이 끝나면
- **휴직 화면**: "잠시 휴직 처리되었어요. 자리는 그대로." + 기록 보관 안내 + **복직 신청(=Latpeed 재결제) 버튼**. 복직하면 하던 Day 그대로 이어짐(기록은 이메일 기준 DB 보관).

## 3. 파일 지도 (전부 셀프 컨테인드 대형 HTML)

| 파일 | 역할 |
|---|---|
| index.html | 라우터 (로그인 상태로 분기, 쿠키/세션 복원) |
| onboarding.html | 입사 지원 + 로그인 (OTP/비번), 환영 화면 |
| **mainboard.html** | 메인 제품. SCENARIOS(90일 콘텐츠), 점심/복습/오후업무 데이터, 모든 화면·게이트가 이 파일에. **주의: `<script>` 블록이 2개(데이터/컴포넌트)로 나뉨. 앞 블록에서 뒷 블록 함수 호출 금지(화면 백지 사고)** |
| operator.html | 운영자 뷰: 사용자 목록/멤버십 현황/퇴직·복직 처리/**Latpeed CSV 동기화 패널**/AI 콘텐츠 제안 승인 |
| simulator.html | 페이월/출근 대기실 |
| lib/supabase-client.js | window.OD 헬퍼 전부 (인증/저장/RPC/멤버십) |
| lib/supabase-config.js | anon key + 결제 URL 설정 |
| scenarios.json | SCENARIOS 추출본(90일). operator 미리보기·AI triage 검증용. mainboard 콘텐츠 수정 시 재생성 필요 |
| sw.js / manifest.json | PWA (sw는 캐시 안 함, 푸시 수신용) |
| supabase/functions/ | Edge Functions: mentor-feedback(AI 첨삭), latpeed-webhook(결제 수신), push-send(푸시, 랜덤 문구 풀), feedback-triage(피드백→콘텐츠 수정 제안), reengage(이탈 메일), lemonsqueezy-webhook(해외, 보류) |
| supabase/migrations/ | SQL 마이그레이션 (실행은 대시보드 SQL Editor에서 수동) |

## 4. 데이터 모델 핵심 (Supabase)

users 테이블 핵심 필드:
- `email` (키), `cohort`: `member`(유료) / `season-*`(베타 시즌) / `staff` 등
- `unlocked`: 실제 입장 게이트. `is_pilot_hire`, `is_operator`, `is_dev_mode`
- `membership_ends_at`: 멤버십 만료일. `membership_cancel_at`: **해지 마커** (있으면 진짜 해지자)
- `level`(jsonb): probation/fulltime. `day_in_company`, `signup_date`(day 자동 계산 기준)
- 학습 데이터는 정규화 테이블(submissions/notes/journals) + RPC(save_*)로만 쓰기

읽기: anon key는 users SELECT 불가. `get_membership_status(email)` RPC로 상태 조회. 운영자 페이지는 로그인 세션(authenticated)으로 전체 조회.

## 5. 멤버십 게이트 (누가 들어올 수 있나, 사고 다발 지점)

mainboard의 게이트 규칙 (2026-08 확정):
1. **유료(member)**: 만료일 + **2일 유예** 지나면 자동 차단(휴직 화면). 단 `membership_cancel_at` 있으면(해지 확정) 유예 없이 만료일에 차단. 운영자 수동 회수(`unlocked=false`)는 즉시.
2. **비유료(시즌/파일럿)**: 만료일 지나면 즉시 차단.
3. 운영자/Dev 계정은 항상 통과.

**왜 2일 유예인가**: Latpeed가 **자동 갱신 결제에는 웹훅을 안 보낸다**(신규 결제·환불만 옴). 그래서 갱신이 DB에 즉시 반영 안 됨 → 날짜만 보고 즉시 차단하면 돈 낸 회원이 튕기는 사고. 반대로 무한 통과시키면 해지자가 계속 씀. 절충 = 2일.

**따라서 월 1회 운영 루틴이 필수**: Latpeed 멤버 CSV 다운로드 → operator의 "📥 Latpeed CSV 동기화" 패널에 붙여넣기 → 대조 미리보기(재량 연장자는 체크 해제) → 반영. 결제일이 대부분 매달 20-21일에 몰려 있으니 22일쯤 1회면 됨.

과거 사고 사례(재발 방지용):
- 갱신 미동기화 상태에서 날짜 차단 → 결제한 회원 튕김
- 반대로 전원 fail-open → 시즌 만료자가 무기한 학습
- localStorage에 옛 만료일 캐시 → 특정 기기(PC)만 차단됨 (해결: boot hydrate가 DB와 동기화, 새로고침/재로그인 안내)

## 6. AI 파이프라인

- **첨삭(mentor-feedback)**: 영작 제출 → gpt-4o-mini가 교정문+segments+문법+어휘+뉘앙스 JSON. **일관성 규칙**: 이미 자연스러우면 그대로 인정, 직전 추천(prevCorrected)을 그대로 재제출하면 절대 딴 버전으로 안 되돌림(서버 가드), temp 0.25. 실패 시 규칙 기반 폴백.
- **콘텐츠 자가수정 루프**: 사용자 피드백 → feedback-triage(cron)가 분류 → 본문(scenarios.json)에 그 문장이 실제 있는지 검증 후 content_edits(pending) 제안 → 운영자가 operator에서 승인 → mainboard가 부팅 시 approved 편집을 substring-replace로 라이브 적용(재배포 불필요) → 신고자 알림은 운영자가 수동 발송.
- **푸시**: 매일 저녁 cron이 push-send 호출, 문구 풀에서 랜덤.

## 7. 배포·검증 (에이전트 필수 습관)

- 코드 수정 후: **em-dash(U+2014) 0개 확인**(CLAUDE.md 절대 규칙), babel 블록 esbuild 파싱, 데이터 블록이면 `node --check`
- mainboard SCENARIOS 수정 시 scenarios.json 재생성
- 배포 = git push (사용자가 Mac에서). Edge Function 수정은 별도로 `supabase functions deploy <이름> --no-verify-jwt`
- 마이그레이션은 SQL Editor에서 수동 RUN
- 캐시: 반영 안 보이면 하드 리프레시(Cmd+Shift+R), PWA는 완전 종료 후 재실행
- 민감 정보(실명+이메일 조합, 수익, 계약)는 **어떤 파일에도 쓰지 않기** (사이트가 공개라서)

## 8. 지금 열려 있는 방향 (2026-08 기준, 상세는 PLANNING.md)

- 결제 프로바이더: Latpeed 유지 중, 해외(Lemon Squeezy 거절됨 → Polar 검토), 국내 PG(포트원) 논의
- 유비챌 퍼널 연결(업셀 지점), 1일1비 전용 톡방(강제성 보완), 업계별 AI 큐레이션(Day60 설문이 시드)
- 미가입 결제자(돈만 내고 가입 안 한 사람) 온보딩 안내가 상시 과제
