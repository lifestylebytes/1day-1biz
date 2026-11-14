// ============================================================
// 1일1비 구매관리 › 다큐라이즈 탭 → Supabase 이용 기간 자동 반영 (Apps Script)
// 붙이는 곳: 구글 시트 "1일1비 구매관리" → 확장 프로그램 → Apps Script → 파일 + → 스크립트 "Docurise.gs" 로 새로 만들어 통째로 붙이기
//   (래피드용 Code.gs 와 같은 프로젝트에 둔다. SHEET_SYNC_SECRET 스크립트 속성을 같이 쓴다)
// 순서:
//   1) 다큐라이즈 대시보드 → 연동 → Google Sheets 연결 → 이 시트(1일1비 구매관리)를 고르고, 결제폼 "1일1비 입사 결제" 를 연결
//   2) 다큐라이즈가 만든 탭 이름을 아래 DR_SHEET_NAMES 에 넣는다 (기본 후보 몇 개는 이미 들어 있음)
//   3) docuriseDryRun 실행 → 로그의 applied(연장될 사람) / pending(미가입) / unknown(상품 못 알아봄) 확인
//      이미 손으로 SQL 반영한 사람이 applied 에 있으면, 그 사람의 key 를 docurise_applied 표에 먼저 넣는다 (마이그레이션 파일 하단 예시)
//   4) docuriseSync 실행 (실제 반영)
//   5) 트리거(⏰) → 추가 → 함수 docuriseSync · 시간 기반 · 분 단위 타이머 · 10분마다
// ============================================================
var DR_SHEET_NAMES = ["다큐라이즈", "DocuRise", "1일1비 입사 결제", "결제", "Sheet1"];
var DR_ENDPOINT = "https://ssjzwnmqywopocpnvjvw.supabase.co/functions/v1/docurise-sheet-sync";

function drSheet_() {
  var ss = SpreadsheetApp.getActive();
  for (var i = 0; i < DR_SHEET_NAMES.length; i++) { var sh = ss.getSheetByName(DR_SHEET_NAMES[i]); if (sh) return sh; }
  throw new Error("다큐라이즈 탭을 못 찾았습니다. DR_SHEET_NAMES 에 탭 이름을 넣어주세요. 지금 탭: " + ss.getSheets().map(function (s) { return s.getName(); }).join(", "));
}

function drReadRows_() {
  var values = drSheet_().getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).replace(/\s+/g, "").toLowerCase(); });
  var col = function (names) {
    for (var i = 0; i < names.length; i++) { var k = head.indexOf(String(names[i]).replace(/\s+/g, "").toLowerCase()); if (k >= 0) return k; }
    // 부분 일치
    for (var j = 0; j < names.length; j++) for (var h = 0; h < head.length; h++) if (head[h].indexOf(String(names[j]).toLowerCase()) >= 0) return h;
    return -1;
  };
  var cEmail = col(["이메일", "email", "구매자이메일"]);
  var cName = col(["이름", "name", "구매자"]);
  var cProduct = col(["상품명", "상품", "product", "주문상품", "구매옵션"]);
  var cStatus = col(["결제상태", "상태", "status", "주문상태"]);
  var cAmount = col(["결제금액", "금액", "amount", "가격"]);
  var cAt = col(["결제일시", "결제일", "일시", "paidat", "createdat", "제출일시", "날짜"]);
  var cOrder = col(["주문번호", "주문id", "orderid", "결제id", "id"]);
  if (cEmail < 0 || cProduct < 0) throw new Error("이메일/상품 열을 못 찾았습니다: " + head.join(","));
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    var email = String(v[cEmail] || "").trim();
    if (!email || email.indexOf("@") < 0) continue;
    var at = cAt >= 0 ? v[cAt] : "";
    if (at instanceof Date) at = Utilities.formatDate(at, "Asia/Seoul", "yyyy-MM-dd HH:mm");
    rows.push({
      email: email,
      name: cName >= 0 ? String(v[cName] || "") : "",
      product: String(v[cProduct] || ""),
      status: cStatus >= 0 ? String(v[cStatus] || "") : "결제 완료",   // 상태 열이 없으면 결제폼 제출 = 결제 완료로 본다
      amount: cAmount >= 0 ? String(v[cAmount] || "").replace(/[^\d]/g, "") : "",
      at: String(at || ""),
      orderId: cOrder >= 0 ? String(v[cOrder] || "") : ""
    });
  }
  return rows;
}

function drPost_(dry) {
  var secret = PropertiesService.getScriptProperties().getProperty("SHEET_SYNC_SECRET");
  if (!secret) throw new Error("스크립트 속성 SHEET_SYNC_SECRET 이 비어 있습니다");
  var rows = drReadRows_();
  var res = UrlFetchApp.fetch(DR_ENDPOINT, {
    method: "post", contentType: "application/json",
    headers: { "x-webhook-token": secret },
    payload: JSON.stringify({ rows: rows, dry: !!dry }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode(), text = res.getContentText();
  Logger.log("rows=" + rows.length + " status=" + code);
  Logger.log(text);
  if (code !== 200) throw new Error("동기화 실패 " + code + ": " + text.slice(0, 300));
  return JSON.parse(text);
}
function docuriseSync() { return drPost_(false); }
function docuriseDryRun() { return drPost_(true); }
