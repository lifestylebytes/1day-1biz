// 웹 푸시 발송 (PWA 알림)
// push_subscriptions 테이블의 구독들에게 Web Push를 보낸다.
// body: { title?, body?, url?, email? }  email 주면 그 사람에게만, 없으면 전체.
// 내부 테스트: 나만 구독돼있으니 전체로 보내도 나한테만 옴.
//
// 필요한 Secret:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:...)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (자동 주입됨)
//
// 배포: supabase functions deploy push-send --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// em-dash 안전: 본문에 들어갈 수 있는 대시 정리
const clean = (s: string) => String(s || "").replace(/[\u2014\u2013]/g, ", ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const b = await req.json().catch(() => ({}));
    const title = clean(b?.title || "1일1비");
    const message = clean(b?.body || "오늘의 단어가 도착했어요!");
    const url = String(b?.url || "./index.html");
    const targetEmail = b?.email ? String(b.email).toLowerCase().trim() : null;

    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:youbuddy.co@gmail.com";
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ ok: false, error: "VAPID 키가 설정되지 않았어요 (Secret 확인)." }), {
        status: 500, headers: { ...cors, "content-type": "application/json" },
      });
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let q = supa.from("push_subscriptions").select("endpoint, subscription, email");
    if (targetEmail) q = q.eq("email", targetEmail);
    const { data: subs, error } = await q;
    if (error) throw error;

    const payload = JSON.stringify({ title, body: message, url });
    let sent = 0, removed = 0;
    const errors: string[] = [];

    for (const row of subs || []) {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        // 410 Gone / 404 = 만료·삭제된 구독, 정리
        if (code === 410 || code === 404) {
          await supa.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
          removed++;
        } else {
          errors.push(String(code || "") + " " + String(e?.message || e));
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true, sent, removed, total: (subs || []).length,
      errors: errors.slice(0, 5),
    }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
