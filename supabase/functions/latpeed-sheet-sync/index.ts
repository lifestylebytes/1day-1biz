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
//   · 새 결제가 있을 때(DB 만료일 < 시트 기준 만료일)만 연장·해지마커 해제. 같거나 뒤면 안 건드린다.
//   · ★ 2026-10-16 결제 금액이 THREE_MONTH_MIN_AMOUNT(기본 30,000원) 이상이면 3개월권 → 만료일 = 결제일 + 3개월.
//   · 마지막 결제 + 1개월 + 2일 안에 새 결제가 없으면 구독 종료로 보고 해지마커(latpeed_no_renewal)를 세운다 → 앱이 휴직 화면.
//   · 래피드 이메일 ≠ 앱 이메일이면 latpeed_aliases 표로 잇는다. 미가입 이메일은 같은 이름의 계정을 nameMatches 로 알려준다.
//   · 운영자·Dev 계정, 테스트 계정(youbuddy.co@gmail.com)은 제외.
//   · 가입 전 결제(users 에 없는 이메일)는 latpeed_events 에 남겨 가입 순간 소급 적용되게 한다 (latpeed_apply_pending).
//   · ★ 2026-10-13: 계정을 못 찾은 결제자 전원(결제 끝난 사람 포함)을 latpeed_unmatched 표에 매일 덮어 쓴다.
//     운영자 뷰 '결제했는데 앱 계정 없는 사람' 칸이 이 표를 읽는다. 이번에 계정이 잡힌 사람은 resolved_at 을 찍어 목록에서 뺀다.
// 본문: { rows: [{ name, email, phone, status, amount, at, reason }] }  (at = "26.09.20 21:25" 또는 ISO)
// 응답: { ok, applied, cancelled, ended, autoAliased, pending, unmatched, notInSheet, skipped }
//   autoAliased: 전화번호로 앱 계정을 찾아 별칭을 자동 등록한 사람 · notInSheet: 앱엔 유료 회원인데 시트엔 결제 이메일이 없는 사람(반대 방향 대조)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { tokenGate } from "../_shared/gate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// ★ 2026-10-16 3개월권: 결제 금액이 이 값 이상이면 3개월권으로 보고 만료일을 3개월 뒤로 (월 구독 13,900원과 구분). Secret 로 바꿀 수 있음.
const THREE_MONTH_MIN_AMOUNT = Number(Deno.env.get("THREE_MONTH_MIN_AMOUNT") || "30000");
export function periodMonths(amount: number | string | null | undefined): number {
  const n = Number(String(amount ?? "").replace(/[^\d.]/g, "")) || 0;
  return n >= THREE_MONTH_MIN_AMOUNT ? 3 : 1;
}
const GRACE_DAYS = 2;   // 결제 지연 유예: 만료 후 이틀 안에 결제가 안 찍히면 구독 종료로 본다

type Row = { name?: string; email?: string; phone?: string; status?: string; amount?: string | number; at?: string; reason?: string };

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
// ★ 2026-10-12 보상 연장: 결제했는데 앱 가입이 늦은 사람은, 가입 전에 통째로 지나간 결제 달 수만큼 만료일을 자동으로 더 준다.
//   (못 쓴 달 = 결제일 + 1개월 이 가입일보다 앞선 결제. 가입한 달은 쓴 것으로 본다.) 매일 같은 값이 나오므로 중복 적용되지 않는다.
export function unusedMonthsBeforeSignup(paidAts: (string | { at: string; months: number })[], signupIso: string | null | undefined): number {
  if (!signupIso) return 0;
  const signup = new Date(signupIso).toISOString();
  let n = 0;
  for (const p of paidAts) {
    const at = typeof p === "string" ? p : p.at; const m = typeof p === "string" ? 1 : (p.months || 1);
    if (new Date(plusMonthsKstEnd(at, m)).toISOString() <= signup) n += m;
  }
  return n;
}
export function plusMonthsKstEnd(iso: string, months: number): string {
  let cur = iso;
  for (let i = 0; i < months; i++) cur = plusOneMonthKstEnd(cur);
  return cur;
}
// 전화번호 비교용: 숫자만, 뒤 8자리 (010 유무·하이픈·국가번호 차이 무시)
export function phoneKey(p: string | number | undefined): string {
  const d = String(p || "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : "";
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
  const by: Record<string, { name: string; phone: string; lastPaid: string | null; firstPaid: string | null; cancelAfter: string | null; amount: number; payCount: number; paidAts: string[]; paid: { at: string; months: number }[] }> = {};
  const seen = new Set<string>();   // ★ 2026-10-13: 시트에 같은 구간을 두 번 붙여 넣은 줄(이메일·시각·상태가 같음)은 한 번만 센다
  for (const r of rows) {
    const email = String(r.email || "").trim().toLowerCase();
    if (!email || !email.includes("@") || email === "youbuddy.co@gmail.com") continue;
    const at = parseKstAt(r.at); if (!at) continue;
    const st = normalizeStatus(r.status);
    const key = email + "|" + at + "|" + st; if (seen.has(key)) continue; seen.add(key);
    const cur = by[email] || (by[email] = { name: String(r.name || ""), phone: phoneKey(r.phone), lastPaid: null, firstPaid: null, cancelAfter: null, amount: 0, payCount: 0, paidAts: [], paid: [] });
    if (!cur.phone) cur.phone = phoneKey(r.phone);
    if (st === "paid") {
      cur.payCount++; cur.paidAts.push(at); cur.paid.push({ at, months: periodMonths(r.amount) });
      if (!cur.firstPaid || at < cur.firstPaid) cur.firstPaid = at;
      if (!cur.lastPaid || at > cur.lastPaid) { cur.lastPaid = at; cur.cancelAfter = null; cur.amount = Number(String(r.amount ?? "").replace(/[^\d.]/g, "")) || 0; }
    }
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
    .select("email, name, phone, signup_date, cohort, unlocked, membership_ends_at, membership_cancel_at, membership_cancel_reason, is_operator, is_dev_mode, withdrawn_at, preferences");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const umap: Record<string, any> = {};
  (users || []).forEach((u: any) => { umap[String(u.email).toLowerCase()] = u; });
  // 래피드 결제 이메일 ≠ 앱 가입 이메일 인 사람: latpeed_aliases (latpeed_email → app_email) 로 잇는다
  const alias: Record<string, string> = {};
  { const { data: al } = await sb.from("latpeed_aliases").select("latpeed_email, app_email");
    (al || []).forEach((a: any) => { alias[String(a.latpeed_email).toLowerCase()] = String(a.app_email).toLowerCase(); }); }
  const nowIso = new Date().toISOString();

  const applied: any[] = [], cancelled: any[] = [], ended: any[] = [], pending: any[] = [], autoAliased: any[] = [], unmatched: any[] = []; let skipped = 0;
  const sheetEmails = new Set(emails);
  const queue = emails.slice();
  while (queue.length) {
    const email = queue.shift()!;
    const r = by[email]; const u = umap[alias[email] || email];
    if (!r.lastPaid) { skipped++; continue; }
    const comp = u ? unusedMonthsBeforeSignup(r.paid, u.signup_date) : 0;
    const want = plusMonthsKstEnd(r.lastPaid, periodMonths(r.amount) + comp);   // 월 구독 = 1개월, 3개월권 = 3개월
    const wantIso = new Date(want).toISOString();
    if (!u) {
      // 래피드 이메일 ≠ 앱 이메일 인 사람 찾기: ① 전화번호 뒤 8자리가 같은 계정이 딱 하나면 별칭을 자동으로 넣고 그 계정에 바로 적용
      //   ② 아니면 같은 이름의 계정을 후보로 알려준다 (운영자가 latpeed_aliases 에 넣을 수 있게)
      const pool = (users || []).filter((x: any) => !x.is_operator && !x.is_dev_mode && !x.withdrawn_at && !sheetEmails.has(String(x.email).toLowerCase()));
      const phoneMatches = r.phone ? pool.filter((x: any) => phoneKey(x.phone) === r.phone).map((x: any) => x.email) : [];
      const nm = r.name.replace(/\s+/g, "");
      const nameMatches = nm ? pool.filter((x: any) => String(x.name || "").replace(/\s+/g, "") === nm).map((x: any) => x.email) : [];
      // ★ 2026-10-13: 결제가 끝난 사람도 운영자 뷰에 보이도록 계정 없는 결제자로 모아 둔다 (전화번호 자동 연결은 결제 중인 사람만)
      const expired = wantIso < nowIso;
      if (expired || phoneMatches.length !== 1) {
        unmatched.push({ latpeed_email: email, name: r.name, phone: r.phone || null, first_paid_at: r.firstPaid, last_paid_at: r.lastPaid,
          pay_count: r.payCount, last_amount: r.amount || null, name_matches: [...new Set([...phoneMatches, ...nameMatches])] });   // 후보: 전화번호·이름이 같은 계정
      }
      // 이미 한 달이 지난 결제는 가입해도 소급할 게 없으니 latpeed_events 엔 안 남긴다.
      if (expired) { skipped++; continue; }
      if (phoneMatches.length === 1) {
        autoAliased.push({ latpeed_email: email, app_email: phoneMatches[0], name: r.name, by: "phone" });
        if (!dry) await sb.from("latpeed_aliases").upsert({ latpeed_email: email, app_email: String(phoneMatches[0]).toLowerCase(), note: r.name + " (전화번호 자동 매칭)" }, { onConflict: "latpeed_email" }).then(() => {}, () => {});
        alias[email] = String(phoneMatches[0]).toLowerCase();
        queue.push(email);   // 별칭이 생겼으니 그 계정으로 다시 처리
        continue;
      }
      pending.push({ email, name: r.name, paid: r.lastPaid, nameMatches, phoneMatches });
      if (!dry) {
        const { data: ex } = await sb.from("latpeed_events").select("id").eq("email", email).eq("event_at", r.lastPaid).eq("type", "MEMBERSHIP_PAYMENT").limit(1);
        if (!ex || !ex.length) {
          await sb.from("latpeed_events").insert({
            email, type: "MEMBERSHIP_PAYMENT", status: "SUCCESS", event_at: r.lastPaid, amount: r.amount || null,
            option_text: "sheet-sync", applied: false, raw: { source: "sheet-sync", name: r.name }, received_at: nowIso,
          }).then(() => {}, () => {});
        }
      }
      continue;
    }
    if (u.is_operator || u.is_dev_mode || u.withdrawn_at) { skipped++; continue; }
    const dbEnd = u.membership_ends_at ? new Date(u.membership_ends_at).toISOString() : null;
    const prefs = (u.preferences && typeof u.preferences === "object") ? u.preferences : {};
    if (r.cancelAfter) {
      // 환불: 취소 시각으로 만료 + 해지마커
      const cancelEnd = new Date(r.cancelAfter).toISOString();
      if (!dbEnd || dbEnd > cancelEnd || !u.membership_cancel_at) {
        cancelled.push({ email: u.email, name: u.name, ends: cancelEnd });
        if (!dry) await sb.from("users").update({ membership_ends_at: cancelEnd, membership_cancel_at: u.membership_cancel_at || nowIso, membership_cancel_reason: "latpeed_refund" }).eq("email", u.email);
      } else skipped++;
      continue;
    }
    // ★ 구독 종료 감지 (2026-10-04): 래피드는 월 구독이라 한 달마다 '결제 완료' 가 찍혀야 한다.
    //   시트엔 '구독 취소' 가 안 찍히므로, 마지막 결제 + 1개월 + 2일(유예) 안에 새 결제가 없으면 구독이 끝난 것으로 보고
    //   해지마커를 세운다 (앱은 해지마커 + 만료일 경과일 때만 member 를 막는다). 만료일은 그대로 둔다.
    //   DB 만료일이 시트보다 뒤면(운영자가 손으로 늘린 경우 등) 건드리지 않는다.
    if (wantIso < nowIso) {
      const graceEnd = new Date(new Date(wantIso).getTime() + GRACE_DAYS * 86400000).toISOString();
      // ★ 2026-10-12: 운영자가 손으로 늘린 만료일(보상 연장·해지 시 +N일)도, 그 날짜 + 2일이 지나면 똑같이 해지마커를 세운다.
      //   (앱이 fail-open 이라 마커 없이 만료일만 지나면 계속 열려 있었다)
      const extEnded = !!dbEnd && dbEnd > wantIso && new Date(new Date(dbEnd).getTime() + GRACE_DAYS * 86400000).toISOString() < nowIso;
      if (graceEnd < nowIso && u.cohort === "member" && !u.membership_cancel_at && (!dbEnd || dbEnd <= wantIso || extEnded)) {
        ended.push({ email: u.email, name: u.name, paid: r.lastPaid, ends: dbEnd || wantIso, extended: extEnded || undefined });
        if (!dry) await sb.from("users").update({ membership_ends_at: dbEnd || wantIso, membership_cancel_at: nowIso, membership_cancel_reason: "latpeed_no_renewal" }).eq("email", u.email);
      } else skipped++;
      continue;
    }
    // ★ 새 결제가 있을 때만 (DB 만료일 < 시트 기준 만료일) 연장 + 해지마커 해제. 만료일이 이미 같거나 더 뒤면 아무것도 안 건드린다.
    //   (2026-10-03 사고: 날짜가 같은 사람의 해지마커까지 지워서 구독 취소자가 '정상 활성' 으로 바뀌었다)
    if (dbEnd && dbEnd >= wantIso) { skipped++; continue; }
    applied.push({ email: u.email, name: u.name, from: dbEnd, to: wantIso, paid: r.lastPaid, compMonths: comp || undefined });
    if (!dry) {
      await sb.from("users").update({
        membership_ends_at: wantIso, cohort: "member", unlocked: true, membership_cancel_at: null, membership_cancel_reason: null,
        preferences: { ...prefs, pay_source: "latpeed_sheet", last_paid_at: r.lastPaid, ...(comp ? { comp_months: comp } : {}) },
      }).eq("email", u.email);
    }
  }
  // 반대 방향 대조: 앱에 유료 회원으로 있는데 시트(래피드 결제)엔 그 이메일이 없는 사람. 다른 이메일로 결제했을 가능성이 크다.
  const aliasTargets = new Set(Object.values(alias));
  const notInSheet = (users || []).filter((x: any) => x.cohort === "member" && !x.is_operator && !x.is_dev_mode && !x.withdrawn_at
      && !sheetEmails.has(String(x.email).toLowerCase()) && !aliasTargets.has(String(x.email).toLowerCase())
      && !(x.membership_ends_at && new Date(x.membership_ends_at).toISOString() < nowIso))
    .map((x: any) => ({ email: x.email, name: x.name, signup: x.signup_date, ends: x.membership_ends_at, pay_source: (x.preferences || {}).pay_source || null }));
  // ★ 2026-10-13: 계정 없는 결제자 표 갱신. 이번에 다시 나온 사람은 덮어 쓰고(접어 둔 표시는 그대로), 안 나온 사람은 해결로 본다.
  let unmatchedSaved = false;
  if (!dry) {
    const nowSeen = new Date().toISOString();
    if (unmatched.length) {
      const { error: ue } = await sb.from("latpeed_unmatched").upsert(unmatched.map(x => ({ ...x, last_seen_at: nowSeen, resolved_at: null })), { onConflict: "latpeed_email" });
      unmatchedSaved = !ue;
    } else unmatchedSaved = true;
    const keep = unmatched.map(x => x.latpeed_email);
    let q = sb.from("latpeed_unmatched").update({ resolved_at: nowSeen }).is("resolved_at", null);
    if (keep.length) q = q.not("latpeed_email", "in", "(" + keep.map(e => '"' + e.replace(/"/g, "") + '"').join(",") + ")");
    await q.then(() => {}, () => {});   // 표가 아직 없으면(SQL 미실행) 조용히 넘어간다
  }
  if (!dry && (applied.length || cancelled.length || ended.length)) {
    await sb.from("ops_log").insert({ email: "*", action: "sheet_sync", detail: { applied: applied.length, cancelled: cancelled.length, ended: ended.length, pending: pending.length, emails: applied.map(a => a.email).concat(cancelled.map(c => c.email), ended.map(e => e.email)) }, by_email: "apps-script" }).then(() => {}, () => {});
  }
  return Response.json({ ok: true, dry, applied, cancelled, ended, autoAliased, pending, unmatched, unmatchedSaved, notInSheet, skipped });
});
