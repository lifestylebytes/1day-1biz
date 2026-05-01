# 1일1비 — 고객 데이터 스키마

## v1 (현재 — localStorage)

브라우저 localStorage 키 2개:

### `__OD_USER` — 사용자 프로필
온보딩 완료 시 생성. 시뮬레이터·운영자 뷰가 읽음.

```ts
{
  // 신원 (실제)
  email: string,
  name: string,
  signupDate: ISO8601,

  // 신원 (게임 내 = 회사 내)
  empNumber: string,           // 예: "20260501-0042"
  department: { id, name, short },
  mentor:     { id, name, role, trait },
  coworkers:  Array<{ id, name, role, note }>,

  // 진도
  level:        { id, ko, en },  // 예: { id:"probation", ko:"수습", en:"Probation" }
  dayInCompany: number,
  scenariosCompleted: Array<{ scenarioId, completedAt, accuracy }>,
  wordsStudied:       Array<{ wordId, firstSeen, lastReviewed, correctCount, wrongCount, contextTags }>,

  // 학습 과학 측정 (P1~P5 가설 검증용)
  productionAttempts: { correct: number, total: number },     // P1
  noveltyEvents:      Array<{ eventId, at, wordsInWindow }>,  // P3

  // 활동
  lastActive:    ISO8601,
  totalSessions: number,
  totalSessionMs:number,

  // 설정
  preferences: { notifications, timezone },

  // 운영 메타
  onboardingMotivation: string,
  cohort: string | null,
  schemaVersion: 1,
}
```

### `__OD_NOTICES` — 운영자가 보낸 공지
운영자 뷰에서 작성, 시뮬레이터의 사내 메모(Inbox)에서 표시.

```ts
Array<{
  id: number,        // timestamp
  type: "notice" | "event" | "ceo" | "event-novelty",
  title: string,
  body: string,
  from: string,      // 보통 "유버디 (CEO)"
  at: ISO8601,
  unread: boolean,
}>
```

## v2 (Supabase 마이그레이션 매핑)

다음 테이블로 그대로 이전.

### `users`
`__OD_USER`의 신원·진도·활동·설정 그대로. 로그인은 Supabase Auth.

### `events` (이벤트 로그 — 분석용)
모든 사용자 행동 1건 1행. 학습 과학 가설 측정의 원천.
```sql
event_id, user_id, type, payload (jsonb), happened_at
```
type 예시: `scenario_started`, `word_attempted`, `production_correct`, `production_wrong`, `novelty_event_shown`, `notice_read`, `level_up`, `session_start`, `session_end`

### `notices`
`__OD_NOTICES`를 모두 사용자에게 broadcast 한다고 보고 사용자별 read 상태 분리.

### `scenarios`, `words`, `characters`
정적 컨텐츠. 운영자가 CMS로 관리.

## 캡처 우선순위 (베타 30일에 모아야 할 데이터)

핵심 4종:
1. **신원** — email, name, signupDate
2. **진도** — dayInCompany, scenariosCompleted, wordsStudied
3. **P1 정확도** — productionAttempts.correct / .total
4. **세션 활동** — lastActive, totalSessions

이 4종만 있어도 D7/D30 retention + 학습 효과 측정 가능.

## 프라이버시 / 신뢰 메모

- 이메일은 운영자 뷰에서 마스킹 (예: `j****@gmail.com`)
- 사용자에게: "당신의 학습 데이터는 본인 동의 하에만 분석에 사용" 명시 (Phase 2 정식 출시 시 약관)
- 데이터 export 권리 (운영자 뷰의 "JSON export" 버튼 = 본인도 다운 가능하게 v1.5에 추가)

## 마이그레이션 절차 (v1 → v2)

1. v1.5에서 사용자에게 "기존 진도 가져오기" 버튼 제공
2. 버튼 누르면 localStorage의 `__OD_USER` JSON을 Supabase API로 POST
3. 서버에서 받아서 `users` 테이블에 insert
4. 이후엔 Supabase가 source of truth, localStorage는 캐시로만
