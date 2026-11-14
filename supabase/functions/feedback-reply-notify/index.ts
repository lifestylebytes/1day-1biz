// ============================================================
// 1일1비, 피드백(버그 신고) 답장 알림톡 (솔라피)  2026-11-14
//
// 운영자 뷰에서 "답장하기" 또는 "바로 해결"을 누르면 앱 사내 메모(쪽지)가 나간다.
// 그 직후 이 함수가 그 회원 번호(users.phone)로 알림톡 한 통을 더 보낸다.
// 번호가 없거나 템플릿이 아직 승인 전이면 아무것도 안 보내고 이유만 돌려준다 (쪽지는 이미 나갔으니 안전).
//
// 템플릿 (솔라피 > 카카오 알림톡 > 템플릿 등록. 변수명이 정확히 같아야 함):
//   [1일1비] 문의 답장 안내
//
//   #{이름}님, 보내주신 문의에 1일1비 IT팀이 답장했어요.
//
//   ▶ 보내주신 내용: #{문의요약}
//   ▶ 답장 위치: 1일1비 앱 > 사내 메모
//
//   앱을 열면 답장을 바로 확인할 수 있어요.
//   버튼(웹링크): 답장 확인하기 → https://1day-1biz.youbuddy.co.kr/mainboard.html
//
// 배포:
//   supabase functions deploy feedback-reply-notify --no-verify-jwt
//
// Secret (supabase secrets set ...):
//   SOLAPI_TEMPLATE_ID_REPLY   (위 템플릿이 승인되면 그 템플릿 ID)
//   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, SOLAPI_FROM(선택)  ← 출근 알림(kakao-daily)과 같은 값, 이미 등록돼 있음
//
// 남용 방지 (브라우저에서 부르는 함수라서):
//   1) Origin 화이트리스트 (originOk)
//   2) 요청에는 noticeId 만 받는다. 보낼 사람과 문구는 서버가 DB 에서 찾는다:
//      그 쪽지가 실제로 어떤 피드백의 답장(reply_notice_id / completion_notice_id)이어야 하고,
//      쪽지를 만든 지 30분 안이어야 하고, 같은 쪽지로는 한 번만 보낸다 (kakao_reply_log).
//   그래서 누가 이 주소를 알아도 "방금 운영자가 답장한 사람"에게 한 번 더 가는 것 말고는 할 수 있는 게 없다.
//
// 테스트: POST { noticeId, dry: true } → 보낼 대상과 변수만 돌려준다 (발송 안 함)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { originOk } from "../_shared/gate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY      = Deno.env.get("SOLAPI_API_KEY") || "";
const API_SECRET   = Deno.env.get("SOLAPI_API_SECRET") || "";
const PFID         = Deno.env.get("SOLAPI_PFID") || "";
const FROM         = Deno.env.get("SOLAPI_FROM") || "";
const TEMPLATE_ID  = Deno.env.get("SOLAPI_TEMPLATE_ID_REPLY") || "";
const WINDOW_MIN   = 30;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// 알림톡 변수: 줄바꿈 없애고, 대시 정리, 길이 제한 (카카오 변수는 한 줄 짧게가 안전)
function oneLine(s: unknown, max: number): string {
  const t = String(s || "").replace(/[\u2014\u2013]/g, ", ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

async function solapiAuth(): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date + salt));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${hex}`;
}

async function sendAlimtalk(to: string, variables: Record<string, string>) {
  const msg: Record<string, unknown> = {
    to, type: "ATA",
    kakaoOptions: { pfId: PFID, templateId: TEMPLATE_ID, variables, disableSms: !FROM },
  };
  if (FROM) msg.from = FROM;
  const res = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: await solapiAuth() },
    body: JSON.stringify({ messages: [msg] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`solapi ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!originOk(req)) return json({ ok: false, error: "forbidden_origin" }, 403);
  try {
    const b = await req.json().catch(() => ({}));
    const noticeId = String(b?.noticeId || "").trim();
    const dry = !!b?.dry;
    if (!noticeId) return json({ ok: false, error: "noticeId_required" }, 400);

    // 1) 이 쪽지로 답장한 피드백 찾기 (답장하기 / 바로 해결 둘 다)
    const { data: fbs, error: fbErr } = await sb.from("feedback")
      .select("id, email, name, message, created_at, reply_notice_id, completion_notice_id")
      .or(`reply_notice_id.eq.${noticeId},completion_notice_id.eq.${noticeId}`)
      .order("created_at", { ascending: false }).limit(5);
    if (fbErr) throw fbErr;
    if (!fbs || !fbs.length) return json({ ok: false, skipped: "not_a_feedback_reply" });
    const email = String(fbs[0].email || "").toLowerCase().trim();
    if (!email) return json({ ok: false, skipped: "no_email" });

    // 2) 쪽지가 방금(30분 안) 만들어진 것이어야 한다
    const { data: nt } = await sb.from("notices").select("id, created_at, target_emails").eq("id", noticeId).maybeSingle();
    if (!nt) return json({ ok: false, skipped: "notice_not_found" });
    const ageMin = (Date.now() - Date.parse(nt.created_at)) / 60000;
    if (!(ageMin >= 0 && ageMin <= WINDOW_MIN)) return json({ ok: false, skipped: "notice_too_old" });
    const targets: string[] = Array.isArray(nt.target_emails) ? nt.target_emails.map((x: string) => String(x).toLowerCase()) : [];
    if (!targets.includes(email)) return json({ ok: false, skipped: "notice_target_mismatch" });

    // 3) 같은 쪽지로 이미 보냈으면 그만
    const { data: logged } = await sb.from("kakao_reply_log").select("notice_id").eq("notice_id", noticeId).maybeSingle();
    if (logged && !dry) return json({ ok: true, skipped: "already_sent" });

    // 4) 회원 번호
    const { data: u } = await sb.from("users").select("email, name, phone, withdrawn_at").eq("email", email).maybeSingle();
    if (!u) return json({ ok: false, skipped: "user_not_found" });
    if (u.withdrawn_at) return json({ ok: false, skipped: "withdrawn" });
    const phone = String(u.phone || "").replace(/[^0-9]/g, "");
    if (!/^01[0-9]{8,9}$/.test(phone)) return json({ ok: false, skipped: "no_phone" });

    const variables = {
      "#{이름}": oneLine(u.name || fbs[0].name || "회원", 20),
      "#{문의요약}": oneLine(fbs[0].message || "보내주신 문의", 30),
    };
    if (dry) return json({ ok: true, dry: true, to: phone.slice(0, 3) + "****" + phone.slice(-4), variables });
    if (!API_KEY || !API_SECRET || !PFID) return json({ ok: false, skipped: "solapi_not_configured" });
    if (!TEMPLATE_ID) return json({ ok: false, skipped: "template_not_set" });

    let status = "sent", detail: unknown = null;
    try { detail = await sendAlimtalk(phone, variables); }
    catch (e) { status = "error"; detail = String((e as Error).message || e).slice(0, 500); }
    await sb.from("kakao_reply_log").insert({ notice_id: noticeId, email, status, detail }).then(() => {}, () => {});
    return json({ ok: status === "sent", status });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
