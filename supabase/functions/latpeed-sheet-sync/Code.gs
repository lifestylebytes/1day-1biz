// ============================================================
// 1일1비 구매관리 › 래피드 탭 → Supabase 멤버십 자동 동기화 (Apps Script)
// 붙이는 곳: 구글 시트 "1일1비 구매관리" → 확장 프로그램 → Apps Script → Code.gs 에 통째로 붙이기
// 설정:
//   1) 프로젝트 설정(⚙) → 스크립트 속성 → SHEET_SYNC_SECRET = (Supabase Secret 과 같은 값)
//   2) 트리거(⏰) → 추가 → 함수 syncToSupabase · 시간 기반 · 일 단위 타이머 · 오전 7시~8시 (프로젝트 시간대 Asia/Seoul 확인)
//   3) 먼저 dryRun() 을 한 번 실행해서 로그로 누가 바뀔지 확인 → 이상 없으면 syncToSupabase() 실행
// 시트 열 순서(래피드 탭): 이름 | 이메일 | 전화번호 | 동의 | 동의 | 상태 | 결제금액 | 일시 | 결제방식 | 취소사유
// ============================================================
var SHEET_NAME = "래피드";
var ENDPOINT = "https://ssjzwnmqywopocpnvjvw.supabase.co/functions/v1/latpeed-sheet-sync";

function readRows_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error("시트 탭 '" + SHEET_NAME + "' 이 없습니다");
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).replace(/\s+/g, ""); });
  var col = function (names) {
    for (var i = 0; i < names.length; i++) { var k = head.indexOf(names[i]); if (k >= 0) return k; }
    return -1;
  };
  var cName = col(["이름"]), cEmail = col(["이메일"]), cStatus = col(["상태"]), cAmount = col(["결제금액", "금액"]);
  var cAt = col(["일시", "결제일시", "결제일"]), cReason = col(["취소사유"]);
  if (cEmail < 0 || cStatus < 0 || cAt < 0) throw new Error("이메일/상태/일시 열을 못 찾았습니다: " + head.join(","));
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    var email = String(v[cEmail] || "").trim();
    if (!email || email === "이메일" || email.indexOf("@") < 0) continue;   // 빈 줄·중간에 끼어 있는 머리글 줄 건너뜀
    var at = v[cAt];
    if (at instanceof Date) at = Utilities.formatDate(at, "Asia/Seoul", "yy.MM.dd HH:mm");
    rows.push({
      name: cName >= 0 ? String(v[cName] || "") : "",
      email: email,
      status: String(v[cStatus] || ""),
      amount: cAmount >= 0 ? String(v[cAmount] || "").replace(/[^\d]/g, "") : "",
      at: String(at || ""),
      reason: cReason >= 0 ? String(v[cReason] || "") : ""
    });
  }
  return rows;
}

function post_(dry) {
  var secret = PropertiesService.getScriptProperties().getProperty("SHEET_SYNC_SECRET");
  if (!secret) throw new Error("스크립트 속성 SHEET_SYNC_SECRET 이 비어 있습니다");
  var rows = readRows_();
  var res = UrlFetchApp.fetch(ENDPOINT, {
    method: "post",
    contentType: "application/json",
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

// 매일 07:00 KST 트리거가 부르는 함수
function syncToSupabase() { return post_(false); }
// 실제로 바꾸지 않고 누가 바뀔지만 로그로 확인
function dryRun() { return post_(true); }
