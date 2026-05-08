// ============================================================
// Supabase Client — 1day-1biz 공용 helper
// onboarding.html, operator.html, mainboard.html 모두 이 파일 로드
// ============================================================
//
// 사용:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="lib/supabase-config.js"></script>
//   <script src="lib/supabase-client.js"></script>
//
// 그러면 window.OD = { signup, updateProgress, fetchAllUsers, ... } 사용 가능
// ============================================================

(function() {
  // 설정 없으면 조용히 비활성화 (localStorage 모드만 동작)
  const cfg = window.__SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.anonKey || cfg.url.includes('xxxxxxxx')) {
    console.log('[Supabase] config not set — running in localStorage-only mode');
    window.OD = { enabled: false };
    return;
  }

  // Supabase JS SDK가 로드돼있는지
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.warn('[Supabase] SDK not loaded — add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    window.OD = { enabled: false };
    return;
  }

  const client = supabase.createClient(cfg.url, cfg.anonKey);

  // ============================================================
  // 가입 — onboarding 끝에 호출
  // ============================================================
  // ============================================================
  // 초대 코드 검증 — pilot_codes 테이블에 등록된 활성 코드인지 확인
  // 클라이언트 정규식은 'PILOT-XXXX' 같은 placeholder도 통과시키므로
  // 진짜 발급된 코드인지는 반드시 서버에서 확인해야 한다.
  // ============================================================
  async function checkInviteCode(code) {
    if (!code || typeof code !== 'string') return { ok: true, valid: false };
    try {
      const { data, error } = await client
        .from('pilot_codes')
        .select('code, label, cohort')
        .eq('code', code)
        .eq('active', true)
        .maybeSingle();
      if (error) throw error;
      return { ok: true, valid: !!data, label: data?.label, cohort: data?.cohort };
    } catch (e) {
      console.warn('[Supabase] checkInviteCode failed:', e.message);
      // 서버 연결 실패 시 보수적으로 invalid 처리 — 통과 안 시킴
      return { ok: false, valid: false, error: e.message };
    }
  }

  async function signup(profile) {
    try {
      // 가입 자체는 자유 — 실제 사옥(mainboard) 입장 권한은
      // simulator.html 페이월에서 checkInviteCode + unlock 플래그로 별도 검증한다.

      // localStorage 형식 → Supabase 컬럼 매핑
      const row = {
        email: profile.email,
        name: profile.name,
        signup_date: profile.signupDate,
        emp_number: profile.empNumber,
        department: profile.department,
        mentor: profile.mentor,
        coworkers: profile.coworkers || [],
        level: profile.level,
        day_in_company: profile.dayInCompany || 1,
        scenarios_completed: profile.scenariosCompleted || [],
        words_studied: profile.wordsStudied || [],
        production_attempts: profile.productionAttempts || { correct: 0, total: 0 },
        novelty_events: profile.noveltyEvents || [],
        last_active: new Date().toISOString(),
        total_sessions: 1,
        preferences: profile.preferences,
        onboarding_motivation: profile.onboardingMotivation,
        cohort: profile.cohort,
        is_pilot_hire: !!profile.isPilotHire,
        is_dev_mode: !!profile.isDevMode,
        is_tester: !!profile.isTester,
        is_operator: !!profile.isOperator,
      };

      const { data, error } = await client
        .from('users')
        .upsert(row, { onConflict: 'email' })
        .select()
        .single();

      if (error) throw error;

      // signup 이벤트 로그
      await logEvent(data.id, 'signup', { source: 'onboarding' });

      console.log('[Supabase] signup saved:', data.email);
      return { ok: true, user: data };
    } catch (e) {
      console.warn('[Supabase] signup failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ============================================================
  // 진도 업데이트 — Day 변경, 시나리오 완료 시
  // ============================================================
  async function updateProgress(email, patch) {
    try {
      const { data, error } = await client
        .from('users')
        .update({
          ...patch,
          last_active: new Date().toISOString(),
        })
        .eq('email', email)
        .select()
        .single();

      if (error) throw error;
      return { ok: true, user: data };
    } catch (e) {
      console.warn('[Supabase] update failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ============================================================
  // 이벤트 로그 — 학습 활동 기록
  // ============================================================
  async function logEvent(userId, type, payload = {}) {
    try {
      const { error } = await client
        .from('events')
        .insert({ user_id: userId, type, payload });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('[Supabase] event log failed:', e.message);
      return { ok: false };
    }
  }

  // ============================================================
  // 운영자 뷰 — 모든 사용자 가져오기
  // ============================================================
  async function fetchAllUsers() {
    try {
      const { data, error } = await client
        .from('users')
        .select('*')
        .order('signup_date', { ascending: false });
      if (error) throw error;
      return { ok: true, users: data };
    } catch (e) {
      console.warn('[Supabase] fetch users failed:', e.message);
      return { ok: false, users: [], error: e.message };
    }
  }

  // ============================================================
  // 운영자 뷰 — 통계 (operator_stats view)
  // ============================================================
  async function fetchStats() {
    try {
      const { data, error } = await client
        .from('operator_stats')
        .select('*')
        .single();
      if (error) throw error;
      return { ok: true, stats: data };
    } catch (e) {
      console.warn('[Supabase] fetch stats failed:', e.message);
      return { ok: false, stats: null };
    }
  }

  // ============================================================
  // 공지 발송
  // ============================================================
  async function sendNotice({ type, title, body, fromName }) {
    try {
      const { data, error } = await client
        .from('notices')
        .insert({
          type, title, body,
          from_name: fromName || '유버디 (Buddy)',
        })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, notice: data };
    } catch (e) {
      console.warn('[Supabase] notice send failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async function fetchNotices(limit = 50) {
    try {
      const { data, error } = await client
        .from('notices')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { ok: true, notices: data };
    } catch (e) {
      console.warn('[Supabase] fetch notices failed:', e.message);
      return { ok: false, notices: [] };
    }
  }

  // ============================================================
  // 대기 등록 (waitlist)
  // ============================================================
  async function saveWaitlistEntry(entry) {
    try {
      const row = {
        name: entry.name,
        email: entry.email,
        phone: entry.phone || null,
        prior_cohorts: entry.priorCohorts || [],
        current_env: entry.currentEnv || null,
        english_usage: entry.englishUsage || [],
        study_methods: entry.studyMethods || [],
        pain_points: entry.painPoints || [],
        goal: entry.goal || null,
        goal_detail: entry.goalDetail || null,
        message: entry.message || null,
        heard_from: entry.heardFrom || null,
        source: entry.source || "waitlist-page",
        user_agent: entry.userAgent || null,
      };

      const { data, error } = await client
        .from('waitlist')
        .insert(row)
        .select()
        .single();

      if (error) throw error;

      console.log('[Supabase] waitlist saved:', data.email);
      return { ok: true, entry: data };
    } catch (e) {
      console.warn('[Supabase] waitlist save failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async function fetchWaitlist() {
    try {
      const { data, error } = await client
        .from('waitlist')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { ok: true, entries: data };
    } catch (e) {
      console.warn('[Supabase] fetch waitlist failed:', e.message);
      return { ok: false, entries: [] };
    }
  }

  // ============================================================
  // 본인 사용자 정보 (이메일로 lookup)
  // ============================================================
  async function fetchByEmail(email) {
    try {
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (error) throw error;
      return { ok: true, user: data };
    } catch (e) {
      console.warn('[Supabase] fetch by email failed:', e.message);
      return { ok: false, user: null };
    }
  }

  // ============================================================
  // export
  // ============================================================
  window.OD = {
    enabled: true,
    client,
    signup,
    checkInviteCode,
    updateProgress,
    logEvent,
    fetchAllUsers,
    fetchStats,
    fetchByEmail,
    sendNotice,
    fetchNotices,
    saveWaitlistEntry,
    fetchWaitlist,
  };
  console.log('[Supabase] client ready');
})();
