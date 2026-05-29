// ============================================================
// 1일1비, 래피드 웹훅 수신 Edge Function
//
// 래피드 → 이 함수 URL → Supabase users 테이블 자동 갱신
//
// 처리 룰:
//   MEMBERSHIP_PAYMENT + SUCCESS  : 결제일 + 31일까지 access 부여 (월간 구독 가정)
//   MEMBERSHIP_PAYMENT + CANCEL   : 즉시 만료 (환불)
//   NORMAL_PAYMENT (단건)         : 로그만, 멤버십 게이트와 무관
//
// 모든 이벤트는 latpeed_events 테이블에 원본 그대로 기록 (감사·디버깅).
// 5초 안에 응답하기 위해 DB write는 best-effort (실패해도 200 반환).
//
// 배포:
//   supabase functions deploy latpeed-webhook --no-verify-jwt
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MEMBERSHIP_DAYS = parseInt(Deno.env.get("MEMBERSHIP_DAYS") || "31", 10);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // 래피드는 POST만 보냄
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse({ ok: false, error: "invalid_json" }, 200);
  }

  const type    = body?.type as string | undefined;
  const payment = body?.payment as Record<string, any> | undefined;

  if (!payment || !payment.email) {
    // 형식이 안 맞아도 래피드한테는 2XX 줘서 무한 재시도 방지.
    await supabase.from("latpeed_events").insert({
      raw: body, applied: false, apply_note: "missing_payment_or_email",
    });
    return jsonResponse({ ok: true, action: "logged_invalid" });
  }

  const email    = String(payment.email).toLowerCase().trim();
  const status   = String(payment.status || "").toUpperCase();
  const amount   = typeof payment.amount === "number" ? payment.amount : null;
  const optText  = payment.option ? String(payment.option) : null;
  const eventAt  = payment.date ? new Date(payment.date) : new Date();

  // 1) 로그 먼저 (이벤트 누락 방지)
  const logRow = {
    email,
    type: type || null,
    status: status || null,
    amount,
    event_at: eventAt.toISOString(),
    option_text: optText,
    raw: body,
    applied: false as boolean,
    apply_note: null as string | null,
  };

  let applied = false;
  let applyNote: string | null = null;

  try {
    // 2) 멤버십 결제 성공 → 31일 연장
    //    + 재구독(만료 후 재결제) 케이스면 공백 일수만큼 signup_date를 뒤로 밀어서
    //      Day 진도가 끊긴 시점부터 다시 이어지게 함.
    if (type === "MEMBERSHIP_PAYMENT" && status === "SUCCESS") {
      // 기존 상태 조회 (gap 계산용)
      const { data: existing } = await supabase
        .from("users")
        .select("email, signup_date, membership_ends_at")
        .eq("email", email)
        .maybeSingle();

      let gapDays = 0;
      const updates: Record<string, unknown> = {
        cohort: "member",
        membership_cancel_reason: null,
      };

      if (existing && existing.membership_ends_at && existing.signup_date) {
        const prevEndsAt = new Date(existing.membership_ends_at);
        // 이전 ends_at이 이번 결제 시점보다 과거면 = 만료 후 재결제
        if (prevEndsAt < eventAt) {
          const msGap = eventAt.getTime() - prevEndsAt.getTime();
          gapDays = Math.floor(msGap / (1000 * 60 * 60 * 24));
          if (gapDays > 0) {
            const newSignupDate = new Date(existing.signup_date);
            newSignupDate.setDate(newSignupDate.getDate() + gapDays);
            updates.signup_date = newSignupDate.toISOString();
          }
        }
      }

      const endsAt = new Date(eventAt);
      endsAt.setDate(endsAt.getDate() + MEMBERSHIP_DAYS);
      updates.membership_ends_at = endsAt.toISOString();

      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("email", email)
        .select("email");

      if (error) {
        applyNote = "update_error: " + error.message;
      } else if (!data || data.length === 0) {
        applyNote = "user_not_found_yet (이메일이 아직 1day-1biz 가입 전. 가입하면 자동 노출.)";
      } else {
        applied = true;
        applyNote = gapDays > 0
          ? `extended_until_${endsAt.toISOString()}_resume_after_${gapDays}d_gap`
          : `extended_until_${endsAt.toISOString()}`;
      }
    }
    // 3) 멤버십 환불 → 즉시 만료
    else if (type === "MEMBERSHIP_PAYMENT" && status === "CANCEL") {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("users")
        .update({
          membership_ends_at: now,
          membership_cancel_reason: payment.canceledReason || "latpeed_refund",
        })
        .eq("email", email)
        .select("email");

      if (error) {
        applyNote = "update_error: " + error.message;
      } else if (!data || data.length === 0) {
        applyNote = "user_not_found";
      } else {
        applied = true;
        applyNote = "refunded_immediate_expiry";
      }
    }
    // 4) 그 외 (NORMAL_PAYMENT 등) → 로그만
    else {
      applyNote = `skipped (type=${type}, status=${status})`;
    }
  } catch (e: any) {
    applyNote = "exception: " + (e?.message || String(e));
  }

  // 5) 최종 로그 저장 (apply 결과 포함)
  logRow.applied = applied;
  logRow.apply_note = applyNote;
  await supabase.from("latpeed_events").insert(logRow).then(() => {}).catch(() => {});

  return jsonResponse({ ok: true, applied, note: applyNote });
});
