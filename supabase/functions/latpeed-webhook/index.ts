// ============================================================
// 1일1비, 래피드 웹훅 수신 Edge Function (2026-10-24 새 명세 대응)
//
// 래피드 → 이 함수 URL(?token=) → Supabase users 자동 갱신
//
// 래피드가 보내는 것 (2026-10 명세):
//   type    : NORMAL_PAYMENT(단건 상품) | MEMBERSHIP_PAYMENT(멤버십)
//   subtype : PAYMENT_SUCCESS | PAYMENT_CANCEL | SUBSCRIPTION_CANCELED | SUBSCRIPTION_RENEWED
//             | SUBSCRIPTION_FINISHED | SUBSCRIPTION_RENEWAL_FAILED | SUBSCRIPTION_RESUMED | SUBSCRIPTION_RECOVERED
//   eventId : 같은 알림이 여러 번 올 수 있으니 이걸로 한 번만 처리한다
//   payment / membership / subscriber / subscription
//
// 처리 룰:
//   [단건 상품 = 장기권]  NORMAL_PAYMENT
//     PAYMENT_SUCCESS : 옵션명에서 N개월을 읽고 (못 읽으면 금액으로),
//                       기존 만료일(또는 체험 종료일)과 지금 중 늦은 쪽에 N개월을 이어 붙인다. cohort → member
//     PAYMENT_CANCEL  : 환불 금액 ÷ 월 정가(16,900) 만큼 개월을 뺀다. 전액이면 즉시 만료
//   [멤버십 = 월 구독]   MEMBERSHIP_PAYMENT
//     PAYMENT_SUCCESS / SUBSCRIPTION_RENEWED / SUBSCRIPTION_RECOVERED : 만료일 = subscription.finishedAt (없으면 +31일). cohort → member
//     SUBSCRIPTION_CANCELED : membership_cancel_at 기록 (유예 없이 만료일에 차단)
//     SUBSCRIPTION_RESUMED  : membership_cancel_at 해제
//     SUBSCRIPTION_FINISHED : 만료일 = finishedAt (= 지금)
//     SUBSCRIPTION_RENEWAL_FAILED : 로그만 (2일 유예는 앱 게이트가 처리)
//     PAYMENT_CANCEL  : 즉시 만료 (환불)
//   옛 형식(subtype 없음, payment.status 만 있음)도 그대로 받는다. 1차·2차 멤버십이 아직 그 URL 로 보내고 있어서.
//
// 계정이 아직 없으면(가입 전 결제) latpeed_unmatched 에 올려 운영자 뷰에 보이게 하고,
// 가입 때 syncSignup 쪽이 이메일로 찾아 적용한다 (그 로직은 lib/supabase-client.js).
//
// 모든 이벤트는 latpeed_events 에 원본 그대로 기록. 5초 안에 응답해야 해서 DB write 는 best-effort (실패해도 200).
//
// 배포:
//   supabase functions deploy latpeed-webhook --no-verify-jwt
// 환경변수 (선택):
//   MEMBERSHIP_DAYS=31           월 구독 finishedAt 이 없을 때 쓰는 기본값
//   MONTH_LIST_PRICE=16900       환불 때 개월 수 계산용 월 정가
//   TRIAL_DAYS=7                 체험 종료일 계산용
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { tokenGate } from "../_shared/gate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MEMBERSHIP_DAYS = parseInt(Deno.env.get("MEMBERSHIP_DAYS") || "31", 10);
const MONTH_LIST_PRICE = parseInt(Deno.env.get("MONTH_LIST_PRICE") || "16900", 10);
const TRIAL_DAYS = parseInt(Deno.env.get("TRIAL_DAYS") || "7", 10);

// 장기권 금액 → 개월 (옵션명에서 "N개월" 을 못 읽을 때만 쓴다)
const AMOUNT_TO_MONTHS: Array<[number, number]> = [
  [285000, 12],   // 임원 트랙
  [179000, 6],    // 승진 패스트트랙
  [94900, 6],     // 정규직
  [49900, 3],     // 인턴
];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function addMonths(d: Date, n: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function later(a: Date | null, b: Date | null): Date | null { if (!a) return b; if (!b) return a; return a > b ? a : b; }
function parseDate(v: unknown): Date | null { if (!v) return null; const d = new Date(String(v)); return isNaN(d.getTime()) ? null : d; }

// 옵션명 해석: "정규직 · 1일1비 6개월 + (48시간이내구매시) 상반기 영어 달력" 같은 문자열
function parsePlan(option: string | null, amount: number | null) {
  const opt = String(option || "");
  let months: number | null = null;
  const m = opt.match(/(\d+)\s*개월/);
  if (m) months = parseInt(m[1], 10);
  if (!months && amount != null) {
    for (const [amt, mo] of AMOUNT_TO_MONTHS) { if (Math.abs(amount - amt) <= 500) { months = mo; break; } }
  }
  return {
    months,
    ubc: /유비챌/i.test(opt),
    workbook: /workbook|워크북/i.test(opt),
    calendar: /달력/.test(opt),
    label: opt.split("·")[0].trim() || null,   // "정규직", "인턴", "승진 패스트트랙", "임원 트랙"
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  // 래피드는 아직 서명을 안 주므로 웹훅 URL 의 ?token= 으로 확인 (Secret LATPEED_WEBHOOK_TOKEN)
  { const g = tokenGate(req, "LATPEED_WEBHOOK_TOKEN"); if (g) return g; }

  let body: any;
  try { body = await req.json(); } catch (_e) { return jsonResponse({ ok: false, error: "invalid_json" }, 200); }

  const type = String(body?.type || "").toUpperCase();
  const subtypeRaw = body?.subtype ? String(body.subtype).toUpperCase() : "";
  const eventId = String(body?.eventId || req.headers.get("x-latpeed-event-id") || "");
  const payment = (body?.payment || null) as Record<string, any> | null;
  const subscription = (body?.subscription || null) as Record<string, any> | null;
  const subscriber = (body?.subscriber || null) as Record<string, any> | null;

  // 이메일: 단건은 payment, 멤버십 구독 이벤트는 subscriber 에 있다
  const emailRaw = payment?.email || subscriber?.email || "";
  const email = String(emailRaw).toLowerCase().trim();
  const status = String(payment?.status || "").toUpperCase();
  // 옛 형식(subtype 없음) 호환: status 로 subtype 을 만들어 쓴다
  const subtype = subtypeRaw || (status === "SUCCESS" ? "PAYMENT_SUCCESS" : status === "CANCEL" ? "PAYMENT_CANCEL" : "");
  const amount = typeof payment?.amount === "number" ? payment.amount : null;
  const optText = payment?.option ? String(payment.option) : null;
  const eventAt = parseDate(body?.date) || parseDate(payment?.date) || new Date();

  if (!email) {
    await supabase.from("latpeed_events").insert({ raw: body, applied: false, apply_note: "missing_email", type: type || null, status: subtype || null }).then(() => {}, () => {});
    return jsonResponse({ ok: true, action: "logged_invalid" });
  }

  // 0) 멱등성: 같은 eventId 를 이미 처리했으면 그대로 200
  if (eventId) {
    const { data: dup } = await supabase.from("latpeed_events").select("id").eq("raw->>eventId", eventId).limit(1);
    if (dup && dup.length) return jsonResponse({ ok: true, action: "duplicate_ignored", eventId });
  }

  const logRow = {
    // status 컬럼은 예전 값(SUCCESS / CANCEL / SUBSCRIPTION_FAILED)을 유지한다. latpeed_apply_pending 과 시트 동기화가 이걸 본다.
    // 구독 이벤트처럼 payment 가 없으면 subtype 을 넣는다. 새 subtype 은 raw->>'subtype' 으로 본다.
    email, type: type || null, status: (status || subtype || null), amount,
    event_at: eventAt.toISOString(), option_text: optText, raw: body,
    applied: false as boolean, apply_note: null as string | null,
  };
  let applied = false;
  let applyNote: string | null = null;

  try {
    // ★ 별칭이 먼저다. 운영자가 "래피드 이메일 → 앱 이메일" 로 이어뒀으면, 결제 이메일과 같은 옛 계정이 있어도 앱 이메일 쪽에 넣는다.
    //   (예: 옛 계정 만료된 사람이 새 이메일로 재가입하고 결제는 옛 이메일로 한 경우)
    let targetEmail = email;
    {
      const { data: alias } = await supabase.from("latpeed_aliases").select("app_email").eq("latpeed_email", email).maybeSingle();
      if (alias && alias.app_email) targetEmail = String(alias.app_email).toLowerCase().trim();
    }
    const { data: existing } = await supabase
      .from("users")
      .select("email, signup_date, cohort, membership_ends_at, membership_cancel_at, preferences")
      .eq("email", targetEmail)
      .maybeSingle();
    const prefs = (existing && existing.preferences && typeof existing.preferences === "object") ? existing.preferences as Record<string, any> : {};
    const payMeta = (extra: Record<string, unknown>) => ({
      ...prefs,
      pay_source: "latpeed",
      last_paid_at: eventAt.toISOString(),
      pay_count: Number(prefs.pay_count || 0) + 1,
      ...extra,
    });

    // 체험 회원이면 체험 종료일(가입 + TRIAL_DAYS)도 '이어 붙이기' 기준에 넣는다
    const trialEnd = (existing && typeof existing.cohort === "string" && existing.cohort.startsWith("trial") && existing.signup_date)
      ? addDays(new Date(existing.signup_date), TRIAL_DAYS) : null;
    const now = new Date();

    // ─────────────────────────────────────────────
    // A. 단건 상품 = 장기권
    // ─────────────────────────────────────────────
    if (type === "NORMAL_PAYMENT" && subtype === "PAYMENT_SUCCESS") {
      const plan = parsePlan(optText, amount);
      if (!plan.months) {
        applyNote = `skipped: cannot_parse_months (option="${optText}", amount=${amount})`;
      } else if (!existing) {
        // 가입 전 결제: 운영자 뷰 '계정 없는 결제자' 에 올린다. 가입하면 syncSignup 이 이메일로 찾아 적용.
        await supabase.from("latpeed_unmatched").upsert({
          latpeed_email: email, name: payment?.name || null,
          phone: String(payment?.phoneNumber || "").replace(/\D/g, "") || null,
          first_paid_at: eventAt.toISOString(), last_paid_at: eventAt.toISOString(),
          pay_count: 1, last_amount: amount, last_seen_at: now.toISOString(), resolved_at: null,
        }, { onConflict: "latpeed_email" }).then(() => {}, () => {});
        applyNote = `user_not_found_yet: queued_in_unmatched (${plan.months}mo, ${plan.label})`;
      } else {
        const prevEnds = parseDate(existing.membership_ends_at);
        const base = later(later(prevEnds, trialEnd), now) || now;   // 남은 기간 위에 이어 붙인다 (덮어쓰기 금지)
        const endsAt = addMonths(base, plan.months);
        const updates: Record<string, unknown> = {
          cohort: "member",
          membership_ends_at: endsAt.toISOString(),
          membership_cancel_at: null,
          membership_cancel_reason: null,
          preferences: payMeta({
            plan: plan.label, plan_months: plan.months, plan_option: optText, plan_amount: amount,
            plan_order_id: payment?.orderId || null, plan_paid_at: eventAt.toISOString(),
            plan_ubc: plan.ubc, plan_workbook: plan.workbook, plan_calendar_option: plan.calendar,
            prev_cohort: existing.cohort || null,
            // 48시간 달력 판정은 앱이 signupDate 로 한다. 여기선 결제 시각만 남긴다.
          }),
        };
        const { data, error } = await supabase.from("users").update(updates).eq("email", targetEmail).select("email");
        if (error) applyNote = "update_error: " + error.message;
        else if (!data || !data.length) applyNote = "user_not_found";
        else { applied = true; applyNote = `longpass_${plan.months}mo_from_${base.toISOString().slice(0, 10)}_until_${endsAt.toISOString().slice(0, 10)}${trialEnd && base.getTime() === trialEnd.getTime() ? "_after_trial" : ""}${targetEmail !== email ? `_via_alias(${targetEmail})` : ""}`; }
      }
    }
    else if (type === "NORMAL_PAYMENT" && subtype === "PAYMENT_CANCEL") {
      if (!existing) { applyNote = "refund_for_unknown_user"; }
      else {
        const prevEnds = parseDate(existing.membership_ends_at);
        const paid = Number(prefs.plan_amount || 0);
        const fullRefund = amount != null && paid > 0 && amount >= paid - 500;
        let endsAt: Date;
        if (fullRefund || !prevEnds || amount == null) endsAt = now;
        else {
          const monthsBack = Math.max(1, Math.round(amount / MONTH_LIST_PRICE));
          endsAt = addMonths(prevEnds, -monthsBack);
          if (endsAt < now) endsAt = now;
        }
        const { data, error } = await supabase.from("users").update({
          membership_ends_at: endsAt.toISOString(),
          membership_cancel_reason: payment?.canceledReason || "latpeed_refund",
          preferences: { ...prefs, refund_at: eventAt.toISOString(), refund_amount: amount },
        }).eq("email", targetEmail).select("email");
        if (error) applyNote = "update_error: " + error.message;
        else if (!data || !data.length) applyNote = "user_not_found";
        else { applied = true; applyNote = fullRefund ? "refund_full_immediate_expiry" : `refund_partial_until_${endsAt.toISOString().slice(0, 10)}`; }
      }
    }

    // ─────────────────────────────────────────────
    // B. 멤버십 = 월 구독 (1차 9,900 / 2차 13,900)
    // ─────────────────────────────────────────────
    else if (type === "MEMBERSHIP_PAYMENT" && (subtype === "PAYMENT_SUCCESS" || subtype === "SUBSCRIPTION_RENEWED" || subtype === "SUBSCRIPTION_RECOVERED")) {
      if (!existing) {
        await supabase.from("latpeed_unmatched").upsert({
          latpeed_email: email, name: payment?.name || subscriber?.name || null,
          phone: String(payment?.phoneNumber || subscriber?.phoneNumber || "").replace(/\D/g, "") || null,
          first_paid_at: eventAt.toISOString(), last_paid_at: eventAt.toISOString(),
          pay_count: 1, last_amount: amount, last_seen_at: now.toISOString(), resolved_at: null,
        }, { onConflict: "latpeed_email" }).then(() => {}, () => {});
        applyNote = "user_not_found_yet: queued_in_unmatched";
      } else {
        // 래피드가 준 이용기간 종료일을 그대로 쓴다. 없으면(옛 형식) 결제일 + 31일
        const finishedAt = parseDate(subscription?.finishedAt);
        const endsAt = finishedAt || addDays(eventAt, MEMBERSHIP_DAYS);
        // 만료 후 재결제면 공백만큼 signup_date 를 밀어 Day 진도를 끊긴 데서 잇는다 (기존 동작 유지)
        const updates: Record<string, unknown> = {
          cohort: "member",
          membership_ends_at: endsAt.toISOString(),
          membership_cancel_at: null,
          membership_cancel_reason: null,
          preferences: payMeta({ subscription_id: subscription?.subscriptionId || prefs.subscription_id || null, membership_name: body?.membership?.name || prefs.membership_name || null, prev_cohort: existing.cohort || null }),
        };
        let gapDays = 0;
        const prevEnds = parseDate(existing.membership_ends_at);
        if (prevEnds && existing.signup_date && prevEnds < eventAt && subtype === "PAYMENT_SUCCESS") {
          gapDays = Math.floor((eventAt.getTime() - prevEnds.getTime()) / 86400000);
          if (gapDays > 0) updates.signup_date = addDays(new Date(existing.signup_date), gapDays).toISOString();
        }
        const { data, error } = await supabase.from("users").update(updates).eq("email", targetEmail).select("email");
        if (error) applyNote = "update_error: " + error.message;
        else if (!data || !data.length) applyNote = "user_not_found";
        else { applied = true; applyNote = `${subtype.toLowerCase()}_until_${endsAt.toISOString().slice(0, 10)}${gapDays > 0 ? `_resume_after_${gapDays}d_gap` : ""}`; }
      }
    }
    else if (type === "MEMBERSHIP_PAYMENT" && subtype === "SUBSCRIPTION_CANCELED") {
      // 해지 예약: 남은 기간은 쓰고, 만료일에 유예 없이 차단되게 표시만 한다
      const { data, error } = await supabase.from("users").update({
        membership_cancel_at: (parseDate(subscription?.canceledAt) || eventAt).toISOString(),
        membership_cancel_reason: subscription?.canceledReason || "latpeed_subscription_canceled",
        ...(parseDate(subscription?.finishedAt) ? { membership_ends_at: parseDate(subscription?.finishedAt)!.toISOString() } : {}),
      }).eq("email", targetEmail).select("email");
      if (error) applyNote = "update_error: " + error.message;
      else if (!data || !data.length) applyNote = "user_not_found";
      else { applied = true; applyNote = "subscription_canceled_marked"; }
    }
    else if (type === "MEMBERSHIP_PAYMENT" && subtype === "SUBSCRIPTION_RESUMED") {
      const { data, error } = await supabase.from("users").update({
        membership_cancel_at: null, membership_cancel_reason: null,
        ...(parseDate(subscription?.finishedAt) ? { membership_ends_at: parseDate(subscription?.finishedAt)!.toISOString() } : {}),
      }).eq("email", targetEmail).select("email");
      if (error) applyNote = "update_error: " + error.message;
      else if (!data || !data.length) applyNote = "user_not_found";
      else { applied = true; applyNote = "subscription_resumed"; }
    }
    else if (type === "MEMBERSHIP_PAYMENT" && (subtype === "SUBSCRIPTION_FINISHED" || subtype === "PAYMENT_CANCEL")) {
      const endsAt = subtype === "PAYMENT_CANCEL" ? now : (parseDate(subscription?.finishedAt) || now);
      const { data, error } = await supabase.from("users").update({
        membership_ends_at: endsAt.toISOString(),
        membership_cancel_reason: payment?.canceledReason || subscription?.canceledReason || (subtype === "PAYMENT_CANCEL" ? "latpeed_refund" : "latpeed_subscription_finished"),
      }).eq("email", targetEmail).select("email");
      if (error) applyNote = "update_error: " + error.message;
      else if (!data || !data.length) applyNote = "user_not_found";
      else { applied = true; applyNote = subtype === "PAYMENT_CANCEL" ? "refunded_immediate_expiry" : `subscription_finished_at_${endsAt.toISOString().slice(0, 10)}`; }
    }
    else if (type === "MEMBERSHIP_PAYMENT" && subtype === "SUBSCRIPTION_RENEWAL_FAILED") {
      // 카드 승인 실패: 아직 차단하지 않는다 (앱의 2일 유예 + 운영자 확인). 기록만.
      applyNote = `renewal_failed_logged (${payment?.failedReason || "no_reason"})`;
    }
    else {
      applyNote = `skipped (type=${type}, subtype=${subtype || "none"})`;
    }
  } catch (e: any) {
    applyNote = "exception: " + (e?.message || String(e));
  }

  logRow.applied = applied;
  logRow.apply_note = applyNote;
  await supabase.from("latpeed_events").insert(logRow).then(() => {}, () => {});
  return jsonResponse({ ok: true, applied, note: applyNote, eventId: eventId || null });
});
