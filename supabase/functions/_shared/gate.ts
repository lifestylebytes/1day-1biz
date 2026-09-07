// ============================================================
// Edge Function 공용 게이트 (2026-09-07 보안 점검 YB-SEC-002)
//
// 1) cronGate(req): 크론/운영자만 부르는 함수용.
//    Secret CRON_SECRET 이 없으면 무조건 거부(fail-closed).
//    호출 쪽은 헤더 `x-cron-secret: <값>` 또는 URL `?key=<값>` 로 보낸다.
//    (Supabase Cron Jobs 의 HTTP 요청 헤더에 x-cron-secret 추가.)
//
// 2) tokenGate(req, envName): 외부 웹훅용. 서명이 없는 서비스(래피드)는
//    웹훅 URL 뒤에 `?token=<값>` 을 붙여 등록하고 여기서 비교한다.
//
// 3) originOk(req): 브라우저에서 부르는 함수용. Origin 화이트리스트.
//    curl 은 Origin 을 위조할 수 있으니 이것만으로 방어가 아니라
//    일일 상한(rate cap)과 같이 쓴다.
// ============================================================

function safeEq(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function cronGate(req: Request): Response | null {
  const secret = Deno.env.get("CRON_SECRET") || "";
  const given = req.headers.get("x-cron-secret")
    || new URL(req.url).searchParams.get("key")
    || "";
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: "cron_secret_not_set" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }
  if (!safeEq(given, secret)) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export function tokenGate(req: Request, envName: string): Response | null {
  const secret = Deno.env.get(envName) || "";
  const given = new URL(req.url).searchParams.get("token")
    || req.headers.get("x-webhook-token")
    || "";
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: envName + "_not_set" }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }
  if (!safeEq(given, secret)) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

const ALLOWED_ORIGINS = [
  "https://1day-1biz.youbuddy.co.kr",
  "https://youbuddy.co.kr",
  "https://www.youbuddy.co.kr",
  "https://lifestylebytes.github.io",
];

export function originOk(req: Request): boolean {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const o = req.headers.get("origin") || "";
  if (!o) return false;
  if (ALLOWED_ORIGINS.includes(o) || extra.includes(o)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;  // 로컬 개발
  return false;
}
