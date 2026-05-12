# Supabase 셋업, 30분이면 끝

## 1. 프로젝트 만들기 (5분)

1. https://supabase.com → **Sign In** (GitHub 계정 권장)
2. **New Project** 클릭
3. 입력:
   - **Name**: `1day-1biz`
   - **Database Password**: 강한 비번, **어딘가에 저장!** (지금 안 보면 다신 못 봄)
   - **Region**: `Northeast Asia (Seoul)` ← 한국 사용자 빠르게
   - **Pricing**: Free
4. **Create new project** → 1-2분 대기

## 2. Schema 실행 (3분)

1. 좌측 메뉴 **SQL Editor**
2. **+ New query** 클릭
3. `~/Projects/1day-1biz/supabase/schema.sql` 파일 통째로 복사 → 붙여넣기
4. 우측 하단 **RUN** (또는 Cmd+Enter)
5. 성공 메시지 확인
6. 좌측 **Table Editor** 들어가서 **users / events / notices / notice_reads** 4개 테이블 보이면 OK

## 3. 연결 키 받기 (2분)

1. 좌측 메뉴 맨 아래 **⚙ Project Settings**
2. **API** 탭
3. 다음 두 값 복사 (메모장 등에 임시 저장):
   - **Project URL** → 예: `https://xxxxxxxx.supabase.co`
   - **anon / public key** → 길고 복잡한 문자열 (eyJh로 시작)

⚠️ **service_role key는 절대 클라이언트에 안 박음.** anon key만 사용.

## 4. 1day-1biz 사이트와 연결 (5분)

`~/Projects/1day-1biz/` 안에 새 파일 만들기:

### `lib/supabase-config.js`

```js
window.__SUPABASE_CONFIG = {
  url: "https://xxxxxxxx.supabase.co",       // ← 여기 너 Project URL
  anonKey: "eyJhbGc..."                       // ← 여기 너 anon key
};
```

이 파일은 모든 HTML이 로드해서 사용. **commit해도 안전** (anon key는 공개용).

## 5. 테스트 (5분)

1. 브라우저에서 `https://1day-1biz.youbuddy.co.kr/onboarding.html` 접속
2. 너의 정보로 가입 (이름·이메일 입력해서 끝까지)
3. Supabase 대시보드 → Table Editor → `users` 테이블 → 너 row 보이면 ✅
4. 만약 `is_operator = true` 자동 체크돼있으면 (너 이메일이 trigger에 등록됨) → 운영자 모드 자동

## 6. 운영자 뷰 동작 확인

1. `https://1day-1biz.youbuddy.co.kr/operator.html` 접속
2. Supabase에서 사용자 목록 가져와서 표시
3. 다른 사람이 가입하면 너 운영자 뷰에서도 보임

---

## v1.5 → v2 마이그레이션 (나중)

지금은 anon key로 다들 read·write. RLS 느슨함.

정식 출시 전 강화:
1. **Supabase Auth** 붙이기 (이메일 매직 링크 또는 카카오)
2. RLS 정책 강화: 본인 row만 update / 운영자만 모두 read
3. service_role key는 별도 백엔드 함수에서만 사용 (Supabase Edge Functions)

자세한 건 `docs/customer-data.md`의 v2 섹션 참고.

---

## 자주 막히는 포인트

| 증상 | 원인 | 해결 |
|---|---|---|
| `relation "users" does not exist` | schema.sql 실행 안 됨 | SQL Editor 다시 RUN |
| `Failed to fetch` (브라우저 콘솔) | Project URL 오타 | supabase-config.js 다시 확인 |
| `Invalid API key` | anon key 오타 | API 페이지에서 다시 복사 |
| 가입은 되는데 Table Editor에 안 보임 | RLS 정책 문제 | schema.sql 다시 RUN (DROP POLICY ... CREATE POLICY ...) |
| 운영자 뷰가 빈 목록 | 사용자 0명 | 본인이 먼저 가입해보기 |

---

## 비용

- **Free tier**: 500MB DB · 50K MAU · 5GB bandwidth/월
- 1day-1biz 베타 (사용자 100명 이내) → **0원**
- v2 (사용자 500명+) → Pro $25/월 권장

---

## 부록, 대기 등록(waitlist) 이메일 알림 설정

waitlist에 새 row 추가될 때 `youbuddy.co@gmail.com`으로 알림 받기.

### 옵션 A, Supabase Edge Function + Resend (추천)

**1. Resend 가입 (무료 100통/일)**
- https://resend.com → Sign up → API key 발급

**2. Supabase Edge Function 만들기**

Supabase 대시보드 → Edge Functions → New Function → 이름 `waitlist-notify`

```ts
// supabase/functions/waitlist-notify/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const TO_EMAIL = "youbuddy.co@gmail.com";

serve(async (req) => {
  const { record } = await req.json();

  const html = `
    <h2>새 대기 등록, 1일1비</h2>
    <table style="border-collapse:collapse">
      <tr><td><b>이름</b></td><td>${record.name}</td></tr>
      <tr><td><b>이메일</b></td><td>${record.email}</td></tr>
      <tr><td><b>전화</b></td><td>${record.phone || '-'}</td></tr>
      <tr><td><b>유비챌</b></td><td>${JSON.stringify(record.prior_cohorts)}</td></tr>
      <tr><td><b>가입 시각</b></td><td>${record.created_at}</td></tr>
    </table>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "1day1biz <noreply@youbuddy.co.kr>",
      to: TO_EMAIL,
      subject: `[1일1비] 새 대기 등록: ${record.name}`,
      html,
    }),
  });

  return new Response("ok", { status: 200 });
});
```

**3. Database Webhook 설정**

Supabase 대시보드 → Database → Webhooks → Create

- **Name**: `waitlist-notify`
- **Table**: `waitlist`
- **Events**: ✅ Insert
- **Type**: Supabase Edge Functions
- **Function**: `waitlist-notify`

**4. Secret 추가**

Edge Functions → Settings → Secrets → `RESEND_API_KEY` 추가

이러면 waitlist에 row 추가될 때마다 자동으로 youbuddy.co@gmail.com에 알림 메일 옴.

### 옵션 B, Zapier (코드 0줄)

1. **Zapier 가입** (무료 100건/월)
2. New Zap:
   - Trigger: **Webhooks by Zapier** → Catch Hook → URL 복사
   - Action: **Email by Zapier** → To: youbuddy.co@gmail.com / Subject: 새 대기 등록 / Body: form fields
3. Supabase Database Webhook → URL에 Zapier URL 입력

### 옵션 C, 일괄 확인 (가장 간단)

알림 없이 그냥 매일/매주 한 번 운영자 뷰에서 waitlist 테이블 확인.
운영자 뷰에 "📬 대기 등록자 N명, 보기" 섹션 추가하면 됨 (v1.5에 추가 예정).

→ **베타 단계엔 옵션 C로 충분.** 신청자 많아지면 옵션 A로 자동화.
