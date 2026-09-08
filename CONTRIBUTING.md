# 1일1비 협업 가이드 (두 사람 이상이 같이 고칠 때)

> 이 레포는 main에 push되는 순간 실제 사이트(1day-1biz.youbuddy.co.kr)에 배포된다.
> 그래서 "main에 직접 push하지 않기"가 이 문서의 전부다. 나머지는 그걸 편하게 지키는 방법이다.
> Claude 같은 AI 에이전트가 작업할 때도 이 문서를 그대로 따른다.

## 1. 역할 나누기 (충돌을 안 나게 하는 가장 확실한 방법)

같은 파일을 두 사람이 동시에 고치면 합칠 때 충돌이 난다. 특히 `mainboard.html`은 1MB가 넘는 단일 파일이라 거의 확실히 난다.
그래서 파일 단위로 담당을 나눈다.

| 담당 | 파일 | 비고 |
|---|---|---|
| 운영·CS 담당 | `onboarding.html`, `thanks.html`, `cancel.html`, `privacy.html`, `terms.html`, `waitlist.html`, `supabase/functions/kakao-daily/TEMPLATE.md`, `data/` 안의 공지·FAQ 텍스트 | 문구·안내·FAQ 위주 |
| 개발 담당 (대표 + Claude) | `mainboard.html`, `operator.html`, `lib/`, `supabase/functions/*/index.ts`, `migrations/`, `scenarios.json` | 앱 로직·DB·Edge Function |

담당이 아닌 파일을 꼭 고쳐야 하면 시작 전에 채팅으로 "지금 mainboard 만진다" 한마디 하고, 끝나면 바로 PR을 올린다. 오래 들고 있지 않는다.

## 2. 작업 흐름 (매번 똑같이)

1. **작업 전 main을 최신으로 당긴다.** GitHub Desktop: Fetch origin 후 Pull. 터미널: `git checkout main && git pull`
2. **브랜치를 만든다.** 이름은 `이름/뭐하는지` 형식. 예: `jiheun/faq-문구`, `buddy/wordbook-fix`
   GitHub Desktop: Current Branch > New Branch. 터미널: `git checkout -b jiheun/faq-문구`
3. **수정하고 커밋한다.** 커밋 메시지는 한국어로 "무엇을 왜" 한 줄. 예: `온보딩 FAQ: 결제 후 입장 방법 문구 추가`
4. **push하고 Pull Request를 연다.** GitHub Desktop: Publish branch 후 Create Pull Request. PR 설명은 자동으로 뜨는 템플릿을 채운다.
5. **대표가 확인하고 Merge한다.** Merge되면 1~2분 뒤 사이트에 반영된다. 확인은 하드 리프레시(Cmd+Shift+R).
6. **Merge된 브랜치는 지운다.** 다음 작업은 다시 1번부터.

한 PR에는 한 가지 일만 담는다. "FAQ 수정"과 "온보딩 버튼 색 변경"은 PR 두 개다.

## 3. 절대 하지 않기

- main에 직접 push (브랜치 보호로 막혀 있지만, 막혀 있어도 시도하지 않는다)
- 다른 사람 브랜치에 커밋
- force push (`git push -f`)
- em-dash(U+2014) 사용. 어디에도. 쉼표·마침표·콜론·하이픈으로 대체한다. (CLAUDE.md 참조)
- 민감 정보 커밋: 실명+이메일 조합, 수익 배분, 계약 조건, 매출 수치, 특정 고객의 개인 사정, API 키·비밀키. 레포가 private이어도 사이트는 공개다.
- 신규 대상 카피에 9,900원 표기 (현재 13,900원)
- 한국어 UI 문구를 명사형으로 끝내기. 문장은 동사로 끝낸다. ("설정 완료" 대신 "설정을 마쳤어요")
- `supabase db push` 실행 (절대 금지). 이 프로젝트의 SQL 은 지금까지 전부 SQL Editor 에서 파일 단위로 손으로 돌렸고 서버에 적용 기록이 없다. db push 는 옛 마이그레이션까지 다시 돌려서 닫아둔 보안 정책을 되돌린다. 새 SQL 은 `supabase/migrations/` 에 파일로 두고, 대표가 SQL Editor 에서 그 파일만 실행한다.
- Edge Function 배포는 `npx supabase functions deploy <이름> --no-verify-jwt` 로 함수 하나씩. 배포 권한은 대표에게만 있다.

## 4. 충돌이 났을 때

PR 화면에 "This branch has conflicts"가 뜨면 당황하지 말고:

1. 내 브랜치에서 `main`을 가져온다. GitHub Desktop: Branch > Update from main. 터미널: `git merge main`
2. 충돌 난 파일을 열면 `<<<<<<<`, `=======`, `>>>>>>>` 표시가 있다. 위쪽이 내 것, 아래쪽이 main 것. 둘 중 맞는 걸 남기고 표시를 지운다.
3. 잘 모르겠으면 파일 건드리지 말고 채팅으로 물어본다. `mainboard.html` 충돌은 무조건 대표(또는 Claude)가 푼다.
4. 커밋하고 push하면 PR이 다시 초록색이 된다.

## 5. 로컬에서 확인하기

- 정적 파일이라 `index.html` 더블클릭이나 `./start.sh`(Python 3 필요)로 바로 볼 수 있다. README 참조.
- `mainboard.html`을 고쳤으면 push 전에 브라우저 콘솔(F12)에 빨간 에러가 없는지 본다.
- 문구만 고친 PR은 스크린샷 한 장이면 충분하다.

## 6. 처음 세팅 (한 번만)

1. 대표에게 GitHub 아이디를 알려주고 Collaborator 초대를 받는다. 초대 메일에서 Accept.
2. GitHub Desktop 설치 후 로그인. File > Clone repository에서 `lifestylebytes/1day-1biz` 선택.
3. 터미널을 쓴다면 `git clone https://github.com/lifestylebytes/1day-1biz.git`. 첫 push 때 뜨는 로그인 창에서 본인 계정으로 로그인한다.
4. 누구의 토큰도 공유하지 않는다. 각자 본인 계정으로만 접근한다.

`1day-1biz-internal` 레포는 대외비 문서용이라 별도 초대가 있을 때만 받는다. 같은 규칙(브랜치 + PR)을 쓴다.

## 7. Claude(AI)에게 시킬 때

- 이 레포에서 Claude가 작업하면 `CLAUDE.md`를 먼저 읽고 이 문서의 규칙을 따른다.
- 대표 계정의 Claude 세션은 main에 바로 push할 수 있게 설정돼 있다. 그 외 사람의 세션에서는 Claude도 브랜치 + PR로 올린다.
- Claude에게 "PR 열어줘"라고 하면 브랜치 생성부터 PR 본문 작성까지 해준다.
