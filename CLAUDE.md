# 1일1비 (1day-1biz) - 작업 메모

## 📝 노션 변경 로그 (매 세션 습관)
- **주요 변동사항(정책 변경·새 기능·사고 대응)은 노션 > 파라 > "1일1비" 페이지에 날짜별 로그로 기록한다.**
  (페이지 ID: 3cb910a8-ed7a-45d3-b3d9-f460f083d71c, "관련 메모" 섹션에 `### YYYY-MM-DD 개발·운영 변경 로그` 형식으로 추가)
- 사소한 수정은 생략, 사용자·운영에 영향 가는 것만. 개인 식별 정보(고객 실명+이메일)는 쓰지 않는다.

## 📋 기획 백로그 (PLANNING.md) - 세션 넘어 기억할 것
- **`PLANNING.md`가 살아있는 기획 백로그.** 매주 월요일 기획회의의 기준 문서.
- 사용자가 새 아이디어·기능 요청을 말하거나, 사용자/이탈자 피드백 답장이 들어올 때마다
  **PLANNING.md에 안건을 추가하거나 기존 안건을 업데이트한다.** (배경/현재구조/장단점/열린질문/상태)
- 완료된 안건은 상태를 ✅로 바꾸고, 새 요청은 안건으로 추가.
- 새 대화 시작 시 PLANNING.md를 읽어 맥락을 이어간다 (채팅방 옮겨도 기억 유지 목적).

## 🔐 공개 노출 주의 (보안)
- 이 레포는 private이어도 **GitHub Pages 사이트(1day-1biz.youbuddy.co.kr)는 공개**다. URL만 알면 누구나 파일을 받을 수 있다.
- `_config.yml`의 exclude로 `*.md`, `*.sql`, `*.sh`, `scripts/`, `supabase/`, `migrations/`는 공개 서빙에서 제외했다. (그래도 방심 금지)
- **민감 정보는 어떤 파일에도 적지 않는다**: 실명+이메일 조합, 수익 배분 비율, 협업/계약 조건, 내부 매출 수치, 특정인의 이탈/개인 사정, 개인 감정 메모, 비밀키.
- 애매하면 그냥 적지 말고 **사용자에게 물어보고, 순화한 버전으로** 적는다. (예: "수익 셰어 7:3" 대신 "수익 셰어 비율은 비공개 논의 중")
- 정말 민감한 상세는 공개 배포 레포가 아니라 별도 private 레포(`1day-1biz-internal`)에 둔다.

## 🚫 절대 규칙 (Style Rules)

### em-dash (U+2014) 완전 금지
이 프로젝트의 어디에도 em-dash 기호를 사용하지 않는다.
- 코드, 데이터, UI 텍스트, 주석, 문서, 시나리오, 답변 풀, 한국어 힌트 등 **모든 곳**
- 사용자가 명시적으로 영구 금지 요청 (2026-05)

**대체 사용**:
- 강조용 분리 → 쉼표(`,`) 또는 마침표(`.`)
- 인용/설명 도입 → 콜론(`:`)
- 줄바꿈 효과 → 줄바꿈 또는 마침표
- 시간 범위 → 하이픈(`-`) 또는 "~"
- 영어 본문 → 쉼표·세미콜론·괄호로 대체

**금지 예시**:
- ❌ "Following up on yesterday's call - here are the action items."
- ✅ "Following up on yesterday's call, here are the action items."

- ❌ "회의 끝나고 follow up 메일 한 줄. 24시간 내 보내면 신뢰 점수 +10."
- ✅ "회의 끝나고 follow up 메일 한 줄. 24시간 내 보내면 신뢰 점수 +10."

**검사 명령**:
```bash
# U+2014 문자가 어디 남아있는지 검사 (Python으로 안전하게)
python3 -c "
import os, glob
for fp in glob.glob('**/*.html', recursive=True) + glob.glob('**/*.jsx', recursive=True) + glob.glob('**/*.js', recursive=True) + glob.glob('**/*.md', recursive=True):
    if 'uploads/' in fp or '.git/' in fp: continue
    try:
        with open(fp, encoding='utf-8') as f: s = f.read()
        ch = chr(0x2014)
        if ch in s: print(fp, ':', s.count(ch))
    except: pass
"
```
결과가 비어있어야 정상 (CLAUDE.md 본인은 제외).

---

## 프로젝트 구조

- `index.html` - 라우터 (로그인 상태 기반 분기)
- `onboarding.html` - 입사 지원 + 로그인
- `mainboard.html` - 메인 제품 (어휘 학습 시뮬레이터, 셀프 컨테인드)
- `simulator.html` - 페이월 / 출근 대기실
- `coming-soon.html` - 일반 대기 페이지
- `operator.html` - 운영자 뷰
- `waitlist.html` - 대기 등록
- `lib/supabase-client.js` - Supabase 헬퍼 (window.OD)

## 권한 플래그 (users 테이블)

| 플래그 | 의미 | mainboard 접근 |
|---|---|---|
| isOperator | 운영자 | ✓ |
| isDevMode | 내부 Dev/테스터 (DEV 코드) | ✓ |
| isTester | 테스터 세그먼트 (DEV 중 운영자 아님) | (DEV로 통과) |
| isPilotHire | PILOT 코드로 가입 | (unlocked 봄) |
| unlocked | 사옥 입장 권한 - 실제 게이트 | ✓ |

## 베타 운영 규칙 (2026-05 기준)

- PILOT-2026 코드로 7일 베타 진행
- 베타 동안 주말 가드 OFF (`_isWeekendDay` 항상 false, `_dayOfWeek` 5일 순환)
- 요일 개념 완전 제거 (UI에 토/일 등 노출 안 함)
- Day 자동 진행: 가입일 기반 캘린더 계산 (KST 자정)
- 7일 지난 PILOT 사용자에게 베타 만료 모달

## 로그인 방식: 이메일 6자리 코드 (OTP) ✅ 완료 (2026-06-12)

- Magic link → OTP 전환 완료. 이메일 템플릿 `{{ .Token }}` + 2단계 로그인 UI
  (`signInWithOtp` → `verifyOtp({ type: 'email' })`).
- 어느 기기에서 코드를 입력해도 세션 생성 → 모바일·PC 교차 로그인 OK.
- 적용 파일: `onboarding.html` LoginScreen, Supabase Dashboard 이메일 템플릿.
- 넛지 메일 안내 문구는 "변경 예정"이 아니라 "변경 완료" 톤으로 쓸 것:
  - 📨 **이메일 코드로 로그인**: 이메일로 받은 6자리 코드를 입력하는 방식으로 바뀌었어요.
    모바일에서 코드 받아 PC에서 입력 같은 교차 로그인이 가능합니다.

## 시즌 2 (Day 31-60) 구조 (2026-06-10 추가)

- SCENARIOS는 Day 1-60. Day 31-60 = 정직원 (능동적 어휘: 회의 주도·의사결정)
- 레벨: `users.level` (jsonb). 수습 `{id:"probation"}` → 정직원 `{id:"fulltime",ko:"정직원",en:"Full-time"}`
- `USER.totalDays`는 레벨 기반: 수습 30 / 정직원 60. `_autoDay` 상한 60.
- Day 29 D-1 팝업(`PromotionD1Popup`), Day 30+ 승급 의례(`PromotionCeremony`): level이 probation이고 realDay>=30이면 자동 트리거 (Day 32+ 기존 사용자 흡수)
- 레벨업 저장: localStorage 먼저 → DB(`updateProgress`). 실패 시 `__OD_PENDING_LEVELUP` 큐 → mountAfterHydrate에서 재시도. hydrate는 pending 중엔 DB level로 되돌리지 않음.
- DB 마이그레이션: `migrations/2026-06-10_season2_levelup.sql` (levelup_completed_at, levelup_test_score, day60_completed_at). ✅ Supabase SQL Editor에서 실행 완료 (2026-06-12 확인).
- 검증: `node scripts/validate-season2.js` (day 1-60 전수, variant 정합성, off-by-one, em-dash)
- Day 60 특별 면담은 Phase 4 (미구현, wrapup 라벨만 존재)
- 마일스톤 day 37/44/51은 축하 톤 단어 (hit the ground running / momentum / go the extra mile)

## 시나리오 데이터 구조 (SCENARIOS in mainboard.html)

```js
{
  day: 1, word: "stakeholder", pos: "n.", meaning: "이해관계자",
  phonetic: "...", scene: "...", npc: "manager",
  quote: "...",                    // NPC가 한 말
  sampleAnswer: "...",             // 영문 모범 답안
  mentorTip: "...",                // 사수의 한 줄 팁
  mcOptions: [                     // Mini Mission 객관식 (3개)
    { text, kind: "correct"|"formal"|"weak", note }
  ],
  buddyAnswers: {                  // 유버디 채팅 답변
    nuance: "...",                 // 뉘앙스 설명
    example: "...",                // 예문 모음
    default: "..."                 // 외우는 팁
  },
  task: {                          // SceneModal 미션 안내 (Day 1-5만 현재)
    to: "manager"|"daniel"|...,    // 받는 사람 NPC id, "team" = 그룹
    channel: "face"|"slack-dm"|"slack-channel"|"email"|"video-call",
    promptKo: "...",               // 한국어 미션 설명
    koSentence: "..."              // 영작 가이드용 한국어 문장 (인용부 없이)
  }
}
```
