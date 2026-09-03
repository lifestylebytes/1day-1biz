// ============================================================
// 1일1비, 카카오 알림톡 "오늘의 출근 알림" 발송 (솔라피)
// 매시간 정각 Supabase Cron 으로 실행. 지금 KST 시각을 알림 시각으로
// 고른 회원에게만, 그 회원의 오늘 게이트 Day 표현/씬/진도 문장을 채워 보낸다.
//
// 템플릿 (솔라피에 등록한 것과 변수명이 정확히 같아야 함):
//   [1일1비] #{이름}님, 오늘 회사에서 이런 일이 있어요.
//   #{상황}
//   이럴 때 쓰는 말이 이거예요.
//   "#{표현}"
//   #{진도안내}
//   버튼: 출근하기 (웹링크, 템플릿에 고정)
//
// 배포:
//   supabase functions deploy kakao-daily --no-verify-jwt
//
// Secret 등록 (supabase secrets set ...):
//   SOLAPI_API_KEY, SOLAPI_API_SECRET   (솔라피 > 개발/연동 > API Key)
//   SOLAPI_PFID                          (솔라피 > 카카오 > 채널 목록의 발신프로필 ID)
//   SOLAPI_TEMPLATE_ID                   (심사 승인된 템플릿 ID)
//   SOLAPI_FROM                          (선택. 대체문자 발신번호. 없으면 문자 대체발송 안 함)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (자동 주입)
//
// Cron 등록 (Dashboard > Database > Cron Jobs):
//   schedule: 0 * * * *   (매시간 정각 UTC = KST 정각)
//   HTTP POST: https://<PROJECT_REF>.supabase.co/functions/v1/kakao-daily
//   Authorization: Bearer <ANON_KEY>
//
// 테스트 (실제 발송 없이 대상·문구만 보기):
//   ?dry=1              대상자와 채워진 변수만 반환
//   ?hour=9             KST 9시 대상으로 강제 (지금 시각 무시)
//   ?email=a@b.com      그 회원만 (hour 무시)
//   ?force=1            오늘 이미 보냈어도 다시 (테스트용)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SCENARIOS } from "./scenarios.ts";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY       = Deno.env.get("SOLAPI_API_KEY") || "";
const API_SECRET    = Deno.env.get("SOLAPI_API_SECRET") || "";
const PFID          = Deno.env.get("SOLAPI_PFID") || "";
const TEMPLATE_ID   = Deno.env.get("SOLAPI_TEMPLATE_ID") || "";
const FROM          = Deno.env.get("SOLAPI_FROM") || "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ── KST 유틸 (mainboard.html 게이트 계산과 같은 기준) ──
const KST_MS = 9 * 60 * 60 * 1000;
function kstDateStr(d: Date): string {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}
function kstHour(d: Date): number {
  return new Date(d.getTime() + KST_MS).getUTCHours();
}
function daysBetweenKST(a: string | Date, b: Date): number {
  const da = Date.parse(kstDateStr(new Date(a)));
  const db = Date.parse(kstDateStr(b));
  return Math.floor((db - da) / 86400000);
}

// ── 게이트: mainboard.html _computeGatedDay 의 서버판 ──
//   열리는 day = floor 에서 시작해 완주한 날은 지나가고, 완주 못 한 첫 날에서 멈춤.
//   완주 = 그날 일지 제출 OR 일정 4개 전부 체크.
//   floor = 게이트 도입(2026-08-16) 전 가입자는 당시 day_in_company, 아니면 1.
const GATE_EPOCH = "2026-08-16";
type Gate = { gated: number; autoDay: number; backlog: number; streak: number };
function computeGate(u: any, doneSet: Set<number>, now: Date): Gate {
  const daysSince = Math.max(0, daysBetweenKST(u.signup_date, now));
  const autoDay = Math.max(1, Math.min(240, daysSince + 1));
  const signupKst = kstDateStr(new Date(u.signup_date));
  const floor = signupKst < GATE_EPOCH ? Math.max(1, Number(u.day_in_company) || 1) : 1;
  let d = Math.max(1, Math.min(floor, autoDay));
  while (d < autoDay && doneSet.has(d)) d++;
  // 연속 완주 (열린 day 바로 앞에서부터 거꾸로)
  let streak = 0;
  while (doneSet.has(d - 1 - streak)) streak++;
  return { gated: d, autoDay, backlog: Math.max(0, autoDay - d), streak };
}

// ── 진도 안내 문장 (압박 대신 기회 프레임, 회사 세계관) ──
function progressLine(g: Gate, idleDays: number): string {
  if (idleDays >= 7) return `Day ${g.gated} 책상이 그대로 있어요. 오늘 다시 앉으면 돼요.`;
  if (g.backlog >= 1) return `책상 위에 ${g.backlog}일치 서류가 쌓여 있어요. 오늘 하나만 치워도 돼요.`;
  if (g.streak >= 1) return `${g.streak}일째 개근 중. 오늘 찍으면 ${g.streak + 1}일 연속이에요.`;
  return `Day ${g.gated}. 오늘 출근 도장 찍고 시작해요.`;
}

function scenarioFor(day: number) {
  // Day 91+ (TF 트랙) 은 별도 앵커 계산이 클라이언트에만 있어 우선 90일 순환으로 근사
  const idx = ((Math.max(1, day) - 1) % SCENARIOS.length);
  return SCENARIOS[idx];
}

// ── 솔라피 HMAC-SHA256 인증 헤더 ──
async function solapiAuth(): Promise<string> {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(API_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date + salt));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${hex}`;
}

async function sendAlimtalk(to: string, variables: Record<string, string>) {
  const msg: any = {
    to,
    type: "ATA",
    kakaoOptions: { pfId: PFID, templateId: TEMPLATE_ID, variables, disableSms: !FROM },
  };
  if (FROM) msg.from = FROM;
  const res = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: await solapiAuth() },
    body: JSON.stringify({ messages: [msg] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`solapi ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const dry = url.searchParams.get("dry") === "1";
    const force = url.searchParams.get("force") === "1";
    const onlyEmail = url.searchParams.get("email");
    const now = new Date();
    const hour = url.searchParams.has("hour") ? Number(url.searchParams.get("hour")) : kstHour(now);
    const today = kstDateStr(now);

    if (!dry && (!API_KEY || !API_SECRET || !PFID || !TEMPLATE_ID)) {
      return json({ ok: false, error: "SOLAPI_* secrets missing" }, 500);
    }

    // 1. 대상 회원
    let q = sb.from("users")
      .select("email, name, phone, signup_date, last_active, day_in_company, kakao_notify_hour, membership_ends_at, withdrawn_at")
      .not("phone", "is", null)
      .is("withdrawn_at", null);
    q = onlyEmail ? q.eq("email", onlyEmail) : q.eq("kakao_notify_hour", hour);
    const { data: users, error } = await q;
    if (error) throw error;
    const active = (users || []).filter(u =>
      !u.membership_ends_at || new Date(u.membership_ends_at).getTime() > now.getTime());
    if (!active.length) return json({ ok: true, hour, sent: 0, note: "no targets" });

    const emails = active.map(u => u.email);

    // 2. 완주 기록 (일지 + 일정 4/4)
    const [{ data: journals }, { data: tasks }, { data: logs }] = await Promise.all([
      sb.from("journals").select("email, day").in("email", emails),
      sb.from("task_progress").select("email, day, tasks").in("email", emails),
      sb.from("kakao_send_log").select("email").in("email", emails).eq("sent_date", today),
    ]);
    const done = new Map<string, Set<number>>();
    const add = (e: string, d: number) => { if (!done.has(e)) done.set(e, new Set()); done.get(e)!.add(d); };
    (journals || []).forEach((j: any) => add(j.email, Number(j.day)));
    (tasks || []).forEach((t: any) => {
      const n = Object.values(t.tasks || {}).filter(Boolean).length;
      if (n >= 4) add(t.email, Number(t.day));
    });
    const already = new Set((logs || []).map((l: any) => l.email));

    // 3. 회원별 변수 채우고 발송
    const results: any[] = [];
    for (const u of active) {
      if (already.has(u.email) && !force) { results.push({ email: u.email, skipped: "already sent today" }); continue; }
      const g = computeGate(u, done.get(u.email) || new Set(), now);
      const idle = daysBetweenKST(u.last_active || u.signup_date, now);
      const s = scenarioFor(g.gated);
      const variables = {
        "#{이름}": u.name || "사원",
        "#{상황}": s.scene || s.quoteKo || "오늘 회의에서 이 말이 나와요.",
        "#{표현}": s.word,
        "#{진도안내}": progressLine(g, idle),
      };
      const row = { email: u.email, day: g.gated, word: s.word, variables, backlog: g.backlog, streak: g.streak, idle };
      if (dry) { results.push({ ...row, status: "dry" }); continue; }
      try {
        const r = await sendAlimtalk(u.phone, variables);
        await sb.from("kakao_send_log").upsert(
          { email: u.email, sent_date: today, day: g.gated, word: s.word, status: "sent", detail: { groupId: r?.groupInfo?._id || null } },
          { onConflict: "email,sent_date" });
        results.push({ ...row, status: "sent" });
      } catch (e) {
        await sb.from("kakao_send_log").upsert(
          { email: u.email, sent_date: today, day: g.gated, word: s.word, status: "failed", detail: { error: String(e).slice(0, 300) } },
          { onConflict: "email,sent_date" });
        results.push({ ...row, status: "failed", error: String(e).slice(0, 200) });
      }
    }
    return json({ ok: true, hour, today, dry, sent: results.filter(r => r.status === "sent").length, results });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });
}
