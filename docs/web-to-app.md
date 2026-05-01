# 1일1비 — 웹에서 앱으로 가는 길

## 결론 먼저
**쉬운 편이야. 단, 지금부터 결정하는 한 가지가 그 길을 결정한다 — "데이터/로직과 UI를 분리하라."**

## 현재 코드 상태 진단

```
prototype.html  →  React 18 + Babel standalone (CDN)
mobile.html     →  iframe으로 simulator.html 감싸기
simulator.html  →  React + Babel standalone, sim/ 안에 컴포넌트
app/            →  Sidebar/Home/Library/Study/Inbox 컴포넌트
sim/            →  Pages, Home, data, styles
data.js         →  window.WORDS = [...] 형태로 글로벌 변수
```

**평가:**
- ✅ 컴포넌트 단위 분리는 어느정도 됨
- ⚠️ Babel standalone — 프로토타입엔 OK, 프로덕션엔 부적절 (느림, SEO 안 됨)
- ⚠️ 데이터가 `window.WORDS` 같은 글로벌 변수 — 앱으로 갈 때 가장 큰 짐
- ⚠️ DOM 직접 조작이 섞여 있을 가능성 — RN 갈 때 막힘

## 앱으로 가는 3가지 길

### 길 1: PWA (가장 쉬움, 1주)
**무엇:** 지금 웹앱에 manifest.json + service worker 추가하면 끝
**받는 것:** 홈 화면 설치, 푸시 알림, 오프라인 사용
**못 받는 것:** App Store / Play Store 리스팅 (PWA만으로는 한국 사용자 인지도 낮음)

→ **출시 전 임시 옵션.** 앱스토어 못 들어가면 유료 서비스 신뢰도가 떨어짐.

### 길 2: Capacitor 래핑 (현실적, 2~3주)
**무엇:** 웹앱 그대로를 네이티브 앱 안에 WebView로 감싸기
**받는 것:** App Store / Play Store 출시 가능, 네이티브 푸시·결제 가능, 웹 코드 그대로 재사용
**못 받는 것:** 진짜 네이티브 느낌의 부드러운 애니메이션, 일부 OS 기능

→ **MVP 출시 추천 경로.** 인스타그램·트위터도 한참 동안 WebView였음. 1일1비처럼 텍스트·시나리오 위주는 WebView로도 충분히 좋음.

전제 조건: Vite 또는 Next.js로 번들링부터 정리해야 함 (Babel standalone은 못 씀).

### 길 3: React Native (Expo) 풀 마이그레이션 (1~3개월)
**무엇:** UI를 RN 컴포넌트로 다시 작성, 비즈니스 로직(데이터·상태·API)은 공유
**받는 것:** 네이티브 성능, 부드러운 인터랙션, 기기 기능 풀 활용, 앱스토어 정식 출시
**비용:** UI 재작성 (CSS → StyleSheet, div → View 등). 데이터/로직을 잘 분리해뒀으면 70% 재사용

→ **트래픽 검증된 후 풀 전환.** 5,000+ 유료 사용자 시점에 권장.

## 추천 로드맵

```
지금 (베타)        →  웹 (현재 simulator.html)
정식 출시 (v1)     →  Vite 마이그레이션 + Capacitor → 앱스토어 출시
6개월 후 (v2)      →  React Native 점진 마이그레이션 (성능 핵심 화면부터)
```

## 지금부터 무조건 지킬 4가지 (이거만 지키면 어떤 길로 가도 쉬움)

### 1. 데이터 레이어 분리
지금: `window.WORDS = [...]` 글로벌 변수
이상: API 호출 함수로 캡슐화

```js
// 지금
const words = window.WORDS;

// 가야 할 곳
import { fetchWords } from '@/api/words';
const words = await fetchWords({ day: user.currentDay });
```

→ 웹/앱 둘 다 같은 API 호출. 데이터 어디서 오는지 UI는 모름.

### 2. 상태 관리 도입
글로벌 변수 ❌ → Zustand 또는 Redux Toolkit ✅
RN으로 가도 그대로 쓸 수 있는 라이브러리 선택할 것.

### 3. 웹 전용 API 사용 금지 (비즈니스 로직 영역에서)
- ❌ `localStorage` (RN에 없음 → AsyncStorage 필요)
- ❌ `document.querySelector` (RN에 DOM 자체가 없음)
- ✅ React state / refs / context

→ 추상화: `storage.set('key', value)` 함수 만들고 웹에선 localStorage, RN에선 AsyncStorage 호출하게.

### 4. 스타일을 토큰화
인라인 CSS / 클래스명 직접 ❌
디자인 토큰 (색·여백·폰트 변수) → CSS-in-JS 또는 토큰 파일 ✅

```js
// tokens.js  — 웹/앱 공유
export const colors = { primary: '#2A1F14', surface: '#E8DFCB' };
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 };
```

웹: CSS 변수로 매핑. RN: StyleSheet에서 직접 사용.

## 비용/시간 추정

| 단계 | 작업 | 예상 시간 (혼자 작업 기준) |
|---|---|---|
| 1 | Vite 마이그레이션 + 데이터 레이어 분리 | 1~2주 |
| 2 | Capacitor 래핑 + 앱스토어 등록 | 2~3주 (심사 포함) |
| 3 | RN 전환 (점진) | 2~3개월 |

총 **MVP 앱스토어 출시까지 4~6주**.

## 백엔드 함께 고려

웹 → 앱 가는 김에 백엔드도 정리하는 게 효율적.
- **추천:** Supabase 또는 Firebase (인증 + DB + Storage 한 번에)
- 결제: Toss Payments / Stripe / 인앱결제 (앱스토어 정책상 디지털 콘텐츠는 인앱결제 강제 가능)
- NPC 응답 동적 생성: OpenAI / Claude API (차후 확장)

## 결정 사항 체크리스트

- [ ] 번들러 선택: Vite (개인 추천) / Next.js
- [ ] 상태관리: Zustand / Redux Toolkit
- [ ] 백엔드: Supabase / Firebase / 자체 구축
- [ ] 인증 방식: 이메일 / 카카오 / 구글
- [ ] 결제: 웹 정기결제 (Toss) + 앱 인앱결제 병행 여부
- [ ] 디자인 토큰 파일 위치 (`/styles/tokens.js`)
