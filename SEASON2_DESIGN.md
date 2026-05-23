# 1일1비, 30일 완주 후 시즌 2 설계

작성: 정식 오픈 후. 핵심 제약: 데이터 손실 절대 0.

## 0. 데이터 손실 0 원칙 (최우선)

모든 시즌 전환 작업은 추가(ADD COLUMN / INSERT)만. 기존 데이터 UPDATE·DELETE 최소화·금지.

- 새 콘텐츠: SCENARIOS에 Day 31-60 append. 기존 Day 1-30 수정 안 함.
- 학습 데이터: submissions PK가 (email, day). day 31-60도 같은 테이블에 누적. 기존 row 무관.
- 레벨/시즌: users 테이블에 ALTER TABLE ADD COLUMN. 기존 컬럼 안 건드림.
- 승진 이력: 새 테이블 level_history (append-only).

핵심: day 번호를 끊지 않고 연속 (시즌1 = 1-30, 시즌2 = 31-60). 30일 데이터는 영구 보존.

## 1. 흐름 개요

수습사원 (Day 1-30)
  → 30일 완주 감지
  → 임원 면접 팝업 (회장 첫 등장, 떡밥 회수)
  → 정규직 전환 (레벨업, 부서 선택)
  → 시즌 2 (Day 31-60)

## 2. 레벨 체계

| 시즌 | day 범위 | 시작 레벨 | 완주 후 레벨 |
|---|---|---|---|
| 1 | 1-30 | 수습 (probation) | 정규직 사원 (staff) |
| 2 | 31-60 | 사원 | 대리 (senior) |
| 3 | 61-90 | 대리 | 과장 (manager) |
| 4+ | 91+ | 과장 | 임원 (executive), 회장 재회 |

단어 난이도:
- 시즌 1: 기초 비즈니스 (stakeholder, deadline, follow up)
- 시즌 2: 중급 (leverage, escalate, deprioritize, circle back)
- 시즌 3+: 고급 (협상, 리더십, 전략 어휘)

## 3. 30일 완주 감지

조건: USER.currentDay >= 30 AND Day 30 미션 완료.
트리거: Day 30 학습 끝나면 GraduationModal 자동 표시.

## 4. 임원 면접 팝업 (이벤트)

회장 첫 등장 (CHARACTERS에 "회장님은 아무도 못 봤다" 떡밥 존재).

```
[임원 면접실 · 30일 차]
회장: "30일 개근, 봤습니다. 영작도 미팅 발언도 다 본인이 먼저 해본 거죠."

회고 카드 (submissions 등에서 집계, 읽기만):
· 학습한 단어 N개
· 작성한 영작 N개
· 사수 칭찬 N회
· 출근 연속 일수

회장: "정규직으로 전환합니다. 다음 분기도 잘 부탁합니다."
[정규직 전환 + 시즌 2 시작하기]
```

가벼운 인터랙션. 회고 보여주고 정규직 전환 버튼 하나. 무겁지 않게.
부서 선택 없음.

## 5. 정규직 전환 (레벨업)

- users.level: probation → staff
- users.season: 1 → 2
- users.selected_dept: 선택한 부서
- 사원증 디자인: "수습" → "정규직" 도장, 색 변경
- 출근부: 시즌1 30일 도장 = 명예의 전당 보존 + 시즌2 새 출근부

## 6. 구현 단계 (점진적, 각 단계 독립 검증)

### Phase 1: DB 준비 (위험 0)
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS season INT DEFAULT 1;

CREATE TABLE IF NOT EXISTS level_history (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  from_level TEXT,
  to_level TEXT,
  season INT,
  promoted_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE level_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY lh2_block ON level_history FOR ALL USING (false) WITH CHECK (false);
```

### Phase 2: 임원 면접 모달 (클라이언트만)
- mainboard.html에 GraduationModal 컴포넌트
- Day 30 완주 시 표시
- 회고 데이터는 기존 submissions에서 집계 (읽기만, 변경 없음)

### Phase 3: 레벨업 RPC (안전)
```sql
CREATE OR REPLACE FUNCTION promote_user(p_email TEXT, p_to_level TEXT, p_season INT)
RETURNS users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r users; old_level TEXT;
BEGIN
  SELECT level->>'id' INTO old_level FROM users WHERE email = p_email;

  -- 승진 이력 append (절대 안 지움)
  INSERT INTO level_history(email, from_level, to_level, season)
  VALUES (p_email, old_level, p_to_level, p_season);

  -- users 업데이트 (학습 데이터 컬럼은 절대 안 건드림)
  UPDATE users
     SET level = jsonb_build_object('id', p_to_level, 'ko', '정규직', 'en', 'Staff'),
         season = p_season,
         updated_at = NOW()
   WHERE email = p_email
   RETURNING * INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION promote_user(TEXT, TEXT, INT) TO anon, authenticated;
```

### Phase 4: 시즌 2 콘텐츠 추가
- SCENARIOS에 Day 31-60 append
- 한 번에 안 하고 Day 31-35 먼저 (사용자 도달 전 여유)
- 기존 Day 1-30 수정 절대 안 함

## 7. 데이터 손실 0 재확인 체크리스트

기존 데이터가 사라질 수 있는 경로 전부 차단:
- submissions UPDATE/DELETE: 안 함 (day 31+ INSERT만)
- users 컬럼 변경: ADD COLUMN만, 기존 컬럼 안 건드림
- 출근부 리셋: 시즌1 기록 보존 + 시즌2 별도 표시
- 콘텐츠 수정: Day 1-30 freeze, Day 31+ 추가만

한 줄 요약: 시즌 전환은 "옛것 지우고 새것"이 아니라 "옛것 위에 새것 쌓기".

## 8. 구현 우선순위 (실제 도달 시점 고려)

사용자가 Day 30에 도달하려면 최소 30일 (정식 오픈 후 한 달). 즉 여유 있음.

권장 일정:
- 정식 오픈 후 1주: 시즌2 설계 확정 (이 문서)
- 2-3주차: Phase 1 (DB 준비) + Phase 2 (면접 모달) 구현·테스트
- 3-4주차: Phase 3 (레벨업 RPC) + Phase 4 (Day 31-40 콘텐츠)
- Day 30 도달자 나오기 전 완성

서두를 필요 없음. 각 Phase 독립 검증 후 다음. 데이터 안전 최우선.
