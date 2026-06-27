// ============================================================
// Supabase Project 설정
// ============================================================
// Supabase 대시보드 → Project Settings → API 에서 복사:
//   1. Project URL → url
//   2. anon / public key → anonKey
//
// 채워 넣고 저장하면 모든 페이지가 자동으로 Supabase 연결됨.
// 비워두면 localStorage-only 모드로 동작 (지금처럼).
//
// ⚠️ anon key만 여기 넣음. service_role key는 절대 X.
// ============================================================

window.__SUPABASE_CONFIG = {
  url: "https://ssjzwnmqywopocpnvjvw.supabase.co",
  anonKey: "sb_publishable_Ss_I1IWW-FZbqzOjxfHxCA_5a-94ngG"
};

// 결제 링크 설정 (국내: Latpeed, 해외: Lemon Squeezy)
window.__PAY_CONFIG = {
  latpeedUrl: "https://www.latpeed.com/memberships/69535224c4fa5959f488270f",
  // Lemon Squeezy 체크아웃 URL (새 탭으로 열어서 embed=1은 제외)
  lemonCheckoutUrl: "https://1day1biz.lemonsqueezy.com/checkout/buy/f6b276e3-6b8c-4cc1-902b-26cdc95c1178"
};
