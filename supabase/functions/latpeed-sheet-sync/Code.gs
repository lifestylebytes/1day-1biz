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

// ★ 2026-11-14 줄 단위로 읽는다. 결제기록 탭은 223행부터 '구매옵션' 열이 끼어 들어간 장기권 양식이 섞여 있고
//   (머리글 줄이 중간에 한 번 더 있음), 1행 머리글 위치로만 읽으면 장기권 결제를 전부 놓쳤다 (김아람·김효언·정다이·황하영 등).
//   그래서 줄마다 '결제 완료/취소/실패' 칸, 날짜 칸(YY.MM.DD HH:MM), 그 다음 금액 칸을 찾아 읽는다.
//   다큐라이즈 결제(결제방식 칸 = 다큐라이즈)는 docurise-sheet-sync 가 따로 처리하므로 건너뛴다.
function optionMonths_(opt) {
  var o = String(opt || "").replace(/\s+/g, "");
  if (!o) return 0;
  if (/임원/.test(o)) return 12;
  if (/패스트트랙|승진/.test(o)) return 6;
  if (/정규직/.test(o)) return 6;
  if (/인턴/.test(o)) return 3;
  var m = /(\d+)개월/.exec(o); return m ? Number(m[1]) : 0;
}
function readRows_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME) || SpreadsheetApp.getActive().getSheetByName("결제기록");
  if (!sh) throw new Error("시트 탭 '" + SHEET_NAME + "' / '결제기록' 이 없습니다");
  var values = sh.getDataRange().getValues();
  var rows = [];
  var reStatus = /^결제\s*(완료|취소|실패)$/;
  var reAt = /^\d{2}\.\d{1,2}\.\d{1,2}(\s+\d{1,2}:\d{2})?$/;
  for (var r = 1; r < values.length; r++) {
    var v = values[r].map(function (x) { return x instanceof Date ? Utilities.formatDate(x, "Asia/Seoul", "yy.MM.dd HH:mm") : String(x == null ? "" : x).trim(); });
    var email = v[1];
    if (!email || email.indexOf("@") < 0) continue;          // 빈 줄·중간 머리글 줄
    if (v.indexOf("다큐라이즈") >= 0) continue;               // 다큐라이즈 결제는 따로
    var sIdx = -1; for (var k = 3; k < v.length; k++) { if (reStatus.test(v[k])) { sIdx = k; break; } }
    if (sIdx < 0) continue;
    var aIdx = -1; for (var k2 = sIdx + 1; k2 < v.length; k2++) { if (reAt.test(v[k2])) { aIdx = k2; break; } }
    if (aIdx < 0) continue;
    if (/테스트/.test(v[aIdx + 2] || "")) continue;              // 테스트 결제·취소 줄은 보내지 않는다 (예: 10/24 이규태 테스트)
    var amount = String(v[sIdx + 1] || "").replace(/[^\d]/g, "");
    var opt = (v[3] && v[3] !== "동의") ? v[3] : "";
    rows.push({
      name: v[0], email: email, phone: String(v[2] || "").replace(/[^\d]/g, ""),
      status: v[sIdx], amount: amount, at: v[aIdx],
      reason: v[aIdx + 2] || "", option: opt, months: optionMonths_(opt)
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
