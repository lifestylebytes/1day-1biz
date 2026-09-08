// ============================================================
// 이메일 수신거부 (2026-09-07)
// 링크 한 번이면 끝: <SUPABASE_URL>/functions/v1/unsubscribe?e=<이메일>&t=<토큰>
// 토큰 = sha256(이메일 소문자 + ":" + CRON_SECRET) 앞 24자. 비밀은 서버에만 있어서 남의 메일을 대신 끊을 수 없다.
// 발송 함수는 보내기 전에 isOptedOut() 로 거르고, 본문 하단에 unsubFooter() 를 붙인다.
// ============================================================
const SECRET = Deno.env.get("CRON_SECRET") || "";
const SB_URL = Deno.env.get("SUPABASE_URL") || "";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function unsubToken(email: string): Promise<string> {
  return (await sha256Hex(String(email || "").trim().toLowerCase() + ":" + SECRET)).slice(0, 24);
}

export async function unsubLink(email: string): Promise<string> {
  const e = String(email || "").trim().toLowerCase();
  return `${SB_URL}/functions/v1/unsubscribe?e=${encodeURIComponent(e)}&t=${await unsubToken(e)}`;
}

export async function unsubFooter(email: string): Promise<string> {
  const link = await unsubLink(email);
  return `<p style="font-size:12px;color:#A8997F;margin-top:18px">이 메일은 1일1비(유버디)에서 보냈어요. 더 받고 싶지 않으시면 <a href="${link}" style="color:#A8997F">여기서 한 번에 수신거부</a>할 수 있어요. 문의: youbuddy.co@gmail.com</p>`;
}

// deno-lint-ignore no-explicit-any
export async function isOptedOut(sb: any, email: string): Promise<boolean> {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return false;
  try {
    const { data } = await sb.from("email_opt_out").select("email").eq("email", e).limit(1);
    return !!(data && data.length);
  } catch (_) { return false; }
}
