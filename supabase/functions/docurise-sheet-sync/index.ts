// ============================================================
// docurise-sheet-sync (2026-11-14)
// 다큐라이즈 1회 결제(1일1비 장기권)를 구글 시트에서 받아 users 이용 기간에 붙인다.
// 경로: 다큐라이즈 → (Iconic 플랜 Google Sheets 연동) → 시트 "1일1비 구매관리" 의 다큐라이즈 탭
//       → Apps Script(Code.gs, 10분마다) → 이 함수 (헤더 x-webhook-token = Secret SHEET_SYNC_SECRET, 래피드 동기화와 같은 값)
// 배포: supabase functions deploy docurise-sheet-sync --no-verify-jwt
// 표: supabase/migrations/20261114_docurise_applied.sql (적용한 결제를 한 번만 반영하기 위한 기록)
//
// 규칙
//   · '결제 완료' 줄만 반영한다. 상품명으로 개월 수를 정한다 (인턴 3 / 정규직 6 / 패스트트랙 6 / 임원 12 / "1개월권" 1).
//     상품을 못 알아보면 반영하지 않고 unknown 으로 돌려준다 (운영자가 확인).
//   · 새 만료일 = max(지금, 현재 만료일) + N개월 그날 23:59 KST. 체험 중이면 체험 끝나는 날 뒤로 이어 붙는다.
//   · cohort=member, unlocked=true. 1회 결제라 자동 갱신이 없으므로 해지마커(membership_cancel_at)를 새 만료일로 세운다
//     → 앱은 '해지마커 + 만료일 경과' 일 때 막으므로, 기간이 끝나면 정상적으로 휴직 화면이 뜬다. (래피드 월 구독은 이 마커가 없음)
//   · 같은 결제는 docurise_applied 에 키(주문번호, 없으면 이메일|일시|상품)로 남겨 두 번 반영하지 않는다.
//   · 아직 가입 안 한 이메일은 반영하지 않고 pending 으로 돌려준다. 키를 남기지 않으므로 가입 뒤 다음 실행에서 자동 반영된다.
//   · '결제 취소/환불' 은 자동으로 줄이지 않는다 (부분 환불이 많음). refunds 로 돌려주고 운영자가 처리한다.
//   · latpeed_aliases(결제 이메일 → 앱 이메일) 표를 같이 쓴다.
//   · 운영자, Dev, 탈퇴 계정은 건너뛴다.
// 본문: { rows: [{ email, name, product, status, amount, at, orderId }], dry? }
// 응답: { ok, applied, pending, unknown, refunds, already, skipped }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { tokenGate } from "../_shared/gate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = { email?: string; name?: string; product?: string; status?: string; amount?: string | number; at?: string; orderId?: string };

// 상품명 → 개월 수. 순서 중요 (패스트트랙 상품명에도 '6개월' 이 있으니 키워드로 먼저 본다)
export function monthsOf(product: string): { months: number; plan: string } | null {
  const p = String(product || "").replace(/\s+/g, "");
  if (/임원/.test(p)) return { months: 12, plan: "exec" };
  if (/패스트트랙|승진/.test(p)) return { months: 6, plan: "fast" };
  if (/정규직/.test(p)) return { months: 6, plan: "regular" };
  if (/인턴/.test(p)) return { months: 3, plan: "intern" };
  if (/1일1비1개월권|1개월권/.test(p)) return { months: 1, plan: "m1" };
  return null;
}
export function statusOf(s: string): "paid" | "refund" | "other" {
  const t = String(s || "").replace(/\s+/g, "").toLowerCase();
  if (/취소|환불|refund|cancel/.test(t)) return "refund";
  if (/완료|paid|succe|결제됨|승인/.test(t)) return "paid";
  return "other";
}
export function parseAt(s: string | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  const m = /^(\d{2}|\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(t);
  if (m && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(t)) {
    const y = m[1].length === 2 ? "20" + m[1] : m[1];
    const d = new Date(`${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${(m[4] || "0").padStart(2, "0")}:${m[5] || "00"}:00+09:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(t); return isNaN(d.getTime()) ? null : d.toISOString();
}
// base(ISO) + N개월, 그날 23:59:59 KST (말일 넘침 방지)
export function addMonthsKstEnd(baseIso: string, months: number): string {
  const d = new Date(new Date(baseIso).getTime() + 9 * 3600000);
  const y = d.getUTCFullYear(), mo = d.getUTCMonth() + months, da = d.getUTCDate();
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const n = new Date(Date.UTC(y, mo, Math.min(da, last)));
  return new Date(`${n.toISOString().slice(0, 10)}T23:59:59+09:00`).toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  { const g = tokenGate(req, "SHEET_SYNC_SECRET"); if (g) return g; }
  let body: { rows?: Row[]; dry?: boolean };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const dry = !!body.dry;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: users, error } = await sb.from("users")
    .select("email, name, cohort, unlocked, signup_date, membership_ends_at, membership_cancel_at, is_operator, is_dev_mode, withdrawn_at, preferences");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const umap: Record<string, any> = {};
  (users || []).forEach((u: any) => { umap[String(u.email).toLowerCase()] = u; });
  const alias: Record<string, string> = {};
  { const { data: al } = await sb.from("latpeed_aliases").select("latpeed_email, app_email");
    (al || []).forEach((a: any) => { alias[String(a.latpeed_email).toLowerCase()] = String(a.app_email).toLowerCase(); }); }
  const done = new Set<string>();
  { const { data: ap, error: apErr } = await sb.from("docurise_applied").select("key");
    if (apErr) return Response.json({ ok: false, error: "docurise_applied 표가 없습니다 (마이그레이션 먼저): " + apErr.message }, { status: 500 });
    (ap || []).forEach((a: any) => done.add(a.key)); }

  const applied: any[] = [], pending: any[] = [], unknown: any[] = [], refunds: any[] = []; let already = 0, skipped = 0;
  // 오래된 결제부터 차례로 붙인다 (같은 사람이 두 번 사면 이어서 연장)
  const list = rows.map(r => ({ ...r, iso: parseAt(r.at) })).filter(r => r.email && String(r.email).includes("@"))
    .sort((a, b) => String(a.iso || "").localeCompare(String(b.iso || "")));
  const nowIso = new Date().toISOString();
  for (const r of list) {
    const payEmail = String(r.email).trim().toLowerCase();
    const st = statusOf(r.status || "");
    const key = r.orderId ? "order:" + String(r.orderId).trim() : `${payEmail}|${r.iso || r.at}|${String(r.product || "").trim()}`;
    if (st === "refund") { refunds.push({ email: payEmail, name: r.name, product: r.product, at: r.iso, amount: r.amount }); continue; }
    if (st !== "paid") { skipped++; continue; }
    if (done.has(key)) { already++; continue; }
    const m = monthsOf(r.product || "");
    if (!m) { unknown.push({ email: payEmail, name: r.name, product: r.product, at: r.iso }); continue; }
    const appEmail = alias[payEmail] || payEmail;
    const u = umap[appEmail];
    if (!u) { pending.push({ email: payEmail, name: r.name, product: r.product, at: r.iso, months: m.months }); continue; }
    if (u.is_operator || u.is_dev_mode || u.withdrawn_at) { skipped++; continue; }
    const dbEnd = u.membership_ends_at ? new Date(u.membership_ends_at).toISOString() : null;
    const base = dbEnd && dbEnd > nowIso ? dbEnd : nowIso;
    const newEnd = addMonthsKstEnd(base, m.months);
    const prefs = (u.preferences && typeof u.preferences === "object") ? u.preferences : {};
    // ★ 2026-11-18: 끊겼다 다시 결제한 사람(체험 종료/만료 후)은 마지막으로 끝낸 Day 다음 날부터 이어지게 signup_date 를 당긴다.
    //   Day 는 가입일 달력 기준이라, 그대로 두면 쉰 날만큼 밀린 Day 가 한꺼번에 열린다 (2026-11-19 김미소님: Day 7 에서 멈췄는데 Day 22 로 열림).
    let resumeSignup: string | null = null, resumeDay: number | null = null;
    if (dbEnd && dbEnd <= nowIso && u.signup_date) {
      const { data: sub } = await sb.from("submissions").select("day").eq("email", u.email).order("day", { ascending: false }).limit(1);
      const lastDone = sub && sub[0] ? Number(sub[0].day) || 0 : 0;
      const todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const signKst = new Date(new Date(u.signup_date).getTime() + 9 * 3600000).toISOString().slice(0, 10);
      const calDay = Math.round((Date.parse(todayKst) - Date.parse(signKst)) / 86400000) + 1;
      const want = lastDone + 1;
      if (calDay > want) {
        const d0 = new Date(Date.parse(todayKst) - (want - 1) * 86400000).toISOString().slice(0, 10);
        resumeSignup = `${d0}T00:00:00+09:00`; resumeDay = want;
      }
    }
    applied.push({ email: u.email, name: u.name, product: r.product, months: m.months, from: dbEnd, to: newEnd, prevCohort: u.cohort, resumeDay });
    if (!dry) {
      const { error: upErr } = await sb.from("users").update({
        membership_ends_at: newEnd, cohort: "member", unlocked: true,
        membership_cancel_at: newEnd, membership_cancel_reason: "docurise_pass",
        ...(resumeSignup ? { signup_date: resumeSignup } : {}),
        preferences: { ...prefs, pay_source: "docurise", plan: m.plan, plan_months: m.months, last_paid_at: r.iso,
          ...(String(u.cohort || "").startsWith("trial") && !prefs.prev_cohort ? { prev_cohort: u.cohort } : {}),
          ...(r.amount ? { last_amount: Number(String(r.amount).replace(/[^\d]/g, "")) || null } : {}) },
      }).eq("email", u.email);
      if (upErr) { applied.pop(); unknown.push({ email: payEmail, error: upErr.message }); continue; }
      await sb.from("docurise_applied").insert({ key, email: u.email, months: m.months, product: r.product || null, paid_at: r.iso, ends_to: newEnd }).then(() => {}, () => {});
      done.add(key);
      // 같은 이메일 다음 줄이 이어 붙도록 메모리 상태도 갱신
      u.membership_ends_at = newEnd; u.cohort = "member"; u.preferences = { ...prefs, pay_source: "docurise", plan: m.plan, plan_months: m.months };
    } else {
      u.membership_ends_at = newEnd;
    }
  }
  if (!dry && (applied.length || pending.length || unknown.length)) {
    await sb.from("ops_log").insert({ email: "*", action: "docurise_sync", detail: { applied, pending: pending.length, unknown: unknown.length, refunds: refunds.length }, by_email: "apps-script" }).then(() => {}, () => {});
  }
  return Response.json({ ok: true, dry, applied, pending, unknown, refunds, already, skipped });
});
