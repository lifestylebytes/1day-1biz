# 1일1비 (1day-1biz) - 작업 메모

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
