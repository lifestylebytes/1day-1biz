# 1일1비 (One Day, One Business)

회사 시뮬레이터 + 비즈니스 어휘 학습 + 직급 RPG.
유버디(YouBuddy) 우산 아래의 두 번째 상품 — 유비챌 코호트와 보완재 관계.

## 지금 바로 보기

**옵션 1 — 더블클릭 (가장 빠름)**
- `index.html` 더블클릭 → 런처 → 메인보드 클릭
- `mainboard.html`은 모든 JSX/CSS/data 인라인된 셀프 컨테인드 파일이라 file:// 에서도 동작

**옵션 2 — 로컬 서버 (안정적)**
- 터미널에서 `./start.sh`
- 브라우저 자동 오픈 → http://localhost:8080
- Python 3 필요

## 폴더 구조

```
.
├── index.html                 ← 로컬 런처 (여기부터 클릭)
├── start.sh                   ← 로컬 서버 스크립트
├── README.md                  ← 이 파일
│
├── docs/                      ← 컨셉·전략·로드맵 (이 순서로 읽기)
│   ├── concept.md             ← 1일1비가 뭔지
│   ├── learning-science.md    ← ⭐ 핵심 — 모든 시나리오·기능 결정의 기준
│   ├── progression.md         ← 직급 레벨업 (수습 → 임원) 설계
│   ├── vs-yubichal.md         ← 유비챌과의 포지셔닝
│   ├── validation.md          ← 검증 전략
│   ├── tech-stack.md          ← 기술 스택 결정 (웹 우선)
│   ├── roadmap.md             ← Phase 0 (1-2일) → Phase 4 단계별 계획
│   └── web-to-app.md          ← 앱 전환 전략 (v2 이후)
│
├── prototype.html             ← 데스크탑 디자인 프로토타입
├── mobile.html                ← 모바일 뷰 (메인보드 iframe)
├── mainboard.html             ← ⭐ 신입 메인보드 (셀프 컨테인드)
├── coming-soon.html           ← 정식 베타 시작 전 안내 페이지
│
├── styles.css, data.js        ← prototype.html 전용 자산
├── design-canvas.jsx, ios-frame.jsx, tweaks-panel.jsx ← 보조 컴포넌트
│
├── app/                       ← prototype.html이 쓰는 컴포넌트 모듈
└── sim/                       ← mainboard.html의 원본 모듈 (인라인 전 dev 버전)
```

## 핵심 원칙 (외우기)

1. **학습 효과가 핵심.** 어휘가 진짜 기억에 남아야 한다 — `docs/learning-science.md`의 P1~P5 원칙이 모든 시나리오·기능의 판단 기준
2. **유비챌과 카니발리제이션 안 되게** — 다른 자아의 사용자 노린다 (`docs/vs-yubichal.md`)
3. **양 늘리기보다 매커니즘 추가** — 직급마다 새 게임플레이 (`docs/progression.md`)
4. **v1은 살아남기 위해. v2는 살아남고 나서.** — 웹 먼저, 앱은 나중 (`docs/tech-stack.md`)
5. **한 번에 한 Phase, 동시 진행 X** — 솔로 운영자의 생존 룰 (`docs/roadmap.md`)

## 지금 (2026-05-01) 위치

**Phase 0 진행 중** — 1-2일 안에 베타 띄우는 게 목표.
다음 액션: Vercel 배포 → PostHog 분석 → 5-10명에게 링크 보내기.

자세한 건 `docs/roadmap.md` Phase 0 체크리스트 참고.
