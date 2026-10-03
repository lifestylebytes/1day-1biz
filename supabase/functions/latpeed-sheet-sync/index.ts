// ============================================================
// latpeed-sheet-sync (2026-10-03)
// 구글 시트 "1일1비 구매관리 › 래피드" 의 결제 내역을 받아 users.membership_ends_at 을 맞춘다.
// 호출: 시트의 Apps Script 가 매일 07:00 KST 에 POST (헤더 x-webhook-token = Secret SHEET_SYNC_SECRET). 수동 호출도 같은 형식.
// 배포: supabase functions deploy latpeed-sheet-sync --no-verify-jwt   (Secret: SHEET_SYNC_SECRET)
// 규칙 (운영자 뷰 CSV 대조 패널의 '결제 내역 표' 규칙과 동일):
//   · 이메일별 가장 최근 '결제 완료' 결제일 + 1개월 = 만료일. DB 만료일이 그보다 이르거나 비어 있으면 연장.
//     연장 시 cohort=member, unlocked=true, 해지마커·퇴직사유 해제.
//   · 그 결제 뒤에 '결제 취소'(환불) 가 있으면 만료일을 취소 시각으로 당기고 해지마커를 세운다.
//   · '결제 실패' 는 건드리지 않는다 (멤버 CSV 의 '구독 종료' 가 처리).
//   · 운영자·Dev 계정, 테스트 계정(youbuddy.co@gmail.com)은 제외.
//   · 가입 전 결제(users 에 없는 이메일)는 latpeed_events 에 남겨 가입 순간 소급 적용되게 한다 (latpeed_apply_pending).
// 본문: { rows: [{ name, email, status, amount, at, reason }] }  (at = "26.09.20 21:25" 또는 ISO)
// 응답: { ok, applied: [...], cancelled: [...], pending: [...], skipped: n }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { tokenGate } from "../_shared/gate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = { name?: string; email?: string; status?: string; amount?: string | number; at?: string; reason?: string };

// "26.09.20 21:25" (KST) → ISO
export function parseKstAt(s: string | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  const m = /^(\d{2}|\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t);
  if (m) {
    const y = m[1].length === 2 ? "20" + m[1] : m[1];
    const iso = `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${(m[4] || "0").padStart(2, "0")}:${m[5] || "00"}:00+09:00`;
    const d = new Date(iso); return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(t); return isNaN(d.getTime()) ? null : d.toISOString();
}
export function plusOneMonthKstEnd(iso: string): string {
  // 결제일(KST) + 1개월 의 그날 23:59:59 KST
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth(), da = d.getUTCDate();
  // 말일 넘침 방지: 8/31 결제 → 9/30 (래피드 '다음 결제일' 과 동일), 1/31 → 2/28
  const lastOfNext = new Date(Date.UTC(y, mo + 2, 0)).getUTCDate();
  const n = new Date(Date.UTC(y, mo + 1, Math.min(da, lastOfNext)));
  const ymd = n.toISOString().slice(0, 10);
  return `${ymd}T23:59:59+09:00`;
}
export function normalizeStatus(s: string | undefined): "paid" | "cancel" | "fail" | "other" {
  const t = String(s || "").replace(/\s+/g, "");
  if (t === "결제완료") return "paid";
  if (t === "결제취소") return "cancel";
  if (t === "결제실패") return "fail";
  return "other";
}
// 이메일별로 '마지막 결제 완료' 와 '그 뒤의 취소' 를 찾는다
export function reduceRows(rows: Row[]) {
  const by: Record<string, { name: string; lastPaid: string | null; cancelAfter: string | null; amount: number }> = {};
  for (const r of rows) {
    const email = String(r.email || "").trim().toLowerCase();
    if (!email || !email.includes("@") || email === "youbuddy.co@gmail.com") continue;
    const at = parseKstAt(r.at); if (!at) continue;
    const st = normalizeStatus(r.status);
    const cur = by[email] || (by[email] = { name: String(r.name || ""), lastPaid: null, cancelAfter: null, amount: 0 });
    if (st === "paid") { if (!cur.lastPaid || at > cur.lastPaid) { cur.lastPaid = at; cur.cancelAfter = null; cur.amount = Number(r.amount) || 0; } }
    else if (st === "cancel") { if (cur.lastPaid && at >= cur.lastPaid && (!cur.cancelAfter || at > cur.cancelAfter)) cur.cancelAfter = at; }
  }
  return by;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  { const g = tokenGate(req, "SHEET_SYNC_SECRET"); if (g) return g; }  // 비밀값 없으면 503, 틀리면 403
  let body: { rows?: Row[]; dry?: boolean };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const dry = !!body.dry;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const by = reduceRows(rows);
  const emails = Object.keys(by);
  if (!emails.length) return Response.json({ ok: true, applied: [], cancelled: [], pending: [], skipped: 0, note: "no rows" });

  // 이메일 대소문자가 섞여 저장된 계정이 있어 전체를 받아 소문자로 맞춘다 (회원 수 백 명 단위라 가볍다)
  const { data: users, error } = await sb.from("users")
    .select("email, name, cohort, unlocked, membership_ends_at, membership_cancel_at, membership_cancel_reason, is_operator, is_dev_mode, withdrawn_at, preferences");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const umap: Record<string, any> = {};
  (users || []).forEach((u: any) => { umap[String(u.email).toLowerCase()] = u; });

  const applied: any[] = [], cancelled: any[] = [], pending: any[] = []; let skipped = 0;
  for (const email of emails) {
    const r = by[email]; const u = umap[email];
    if (!r.lastPaid) { skipped++; continue; }
    if (!u) {
      // 가입 전 결제: latpeed_events 에 넣어두면 가입 트리거(latpeed_apply_pending)가 소급 적용
      pending.push({ email, paid: r.lastPaid });
      if (!dry) {
        // 같은 결제를 매일 또 넣지 않게 먼저 확인
        const { data: ex } = await sb.from("latpeed_events").select("id").eq("email", email).eq("event_at", r.lastPaid).eq("type", "MEMBERSHIP_PAYMENT").limit(1);
        if (!ex || !ex.length) {
          await sb.from("latpeed_events").insert({
            email, type: "MEMBERSHIP_PAYMENT", status: "SUCCESS", event_at: r.lastPaid, amount: r.amount || null,
            option_text: "sheet-sync", applied: false, raw: { source: "sheet-sync", name: r.name }, received_at: new Date().toISOString(),
          }).then(() => {}, () => {});
        }
      }
      continue;
    }
    if (u.is_operator || u.is_dev_mode || u.withdrawn_at) { skipped++; continue; }
    const want = plusOneMonthKstEnd(r.lastPaid);
    const dbEnd = u.membership_ends_at ? new Date(u.membership_ends_at).toISOString() : null;
    const prefs = (u.preferences && typeof u.preferences === "object") ? u.preferences : {};
    if (r.cancelAfter) {
      // 환불: 취소 시각으로 만료 + 해지마커
      const cancelEnd = new Date(r.cancelAfter).toISOString();
      if (!dbEnd || dbEnd > cancelEnd || !u.membership_cancel_at) {
        cancelled.push({ email, name: u.name, ends: cancelEnd });
        if (!dry) await sb.from("users").update({ membership_ends_at: cancelEnd, membership_cancel_at: u.membership_cancel_at || new Date().toISOString(), membership_cancel_reason: "latpeed_refund" }).eq("email", u.email);
      } else skipped++;
      continue;
    }
    const wantIso = new Date(want).toISOString();
    const needs = !dbEnd || dbEnd < wantIso || u.cohort !== "member" || u.unlocked === false || !!u.membership_cancel_at || !!u.membership_cancel_reason;
    if (!needs) { skipped++; continue; }
    applied.push({ email, name: u.name, from: dbEnd, to: wantIso, paid: r.lastPaid });
    if (!dry) {
      await sb.from("users").update({
        membership_ends_at: wantIso, cohort: "member", unlocked: true, membership_cancel_at: null, membership_cancel_reason: null,
        preferences: { ...prefs, pay_source: "latpeed_sheet", last_paid_at: r.lastPaid },
      }).eq("email", u.email);
    }
  }
  if (!dry && (applied.length || cancelled.length)) {
    await sb.from("ops_log").insert({ email: "*", action: "sheet_sync", detail: { applied: applied.length, cancelled: cancelled.length, pending: pending.length, emails: applied.map(a => a.email).concat(cancelled.map(c => c.email)) }, by_email: "apps-script" }).then(() => {}, () => {});
  }
  return Response.json({ ok: true, dry, applied, cancelled, pending, skipped });
});
