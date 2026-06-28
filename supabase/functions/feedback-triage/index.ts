// 피드백 AI 분류(triage): 새 피드백 → LLM 분석 → 콘텐츠 수정감이면 content_edits(pending) 제안 생성.
// pg_cron이 주기적으로 호출(서버). 운영자는 직접 안 부르고, 쌓인 제안을 operator에서 검사/승인만.
//
// 필요한 Secret:
//   CONTENT_ADMIN_KEY  (이 함수 호출 게이트. cron만 알면 됨)
//   OPENAI_API_KEY     (mentor-feedback과 동일 키)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (자동 주입)
//
// 배포: supabase functions deploy feedback-triage --no-verify-jwt
// 호출: POST, header x-admin-key: <CONTENT_ADMIN_KEY>, body {limit?:10}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DASH = /[\u2014\u2013]/g;
const clean = (s: string) => String(s || "").replace(DASH, ", ").trim();

// \ubcf8\ubb38 \uac80\uc99d\uc6a9: dot-path \uac12 \uaebc\ub0b4\uae30 + \uac80\uc0c9 \ub300\uc0c1 \ud544\ub4dc\ub4e4
function getByPath(obj: any, path: string): any {
  try { return String(path).split(".").reduce((o, k) => (o ? o[k] : undefined), obj); }
  catch (_) { return undefined; }
}
const VERIFY_FIELDS = ["quote", "sampleAnswer", "mentorTip", "meaning", "phonetic", "buddyAnswers.example", "buddyAnswers.nuance", "buddyAnswers.default"];

const SYS = [
  "너는 한국인 대상 비즈니스 영어 학습앱의 콘텐츠 QA야.",
  "각 레슨(Day)에는 필드가 있어: word, meaning(한국어 뜻), quote(영어 NPC 대사), sampleAnswer(영어 모범답안), mentorTip(한국어 팁), buddyAnswers.example(예문, 이중언어), phonetic(발음기호).",
  "사용자 피드백 1건을 받아서, 그게 '특정 레슨의 구체적이고 고칠 수 있는 콘텐츠 오류'를 가리키는지 판단해.",
  "콘텐츠 오류 예: 영어 문장에 한국어가 섞임, 오타, 명백히 틀리거나 어색한 어휘 사용.",
  "피드백 글이 보통 문제 문장을 인용해줘. 그 인용에서 정확한 수정값을 만들 수 있으면 제안을 내.",
  "버그 신고, 기능 요청, 칭찬, 로그인/알림 불만, 또는 정확한 수정값을 알 수 없으면 actionable=false.",
  "절대 텍스트 수정만 제안. 정답/구조/권한은 건드리지 마.",
  'JSON만 출력: {"actionable":bool,"day":int|null,"field":string|null,"old_value":string|null,"new_value":string|null,"reason":string,"type":string,"summary":string}',
  "field는 quote/sampleAnswer/mentorTip/meaning/buddyAnswers.example/phonetic 중 하나. type은 korean_mix/vocab/typo/other 중 하나. reason은 한국어로.",
].join("\n");

async function analyze(fb: any, apiKey: string): Promise<any> {
  const userMsg = [
    "피드백 메타: day=" + (fb.day ?? "null") + ", category=" + (fb.category ?? "null"),
    "피드백 내용:",
    String(fb.message || ""),
  ].join("\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!res.ok) throw new Error("openai " + res.status);
  const j = await res.json();
  const txt = j?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(txt);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const adminKey = Deno.env.get("CONTENT_ADMIN_KEY") || "";
    const got = req.headers.get("x-admin-key") || "";
    if (!adminKey || got !== adminKey) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401, headers: { ...cors, "content-type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: "no OPENAI_API_KEY" }), {
        status: 500, headers: { ...cors, "content-type": "application/json" },
      });
    }
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 30);

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error } = await supa
      .from("feedback")
      .select("id, day, category, message, name, email")
      .is("triaged_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    // 본문 스냅샷 (제안 전에 "그 문장이 진짜 본문에 아직 있나" 검증용)
    const scnMap: Record<number, any> = {};
    try {
      const sres = await fetch("https://1day-1biz.youbuddy.co.kr/scenarios.json");
      if (sres.ok) { const arr = await sres.json(); for (const s of arr) scnMap[s.day] = s; }
    } catch (_) {}

    let processed = 0, proposals = 0;
    const errors: string[] = [];

    for (const fb of rows || []) {
      let note = "";
      try {
        const a = await analyze(fb, apiKey);
        if (a && a.actionable && a.new_value && a.old_value && (a.day || fb.day)) {
          const day = Number(a.day || fb.day);
          const sc = scnMap[day];
          const oldv = String(a.old_value);
          let field = String(a.field || "");
          let found = false;
          // 1) AI가 지목한 필드에 그 문장이 실제로 있나
          if (sc && field) {
            const v = getByPath(sc, field);
            if (v != null && String(v).indexOf(oldv) >= 0) found = true;
          }
          // 2) 없으면 다른 필드들 검색 (필드 오지목 자동 교정)
          if (!found && sc) {
            for (const f of VERIFY_FIELDS) {
              const v = getByPath(sc, f);
              if (v != null && String(v).indexOf(oldv) >= 0) { field = f; found = true; break; }
            }
          }
          if (found && field) {
            await supa.from("content_edits").insert({
              day, field,
              old_value: clean(oldv),
              new_value: clean(a.new_value),
              reason: clean(a.reason || ""),
              type: String(a.type || "other"),
              source: "feedback",
              status: "pending",
              feedback_id: fb.id,
              reporter_email: fb.email || null,
              reporter_name: fb.name || null,
              original_message: String(fb.message || "").slice(0, 1000),
            });
            proposals++;
            note = "제안 생성: " + field + " (" + (a.type || "other") + ")";
          } else {
            // 본문에서 못 찾음 = 이미 수정됨 / 다른 곳(첨삭 등) / 오탐 → 제안 생략
            note = "본문에서 해당 문장 못 찾음 (이미 수정됨 또는 오탐) - 제안 생략";
          }
        } else {
          note = a?.summary ? clean(a.summary) : "콘텐츠 수정 대상 아님";
        }
      } catch (e: any) {
        note = "분석 실패: " + String(e?.message || e);
        errors.push(String(fb.id) + " " + note);
      }
      await supa.from("feedback").update({
        triaged_at: new Date().toISOString(),
        triage_note: note.slice(0, 500),
      }).eq("id", fb.id);
      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed, proposals, errors: errors.slice(0, 5) }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});
