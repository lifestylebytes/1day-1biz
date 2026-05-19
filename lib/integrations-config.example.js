// ============================================================
// 외부 통합 설정 (Slack, Discord 등)
//
// 사용:
//   1) 이 파일을 lib/integrations-config.js 로 복사
//   2) 아래 값을 실제 webhook URL로 채움
//   3) 모든 HTML이 lib/integrations-config.js를 로드하면 자동 활성화
//
// 보안 주의:
//   anon 클라이언트에 들어가는 URL이므로 노출됨. 베타 단계에선 OK,
//   본격 오픈 시엔 Edge Function 프록시 거치는 게 안전.
//   Slack 채널은 운영자만 들어가있어야 함 (학습 답안 등 사용자 데이터 평문 노출).
// ============================================================

window.__INTEGRATIONS_CONFIG = {
  // Slack incoming webhook URL
  // 발급: Slack workspace → Apps → "Incoming Webhooks" 추가 →
  //       채널 선택 (운영자만 들어있는 채널 권장, 예 #1day1biz-backup)
  //       → URL 복사해서 아래에 붙여넣기
  slackWebhookUrl: "https://hooks.slack.com/services/XXX/YYY/ZZZ",
};
