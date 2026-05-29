// ============================================================
// Supabase Client, 1day-1biz 공용 helper
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
    console.log('[Supabase] config not set, running in localStorage-only mode');
    window.OD = { enabled: false };
    return;
  }

  // Supabase JS SDK가 로드돼있는지
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.warn('[Supabase] SDK not loaded, add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    window.OD = { enabled: false };
    return;
  }

  const client = supabase.createClient(cfg.url, cfg.anonKey);

  // ============================================================
  // 가입, onboarding 끝에 호출
  // ============================================================
  // ============================================================
  // 초대 코드 검증, pilot_codes 테이블에 등록된 활성 코드인지 확인
  // 클라이언트 정규식은 'PILOT-XXXX' 같은 placeholder도 통과시키므로
  // 진짜 발급된 코드인지는 반드시 서버에서 확인해야 한다.
  // ============================================================
  async function checkInviteCode(code) {
    if (!code || typeof code !== 'string') return { ok: true, valid: false };
    try {
      const { data, error } = await client
        .from('pilot_codes')
        .select('code, label, cohort, expires_at, max_uses, used_count')
        .eq('code', code)
        .eq('active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ok: true, valid: false };

      // 만료일 체크
      if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
        return { ok: true, valid: false, reason: 'expired', label: data.label };
      }
      // 사용 횟수 체크 (max_uses 설정돼있을 때만)
      if (typeof data.max_uses === 'number' && typeof data.used_count === 'number'
          && data.used_count >= data.max_uses) {
        return { ok: true, valid: false, reason: 'exhausted', label: data.label };
      }
      return { ok: true, valid: true, label: data.label, cohort: data.cohort };
    } catch (e) {
      console.warn('[Supabase] checkInviteCode failed:', e.message);
      // 서버 연결 실패 시 보수적으로 invalid 처리, 통과 안 시킴
      return { ok: false, valid: false, error: e.message };
    }
  }

  // ★ 매직 링크 발송 (비밀번호 없는 인증)
  async function sendMagicLink(email) {
    if (!email) return { ok: false, error: '이메일이 필요해요.' };
    try {
      const { data, error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin + '/auth-callback.html',
          shouldCreateUser: true,  // public.users 화이트리스트는 클라이언트에서 fetchByEmail로 가드
        },
      });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('[Supabase] sendMagicLink failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 현재 세션 가져오기 (매직 링크로 인증된 경우 토큰 반환)
  async function getCurrentSession() {
    try {
      const { data: { session } } = await client.auth.getSession();
      return { ok: true, session };
    } catch (e) {
      return { ok: false, session: null };
    }
  }

  // 로그아웃 (Supabase 세션도 같이 종료)
  async function signOut() {
    try {
      await client.auth.signOut();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ★ 원자적 시나리오 저장 (덮어쓰기 방지)
  // 서버에서 기존 데이터 + 신규 entry 를 union merge.
  // 동시에 learning_history 테이블에 영구 기록 (append-only).
  async function saveScenarioAtomic(email, entry) {
    if (!email || !entry) return { ok: false };
    try {
      const { data, error } = await client.rpc('merge_scenario_completion', {
        p_email: email,
        p_entry: entry,
      });
      if (error) throw error;
      return { ok: true, result: data };
    } catch (e) {
      console.warn('[Supabase] saveScenarioAtomic failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ★ 원자적 노트 저장 (중복 제거 + history 보존)
  async function saveNoteAtomic(email, day, note) {
    if (!email || !day || !note) return { ok: false };
    try {
      const { data, error } = await client.rpc('merge_saved_note', {
        p_email: email,
        p_day: String(day),
        p_note: note,
      });
      if (error) throw error;
      return { ok: true, result: data };
    } catch (e) {
      console.warn('[Supabase] saveNoteAtomic failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ★ history에서 사용자 데이터 재구성 (응급 복구용)
  async function rebuildFromHistory(email) {
    try {
      const { data, error } = await client.rpc('rebuild_user_from_history', {
        p_email: email,
      });
      if (error) throw error;
      return { ok: true, scenarios: data || [] };
    } catch (e) {
      console.warn('[Supabase] rebuildFromHistory failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 가입 성공 시 호출, 코드별 사용 카운트 +1 (RPC, security definer)
  async function incrementCodeUsage(code) {
    if (!code) return;
    try {
      await client.rpc('increment_pilot_code_used', { p_code: code });
    } catch (e) {
      console.warn('[Supabase] incrementCodeUsage failed:', e.message);
    }
  }

  async function signup(profile) {
    try {
      // 가입 자체는 자유, 실제 사옥(mainboard) 입장 권한은
      // simulator.html 페이월에서 checkInviteCode + unlock 플래그로 별도 검증한다.

      // ★ 중복 가입 방지, upsert(덮어쓰기) 대신 insert로 변경.
      // 같은 이메일이 이미 있으면 서버에서 거부, 진도 데이터 보호.
      // 클라이언트(onboarding)에서도 사전 가드(fetchByEmail) 한 번 더 함.

      // localStorage 형식 → Supabase 컬럼 매핑
      const row = {
        email: profile.email,
        name: profile.name,
        signup_date: profile.signupDate,
        agreed_at: profile.agreedAt || profile.signupDate,
        emp_number: profile.empNumber,
        department: profile.department,
        mentor: profile.mentor,
        coworkers: profile.coworkers || [],
        level: profile.level,
        unlocked: !!profile.unlocked,
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

      // ★ .select().single() 안 함, RLS가 anon에게 SELECT 권한 안 줘서 방금 넣은 row도 못 읽음.
      //   INSERT 만 시도, 에러 없으면 성공으로 본다.
      const { error } = await client
        .from('users')
        .insert(row);

      if (error) {
        const isDup = error.code === '23505'
          || /duplicate|already exists|unique/i.test(error.message || '');
        if (isDup) {
          return {
            ok: false,
            duplicate: true,
            error: '이미 가입된 이메일이에요. 메인 화면에서 \"다시 출근하기\"를 이용해주세요.',
          };
        }
        throw error;
      }

      // signup 이벤트 로그는 user.id 가 필요한데 못 읽으니 생략 (이벤트는 나중에 매직링크 로그인 후 기록)
      console.log('[Supabase] signup saved:', row.email);
      return { ok: true, user: row };
    } catch (e) {
      console.warn('[Supabase] signup failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ============================================================
  // 진도 업데이트, Day 변경, 시나리오 완료 시
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
  // 이벤트 로그, 학습 활동 기록
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
  // 운영자 뷰, 모든 사용자 가져오기
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
  // 운영자 뷰, 통계 (operator_stats view)
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
  async function sendNotice({ type, title, body, fromName, popup }) {
    try {
      const { data, error } = await client
        .from('notices')
        .insert({
          type, title, body,
          from_name: fromName || '유버디 (Buddy)',
          popup: !!popup,
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

  async function updateNotice(id, { type, title, body, popup }) {
    try {
      const patch = {};
      if (type !== undefined)  patch.type = type;
      if (title !== undefined) patch.title = title;
      if (body !== undefined)  patch.body = body;
      if (popup !== undefined) patch.popup = !!popup;
      const { data, error } = await client
        .from('notices')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return { ok: true, notice: data };
    } catch (e) {
      console.warn('[Supabase] update notice failed:', e.message);
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

  async function deleteNotice(id) {
    try {
      const { error } = await client
        .from('notices')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('[Supabase] delete notice failed:', e.message);
      return { ok: false, error: e.message };
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
  // ★ 멤버십 퇴직 처리 (구독 취소)
  // 사용자에게 "인수인계 기간" daysGrace(기본 30일) 부여 후 자동 만료.
  // 만료일 이후 mainboard 진입 시 simulator.html?expired=1 로 차단.
  // ============================================================
  async function cancelMembership(email, daysGrace = 30) {
    if (!email) return { ok: false, error: '이메일이 필요해요.' };
    try {
      const now = new Date();
      const ends = new Date();
      ends.setDate(ends.getDate() + (Number(daysGrace) || 30));
      const { data, error } = await client
        .from('users')
        .update({
          membership_cancel_at: now.toISOString(),
          membership_ends_at: ends.toISOString(),
          last_active: now.toISOString(),
        })
        .eq('email', email)
        .select()
        .single();
      if (error) throw error;
      return { ok: true, user: data, endsAt: ends.toISOString() };
    } catch (e) {
      console.warn('[Supabase] cancelMembership failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ★ 퇴직 취소 (복직, 인수인계 기간 중 마음 바뀐 경우)
  async function restoreMembership(email) {
    if (!email) return { ok: false, error: '이메일이 필요해요.' };
    try {
      const { data, error } = await client
        .from('users')
        .update({
          membership_cancel_at: null,
          membership_ends_at: null,
          last_active: new Date().toISOString(),
        })
        .eq('email', email)
        .select()
        .single();
      if (error) throw error;
      return { ok: true, user: data };
    } catch (e) {
      console.warn('[Supabase] restoreMembership failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ============================================================
  // 이메일 존재 여부만 확인 (RLS 우회용, SECURITY DEFINER RPC 호출)
  // anon 상태에서 fetchByEmail 못 쓰는 케이스에 사용:
  //   - LoginScreen: 매직링크 보내기 전 가입자인지 확인
  //   - signup 중복 가드: 새 이메일이 이미 가입돼있는지 확인
  // ============================================================
  async function emailExists(email) {
    if (!email) return { ok: true, exists: false };
    try {
      const { data, error } = await client.rpc('email_exists', { p_email: email.trim() });
      if (error) throw error;
      return { ok: true, exists: !!data };
    } catch (e) {
      console.warn('[Supabase] emailExists failed:', e.message);
      return { ok: false, exists: false, error: e.message };
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
  // ★ 정규화 테이블 저장·조회 헬퍼 (2026-05-19 추가, RLS 사고 대응)
  // submissions / submissions_history / notes / journals
  // 모두 RPC만 통로. write-through verify로 저장 성공 확인.
  // ============================================================

  // 시나리오 영작 저장 + verify
  // payload.status === 'draft' 면 answer_text 빈 문자열도 허용 (mc 선택만 저장하는 케이스 포함)
  async function saveSubmission(email, day, payload) {
    if (!email || !day || !payload) {
      return { ok: false, error: 'invalid args' };
    }
    const isSubmitted = (payload.status || 'submitted') === 'submitted';
    if (isSubmitted && !payload.answer_text) {
      return { ok: false, error: 'submitted requires answer_text' };
    }
    try {
      const { data, error } = await client.rpc('save_submission', {
        p_email: email,
        p_day: Number(day),
        p_payload: payload,
      });
      if (error) throw error;

      // write-through verify, 제출 상태일 때만 본문 일치 확인 (draft는 mc만 갱신할 수 있음)
      let verified = true;
      if (isSubmitted) {
        const { data: verify, error: vErr } = await client.rpc('get_user_day', {
          p_email: email,
          p_day: Number(day),
        });
        verified = !vErr
          && verify && verify.submission
          && verify.submission.answer_text === payload.answer_text;
      }
      return { ok: true, verified: !!verified, result: data };
    } catch (e) {
      console.warn('[Supabase] saveSubmission failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 단어 노트 저장 (1row = 1note)
  async function saveNoteRow(email, day, text, label, kind) {
    if (!email || !day || !text) return { ok: false, error: 'invalid args' };
    try {
      const { data, error } = await client.rpc('save_note', {
        p_email: email,
        p_day: Number(day),
        p_text: text,
        p_label: label || null,
        p_kind: kind || null,
      });
      if (error) throw error;
      return { ok: true, result: data };
    } catch (e) {
      console.warn('[Supabase] saveNoteRow failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 업무일지 저장
  async function saveJournalRow(email, day, text) {
    if (!email || !day || !text) return { ok: false, error: 'invalid args' };
    try {
      const { data, error } = await client.rpc('save_journal', {
        p_email: email,
        p_day: Number(day),
        p_text: text,
      });
      if (error) throw error;
      return { ok: true, result: data };
    } catch (e) {
      console.warn('[Supabase] saveJournalRow failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 운영자 조회, 전체 진도
  async function fetchUserProgress(email) {
    if (!email) return { ok: false, rows: [] };
    try {
      const { data, error } = await client.rpc('get_user_progress', { p_email: email });
      if (error) throw error;
      return { ok: true, rows: data || [] };
    } catch (e) {
      console.warn('[Supabase] fetchUserProgress failed:', e.message);
      return { ok: false, rows: [], error: e.message };
    }
  }

  // 운영자 조회, 특정 일자 풀 데이터 (시나리오 + 노트 + 일지 + history)
  async function fetchUserDay(email, day) {
    if (!email || !day) return { ok: false };
    try {
      const { data, error } = await client.rpc('get_user_day', {
        p_email: email,
        p_day: Number(day),
      });
      if (error) throw error;
      return { ok: true, data };
    } catch (e) {
      console.warn('[Supabase] fetchUserDay failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // ★ cross-device hydrate, 사용자 전체 학습 데이터 한 번에 가져오기
  // 반환: { submissions:[...], notes:[...], journals:[...], notice_reads:[ids] }
  async function fetchUserFullData(email) {
    if (!email) return { ok: false };
    try {
      const { data, error } = await client.rpc('get_user_full_data', { p_email: email });
      if (error) throw error;
      return { ok: true, data };
    } catch (e) {
      console.warn('[Supabase] fetchUserFullData failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 데이터 헬스 카운터 (운영 대시보드용)
  async function fetchUserHealth(email) {
    if (!email) return { ok: false };
    try {
      const { data, error } = await client.rpc('get_user_health', { p_email: email });
      if (error) throw error;
      return { ok: true, health: data };
    } catch (e) {
      console.warn('[Supabase] fetchUserHealth failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // Day 진도 저장 (RPC)
  async function saveDayProgress(email, day) {
    if (!email || !day) return { ok: false, error: 'invalid args' };
    try {
      const { data, error } = await client.rpc('save_day_progress', {
        p_email: email,
        p_day: Number(day),
      });
      if (error) throw error;
      return { ok: true, user: data };
    } catch (e) {
      console.warn('[Supabase] saveDayProgress failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 설문 응답 저장 (Day 2 1일차 피드백 등 범용)
  async function saveSurveyResponse(email, surveyKey, responses) {
    if (!email || !surveyKey || !responses) return { ok: false, error: 'invalid args' };
    try {
      const { data, error } = await client.rpc('save_survey_response', {
        p_email: email,
        p_key: surveyKey,
        p_responses: responses,
      });
      if (error) throw error;
      return { ok: true, result: data };
    } catch (e) {
      console.warn('[Supabase] saveSurveyResponse failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 일정 체크 상태 저장 (한 day의 task 객체 union merge)
  async function saveTaskProgress(email, day, tasks) {
    if (!email || !day || !tasks) return { ok: false, error: 'invalid args' };
    try {
      const { data, error } = await client.rpc('save_task_progress', {
        p_email: email,
        p_day: Number(day),
        p_tasks: tasks,
      });
      if (error) throw error;
      return { ok: true, result: data };
    } catch (e) {
      console.warn('[Supabase] saveTaskProgress failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 공지 읽음 마킹 (RPC)
  async function markNoticeRead(email, noticeKey) {
    if (!email || !noticeKey) return { ok: false, error: 'invalid args' };
    try {
      const { data, error } = await client.rpc('mark_notice_read', {
        p_email: email,
        p_notice_key: String(noticeKey),
      });
      if (error) throw error;
      return { ok: true, result: data };
    } catch (e) {
      console.warn('[Supabase] markNoticeRead failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 사용자가 읽은 공지 ID 목록 (페이지 진입 시 hydrate)
  async function fetchNoticeReads(email) {
    if (!email) return { ok: false, keys: [] };
    try {
      const { data, error } = await client.rpc('get_notice_reads', { p_email: email });
      if (error) throw error;
      return { ok: true, keys: (data || []).map(r => r.notice_key) };
    } catch (e) {
      console.warn('[Supabase] fetchNoticeReads failed:', e.message);
      return { ok: false, keys: [], error: e.message };
    }
  }

  // 피드백 (사용자 → 운영자)
  async function submitFeedback({ email, name, day, category, message, context }) {
    if (!message || !message.trim()) return { ok: false, error: 'empty_message' };
    try {
      const { data, error } = await client
        .from('feedback')
        .insert({
          email: email || null,
          name: name || null,
          day: day || null,
          category: category || 'general',
          message: message.trim(),
          context: context || null,
        })
        .select()
        .single();
      if (error) throw error;
      return { ok: true, feedback: data };
    } catch (e) {
      console.warn('[Supabase] submitFeedback failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async function fetchFeedback(limit = 100) {
    try {
      const { data, error } = await client
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { ok: true, feedback: data };
    } catch (e) {
      console.warn('[Supabase] fetchFeedback failed:', e.message);
      return { ok: false, feedback: [] };
    }
  }

  async function setFeedbackResolved(id, resolved) {
    try {
      const { error } = await client
        .from('feedback')
        .update({ resolved: !!resolved })
        .eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('[Supabase] setFeedbackResolved failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  async function deleteFeedback(id) {
    try {
      const { error } = await client.from('feedback').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('[Supabase] deleteFeedback failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  // 공지별 확인(읽음) 사람 수 집계 (운영자용). notice_key 기준 distinct email 수.
  async function fetchNoticeReadCounts() {
    try {
      const { data, error } = await client.rpc('get_notice_read_counts');
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => { map[r.notice_key] = Number(r.cnt) || 0; });
      return { ok: true, counts: map };
    } catch (e) {
      console.warn('[Supabase] fetchNoticeReadCounts failed:', e.message);
      return { ok: false, counts: {} };
    }
  }

  // ============================================================
  // ★ Outbox, DB write 실패 시 queue → 재시도. localStorage가 큐 저장소.
  // 페이지 진입 + online 이벤트 + 60초 간격으로 flush.
  // ============================================================
  const OUTBOX_KEY = '__OD_OUTBOX';

  function _readOutbox() {
    try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (e) { return []; }
  }
  function _writeOutbox(arr) {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(arr)); } catch (e) {}
    _renderOutboxBadge();
  }
  function _renderOutboxBadge() {
    try {
      const q = _readOutbox();
      const el = document.getElementById('__od_outbox_badge');
      if (!el) return;
      if (!q.length) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.textContent = '저장 대기 ' + q.length + '건 (자동 재시도 중)';
    } catch (e) {}
  }
  function pushOutbox(op) {
    const q = _readOutbox();
    q.push({ ...op, queuedAt: Date.now() });
    _writeOutbox(q);
  }
  async function flushOutbox() {
    const q = _readOutbox();
    if (!q.length) return { ok: true, drained: 0 };
    const remaining = [];
    let drained = 0;
    for (const op of q) {
      let r;
      try {
        switch (op.type) {
          case 'submission': r = await saveSubmission(op.email, op.day, op.payload); break;
          case 'note':       r = await saveNoteRow(op.email, op.day, op.text, op.label, op.kind); break;
          case 'journal':    r = await saveJournalRow(op.email, op.day, op.text); break;
          case 'day':        r = await saveDayProgress(op.email, op.day); break;
          case 'task':       r = await saveTaskProgress(op.email, op.day, op.tasks); break;
          case 'notice':     r = await markNoticeRead(op.email, op.noticeKey); break;
          default:           r = { ok: false, error: 'unknown op' };
        }
      } catch (e) { r = { ok: false, error: e.message }; }
      if (r && r.ok) drained++;
      else remaining.push(op);
    }
    _writeOutbox(remaining);
    return { ok: true, drained, remaining: remaining.length };
  }

  // 부팅 시 1회 + online 이벤트 + 60초 주기
  setTimeout(() => { _renderOutboxBadge(); flushOutbox().catch(() => {}); }, 1500);
  window.addEventListener('online', () => { flushOutbox().catch(() => {}); });
  setInterval(() => { flushOutbox().catch(() => {}); }, 60_000);

  // ============================================================
  // ★ 외부 미러 (Slack incoming webhook), 데이터 보험
  // window.__INTEGRATIONS_CONFIG.slackWebhookUrl 설정돼있어야 동작
  // ============================================================
  async function sendSlackMirror(op) {
    try {
      const cfg = window.__INTEGRATIONS_CONFIG;
      const url = cfg && cfg.slackWebhookUrl;
      if (!url) return { ok: false, reason: 'no webhook configured' };
      const ts = new Date().toISOString();
      const text =
        '[' + ts + '] ' + (op.type || 'event') +
        ' | ' + (op.email || '?') +
        ' | Day ' + (op.day || '?') +
        '\n```' + JSON.stringify(op, null, 2) + '```';
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
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
    incrementCodeUsage,
    saveScenarioAtomic,
    saveNoteAtomic,
    rebuildFromHistory,
    sendMagicLink,
    getCurrentSession,
    signOut,
    updateProgress,
    logEvent,
    fetchAllUsers,
    fetchStats,
    fetchByEmail,
    sendNotice,
    fetchNotices,
    deleteNotice,
    updateNotice,
    fetchNoticeReadCounts,
    submitFeedback,
    fetchFeedback,
    setFeedbackResolved,
    deleteFeedback,
    saveWaitlistEntry,
    fetchWaitlist,
    cancelMembership,
    restoreMembership,
    emailExists,
    // 2026-05-19 추가
    saveSubmission,
    saveNoteRow,
    saveJournalRow,
    saveDayProgress,
    saveTaskProgress,
    saveSurveyResponse,
    markNoticeRead,
    fetchNoticeReads,
    fetchUserProgress,
    fetchUserDay,
    fetchUserHealth,
    fetchUserFullData,
    sendSlackMirror,
    pushOutbox,
    flushOutbox,
  };
  console.log('[Supabase] client ready');
})();
