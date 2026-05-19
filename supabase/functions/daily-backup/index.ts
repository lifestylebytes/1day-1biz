// ============================================================
// 1일1비, 학습 데이터 일일 백업 Edge Function
// 매일 자정(KST = UTC 15:00) Supabase Cron으로 실행.
// 모든 학습 테이블을 JSON으로 dump → Resend로 운영자 메일에 첨부 발송.
//
// 배포:
//   supabase functions deploy daily-backup
// 또는 Supabase Dashboard → Edge Functions → New Function → 코드 붙여넣기
//
// Secret 등록 (Dashboard → Edge Functions → Settings → Secrets):
//   RESEND_API_KEY   (Resend Dashboard에서 발급)
//   BACKUP_TO_EMAIL  (예: dmsgktn0523@gmail.com)
//   FROM_EMAIL       (예: noreply@youbuddy.co.kr, Resend 검증된 도메인)
//   SUPABASE_URL     (자동 주입)
//   SUPABASE_SERVICE_ROLE_KEY (자동 주입)
//
// Cron 등록 (Dashboard → Edge Functions → Cron):
//   0 15 * * *    (매일 UTC 15:00 = KST 자정)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY")!;
const TO_EMAIL                  = Deno.env.get("BACKUP_TO_EMAIL") || "dmsgktn0523@gmail.com";
const FROM_EMAIL                = Deno.env.get("FROM_EMAIL")      || "noreply@youbuddy.co.kr";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function fetchAll(table: string) {
  const { data, error } = await sb.from(table).select("*");
  if (error) {
    console.warn(`[backup] ${table} fetch failed:`, error.message);
    return [];
  }
  return data || [];
}

function base64Encode(s: string) {
  return btoa(unescape(encodeURIComponent(s)));
}

serve(async (_req) => {
  const startedAt = new Date().toISOString();
  try {
    const [users, submissions, history, notes, journals, noticeReads, notices] = await Promise.all([
      fetchAll("users"),
      fetchAll("submissions"),
      fetchAll("submissions_history"),
      fetchAll("notes"),
      fetchAll("journals"),
      fetchAll("notice_reads_v2"),
      fetchAll("notices"),
    ]);

    const dump = {
      backedUpAt: startedAt,
      counts: {
        users: users.length,
        submissions: submissions.length,
        submissions_history: history.length,
        notes: notes.length,
        journals: journals.length,
        notice_reads_v2: noticeReads.length,
        notices: notices.length,
      },
      users, submissions, submissions_history: history,
      notes, journals, notice_reads_v2: noticeReads, notices,
    };

    const json = JSON.stringify(dump, null, 2);
    const b64  = base64Encode(json);
    const dateKey = startedAt.slice(0, 10);

    const summary = `users ${users.length} · submissions ${submissions.length} · history ${history.length} · notes ${notes.length} · journals ${journals.length} · notice_reads ${noticeReads.length}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `1일1비 백업 <${FROM_EMAIL}>`,
        to: TO_EMAIL,
        subject: `[1일1비] 일일 학습 데이터 백업 ${dateKey}`,
        text: `백업 시각: ${startedAt}\n\n${summary}\n\n첨부 파일에 모든 row가 들어있어요. 영구 보관 권장.`,
        attachments: [
          { filename: `1day1biz-backup-${dateKey}.json`, content: b64 },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[backup] Resend send failed:", errText);
      return new Response(JSON.stringify({ ok: false, error: errText }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, counts: dump.counts }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[backup] fatal:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
