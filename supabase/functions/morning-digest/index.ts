// ============================================================
// 1일1비, 매일 아침 7시 KST 운영자 슬랙 일일 리포트
// 매일 UTC 22:00 (= KST 07:00) Supabase Cron으로 실행.
// 어제 활동 요약 + 사용자별 영작 본문 → Slack webhook 전송.
//
// 배포:
//   supabase functions deploy morning-digest
// 또는 Dashboard → Edge Functions → New Function → 코드 붙여넣기
//
// Secret 등록 (Dashboard → Edge Functions → Settings → Secrets):
//   SLACK_WEBHOOK_URL   (운영자 채널 incoming webhook)
//   SUPABASE_URL        (자동 주입)
//   SUPABASE_SERVICE_ROLE_KEY (자동 주입)
//
// Cron 등록 (Dashboard → Database → Cron Jobs):
//   schedule: 0 22 * * *  (매일 UTC 22:00 = KST 07:00)
//   HTTP POST: https://<PROJECT_REF>.supabase.co/functions/v1/morning-digest
//   Authorization: Bearer <ANON_KEY>
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_WEBHOOK_URL         = Deno.env.get("SLACK_WEBHOOK_URL")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// KST 기준 어제 자정 ~ 오늘 자정 (UTC로 변환)
function kstYesterdayRange() {
  const now = new Date();
  // KST = UTC + 9. 현재 KST 시각 계산.
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // KST 오늘 자정 (UTC 기준 어제 15:00)
  const kstTodayMidnight = new Date(Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
    0, 0, 0
  ));
  const todayStartUtc = new Date(kstTodayMidnight.getTime() - 9 * 60 * 60 * 1000);
  const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
  return { from: yesterdayStartUtc, to: todayStartUtc };
}

function fmtKstDate(d: Date): string {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return k.toISOString().slice(0, 10);
}

const FEEDBACK_LABEL: Record<string, string> = {
  good: "good",
  ok: "ok",
  "needs-work": "needs-work",
};

serve(async (_req) => {
  try {
    const { from, to } = kstYesterdayRange();
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const dateLabel = fmtKstDate(from);

    // 1. 어제 영작 (submissions_history에서 어제 행위만)
    const { data: subs } = await sb
      .from("submissions_history")
      .select("email, day, answer_text, payload, created_at")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: true });

    // 2. 어제 노트
    const { data: notes } = await sb
      .from("notes")
      .select("email, day, text, label")
      .gte("created_at", fromIso)
      .lt("created_at", toIso);

    // 3. 어제 일지
    const { data: journals } = await sb
      .from("journals")
      .select("email, day, text, saved_at")
      .gte("saved_at", fromIso)
      .lt("saved_at", toIso);

    // 4. 어제 일정 체크 (task_progress.updated_at 기준)
    const { data: tasks } = await sb
      .from("task_progress")
      .select("email, day, tasks, updated_at")
      .gte("updated_at", fromIso)
      .lt("updated_at", toIso);

    // 5. 어제 신규 가입
    const { data: newUsers } = await sb
      .from("users")
      .select("email, name, signup_date")
      .gte("signup_date", fromIso)
      .lt("signup_date", toIso);

    const subsCount = (subs || []).length;
    const notesCount = (notes || []).length;
    const journalsCount = (journals || []).length;
    const tasksCount = (tasks || []).length;
    const newCount = (newUsers || []).length;
    const activeUsers = new Set([
      ...(subs || []).map((s: any) => s.email),
      ...(notes || []).map((n: any) => n.email),
      ...(journals || []).map((j: any) => j.email),
      ...(tasks || []).map((t: any) => t.email),
    ]);

    // 영작 본문 정리, 4000자 안 들어가게 한 줄당 ~150자
    const lines: string[] = [];
    for (const s of (subs || [])) {
      const fb = (s.payload?.mentor_feedback?.overall) || "?";
      const fbLabel = FEEDBACK_LABEL[fb] || fb;
      const word = s.payload?.word || "";
      const text = (s.answer_text || "").trim();
      if (!text) continue; // mc만 저장한 draft 건너뜀
      const line = `• Day ${s.day} / ${word} / ${s.email} (${fbLabel})\n  "${text.slice(0, 200)}"`;
      lines.push(line);
    }

    // 메시지 조립
    const header =
      `🌅 *1일1비 일일 리포트* · ${dateLabel}\n\n` +
      `📊 *어제 활동*\n` +
      `• 활동 사용자: ${activeUsers.size}명\n` +
      `• 신규 가입: ${newCount}명\n` +
      `• 영작 제출: ${subsCount}건 (재시도 포함)\n` +
      `• 노트 저장: ${notesCount}건\n` +
      `• 일지 작성: ${journalsCount}건\n` +
      `• 일정 진도 갱신: ${tasksCount}건`;

    // 영작 본문 합치기, 메시지 크기 제한 (Slack 4000자) 대응
    const MAX_LEN = 3500; // header + 안전 margin
    let body = "";
    let truncated = 0;
    if (lines.length > 0) {
      body = `\n\n📝 *어제 제출된 영작 (${lines.length}건)*\n`;
      for (const ln of lines) {
        if ((header + body + ln).length > MAX_LEN) {
          truncated++;
        } else {
          body += ln + "\n\n";
        }
      }
      if (truncated > 0) {
        body += `\n_... 외 ${truncated}건. SQL로 자세히: \`SELECT * FROM submissions_history WHERE created_at >= '${fromIso}'\`_`;
      }
    }

    const footer = `\n\n📎 상세 조회: \`SELECT get_user_full_data('이메일');\``;

    const text = header + body + footer;

    // Slack 전송
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, error: errText }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      counts: {
        active: activeUsers.size,
        new: newCount,
        submissions: subsCount,
        notes: notesCount,
        journals: journalsCount,
        tasks: tasksCount,
      },
      truncated,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
