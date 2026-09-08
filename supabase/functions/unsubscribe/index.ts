// ============================================================
// 1일1비, 이메일 수신거부 (링크 한 번)
// GET /unsubscribe?e=<이메일>&t=<토큰>  → 토큰이 맞으면 email_opt_out 에 기록하고 안내 페이지를 보여준다.
// 배포: supabase functions deploy unsubscribe --no-verify-jwt
// Secret: CRON_SECRET (토큰 계산에 재사용), SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (자동)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { unsubToken } from "../_shared/unsub.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function page(title: string, body: string, ok = true) {
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#F7F2E8;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#2A1F14}
.card{max-width:440px;margin:60px auto;background:#fff;border:1px solid #E8DFCB;border-radius:12px;padding:32px 28px;line-height:1.7}
h1{font-size:20px;margin:0 0 10px}p{margin:8px 0;font-size:15px}a{color:#D85A2A}</style></head>
<body><div class="card"><h1>${ok ? "✅" : "⚠️"} ${title}</h1>${body}<p style="font-size:13px;color:#8A7A66;margin-top:18px">1일1비 · 문의 youbuddy.co@gmail.com</p></div></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const e = String(url.searchParams.get("e") || "").trim().toLowerCase();
  const t = String(url.searchParams.get("t") || "").trim();
  if (!e || !t) return page("주소가 완전하지 않아요", "<p>메일에 있는 수신거부 링크를 그대로 눌러주세요.</p>", false);
  const want = await unsubToken(e);
  if (t !== want) return page("링크를 확인할 수 없어요", "<p>오래된 링크이거나 주소가 바뀐 것 같아요. 메일에 회신 주시면 바로 처리해드릴게요.</p>", false);
  const { error } = await sb.from("email_opt_out").upsert({ email: e, at: new Date().toISOString(), source: "link" }, { onConflict: "email" });
  if (error) return page("잠깐 문제가 있었어요", "<p>잠시 후 다시 눌러주시거나 메일에 회신 주세요.</p>", false);
  return page("수신거부가 완료됐어요", `<p><b>${e}</b> 주소로는 이제 안내 메일을 보내지 않아요.</p><p>학습 중이시라면 앱의 출근 알림(푸시·카톡)은 사원증/인사 &gt; 설정에서 따로 관리돼요.</p>`);
});
