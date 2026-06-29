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

// \uc790\ub3d9(cron) \ubc1c\uc1a1 \uc2dc \ub79c\ub364\uc73c\ub85c \uace0\ub974\ub294 \ubb38\uad6c \ud480. body \uc5c6\uc774 \ud638\ucd9c\ud558\uba74 \ub9e4\uc77c \ub2e4\ub978 \uba58\ud2b8.
const PUSH_POOL = [
  { title: "\ud83c\udf19 \uc624\ub298 \ucd9c\uadfc\ud558\uc168\uc5b4\uc694?", body: "\uc790\uae30 \uc804\uc5d0 5\ubd84\uc774\uba74 \ucda9\ubd84\ud574\uc694. \uc624\ub298\uc758 \ub2e8\uc5b4 \ud558\ub098 \ucc59\uaca8\uac00\uc694!" },
  { title: "\ud83d\udccb \ucc45\uc0c1\uc5d0 \ub2e8\uc5b4 \ub450\uace0 \uac14\uc5b4\uc694", body: "\uc0ac\uc218\uac00 \uc624\ub298\uc758 \ud45c\ud604 \uc62c\ub824\ub1a8\uc5b4\uc694. 5\ubd84\ub9cc \ucd9c\uadfc!" },
  { title: "\ud83d\udd25 \uc2a4\ud2b8\ub9ad \uc9c0\ud0a4\ub7ec \uac00\uc694", body: "\uc624\ub298 \ucd9c\uadfc \ub3c4\uc7a5 \uc544\uc9c1\uc774\uc5d0\uc694. \ud55c \ud45c\ud604\uc774\uba74 \ub05d\ub098\uc694." },
  { title: "\u2615 \ud1f4\uadfc \uc804 5\ubd84 \ucd9c\uadfc", body: "\uc624\ub298\uc758 \ube44\uc988\ub2c8\uc2a4 \ud45c\ud604 \ud558\ub098, \uac00\ubccd\uac8c \ucc59\uaca8\uac00\uc694." },
  { title: "\ud83d\udcac \uc720\ubc84\ub514\uc608\uc694", body: "\uc624\ub298 \ubabb \ub4e4\uc5b4\uc624\uc168\uc8e0? 5\ubd84\uc774\uba74 \ub2e8\uc5b4 \ud558\ub098 \uc678\uc6cc\uc694 :)" },
  { title: "\ud83d\udce8 \uc624\ub298\uc758 \ub2e8\uc5b4 \ub3c4\ucc29", body: "\uc678\uad6d\uacc4 \ud68c\uc758\uc5d0\uc11c \uc9c4\uc9dc \uc790\uc8fc \uc4f0\ub294 \ud45c\ud604\uc774\uc5d0\uc694. \ubcf4\ub7ec \uac00\uc694." },
  { title: "\ud83c\udfe2 9\uc2dc\uae4c\uc9c0 \ucd9c\uadfc \ub3c4\uc7a5", body: "\ub531 \ud55c \ub2e8\uc5b4, \uc624\ub298\ub3c4 \uc678\uad6d\uacc4\ub85c \ucd9c\uadfc\ud574\uc694." },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const b = await req.json().catch(() => ({}));
    // 수동(title/body 지정) → 그대로. 자동(cron, body 없음) → 풀에서 랜덤 한 개.
    const _manual = !!(b && (b.title || b.body));
    const _pick = PUSH_POOL[Math.floor(Math.random() * PUSH_POOL.length)];
    const title = clean(b?.title || (_manual ? "1일1비" : _pick.title));
    const message = clean(b?.body || (_manual ? "오늘의 단어가 도착했어요!" : _pick.body));
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
