# 1일1비 iOS 앱 (Capacitor 껍데기)

라이브 웹(https://1day-1biz.youbuddy.co.kr)을 그대로 띄우는 앱이에요. 웹을 고치면 앱에도 바로 반영돼요.
앱 자체(아이콘, 이름, 네이티브 기능)를 바꿀 때만 다시 빌드하고 심사를 넣어요.

## 처음 한 번 (맥북)
1. Xcode 설치 (App Store)
2. `app-ios/ios/App/App.xcodeproj` 를 더블클릭해서 열기 (패키지를 자동으로 받아요, 1~2분)
3. 왼쪽 맨 위 App → Signing & Capabilities → Team 에서 본인 개발자 계정 선택
4. 위쪽 기기 선택에서 아이폰 시뮬레이터 고르고 ▶ 실행

## 설정
- 번들 ID: kr.co.youbuddy.onedayonebiz
- 앱이 여는 주소: capacitor.config.json 의 server.url (?app=ios 가 붙어요)
- 앱 구분: User-Agent 끝에 OD1D1B-iOS (웹에서 `_isAppShell()` 로 확인)
- 설정을 바꾼 뒤엔 `npm i && npx cap copy ios`

## 스토어 규정 메모
- 앱 안에는 결제 버튼 / 가격 / 외부 결제 링크를 두지 않아요 (웹의 `_isAppShell()` 분기로 숨김).
