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

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY 미설정" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html }),
  });
  if (r.ok) return { ok: true };
  let error = "";
  try { error = JSON.stringify(await r.json()); } catch (_) { error = await r.text().catch(() => ""); }
  return { ok: false, status: r.status, error: String(error).slice(0, 400) };
}

// ── 이메일 본문 (저세상 톤, 매번 랜덤 변형) ──
function _pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// 본문 + CTA 버튼을 공통 껍데기로 감싼다.
function _wrap(bodyHtml: string, ctaLabel: string, footerHtml: string, signoff = "유버디 드림") {
  return `
    <div style="font-family:-apple-system,'Noto Sans KR',sans-serif;max-width:480px;margin:0 auto;color:#2A1F14;line-height:1.7">
      ${bodyHtml}
      <p style="margin:24px 0">
        <a href="${APP_URL}" style="background:#D85A2A;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700">${ctaLabel}</a>
      </p>
      <p style="font-size:13px;color:#8A7A66">${footerHtml}</p>
      <p style="font-size:13px;color:#8A7A66">${signoff}</p>
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

// ── 업데이트 안내(푸시 알림 출시) 메일. 가입했던 전원(취소 포함) 컴백 + 기능 안내 톤 ──
function pushUpdateEmail(name: string) {
  const body = `
    <p>${name}님, 오랜만이에요 :)</p>
    <p>1일1비에 반가운 업데이트 두 가지, 소식 전해요.</p>

    <p><b>🔑 이제 비밀번호로 로그인돼요</b><br/>
    매번 이메일 코드 기다리지 마세요! 로그아웃 후 다시 로그인할 때 <b>이메일 인증 1회</b>만 하면 비밀번호를 정할 수 있어요. 다음부턴 <b>이메일 + 비밀번호</b>로 바로 출근. (비번을 잊어도 이메일 코드로 언제든 들어올 수 있으니 안심하세요.)</p>

    <p><b>📲 푸시 알림도 받을 수 있어요</b><br/>
    폰에서 1일1비를 <b>홈 화면에 추가</b>하면 앱처럼 깔리고, 매일 출근 리마인드 알림이 와요. 메일 안 열어봐도 까먹지 않게 챙겨드릴게요.</p>
    <div style="background:#F4EFE3;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.75;margin:16px 0">
      <b>푸시 설정 방법 (1분)</b><br/>
      · <b>아이폰(사파리)</b>: 1일1비 접속, 하단 공유 버튼, "홈 화면에 추가", 생긴 앱 열기, 사원증 탭, 설정, 알림 켜기<br/>
      · <b>안드로이드(크롬)</b>: 1일1비 접속, 메뉴, "앱 설치", 설정, 알림 켜기
    </div>

    <p>그때 불편하셨던 로그인이랑 콘텐츠도 많이 다듬었어요.</p>
    <p>오랜만에 다시 출근해보실래요? 책상은 그대로 두고 기다리고 있을게요 ☕</p>`;
  return {
    subject: `📲 ${name}님, 1일1비 이제 알림으로 챙겨드려요`,
    html: _wrap(body, "🏢 1일1비 다시 가보기", "이 메일은 1일1비에 가입하신 분께 보내드렸어요. 그만 받고 싶으시면 회신 한 줄 주세요.", "1일1비 드림"),
  };
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
    const ok1 = (await sendEmail(sampleTo, "[샘플] " + cb.subject, cb.html)).ok;
    const ok2 = (await sendEmail(sampleTo, "[샘플] " + rn.subject, rn.html)).ok;
    return new Response(JSON.stringify({
      ok: true, sample: true, to: sampleTo,
      comeback_sent: ok1, renewal_sent: ok2,
      hint: ok1 && ok2 ? "두 통 다 발송됨. 인박스 확인." : "발송 실패. RESEND_API_KEY 설정/도메인 확인 필요.",
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  // ── 업데이트 안내 메일 테스트: ?announceto=이메일 (그 주소로만 1통, 실제 사용자 안 건드림) ──
  const announceTo = new URL(req.url).searchParams.get("announceto");
  if (announceTo) {
    const nm = (new URL(req.url).searchParams.get("name") || "테스터").trim();
    const m = pushUpdateEmail(nm);
    const r = await sendEmail(announceTo, m.subject, m.html);
    return new Response(JSON.stringify({
      ok: r.ok, sample: true, to: announceTo, status: r.status, error: r.error,
      from: FROM,
      hint: r.ok ? "발송됨. 인박스(+스팸함) 확인." : "발송 실패. 위 error 메시지를 보세요. (도메인 미인증이면 Resend 계정 본인 메일로만 발송돼요.)",
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  }

  // ── 업데이트 안내 전체 발송: ?announce=1 (가입한 전원, 취소 포함. 탈퇴/운영자/Dev 제외) ──
  //   ?announce=1&dry=1 = 미리보기(발송 X). 이미 보낸 사람은 건너뜀(중복 방지). 한 번에 최대 80통.
  const announceAll = new URL(req.url).searchParams.get("announce") === "1";
  if (announceAll) {
    const { data: allUsers, error: aerr } = await sb.from("users")
      .select("email, name, withdrawn_at, is_operator, is_dev_mode");
    if (aerr) return new Response(JSON.stringify({ ok: false, error: aerr.message }), { status: 200 });

    const seen = new Set<string>();
    const targets: { email: string; name: string }[] = [];
    for (const u of allUsers || []) {
      const em = String(u.email || "").toLowerCase().trim();
      if (!em || u.withdrawn_at || u.is_operator || u.is_dev_mode) continue;
      if (seen.has(em)) continue;
      seen.add(em);
      targets.push({ email: em, name: (u.name || "").trim() || "사원" });
    }

    // 이미 보낸 사람 (reengagement_log kind=push_update) 한 번에 조회
    const { data: logs } = await sb.from("reengagement_log").select("email").eq("kind", "push_update");
    const sentSet = new Set((logs || []).map((l: any) => String(l.email || "").toLowerCase()));
    const pending = targets.filter((t) => !sentSet.has(t.email));

    if (dry) {
      return new Response(JSON.stringify({
        ok: true, dry: true, total_targets: targets.length,
        already_sent: sentSet.size, pending: pending.length,
        sample: pending.slice(0, 10).map((t) => t.email),
      }, null, 2), { headers: { "Content-Type": "application/json" } });
    }

    const LIMIT = 80;
    let sent = 0, failed = 0;
    let lastError = "";
    for (const t of pending) {
      if (sent + failed >= LIMIT) break;
      const m = pushUpdateEmail(t.name);
      const r = await sendEmail(t.email, m.subject, m.html);
      if (r.ok) {
        sent++;
        await sb.from("reengagement_log").insert({ email: t.email, kind: "push_update", meta: {} }).then(() => {}).catch(() => {});
      } else {
        failed++;
        lastError = r.error || ("status " + r.status);
      }
      await new Promise((res) => setTimeout(res, 300));  // Resend 레이트 리밋 보호
    }
    return new Response(JSON.stringify({
      ok: true, total_targets: targets.length, pending_before: pending.length,
      sent, failed, remaining: pending.length - sent, last_error: lastError || undefined,
      hint: "남았으면(remaining>0) 같은 요청 다시 호출하면 이어서 발송돼요. 이미 보낸 사람은 자동 스킵.",
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
    const ok = (await sendEmail(p.email, mail.subject, mail.html)).ok;
    if (ok) {
      sent++;
      await sb.from("reengagement_log").insert({ email: p.email, kind: p._kind, meta: { dayN: p.dayN } }).then(() => {}).catch(() => {});
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: picked.length, sent }), { headers: { "Content-Type": "application/json" } });
});
