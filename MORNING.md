# 🌅 일어나면 여기부터 — 어젯밤 작업 정리

> 안녕! 어젯밤 P0~P3 다 돌렸어. 화이팅.

## 오늘 가장 먼저 볼 것 (5분)

1. [Dev 런처 열기](computer:///Users/gyo/Projects/1일1비/dev.html) — 모든 화면 한눈에
2. [docs-viewer 열기](computer:///Users/gyo/Projects/1일1비/docs-viewer.html) — 문서 정리됨, 새 doc 4개 추가
3. **🛠 테스터1로 즉시 Day 1 진입** 빨간 버튼 클릭 → Day 1 시뮬 바로 체험

## 어젯밤 끝낸 작업

### P0 (필수)
- ✅ **명조체 폰트 제거** — Cormorant Garamond / 바탕체 fallback 다 차단. 전체 sans-serif 통일
- ✅ **Day 900 → Day 180 endgame 압축** — 회장 만남 = 6개월차로 변경. retention 핵심
- ✅ **Tester Dev 모드 토글** — onboarding의 ApplicationScreen에 체크박스 추가. DEV-TEST / DEV-2026 / DEV-BUDDY 코드 인식
- ✅ **유버디 = CEO 아님 = 버디** — onboarding/operator/simulator 다 정정
- ✅ **회장 미스테리 캐릭터** — 별개로 분리. 50개 일화 풀, Day 180 reveal
- ✅ **사수 vs 버디 차이 명확화** — `docs/youbuddy-role.md`

### P1 (중요)
- ✅ **새 doc — `retention-mechanics.md`** — NG+ / 시즌 / 컬렉션 / 멘토 모드 / LTV 분석
- ✅ **새 doc — `day1-30-outline.md`** — 30일치 시나리오 blueprint (어휘·NPC·P1 액션·떡밥)
- ✅ **새 doc — `ceo-mystery.md`** — 회장 50개 일화 풀
- ✅ **`progression.md` 통째 재작성** — Day 180 endgame, 결제 사이클 매핑
- ✅ **`job-titles.md` 압축** — 8단계 Day 1-180 anchored
- ✅ **`concept.md` 4 시즌 비전** — 너 적어둔 거 반영
- ✅ **부서 5개 + 사수 4명 랜덤 배정** (이미 동작) + Day 14 부서 이동 옵션

### P2 (좋은 흐름)
- ✅ **docs-viewer 업데이트** — 새 doc 2개 (retention-mechanics, day1-30-outline) 사이드바 + 인라인 임베드
- ✅ **dev.html "🧪 테스터1 즉시 진입" 버튼** — 가짜 사용자 만들어 Day 1 직행
- ✅ **simulator의 Dev 패널 (?dev=1)** — Day +1 / +7 / 점프 / 리셋

### P3 (정리)
- 📌 **남은 정리** (다음 라운드):
  - login.html (회사 PC 스타일) + 비밀번호 시스템 — 우선순위 떨어진 거 같아 미룸
  - operator.html의 invite code 섹션 정리 (테스트 도구로 잔존)
  - sim/data.js의 Day 1-30 실제 시나리오 채우기 (outline 기반)
  - AI 도입 계획 doc (`docs/ai-integration.md`)
  - 가격·번들 doc (`docs/pricing-bundles.md` — 2만/3.9만 + 워크샵 7종)

---

## 새로 봐야 할 핵심 doc (이 순서)

| 순서 | doc | 왜 |
|---|---|---|
| 1 | [Day 1-30 outline](computer:///Users/gyo/Projects/1일1비/docs/day1-30-outline.md) | 30일치 시나리오 blueprint — 검토하고 수정할 부분 정해줘 |
| 2 | [Retention 메커니즘](computer:///Users/gyo/Projects/1일1비/docs/retention-mechanics.md) | 평생 컨텐츠 설계 — NG+ / 컬렉션 / 멘토 모드 |
| 3 | [회장 미스테리](computer:///Users/gyo/Projects/1일1비/docs/ceo-mystery.md) | 50개 일화 풀 — 시뮬레이터에 박을 떡밥 |
| 4 | [업데이트된 progression](computer:///Users/gyo/Projects/1일1비/docs/progression.md) | Day 180 anchored |
| 5 | [업데이트된 job-titles](computer:///Users/gyo/Projects/1일1비/docs/job-titles.md) | 압축된 8단계 |

---

## 직접 테스트해볼 흐름

### 흐름 A — 일반 신규 사용자
1. dev.html → "↻ 사용자 리셋"
2. "🚪 온보딩 처음부터" 클릭
3. 60초 흐름: 환영 → 지원서 → 심사 → 합격 메일 → 사번 배정 → 버디 인사 → Day 1 출근
4. → simulator.html (Day 1 시뮬)

### 흐름 B — 테스터 (Dev 모드 ON)
1. dev.html → "↻ 사용자 리셋"
2. "🚪 온보딩 처음부터" 클릭
3. STEP 1 지원서에서 **🛠 테스터 (Dev 모드)** 체크박스 클릭
4. 코드 입력: `DEV-TEST`
5. "✓ Dev 모드 활성" 표시 확인
6. 지원서 제출 → 흐름 진행 → 시뮬레이터 자동으로 `?dev=1` 모드
7. 우측 하단 검은 패널 — Day 점프 자유

### 흐름 C — 즉시 테스터1로 Day 1
1. dev.html → "🧪 테스터1로 즉시 Day 1 진입" 빨간 버튼
2. 가짜 사용자 자동 생성 → simulator 바로 진입

### 흐름 D — 운영자 뷰 확인
1. dev.html → "⚙ 운영자 뷰"
2. 너의 사용자 정보 + 운영 도구 (Day 점프 / 리셋)
3. 공지 발송 (전사 / 이벤트 / 버디 톡 / 돌발 노벨티)

---

## 코치한테 보내는 흐름 (Vercel 배포 후)

```
[배포된 URL]/onboarding.html
```
보내면 코치가:
1. 온보딩 진입
2. 이름·이메일 입력 (Dev 모드는 체크 안 함)
3. 정상 가입 → simulator (Day 1 시뮬)

너는 운영자 뷰에서:
- 실시간 진도 확인 (단, v1 localStorage라 같은 기기 안에서만)
- v1.5 Supabase 붙으면 모든 사용자 통합 모니터링

---

## 이번 주 추천 다음 액션 (우선순위)

### 1. **노션 단어 데이터** 받기 (가장 시급)
노션 페이지 "Share to Web" 공개로 전환하든가 → Markdown export → 파일 첨부.
받으면 sim/data.js의 `WORDS` + `SCENARIOS`를 너의 100개 큐레이션 + 비즈니스 빈출 100개 합쳐서 200개로 재구성.

### 2. **Day 1-30 outline 검토**
[Day 1-30 outline](computer:///Users/gyo/Projects/1일1비/docs/day1-30-outline.md) 읽고 수정할 부분 표시. OK 떨어지면 sim/data.js에 박음.

### 3. **Vercel 배포** (1-2시간)
- GitHub 비공개 레포 만들기
- Vercel 무료 계정 → GitHub 연결
- 자동 배포 URL 받기 → 코치한테 보낼 진짜 URL 생성

### 4. **외국계 N년차 알려줘**
정확한 햇수 받아서 docs/youbuddy-role.md + onboarding 카피에 채우기.

---

## 알아둘 사항

- **bash 마운트가 어젯밤 폴더 이동(~/Projects)으로 끊어졌어** — 그래서 file 도구로만 작업. 정상.
- **docs-viewer.html은 file:// 더블클릭으로도 동작** — 모든 doc 인라인 임베드
- **simulator.html은 셀프 컨테인드** — file:// 동작
- **localStorage = 이 브라우저 안에서만 진도 유지** — 시크릿 모드/다른 브라우저 가면 새 사용자

---

🛏 잘 자고 일어나서 꿈 꾸던 거 만들어보자. 화이팅!
