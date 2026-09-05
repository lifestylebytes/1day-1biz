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
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";  // 첨삭·Q&A: 싸고 빠름
const MODEL_RICH = Deno.env.get("OPENAI_MODEL_RICH") || "gpt-4.1";  // 리포트·코칭·상담: 한 장짜리 리포트는 큰 모델로 (secret OPENAI_MODEL_RICH 로 바꿈)

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
  const prevCorrected = String(b?.prevCorrected || "").slice(0, 300).trim();  // 직전에 사수가 추천했던 문장 (재제출 시 왔다갔다 방지)
  // ── AI 성장 리포트 모드 (2026-09-05, 개발 뷰 프로토타입) ──
  // 클라이언트가 압축본(단어 목록, 최근 문장 30개, 저널 10개, 질문 10개, 아는 표현, 연속 출근)만 보낸다. 원문 노트는 안 보낸다.
  if (mode === "report") {
    const rp = (b && typeof b.report === "object" && b.report) || null;
    if (!rp) return json({ ok: false, error: "missing" }, 200);
    const clip = (arr: any, n: number) => Array.isArray(arr) ? arr.slice(0, n) : [];
    const compact = {
      name: String(rp.name || "").slice(0, 30), day: Number(rp.day) || 1, streak: Number(rp.streak) || 0,
      words: clip(rp.words, 90).map((w: any) => String(w).slice(0, 40)),
      known: clip(rp.known, 90).map((w: any) => String(w).slice(0, 40)),
      sentences: clip(rp.sentences, 30).map((x: any) => ({ day: Number(x.day) || 0, word: String(x.word || "").slice(0, 40), text: String(x.text || "").slice(0, 160), fixed: !!x.fixed })),
      journals: clip(rp.journals, 10).map((x: any) => ({ day: Number(x.day) || 0, text: String(x.text || "").slice(0, 160) })),
      questions: clip(rp.questions, 10).map((q: any) => String(q).slice(0, 80)),
      savedCount: Number(rp.savedCount) || 0, fixedCount: Number(rp.fixedCount) || 0,
      profile: rp.profile && typeof rp.profile === "object" ? { job: String(rp.profile.job || "").slice(0, 60), industry: String(rp.profile.industry || "").slice(0, 40), years: String(rp.profile.years || "").slice(0, 60), situ: clip(rp.profile.situ, 8).map((x: any) => String(x).slice(0, 20)), who: clip(rp.profile.who, 6).map((x: any) => String(x).slice(0, 30)), goal: String(rp.profile.goal || "").slice(0, 120), diag: clip(rp.profile.diag?.english?.labels, 8).map((x: any) => String(x.q || "").slice(0, 60) + " → " + String(x.a || "").slice(0, 120)) } : null,
      areas: clip(rp.areas, 6).map((a: any) => ({ name: String(a.name || "").slice(0, 20), learned: Number(a.learned) || 0, used: Number(a.used) || 0, words: clip(a.words, 12).map((w: any) => String(w).slice(0, 40)) })),
    };
    const rsys = [
      `너는 따뜻하고 구체적인 영어 사수(${mentor})야. 신입 ${compact.name || ""}의 ${compact.day}일차까지 학습 기록 압축본을 읽고 짧은 성장 리포트를 써.`,
      `기록: 배운 표현 ${compact.words.length}개, 직접 쓴 문장 ${compact.sentences.length}개(사수가 고친 것 ${compact.fixedCount}개), 저널 ${compact.journals.length}개, 물어본 질문 ${compact.questions.length}개, 이미 알던 표현 ${compact.known.length}개, 연속 출근 ${compact.streak}일.`,
      compact.profile ? `신입의 일: ${compact.profile.job}${compact.profile.industry ? " / " + compact.profile.industry : ""}${compact.profile.years ? " / " + compact.profile.years : ""}. 영어 쓰는 상황: ${(compact.profile.situ || []).join(", ") || "미입력"}. 상대: ${(compact.profile.who || []).join(", ") || "미입력"}. 목표: ${compact.profile.goal || "미입력"}.${(compact.profile.diag || []).length ? " 영어 진단 답: " + compact.profile.diag.join(" / ") + "." : ""} 이 직종과 상황에서 실제로 통하는 조언으로 써.` : "",
      `영역별(회의/메일/관계/보고/협상) 배운 표현 대비 직접 써본 표현 수는 areas 에 있다. 비어 있는 영역을 짚어줘.`,
      `반드시 기록에 실제로 있는 표현과 문장을 근거로 써. 없는 걸 지어내지 마. 문장 인용은 짧게.`,
      `JSON 으로만: {"headline":"한 줄 총평(25자 안팎, 동사로 끝나는 문장)","strengths":["잘하는 것 2개, 각 한 문장"],"patterns":["반복되는 습관이나 아직 안 써본 표현 2개, 각 한 문장"],"next":["다음 10일 할 것 1~2개, 각 한 문장"],"forYou":["이 직종·상황에 맞춘 조언 1~2개, 실제 쓸 영어 문장 하나 포함"],"oneLiner":"사수가 남기는 응원 한 줄(동사로 끝남)"}`,
      `규칙: 따뜻한 존댓말. 모든 문장은 동사로 끝낸다(명사로 끝나는 조각 문장 금지). em-dash(U+2014) 절대 금지.`,
    ].filter(Boolean).join("\n");
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_RICH, temperature: 0.4, response_format: { type: "json_object" }, max_tokens: 2500,
          messages: [
            { role: "system", content: rsys },
            { role: "user", content: JSON.stringify(compact) },
          ],
        }),
      });
      if (!r.ok) return json({ ok: false, error: "openai_" + r.status }, 200);
      const d = await r.json();
      let report: any = {};
      try { report = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch { report = {}; }
      if (!report.headline) return json({ ok: false, error: "empty" }, 200);
      return json({ ok: true, report, usage: d?.usage || null });
    } catch (e) {
      return json({ ok: false, error: "exception" }, 200);
    }
  }

  // ── 주간 인사이트 모드 (2026-09-05, 표현 사전/개발 뷰) ──
  // 클라이언트가 약한 표현 8개(단어, 뜻, 내 문장, 강도, 영역), 튼튼한 표현 5개, 영역별 강도, 직무 프로필만 보낸다. 주 1회 캐시.
  if (mode === "insight") {
    const ip = (b && typeof b.insight === "object" && b.insight) || null;
    if (!ip) return json({ ok: false, error: "missing" }, 200);
    const clip = (arr: any, n: number) => Array.isArray(arr) ? arr.slice(0, n) : [];
    const compact = {
      name: String(ip.name || "").slice(0, 30), day: Number(ip.day) || 1, week: String(ip.week || "").slice(0, 12),
      reviewedThisWeek: Number(ip.reviewedThisWeek) || 0,
      weak: clip(ip.weak, 8).map((x: any) => ({ word: String(x.word || "").slice(0, 40), meaning: String(x.meaning || "").slice(0, 60), mine: String(x.mine || "").slice(0, 120), strength: Number(x.strength) || 0, area: String(x.area || "").slice(0, 20) })),
      strong: clip(ip.strong, 5).map((w: any) => String(w).slice(0, 40)),
      areas: clip(ip.areas, 6).map((a: any) => ({ name: String(a.name || "").slice(0, 20), learned: Number(a.learned) || 0, used: Number(a.used) || 0, avg: Number(a.avg) || 0 })),
      profile: ip.profile && typeof ip.profile === "object" ? { job: String(ip.profile.job || "").slice(0, 60), industry: String(ip.profile.industry || "").slice(0, 40), situ: clip(ip.profile.situ, 8).map((x: any) => String(x).slice(0, 20)), who: clip(ip.profile.who, 6).map((x: any) => String(x).slice(0, 30)), stuck: String(ip.profile.stuck || "").slice(0, 120), goal: String(ip.profile.goal || "").slice(0, 120), diag: clip(ip.profile.diag?.english?.labels, 8).map((x: any) => String(x.q || "").slice(0, 60) + " → " + String(x.a || "").slice(0, 120)) } : null,
    };
    if (!compact.weak.length) return json({ ok: false, error: "empty_input" }, 200);
    const isys = [
      `너는 따뜻하고 구체적인 영어 사수(${mentor})야. 신입 ${compact.name || ""}(${compact.day}일차)의 표현 사전 기록을 읽고 이번 주 인사이트를 써.`,
      `기록: 기억 강도가 낮은 표현(weak, 0~100 낮을수록 희미함)과 그 표현으로 신입이 쓴 문장(mine, 없으면 한 번도 안 써본 것), 튼튼한 표현(strong), 영역별 배운 수/써본 수/평균 강도(areas), 이번 주 복습 횟수(reviewedThisWeek).`,
      compact.profile ? `신입의 일: ${compact.profile.job}${compact.profile.industry ? " / " + compact.profile.industry : ""}. 영어 쓰는 상황: ${(compact.profile.situ || []).join(", ") || "미입력"}. 상대: ${(compact.profile.who || []).join(", ") || "미입력"}. 막히는 순간: ${compact.profile.stuck || "미입력"}. 목표: ${compact.profile.goal || "미입력"}.${(compact.profile.diag || []).length ? " 영어 진단 답: " + compact.profile.diag.join(" / ") + "." : ""} 이 직종과 상황에서 실제로 통하는 문장으로 써.` : "직무 정보가 없으니 일반적인 외국계 회사 상황으로 써.",
      `set 은 weak 안에 있는 표현 3개만 고른다(있는 표현만, 지어내지 마). 각 표현마다 이 신입의 일에서 언제 쓰는지 한 줄(why)과 바로 쓸 수 있는 자연스러운 영어 문장 하나(sentence, 12단어 안팎)를 쓴다. 신입이 이미 쓴 문장(mine)이 있으면 그 습관을 이어서 다듬는 방향으로.`,
      `pattern 은 areas 와 weak 를 근거로 이번 주에 보이는 습관 하나를 숫자와 함께 짚는다(예: 어느 영역이 비었는지, 배웠지만 안 쓴 표현이 몇 개인지). 없는 숫자를 만들지 마.`,
      `JSON 으로만: {"headline":"한 줄 총평(25자 안팎, 동사로 끝나는 문장)","pattern":"2~3문장","set":[{"word":"","why":"","sentence":""},{"word":"","why":"","sentence":""},{"word":"","why":"","sentence":""}],"task":"이번 주에 실제로 해볼 과제 한 문장(동사로 끝남)"}`,
      `규칙: 따뜻한 존댓말. 모든 한국어 문장은 동사로 끝낸다(명사로 끝나는 조각 문장 금지). em-dash(U+2014) 절대 금지.`,
    ].filter(Boolean).join("\n");
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_RICH, temperature: 0.5, response_format: { type: "json_object" }, max_tokens: 1800,
          messages: [
            { role: "system", content: isys },
            { role: "user", content: JSON.stringify(compact) },
          ],
        }),
      });
      if (!r.ok) return json({ ok: false, error: "openai_" + r.status }, 200);
      const d = await r.json();
      let insight: any = {};
      try { insight = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch { insight = {}; }
      if (!insight.headline) return json({ ok: false, error: "empty" }, 200);
      // set 은 실제 weak 표현만 남긴다 (지어낸 표현 방지)
      const allowed = new Set(compact.weak.map((x: any) => x.word.toLowerCase()));
      insight.set = (Array.isArray(insight.set) ? insight.set : []).filter((x: any) => x && allowed.has(String(x.word || "").toLowerCase())).slice(0, 3)
        .map((x: any) => ({ word: String(x.word || "").slice(0, 40), why: String(x.why || "").slice(0, 160), sentence: String(x.sentence || "").slice(0, 200) }));
      return json({ ok: true, insight, usage: d?.usage || null });
    } catch (e) {
      return json({ ok: false, error: "exception" }, 200);
    }
  }

  // ── 복지포인트 상담 모드 (2026-09-05, 개발 뷰): 커리어 / 직무 / 영어 학습 처방 / 직장생활 ──
  // 클라이언트가 진단 문답 + 직무 프로필 + 학습 기록 전체(내가 쓴 문장 전부, 교정, 야근 문장, 저널, 질문, 약한 표현, 영역별 숫자)를 보낸다.
  // 한 장짜리 리포트(ingan 식 "기록에서 읽히는 나" 포함)를 돌려주고, 클라이언트가 notes(kind consult)에 보관한다.
  // 모델: OPENAI_MODEL_RICH (기본 gpt-4.1). 리포트 하나에 입력 5~8천 + 출력 3~4천 토큰, 100원 안팎.
  if (mode === "consult") {
    const cp = (b && typeof b.consult === "object" && b.consult) || null;
    if (!cp) return json({ ok: false, error: "missing" }, 200);
    const clip = (arr: any, n: number) => Array.isArray(arr) ? arr.slice(0, n) : [];
    const str = (v: any, n: number) => String(v || "").slice(0, n);
    const topic = str(cp.topic, 20);
    const question = str(cp.question, 800).trim();
    const answers = clip(cp.answers, 10).map((x: any) => ({ q: str(x.q, 80), a: str(x.a, 200) })).filter((x: any) => x.q && x.a);
    if (!question && !answers.length) return json({ ok: false, error: "empty_input" }, 200);
    const st = (cp.stats && typeof cp.stats === "object") ? cp.stats : {};
    const compact = {
      name: str(cp.name, 30), day: Number(cp.day) || 1, topic, question, answers,
      profile: cp.profile && typeof cp.profile === "object" ? { job: str(cp.profile.job, 60), industry: str(cp.profile.industry, 40), years: str(cp.profile.years, 60), situ: clip(cp.profile.situ, 8).map((x: any) => str(x, 20)), who: clip(cp.profile.who, 6).map((x: any) => str(x, 30)), freq: str(cp.profile.freq, 20), confidence: Number(cp.profile.confidence) || 0, stuck: str(cp.profile.stuck, 120), goal: str(cp.profile.goal, 120), diag: clip(cp.profile.diag?.english?.labels, 8).map((x: any) => str(x.q, 60) + " → " + str(x.a, 120)) } : null,
      stats: {
        learned: Number(st.learned) || 0, mine: Number(st.mine) || 0, oneShot: Number(st.oneShot) || 0, streak: Number(st.streak) || 0,
        areas: clip(st.areas, 6).map((a: any) => ({ name: str(a.name, 20), learned: Number(a.learned) || 0, used: Number(a.used) || 0, words: clip(a.words, 12).map((w: any) => str(w, 40)) })),
        sentences: clip(st.sentences, 120).map((x: any) => ({ day: Number(x.day) || 0, word: str(x.word, 40), text: str(x.text, 200), fixed: x.fixed ? str(x.fixed, 200) : undefined })),
        ot: clip(st.ot, 40).map((x: any) => ({ day: Number(x.day) || 0, word: str(x.word, 40), text: str(x.text, 160) })),
        journals: clip(st.journals, 15).map((x: any) => ({ day: Number(x.day) || 0, text: str(x.text, 200) })),
        questions: clip(st.questions, 12).map((x: any) => str(x, 100)),
        known: clip(st.known, 40).map((x: any) => str(x, 40)),
        weak: clip(st.weak, 12).map((x: any) => ({ word: str(x.word, 40), strength: Number(x.strength) || 0, area: str(x.area, 20) })),
        reviews: Number(st.reviews) || 0,
      },
    };
    const TOPIC: Record<string, { role: string; fixesLabel: string; termsLabel: string; actionsLabel: string }> = {
      career: { role: "커리어 상담: 이직·채용·면접·다음 스텝. 외국계 채용 관행(영문 이력서의 동사+숫자 불릿, 링크드인 헤드라인, 레퍼럴·커피챗, 영어 면접 STAR)을 아는 선배로서 현실적인 선택지와 순서를 준다. fixes 에는 이 사람의 실제 문장이나 경험을 이력서·링크드인 불릿으로 고쳐 쓴 예를 넣는다(빈칸이 아니라 '이렇게 쓰면' 형태). expressions 에는 커피챗 요청·면접·링크드인에 바로 쓸 문장을 넣는다.", fixesLabel: "이력서·링크드인 문장, 이렇게 고치면", termsLabel: "지원하는 직무의 언어", actionsLabel: "다음 주 커리어 액션" },
      job: { role: "직무 고민 상담: 지금 맡은 일에서 막히는 것, 역할·우선순위·상사와 본사의 기대치 조율. 외국계 협업 방식(비동기, 문서화, 선택지 제시, 슬랙 한 줄 확인)을 기준으로 구체적인 행동을 준다. fixes 에는 이 사람이 실제로 쓴 문장을 상사·본사에 보낼 문장으로 고쳐 쓴 예를 넣는다. expressions 에는 우선순위 합의·일정 확인·기대치 조율 문장을 넣는다.", fixesLabel: "상사·본사에 보낼 문장, 이렇게 고치면", termsLabel: "이 상황에서 통하는 표현", actionsLabel: "다음 주 업무 액션" },
      english: { role: "영어 학습 처방 리포트: 진단 문답과 학습 기록 전체를 근거로 이 사람에게만 맞는 한 장짜리 처방전을 쓴다. 답과 기록이 서로 다른 얘기를 하면 그 차이를 짚어라(예: 못 한다고 답했는데 기록은 이미 하고 있음). fixes 에는 사수가 고친 문장(fixed 가 있는 sentences)을 빈칸 문제로 만든다.", fixesLabel: "이렇게 말하면 더 자연스러울 거예요", termsLabel: "내 직무에서 알아두면 좋은 표현", actionsLabel: "다음 주 영어 액션" },
      work: { role: "직장생활 고민 상담: 관계, 번아웃, 리모트 근무, 피드백 받는 법. 공감 먼저, 그다음 이번 주에 해볼 작은 행동. 의학적·심리치료적 진단은 하지 않는다. 자해·극단적 선택·심한 우울 신호가 보이면 전문가(정신건강 상담전화 1577-0199 등)와 가까운 사람에게 지금 이야기하라고 headline 과 diagnosis 첫 문단에 분명히 쓴다. fixes 에는 피드백을 받을 때·부탁할 때·거절할 때 이 사람이 실제로 쓸 문장을 넣는다.", fixesLabel: "그 순간에 쓸 문장, 이렇게", termsLabel: "외국계에서 이 상황을 말하는 법", actionsLabel: "다음 주 액션" },
    };
    const T = TOPIC[topic] || TOPIC.job;
    const sysReport = [
      `너는 외국계 회사에서 10년 넘게 신입을 키운 선배 사수(${mentor})야. 신입 ${compact.name || ""}(${compact.day}일차)에게 한 장짜리 리포트를 써. 이 리포트는 유료(복지포인트)라서, 어디서나 읽을 수 있는 일반론이 한 줄이라도 있으면 실패야.`,
      T.role,
      compact.profile ? `신입의 일: ${compact.profile.job}${compact.profile.industry ? " / " + compact.profile.industry : ""}${compact.profile.years ? " / " + compact.profile.years : ""}. 영어 쓰는 상황: ${(compact.profile.situ || []).join(", ") || "미입력"}. 상대: ${(compact.profile.who || []).join(", ") || "미입력"}. 빈도: ${compact.profile.freq || "미입력"}. 자신감 ${compact.profile.confidence || "?"}/5. 막히는 순간: ${compact.profile.stuck || "미입력"}. 목표: ${compact.profile.goal || "미입력"}.${(compact.profile.diag || []).length ? " 영어 진단 답: " + compact.profile.diag.join(" / ") + "." : ""}` : "직무 정보가 없다. 기록에서 읽히는 것만으로 쓰되, 어떤 정보가 있으면 더 정확해지는지 closing 에 한 줄 적어.",
      `학습 기록(전부 실제 데이터): 배운 표현 ${compact.stats.learned}개, 직접 쓴 문장 ${compact.stats.sentences.length}개(그중 사수가 고친 문장 ${compact.stats.sentences.filter((x: any) => x.fixed).length}개, 한 번에 통과 ${compact.stats.oneShot}개), 야근 문장 ${compact.stats.ot.length}개, 저널 ${compact.stats.journals.length}개, 질문 ${compact.stats.questions.length}개, 이미 알던 표현 ${compact.stats.known.length}개, 복기 ${compact.stats.reviews}장, 연속 출근 ${compact.stats.streak}일. 영역별 배운/써본: ${compact.stats.areas.map((a: any) => a.name + " " + a.used + "/" + a.learned).join(", ")}. 기억이 흔들리는 표현: ${compact.stats.weak.map((w: any) => w.word + "(" + w.strength + ")").join(", ") || "없음"}.`,
      `user 메시지의 sentences 가 이 사람이 90일 동안 실제로 쓴 문장 전부다. 전부 읽어라. 거기서 반복되는 습관(시제, 관사, 축약형, 특정 표현 회피, 문장 길이, 톤, 자주 등장하는 상황과 사람, 잘 쓰는 것)을 찾아서 readings 에 증거 문장과 함께 쓴다. 인용은 그 사람의 문장을 그대로 쓴다. 없는 문장을 지어내면 안 된다.`,
      compact.answers.length ? `진단 문답: ${compact.answers.map((x: any) => x.q + " → " + x.a).join(" / ")}. 답을 반복하지 말고 해석해서 써. 답과 기록이 다르면 그 차이가 이 리포트의 핵심이다.` : "",
      question ? `신입이 덧붙인 한 줄: "${question}". 이 문장이 이 리포트의 출발점이다. headline 과 diagnosis 첫 문단은 반드시 이 한 줄에 직접 답한다.` : "",
      `JSON 으로만: {"headline":"이 사람의 상황을 한 줄로 뒤집어 주는 문장(35자 안팎, 동사로 끝남. '나아가다/극복하다/노력하다' 같은 뻔한 말 금지)","oneLine":"기록에서 찾은 구체적 성취 한 줄(숫자와 실제 표현 포함)","readings":[{"title":"기록에서 읽히는 나 (제목 8자 안팎)","body":"2~3문장. 이 사람의 문장 습관·일하는 방식·영어 성향 중 하나","evidence":"근거가 되는 실제 문장 하나 그대로 인용"}] 3개,"diagnosis":["사수가 드리는 말 2~3문단, 각 3~4문장. 답·기록·덧붙인 한 줄을 근거로 진짜 원인을 짚고 지금 필요한 게 뭔지"],"strengths":["기록에 근거한 잘하는 것 2개, 각각 실제 문장이나 숫자 인용"],"expressions":[{"en":"이번에 가져갈 표현","ko":"뜻","use":"이 사람 상황에서 언제 쓰는지 한 줄"}] 3개,"qa":[{"q":"진단 질문","a":"신입의 답","coach":"그 답에 대한 사수 코멘트 1~2문장, 기록과 연결"}] 3개,"fixes":[{"blank":"${T.fixesLabel}: 원문 또는 빈칸 문장","answer":"고친 문장 또는 정답","why":"왜 그게 통하는지"}] 4개,"jobTerms":[{"term":"${T.termsLabel}","ko":"뜻","ex":"예문"}] 4개,"culture":[{"title":"외국계에서 더 잘 통하는 방식","body":"1~2문장"}] 3개,"actions":[{"task":"할 것","how":"어떻게(구체적 산출물. 1일1비 기능 활용 포함: 야근 3문장, 복습 탭 흔들리는 카드, 사수 Q&A)","when":"언제"}] 5개,"goals":[{"goal":"다음 30일 목표","measure":"측정 방법"}] 3개,"vision":"1년 뒤의 모습 2~3문장, 이 사람 직무와 목표 기준","closing":"닫는 말 2~3문장","oneLiner":"사수가 남기는 한 줄(동사로 끝남)"}`,
      `규칙: 따뜻하지만 날카로운 존댓말. 모든 한국어 문장은 동사로 끝낸다(명사로 끝나는 조각 문장 금지). "중요합니다/도움이 될 것입니다/고민해보세요/노력하세요" 같은 빈 말 금지. 모든 조언은 이 사람의 문장·숫자·답을 근거로 대고, 근거를 문장 안에 보여준다. em-dash(U+2014) 절대 금지.`,
    ].filter(Boolean).join("\n");
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_RICH, temperature: 0.6, response_format: { type: "json_object" }, max_tokens: 4500,
          messages: [
            { role: "system", content: sysReport },
            { role: "user", content: JSON.stringify(compact) },
          ],
        }),
      });
      if (!r.ok) return json({ ok: false, error: "openai_" + r.status }, 200);
      const d = await r.json();
      let consult: any = {};
      try { consult = JSON.parse(d?.choices?.[0]?.message?.content || "{}"); } catch { consult = {}; }
      if (!consult.headline) return json({ ok: false, error: "empty" }, 200);
      consult.readings = clip(consult.readings, 3).map((x: any) => ({ title: str(x.title, 40), body: str(x.body, 500), evidence: str(x.evidence, 220) }));
      consult.diagnosis = clip(consult.diagnosis, 3).map((x: any) => str(x, 900));
      consult.strengths = clip(consult.strengths, 3).map((x: any) => str(x, 300));
      consult.expressions = clip(consult.expressions, 3).map((x: any) => ({ en: str(x.en, 160), ko: str(x.ko, 100), use: str(x.use, 200) }));
      consult.qa = clip(consult.qa, 3).map((x: any) => ({ q: str(x.q, 80), a: str(x.a, 200), coach: str(x.coach, 400) }));
      consult.fixes = clip(consult.fixes, 5).map((x: any) => ({ blank: str(x.blank, 220), answer: str(x.answer, 220), why: str(x.why, 260) }));
      consult.jobTerms = clip(consult.jobTerms, 4).map((x: any) => ({ term: str(x.term, 60), ko: str(x.ko, 80), ex: str(x.ex, 180) }));
      consult.culture = clip(consult.culture, 3).map((x: any) => ({ title: str(x.title, 80), body: str(x.body, 300) }));
      consult.actions = clip(consult.actions, 5).map((x: any) => ({ task: str(x.task, 80), how: str(x.how, 200), when: str(x.when, 40) }));
      consult.goals = clip(consult.goals, 3).map((x: any) => ({ goal: str(x.goal, 120), measure: str(x.measure, 160) }));
      consult.vision = str(consult.vision, 500); consult.closing = str(consult.closing, 500); consult.oneLine = str(consult.oneLine, 240); consult.oneLiner = str(consult.oneLiner, 160);
      consult.labels = { fixes: T.fixesLabel, terms: T.termsLabel, actions: T.actionsLabel };
      return json({ ok: true, consult, model: MODEL_RICH, usage: d?.usage || null });
    } catch (e) {
      return json({ ok: false, error: "exception" }, 200);
    }
  }

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

  // 문장 비교용 정규화: 공백·끝 구두점·대소문자 무시
  const norm = (s: string) => s.toLowerCase().replace(/[\s]+/g, " ").replace(/[.!?,;:'"]+$/g, "").trim();
  const resubmittedOwn = !!prevCorrected && norm(sentence) === norm(prevCorrected);

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
    `핵심 원칙: 실제로 고칠 게 있을 때만 고친다. 신입 문장이 이미 자연스러운 네이티브 문장이면 corrected는 제출 문장을 "글자 하나도 바꾸지 말고 그대로" 넣고, segments는 전부 keep 한 덩어리로, grammar는 "문법은 정확해요"로 시작해. 대신 nuance나 vocab에서 "오 이건 몰랐는데" 할 팁 하나를 줘. 억지로 다른 버전을 만들어내는 것 금지(사소한 취향 차이로 바꾸지 마).`,
    `일관성 원칙: 한 번 추천한 문장을 신입이 받아들여 다시 제출하면, 그 문장을 다시 다른 버전으로 되돌리지 마라. 추천이 왔다갔다 하면 신뢰를 잃는다.`,
    prevCorrected ? `★ 직전에 네가 추천했던 문장: "${prevCorrected}". 신입이 이 추천을 그대로(또는 거의 그대로) 반영해 제출했다면 절대 예전 문장이나 다른 변형으로 바꾸지 말고, corrected에 제출 문장을 그대로 두고 칭찬해.` : ``,
    koSentence ? `★ 가장 중요: 이번 미션의 의도(한국어 뜻)는 "${koSentence}" 이다. corrected는 반드시 이 한국어 뜻 "전체"를 자연스러운 영어로 옮긴 문장이어야 한다(오늘 단어 살려서). 신입 문장을 이 의도와 비교해서 채점해.` : ``,
    koSentence ? `의도와 비교 규칙: (a) 신입이 딴 얘기를 썼거나 단어만 끼워넣었으면 grammar에서 "의도한 뜻과 달라요"라고 분명히 짚고 ok=false. (b) 의도의 일부만 담기고 핵심 내용이 빠졌으면(예: "주간으로 진행 상황 공유" 같은 부분이 없으면) nuance에서 "빠진 내용: ~"이라고 알려주고, corrected에는 빠진 내용까지 채워 넣어. (c) 오늘 단어가 들어갔다고 의미가 부족한데 통과시키지 마.` : ``,
    promptKo ? `미션 안내(참고): ${promptKo}` : ``,
    `아래 필드를 채워. corrected와 segments의 text만 영어, 나머지 설명은 한국어로, 짧고 명확하게(각 1~2문장).`,
    `1) corrected: 신입 문장을 네이티브 동료가 쓸 가장 자연스러운 "한 문장"으로 다시 쓴 영어 문장. 오늘 단어("${word}")는 반드시 살려. 영어 문장 하나만, 앞뒤 설명이나 따옴표 없이.`,
    `2) segments: corrected를 단어/구 단위로 쪼갠 배열. 각 원소는 {text, type, cat}. type은 keep(원문 그대로 유지), removed(원문에서 빠지거나 바뀐 부분), added(네이티브 버전에서 새로 쓰인 부분). cat은 removed/added에만 붙이고 grammar, vocab, nuance, tone 중 하나(왜 바꿨는지 기준). keep과 added를 순서대로 이으면 corrected 문장이 정확히 나와야 해. 바뀐 부분은 removed 바로 뒤에 added를 둬서 "원래 X였는데 Y로" 대조가 되게. 고칠 게 전혀 없으면 전부 keep 한 덩어리로.`,
    `   예: 원문 "I'll take ownership and share you the progress" 의 segments = [{"text":"I'll take ownership and ","type":"keep"},{"text":"share you the progress","type":"removed","cat":"grammar"},{"text":"share the progress with you","type":"added","cat":"grammar"}]`,
    `3) grammar: corrected에서 무엇을 왜 바꿨는지 문법·구조 관점 한 줄. 반드시 원문의 실제 오류를 콕 집어 말해: 철자 오타(예: integreate → integrate), 시제(과거 streamlined 인데 의도가 "하겠다"면 I'll streamline), 어순, 빠진 전치사. 원문에 한글 단어가 섞여 있으면 "한국어 단어가 섞였어요: 중복단계 → duplicate steps"처럼 짚어. 고칠 게 하나라도 있으면 "문법은 정확해요"로 시작하면 안 된다. "추가 설명이 필요해요" 같은 빈말 금지, 설명을 그 자리에서 해.`,
    `   segments 규칙 추가: removed 의 text 는 반드시 원문에 실제로 있는 글자 그대로여야 한다. 원문에 없는 문장을 removed 로 지어내지 마. keep 과 removed 를 순서대로 이으면 원문이 정확히 나와야 한다.`,
    `4) vocab: 어휘 추천을 객체로. {from: 원래 단어나 표현(없으면 ""), to: 더 native한 추천 단어나 표현, reason: 왜 더 나은지 한국어 한 줄, similar: 비슷하게 쓸 수 있는 표현 2~4개 배열}. to, from, similar 안의 표현만 영어. reason은 반드시 한국어. 원문에 한글이 섞여 있으면 vocab 은 무조건 그 한글을 from 으로, 영어 표현을 to 로 잡아.`,
    `5) nuance: 이 표현을 언제, 어떤 톤으로 쓰면 좋은지 뉘앙스 한 줄(한국어). "~할 때 사용하면 좋아요" 같은 뜻풀이 반복 금지. 비슷한 표현과 뭐가 다른지, 어떤 상대에게 쓰면 안 되는지처럼 몰랐을 법한 한 가지를 줘.`,
    `6) vsSample: 모범답안을 보고 "이렇게 하면 더 좋아요" 톤으로 1~3문장(한국어). 비판이 아니라 제안이다. 첫 문장은 모범답안의 표현이 왜 이 상황에 더 잘 맞는지(예: "이런 상황에서는 map out이 더 잘 어울려요!"). 모범답안에 신입 문장에 없는 새 단어나 표현이 있으면 반드시 줄을 바꿔 "표현 = 뜻 / 뜻" 형식으로 뜻을 덧붙여(예: "map out = 구체적으로 계획을 세우다 / 전체 과정을 그려보다"). 신입 문장이 이미 모범답안만큼 좋으면 "이대로도 충분해요!"로 시작하고 모범답안의 다른 선택지 하나만 가볍게 소개해. 모범답안이 없으면 빈 문자열 "".`,
    `7) praise: 사수가 건네는 따뜻한 칭찬 한마디(한국어). 이 문장에서 실제로 잘한 점 하나를 구체적으로 짚어(예: "8 steps to 3 steps 처럼 숫자로 말한 게 좋아요"). "잘하고 있어요, 조금만 더" 같은 빈 칭찬 금지.`,
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
        temperature: 0.25,   // 재제출 시 답이 흔들리지 않게 (왔다갔다 방지)
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
    // ★ 결정적 가드: 직전 추천을 그대로 반영해 재제출했는데 모델이 또 딴 버전을 내면,
    //   코드 레벨에서 강제로 "그대로 인정" 처리 (A→B→A 왔다갔다 원천 차단).
    if (resubmittedOwn && fb.corrected && norm(fb.corrected) !== norm(sentence)) {
      fb.corrected = sentence;
      fb.segments = [{ text: sentence, type: "keep" }];
      if (!/^문법은 정확/.test(fb.grammar)) fb.grammar = "문법은 정확해요. 지난번 추천을 그대로 소화했네요, 이 문장 그대로 쓰면 돼요.";
    }
    if (!fb.corrected && !fb.grammar && !fb.nuance) return json({ ok: false, error: "empty" }, 200);
    return json({ ok: true, fb, good: parsed.ok !== false });
  } catch (e: any) {
    return json({ ok: false, error: "exception", detail: String(e?.message || e).slice(0, 200) }, 200);
  }
});
