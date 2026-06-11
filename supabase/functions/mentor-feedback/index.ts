// ============================================================
// 1일1비, AI 사수 피드백 Edge Function
//
// 앱이 사용자 영작 + 시나리오를 보내면, 사수(김주연 대리) 말투로
// 그 문장에 대한 개인 맞춤 코멘트 한 줄을 돌려줌.
// 키는 서버(Supabase Secret)에만. 프론트엔 절대 노출 안 됨.
//
// 배포:
//   supabase functions deploy mentor-feedback --no-verify-jwt
// 또는 대시보드 Edge Functions에서 코드 붙여넣기.
//
// Secret (Dashboard → Edge Functions → Settings → Secrets):
//   OPENAI_API_KEY   (platform.openai.com 에서 발급)
//
// 안전장치: 키 없거나 호출 실패해도 200 + {ok:false} 반환.
//          앱은 이 경우 기존 규칙 기반 피드백만 보여줌 (폴백).
// ============================================================

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";  // 싸고 빠름

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 200);
  if (!OPENAI_API_KEY) return json({ ok: false, error: "no_key" }, 200);

  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 200); }

  const sentence = String(b?.sentence || "").slice(0, 500).trim();
  const word     = String(b?.word || "").slice(0, 60);
  const meaning  = String(b?.meaning || "").slice(0, 120);
  const scene    = String(b?.scene || "").slice(0, 300);
  const sample   = String(b?.sampleAnswer || "").slice(0, 300);
  const mentor   = String(b?.mentorName || "사수").slice(0, 20);
  if (!sentence || !word) return json({ ok: false, error: "missing" }, 200);

  const system = [
    `너는 한국 외국계 회사의 따뜻하지만 디테일에 깐깐한 사수 "${mentor}"야.`,
    `신입이 비즈니스 영어 한 문장을 제출하면, 그 문장을 읽고 한국어로 짧게 코칭해.`,
    `규칙:`,
    `- 2~3문장, 60자 내외로 짧게. 사수가 슬랙으로 툭 던지듯 자연스럽게.`,
    `- 먼저 잘한 점 한 가지를 구체적으로 짚고(그 사람 문장에서 실제 단어를 인용), 그 다음 더 자연스럽게 바꿀 점이 있으면 한 가지만.`,
    `- 칭찬만 하지 말고, 고칠 게 있으면 솔직하게. 단 비난조 금지. 격려 톤.`,
    `- 영어 교정 예시는 짧게 따옴표로.`,
    `- 줄표(long dash) 문자는 절대 쓰지 마. 쉼표나 마침표로 대체.`,
    `- 반말 아닌 친근한 존댓말 살짝 섞인 사수 말투("~네요", "~해봐요").`,
    `오늘의 학습 단어: "${word}" (뜻: ${meaning}). 상황: ${scene}`,
    sample ? `참고용 모범답안: "${sample}"` : ``,
    `반드시 아래 JSON 형식으로만 답해: {"comment":"코멘트 본문","ok":true}`,
    `ok는 문장이 단어를 적절히 살리고 톤이 맞으면 true, 크게 어긋나면 false.`,
  ].join("\n");

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `신입이 제출한 문장: "${sentence}"` },
        ],
        temperature: 0.6,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ ok: false, error: "openai_" + r.status, detail: t.slice(0, 200) }, 200);
    }
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { comment: raw }; }
    const comment = String(parsed.comment || "").slice(0, 400);
    if (!comment) return json({ ok: false, error: "empty" }, 200);
    return json({ ok: true, comment, good: parsed.ok !== false });
  } catch (e: any) {
    return json({ ok: false, error: "exception", detail: String(e?.message || e).slice(0, 200) }, 200);
  }
});
