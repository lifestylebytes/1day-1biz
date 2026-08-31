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

  const sentence   = String(b?.sentence || "").slice(0, 500).trim();
  const word       = String(b?.word || "").slice(0, 60);
  const meaning    = String(b?.meaning || "").slice(0, 120);
  const scene      = String(b?.scene || "").slice(0, 300);
  const sample     = String(b?.sampleAnswer || "").slice(0, 300);
  const koSentence = String(b?.koSentence || "").slice(0, 300).trim();
  const promptKo   = String(b?.promptKo || "").slice(0, 300).trim();
  const mentor     = String(b?.mentorName || "사수").slice(0, 20);
  const mode       = String(b?.mode || "").trim();
  const question   = String(b?.question || "").slice(0, 300).trim();  // AI Q&A 자유 질문
  // ── AI Q&A 모드 ──
  // 학습 중인 표현에 대해 신입이 자유롭게 궁금한 걸 물으면, 사수가 짧고 따뜻하게 답한다.
  if (mode === "qa") {
    if (!question || !word) return json({ ok: false, error: "missing" }, 200);
    const qsys = [
      `너는 따뜻하고 명확한 영어 사수야. 신입이 오늘 배운 표현에 대해 궁금한 걸 물었어.`,
      `오늘 표현: "${word}"${meaning ? ` (뜻: ${meaning})` : ""}.${scene ? ` 상황: ${scene}` : ""}`,
      `질문에 한국어로 짧고 쉽게 답해. 꼭 필요하면 영어 예문 하나를 곁들여도 좋아. 장황하지 않게 3~4문장 이내.`,
      `이 표현/비즈니스 영어와 무관한 질문이면, 여기선 표현 학습만 도와드린다고 부드럽게 안내해.`,
      `반드시 JSON으로만: {"answer":"한국어 답변(3~4문장 이내)","exampleEn":"도움되는 영어 예문 하나 또는 빈 문자열","exampleKo":"그 예문의 한국어 뜻 또는 빈 문자열","ok":true}`,
      `규칙: 따뜻한 존댓말. em-dash(U+2014) 절대 금지(쉼표나 마침표로).`,
    ].join("\n");
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL, temperature: 0.5, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: qsys },
            { role: "user", content: `신입의 질문: "${question}"` },
          ],
        }),
      });
      if (!r.ok) return json({ ok: false, error: "openai_" + r.status }, 200);
      const d = await r.json();
      let qa: any = {};
      try { qa = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch { qa = {}; }
      if (!qa.answer) return json({ ok: false, error: "empty" }, 200);
      return json({ ok: true, qa });
    } catch (e) {
      return json({ ok: false, error: "exception" }, 200);
    }
  }

  if (!sentence || !word) return json({ ok: false, error: "missing" }, 200);

  // ── 업무일지 회고 피드백 모드 ──
  // 신입이 "어디서 써먹을지" 한국어 회고를 쓰면, 그 상황에 단어가 어울리는지 판단 + 추천 영어 문장.
  if (mode === "journal") {
    const jsys = [
      `너는 따뜻한 영어 버디야. 신입이 오늘 배운 단어를 "어디서 써먹을지" 한국어로 한 줄 회고를 썼어.`,
      `그 회고 속 상황에 이 단어가 어울리는지 친구처럼 판단하고(좋다/애매하다/잘 안 맞는다), 그 상황에서 실제로 쓸 수 있는 자연스러운 영어 문장 하나를 추천해.`,
      `오늘 단어: "${word}" (뜻: ${meaning}).`,
      `반드시 JSON으로만: {"fit":"good|ok|bad","fitMsg":"그 상황에 쓰기 어떤지 한 줄(예: 딱 좋은 상황이에요 / 살짝 애매해요 / 그 상황엔 잘 안 맞아요)","reason":"왜 그런지 한 줄","recommended":"그 상황에서 쓸 영어 문장 하나","recommendedKo":"그 문장의 한국어 뜻","ok":true}`,
      `규칙: 따뜻한 반말 버디 톤. em-dash(U+2014) 문자 절대 금지(쉼표나 마침표로). fitMsg, reason, recommendedKo는 한국어, recommended만 영어.`,
    ].join("\n");
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: jsys },
            { role: "user", content: `신입의 회고: "${sentence}"` },
          ],
          temperature: 0.6, max_tokens: 320, response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) return json({ ok: false, error: "openai_" + r.status }, 200);
      const data = await r.json();
      let parsed: any = {};
      try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); } catch { parsed = {}; }
      const jclean = (s: any) => String(s || "").replace(/[\u2014\u2013]/g, ", ").trim();
      const journal = {
        fit: ["good", "ok", "bad"].includes(parsed.fit) ? parsed.fit : "ok",
        fitMsg: jclean(parsed.fitMsg).slice(0, 200),
        reason: jclean(parsed.reason).slice(0, 300),
        recommended: jclean(parsed.recommended).slice(0, 300),
        recommendedKo: jclean(parsed.recommendedKo).slice(0, 200),
      };
      if (!journal.fitMsg && !journal.recommended) return json({ ok: false, error: "empty" }, 200);
      return json({ ok: true, journal });
    } catch (_e) {
      return json({ ok: false, error: "exception" }, 200);
    }
  }

  const system = [
    `너는 한국 외국계 회사의 따뜻하지만 디테일에 깐깐한 사수 "${mentor}"야.`,
    `신입이 비즈니스 영어 한 문장을 제출하면, 진짜 네이티브 동료처럼 깔끔하고 논리적으로 코칭해.`,
    `목표 톤: 약간 캐주얼한 비즈니스 영어(사내 슬랙, 동료 대화). 너무 딱딱하지도 너무 가볍지도 않게.`,
    `핵심 원칙: 문장이 문법적으로 맞아도 반드시 더 자연스러운 네이티브 버전을 제시한다. "이대로 좋아요"로만 끝내지 마. 매일 "오 이건 몰랐는데" 하나를 주는 게 목표.`,
    koSentence ? `★ 가장 중요: 이번 미션의 의도(한국어 뜻)는 "${koSentence}" 이다. corrected는 반드시 이 한국어 뜻 "전체"를 자연스러운 영어로 옮긴 문장이어야 한다(오늘 단어 살려서). 신입 문장을 이 의도와 비교해서 채점해.` : ``,
    koSentence ? `의도와 비교 규칙: (a) 신입이 딴 얘기를 썼거나 단어만 끼워넣었으면 grammar에서 "의도한 뜻과 달라요"라고 분명히 짚고 ok=false. (b) 의도의 일부만 담기고 핵심 내용이 빠졌으면(예: "주간으로 진행 상황 공유" 같은 부분이 없으면) nuance에서 "빠진 내용: ~"이라고 알려주고, corrected에는 빠진 내용까지 채워 넣어. (c) 오늘 단어가 들어갔다고 의미가 부족한데 통과시키지 마.` : ``,
    promptKo ? `미션 안내(참고): ${promptKo}` : ``,
    `아래 필드를 채워. corrected와 segments의 text만 영어, 나머지 설명은 한국어로, 짧고 명확하게(각 1~2문장).`,
    `1) corrected: 신입 문장을 네이티브 동료가 쓸 가장 자연스러운 "한 문장"으로 다시 쓴 영어 문장. 오늘 단어("${word}")는 반드시 살려. 영어 문장 하나만, 앞뒤 설명이나 따옴표 없이.`,
    `2) segments: corrected를 단어/구 단위로 쪼갠 배열. 각 원소는 {text, type, cat}. type은 keep(원문 그대로 유지), removed(원문에서 빠지거나 바뀐 부분), added(네이티브 버전에서 새로 쓰인 부분). cat은 removed/added에만 붙이고 grammar, vocab, nuance, tone 중 하나(왜 바꿨는지 기준). keep과 added를 순서대로 이으면 corrected 문장이 정확히 나와야 해. 바뀐 부분은 removed 바로 뒤에 added를 둬서 "원래 X였는데 Y로" 대조가 되게. 고칠 게 전혀 없으면 전부 keep 한 덩어리로.`,
    `   예: 원문 "I'll take ownership and share you the progress" 의 segments = [{"text":"I'll take ownership and ","type":"keep"},{"text":"share you the progress","type":"removed","cat":"grammar"},{"text":"share the progress with you","type":"added","cat":"grammar"}]`,
    `3) grammar: corrected에서 무엇을 왜 바꿨는지 문법·구조 관점 한 줄. 고칠 문법이 없으면 "문법은 정확해요"로 시작해 어순·자연스러움 관점 한 줄.`,
    `4) vocab: 어휘 추천을 객체로. {from: 원래 단어나 표현(없으면 ""), to: 더 native한 추천 단어나 표현, reason: 왜 더 나은지 한국어 한 줄, similar: 비슷하게 쓸 수 있는 표현 2~4개 배열}. to, from, similar 안의 표현만 영어. reason은 반드시 한국어.`,
    `5) nuance: 이 표현을 언제, 어떤 톤으로 쓰면 좋은지 뉘앙스 한 줄(한국어).`,
    `6) vsSample: 신입 문장이 아래 모범답안과 핵심적으로 뭐가 다른지 1~2문장(한국어). 모범답안이 없으면 빈 문자열 "".`,
    `7) praise: 사수가 건네는 따뜻한 칭찬 한마디(한국어).`,
    `언어 규칙: 설명 필드(grammar, vocab.reason, nuance, vsSample, praise)는 전부 한국어로 써. 영어 문장으로 설명하지 마. 영어는 corrected, segments의 text, vocab의 to/from/similar 표현에만 쓴다.`,
    `기호 규칙: 어떤 필드에도 em-dash(U+2014)나 en-dash(U+2013) 문자를 절대 쓰지 마. 대신 쉼표나 콜론으로. 비난조 금지. 친근한 존댓말 사수 말투("~네요","~해봐요").`,
    `오늘의 학습 단어: "${word}" (뜻: ${meaning}). 상황: ${scene}`,
    sample ? `참고용 모범답안: "${sample}"` : ``,
    `반드시 아래 JSON 형식으로만: {"corrected":"...","segments":[{"text":"...","type":"keep|removed|added","cat":"grammar|vocab|nuance|tone"}],"grammar":"...","vocab":{"from":"...","to":"...","reason":"...","similar":["...","..."]},"nuance":"...","vsSample":"...","praise":"...","ok":true}`,
    `ok는 문장이 단어를 적절히 살리고 톤이 맞으면 true, 크게 어긋나면 false. (ok와 무관하게 corrected에는 항상 더 나은 버전을 담아.)`,
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
        max_tokens: 700,
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
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const clean = (s: any) => String(s || "").replace(/[\u2014\u2013]/g, ", ").trim();
    const segments = Array.isArray(parsed.segments) ? parsed.segments.slice(0, 40).map((x: any) => ({
      text: clean(x?.text).slice(0, 200),
      type: ["keep", "removed", "added"].includes(x?.type) ? x.type : "keep",
      ...(["grammar", "vocab", "nuance", "tone"].includes(x?.cat) ? { cat: x.cat } : {}),
    })).filter((x: any) => x.text) : [];
    let vocab: any;
    if (parsed.vocab && typeof parsed.vocab === "object" && !Array.isArray(parsed.vocab)) {
      vocab = {
        from:    clean(parsed.vocab.from).slice(0, 60),
        to:      clean(parsed.vocab.to).slice(0, 60),
        reason:  clean(parsed.vocab.reason).slice(0, 200),
        similar: Array.isArray(parsed.vocab.similar) ? parsed.vocab.similar.slice(0, 5).map((x: any) => clean(x).slice(0, 60)).filter(Boolean) : [],
      };
    } else {
      vocab = clean(parsed.vocab).slice(0, 300);
    }
    const fb = {
      corrected: clean(parsed.corrected).slice(0, 300),
      segments,
      grammar:   clean(parsed.grammar).slice(0, 300),
      vocab,
      nuance:    clean(parsed.nuance).slice(0, 300),
      vsSample:  clean(parsed.vsSample).slice(0, 300),
      praise:    clean(parsed.praise).slice(0, 200),
    };
    if (!fb.corrected && !fb.grammar && !fb.nuance) return json({ ok: false, error: "empty" }, 200);
    return json({ ok: true, fb, good: parsed.ok !== false });
  } catch (e: any) {
    return json({ ok: false, error: "exception", detail: String(e?.message || e).slice(0, 200) }, 200);
  }
});
