// ============================================================
// 1일1비, 재방문 넛지 자동 발송 (이탈 방지)
// 매일 KST 오전 10시쯤 Supabase Cron으로 실행.
//
// 하는 일 (이메일로 자동 발송):
//   1) comeback : 2~3일 안 들어온 회원에게 "보고 싶어요" 넛지 (침묵 이탈 차단)
//   2) renewal  : Day 25~29 회원에게 "곧 사원 승진 + N개 모음" 가치 리마인드
//   각각 1회만 (reengagement_log로 중복 방지).
//
// 배포:
//   supabase functions deploy reengage --no-verify-jwt
//
// Secret 등록 (Dashboard → Edge Functions → Settings → Secrets):
//   RESEND_API_KEY        (resend.com 에서 발급)
//   REENGAGE_FROM         (예: "유버디 <buddy@youbuddy.co.kr>", 도메인 인증 필요)
//   REENGAGE_REPLY_TO     (예: youbuddy.co@gmail.com, 답장 받을 주소)
//   APP_URL               (예: https://1day-1biz.youbuddy.co.kr)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (자동 주입)
//
// Cron 등록 (Dashboard → Database → Cron Jobs):
//   schedule: 0 1 * * *   (UTC 01:00 = KST 10:00)
//   HTTP POST: https://<PROJECT_REF>.supabase.co/functions/v1/reengage
//   Authorization: Bearer <ANON_KEY>
//
// 테스트: ?dry=1 붙이면 실제 발송 안 하고 대상자만 반환.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY") || "";
const FROM             = Deno.env.get("REENGAGE_FROM") || "유버디 <onboarding@resend.dev>";
// 답장은 여기로 모임 (From은 도메인 주소여야 하지만, 답장은 gmail로 받을 수 있음)
const REPLY_TO         = Deno.env.get("REENGAGE_REPLY_TO") || "youbuddy.co@gmail.com";
const APP_URL          = Deno.env.get("APP_URL") || "https://1day-1biz.youbuddy.co.kr";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// KST 자정 기준 날짜 차이 (일수)
function daysBetweenKST(fromISO: string, toDate: Date): number {
  if (!fromISO) return 9999;
  const f = new Date(new Date(fromISO).getTime() + 9 * 3600 * 1000);
  const t = new Date(toDate.getTime() + 9 * 3600 * 1000);
  const fd = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  const td = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.floor((td - fd) / 86400000);
}

async function sendEmail(to: string, subject: string, html: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }),
  });
  return r.ok;
}

// ── 이메일 본문 (저세상 톤, 매번 랜덤 변형) ──
function _pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// 본문 + CTA 버튼을 공통 껍데기로 감싼다.
function _wrap(bodyHtml: string, ctaLabel: string, footerHtml: string) {
  return `
    <div style="font-family:-apple-system,'Noto Sans KR',sans-serif;max-width:480px;margin:0 auto;color:#2A1F14;line-height:1.7">
      ${bodyHtml}
      <p style="margin:24px 0">
        <a href="${APP_URL}" style="background:#D85A2A;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700">${ctaLabel}</a>
      </p>
      <p style="font-size:13px;color:#8A7A66">${footerHtml}</p>
      <p style="font-size:13px;color:#8A7A66">유버디 드림</p>
    </div>`;
}

// 2~3일 안 들어온 사람용. 사옥 세계관 + 동료/사수 톤으로 매번 다르게.
function comebackEmail(name: string, dayN: number) {
  const pool = [
    {
      subject: `${name}님, 책상에 먼지 쌓이고 있어요`,
      body: `<p>${name}님, 유버디예요.</p><p>며칠 안 보이셔서 책상에 먼지가 슬슬 쌓이고 있어요 ㅎㅎ. 오늘 5분이면 출근 도장 찍고 깨끗하게 다시 시작할 수 있어요. 단어 하나, 시추에이션 하나면 끝이에요.</p>`,
    },
    {
      subject: `${name}님, 옆자리 동기가 찾던데요`,
      body: `<p>${name}님, 유버디예요.</p><p>한도윤 씨가 "${name}님 요즘 통 안 보이네" 하더라고요 ㅎㅎ. 오늘 잠깐 들러서 단어 하나 같이 챙겨갈래요? 5분이면 돼요.</p>`,
    },
    {
      subject: `김 사수: ${name}님, 잠깐 시간 돼요?`,
      body: `<p>${name}님, 유버디예요.</p><p>사수가 같이 볼 게 있다는데 며칠 자리를 비우셨더라고요. 오늘 딱 5분만 출근해서 오늘 표현 하나 챙겨가요. 회의에서 바로 써먹을 거예요.</p>`,
    },
    {
      subject: `${name}님, 스트릭 끊기기 직전이에요 🔥`,
      body: `<p>${name}님, 유버디예요.</p><p>며칠 비우셨네요. 지금 살짝 들르면 스트릭 안 끊겨요. 여기까지 온 게 아까우니, 오늘 한 번만 출근 도장 찍고 가요.</p>`,
    },
    {
      subject: `${name}님, 오늘 책상에 새 단어가 도착했어요`,
      body: `<p>${name}님, 유버디예요.</p><p>오늘의 단어가 책상에 도착했어요. 회의에서 바로 써먹는 표현이라던데, 5분만 들어와서 확인해봐요. 안 보면 그냥 휘발돼요 ㅎㅎ.</p>`,
    },
  ];
  const v = _pick(pool);
  return { subject: v.subject, html: _wrap(v.body, "🏢 오늘 출근하기", `현재 Day ${dayN}. 30일 채우면 사원으로 승진해요. 거의 다 왔어요.`) };
}

// 갱신 직전(Day 25~29)용. 승진 코앞 가치 리마인드, 매번 다르게.
function renewalEmail(name: string, dayN: number, words: number) {
  const pool = [
    {
      subject: `${name}님, 곧 정직원 전환이에요 🎓`,
      body: `<p>${name}님, 유버디예요.</p><p>벌써 Day ${dayN}이에요. 수습 30일이 코앞이네요! 그동안 <b>${words}개</b>의 비즈니스 표현을 모으셨어요. 30일을 채우면 인사팀 면담을 거쳐 <b>사원(Associate)으로 승진</b>하고, 회의를 주도하는 표현들(Day 31-60)과 <b>나만의 노트 보관함</b>이 열려요.</p>`,
    },
    {
      subject: `${name}님, 인사팀에서 면담이 잡혔어요`,
      body: `<p>${name}님, 유버디예요.</p><p>Day ${dayN}, 정직원 면담이 코앞이에요. 며칠만 더 채우면 사원증 색이 바뀌고 회의 주도 표현들이 열려요. 그동안 <b>${words}개</b> 모으신 거, 여기서 멈추기엔 아깝잖아요.</p>`,
    },
    {
      subject: `${name}님, 정직원까지 진짜 며칠 안 남았어요`,
      body: `<p>${name}님, 유버디예요.</p><p>여기까지 온 게 진짜 대단한 거예요. <b>${words}개</b> 표현 쌓으셨고, 조금만 더 채우면 사원 승진 + 회의 주도 표현(Day 31-60)이 기다려요. 마지막 며칠, 같이 가요.</p>`,
    },
  ];
  const v = _pick(pool);
  return { subject: v.subject, html: _wrap(v.body, "🎓 마지막 며칠 마저 채우기", "여기까지 온 게 진짜 대단한 거예요. 조금만 더요.") };
}

async function alreadySent(email: string, kind: string, sinceISO: string): Promise<boolean> {
  const { data } = await sb.from("reengagement_log")
    .select("id").eq("email", email).eq("kind", kind)
    .gte("sent_at", sinceISO).limit(1);
  return !!(data && data.length);
}

Deno.serve(async (req) => {
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const now = new Date();

  // ── 테스트 모드: ?sampleto=이메일 ──
  // 실제 사용자는 전혀 안 건드리고, 그 주소로만 comeback + renewal 샘플 2통을 보낸다.
  // 넛지 메일이 실제로 어떻게 오는지 내 인박스에서 확인용.
  const sampleTo = new URL(req.url).searchParams.get("sampleto");
  if (sampleTo) {
    const cb = comebackEmail("테스터", 3);
    const rn = renewalEmail("테스터", 27, 26);
    const ok1 = await sendEmail(sampleTo, "[샘플] " + cb.subject, cb.html);
    const ok2 = await sendEmail(sampleTo, "[샘플] " + rn.subject, rn.html);
    return new Response(JSON.stringify({
      ok: true, sample: true, to: sampleTo,
      comeback_sent: ok1, renewal_sent: ok2,
      hint: ok1 && ok2 ? "두 통 다 발송됨. 인박스 확인." : "발송 실패. RESEND_API_KEY 설정/도메인 확인 필요.",
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  // 발송 대상: 결제 회원 + 탈퇴 안 함 + 운영자/Dev 아님 + 멤버십 미만료 + 이메일 있음
  const { data: users, error } = await sb.from("users")
    .select("email, name, signup_date, last_active, day_in_company, membership_ends_at, withdrawn_at, cohort, is_operator, is_dev_mode")
    .eq("cohort", "member");
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 200 });

  const picked: any[] = [];
  for (const u of users || []) {
    if (!u.email || u.withdrawn_at || u.is_operator || u.is_dev_mode) continue;
    // 멤버십 만료된 사람은 제외 (이미 떠난 사람)
    if (u.membership_ends_at && new Date(u.membership_ends_at) < now) continue;

    const idle = daysBetweenKST(u.last_active || u.signup_date, now);
    const dayN = Math.max(1, daysBetweenKST(u.signup_date, now) + 1);
    const words = Math.min(Math.max(0, dayN - 1), 30);

    // 1) comeback: 2~3일 비활성 (그 이상은 너무 늦음, 매일 스팸 방지로 좁은 창)
    if (idle >= 2 && idle <= 3) {
      // 마지막 활동 이후 comeback 보낸 적 없으면 발송 (재드리프트마다 1회)
      if (!(await alreadySent(u.email, "comeback", u.last_active || u.signup_date))) {
        picked.push({ ...u, _kind: "comeback", dayN, words });
        continue;
      }
    }
    // 2) renewal: Day 25~29 (갱신 직전). 최근 20일 내 renewal 안 보냈으면.
    if (dayN >= 25 && dayN <= 29) {
      const since = new Date(now.getTime() - 20 * 86400000).toISOString();
      if (!(await alreadySent(u.email, "renewal", since))) {
        picked.push({ ...u, _kind: "renewal", dayN, words });
      }
    }
  }

  if (dry) {
    return new Response(JSON.stringify({ ok: true, dry: true, count: picked.length,
      targets: picked.map(p => ({ email: p.email, kind: p._kind, dayN: p.dayN, idle: daysBetweenKST(p.last_active || p.signup_date, now) })) }, null, 2),
      { headers: { "Content-Type": "application/json" } });
  }

  let sent = 0;
  for (const p of picked) {
    const name = (p.name || "").trim() || "사원";
    const mail = p._kind === "comeback" ? comebackEmail(name, p.dayN) : renewalEmail(name, p.dayN, p.words);
    const ok = await sendEmail(p.email, mail.subject, mail.html);
    if (ok) {
      sent++;
      await sb.from("reengagement_log").insert({ email: p.email, kind: p._kind, meta: { dayN: p.dayN } }).then(() => {}).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: picked.length, sent }), { headers: { "Content-Type": "application/json" } });
});
