// Lemon Squeezy 웹훅 → 멤버십(entitlement) 부여
// 결제/구독 성공 시 users 테이블에 cohort='member' + membership_ends_at 세팅 (이메일 기준).
// 머천트 오브 레코드(LS)가 결제·세금·정산을 처리하고, 우리는 "권한"만 켠다.
//
// 필요한 Secret:
//   LEMONSQUEEZY_WEBHOOK_SECRET  (LS 대시보드 Settings > Webhooks 에서 만든 signing secret)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (자동 주입)
//
// 배포: supabase functions deploy lemonsqueezy-webhook --no-verify-jwt
// LS Webhook URL: https://<프로젝트ref>.supabase.co/functions/v1/lemonsqueezy-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-signature, x-event-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// HMAC-SHA256(raw body, secret) 을 hex로 만들어 X-Signature와 상수시간 비교
async function verifySignature(rawBody: string, signatureHex: string, secret: string): Promise<boolean> {
  try {
    if (!signatureHex) return false;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const macHex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    // 상수시간 비교
    if (macHex.length !== signatureHex.length) return false;
    let diff = 0;
    for (let i = 0; i < macHex.length; i++) diff |= macHex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
    return diff === 0;
  } catch (_) {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: cors });
  }

  try {
    const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET") || "";
    if (!secret) {
      return new Response(JSON.stringify({ ok: false, error: "webhook secret not set" }), {
        status: 500, headers: { ...cors, "content-type": "application/json" },
      });
    }

    const raw = await req.text();
    const sig = req.headers.get("X-Signature") || req.headers.get("x-signature") || "";
    const valid = await verifySignature(raw, sig, secret);
    if (!valid) {
      return new Response(JSON.stringify({ ok: false, error: "invalid signature" }), {
        status: 401, headers: { ...cors, "content-type": "application/json" },
      });
    }

    const body = JSON.parse(raw);
    const eventName: string = body?.meta?.event_name || "";
    const attrs = body?.data?.attributes || {};

    // 이메일: custom_data로 넘긴 우리 가입 이메일을 최우선(가입 메일과 결제 메일이 다를 수 있어서)
    const email = String(
      body?.meta?.custom_data?.email ||
      attrs?.user_email ||
      attrs?.customer_email ||
      "",
    ).toLowerCase().trim();

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 멤버십 켜는 이벤트
    const GRANT = new Set([
      "order_created",
      "subscription_created",
      "subscription_updated",
      "subscription_payment_success",
      "subscription_resumed",
    ]);
    // 멤버십 끄는(만료 예약) 이벤트
    const REVOKE = new Set([
      "subscription_expired",
      "subscription_cancelled", // 취소 = 기간 말까지 유지 후 만료 (ends_at 사용)
    ]);

    // 이벤트 원본은 항상 로그 테이블에 적재 (감사/디버깅용, 실패해도 무시)
    try {
      await supa.from("payment_events").insert({
        provider: "lemonsqueezy",
        event_type: eventName,
        email: email || null,
        payload: body,
      });
    } catch (_) {}

    if (!email) {
      // 이메일 못 찾으면 멤버십 못 켬. 200으로 받되 미처리 표시.
      return new Response(JSON.stringify({ ok: true, handled: false, reason: "no email" }), {
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    if (GRANT.has(eventName)) {
      // 구독: renews_at/ends_at 있으면 그 시점까지. 일회성 주문: +1년(테스트).
      let endsAt: string | null = null;
      const renews = attrs?.renews_at || attrs?.ends_at;
      if (renews) {
        endsAt = new Date(renews).toISOString();
      } else {
        const d = new Date(); d.setFullYear(d.getFullYear() + 1);
        endsAt = d.toISOString();
      }
      // 결제 상태 확인 (order는 status='paid'일 때만)
      const status = String(attrs?.status || "").toLowerCase();
      const orderUnpaid = eventName === "order_created" && status && status !== "paid";
      if (!orderUnpaid) {
        const { error } = await supa.from("users").update({
          cohort: "member",
          membership_ends_at: endsAt,
          membership_cancel_at: null,
          membership_cancel_reason: null,
          last_active: new Date().toISOString(),
        }).ilike("email", email);
        if (error) throw error;
        return new Response(JSON.stringify({ ok: true, handled: true, action: "grant", email, endsAt }), {
          headers: { ...cors, "content-type": "application/json" },
        });
      }
    }

    if (REVOKE.has(eventName)) {
      // 취소: 기간 말일(ends_at)까지 유지 후 만료. 만료 이벤트: 즉시 만료.
      let endsAt: string;
      if (eventName === "subscription_expired") {
        endsAt = new Date().toISOString();
      } else {
        endsAt = attrs?.ends_at ? new Date(attrs.ends_at).toISOString() : new Date().toISOString();
      }
      const { error } = await supa.from("users").update({
        membership_ends_at: endsAt,
        membership_cancel_reason: "lemonsqueezy_" + eventName,
        last_active: new Date().toISOString(),
      }).ilike("email", email);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, handled: true, action: "revoke", email, endsAt }), {
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    // 그 외 이벤트는 로그만 남기고 통과
    return new Response(JSON.stringify({ ok: true, handled: false, event: eventName }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message || e) }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
