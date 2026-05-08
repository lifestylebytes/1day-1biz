/* global React */
const { useState, useMemo } = React;

// ============================================================
// 업무 노트 = 라이브러리
// ============================================================
function LibraryPage({ openScene }) {
  const { SCENARIOS, CHARACTERS, USER } = window.__SIM;
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [npcFilter, setNpcFilter] = useState("all");

  const accessible = SCENARIOS.filter(s => s.day <= USER.currentDay);
  const filtered = accessible.filter(s => {
    if (filter === "studied" && s.status !== "studied") return false;
    if (filter === "today" && s.status !== "today") return false;
    if (npcFilter !== "all" && s.npc !== npcFilter) return false;
    if (search && !s.word.toLowerCase().includes(search.toLowerCase()) && !(s.meaning || "").includes(search)) return false;
    return true;
  });
  const locked = SCENARIOS.filter(s => s.day > USER.currentDay);

  return (
    <div>
      <div className="desk-header">
        <div>
          <div className="desk-eyebrow">RECORDS · 업무 노트 (Vocabulary Notebook)</div>
          <h1 className="desk-title"><em>지금까지</em> 만난 비즈니스 단어</h1>
        </div>
        <div className="desk-meta"><b>{accessible.length}</b>개 수집 · {USER.totalDays - USER.currentDay}일 남음</div>
      </div>

      <ApprovalLine doc="YB-NOTE-2026" applicant={USER.name} status={`${accessible.length} / ${USER.totalDays} 수집`} />

      <div className="filter-row">
        <button className={"filter-chip " + (filter === "all" ? "active" : "")} onClick={() => setFilter("all")}>전체 {accessible.length}</button>
        <button className={"filter-chip " + (filter === "studied" ? "active" : "")} onClick={() => setFilter("studied")}>학습완료</button>
        <button className={"filter-chip " + (filter === "today" ? "active" : "")} onClick={() => setFilter("today")}>오늘</button>
        <input className="filter-search" placeholder="단어 / 뜻 검색…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="filter-row" style={{ marginTop: -8 }}>
        <span style={{ fontSize: 10.5, color: "var(--ink-mute)", letterSpacing: "0.16em", fontWeight: 800 }}>NPC ·</span>
        <button className={"filter-chip " + (npcFilter === "all" ? "active" : "")} onClick={() => setNpcFilter("all")}>전체</button>
        {Object.values(CHARACTERS).filter(c => c.id !== "hr").map(c => (
          <button key={c.id} className={"filter-chip " + (npcFilter === c.id ? "active" : "")} onClick={() => setNpcFilter(c.id)} style={npcFilter === c.id ? { background: c.color, borderColor: c.color, color: "#fff" } : {}}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="word-rolodex">
        {filtered.map(s => {
          const c = CHARACTERS[s.npc];
          return (
            <button key={s.day} className={"biz-card " + (s.status === "today" ? "today" : "")} onClick={() => openScene(s)}>
              <div className="biz-card-head">
                <span className="biz-card-day">DAY {String(s.day).padStart(2, "0")}</span>
                <span>{s.status === "today" ? "● 오늘" : "✓ 완료"}</span>
              </div>
              <div className="biz-card-word">{s.word}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-mute)", fontWeight: 600 }}>{s.pos} · {s.phonetic}</div>
              <div className="biz-card-meaning">{s.meaning}</div>
              <div className="biz-card-foot">
                <span className="biz-card-npc">
                  <span className="biz-card-npc-dot" style={{ background: c.color }}></span>
                  {c.name}
                </span>
                <span>{(s.tags || []).map(t => "#" + t).join(" ")}</span>
              </div>
            </button>
          );
        })}
        {locked.slice(0, 4).map(s => (
          <div key={s.day} className="biz-card locked">
            <div className="biz-card-head"><span className="biz-card-day">DAY {String(s.day).padStart(2, "0")}</span><span>🔒 잠금</span></div>
            <div className="biz-card-word">{s.word}</div>
            <div className="biz-card-meaning" style={{ color: "var(--ink-mute)" }}>Day {s.day}에 만나요</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 분기 평가 = 시험
// ============================================================
function TestPage() {
  const { SCENARIOS, CHARACTERS, USER } = window.__SIM;
  const studied = SCENARIOS.filter(s => s.status === "studied");
  const [phase, setPhase] = useState("idle");
  const [count, setCount] = useState(5);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);

  // Hooks must be called unconditionally — keep at top
  const cur = queue[idx];
  const opts = useMemo(() => {
    if (!cur) return [];
    const others = studied.filter(o => o.day !== cur.day).sort(() => Math.random() - 0.5).slice(0, 3).map(o => o.word);
    return [...others, cur.word].sort(() => Math.random() - 0.5);
  }, [cur && cur.day, idx]);

  function start(n) {
    const shuffled = [...studied].sort(() => Math.random() - 0.5).slice(0, n);
    setQueue(shuffled); setIdx(0); setResults([]); setPicked(null); setPhase("playing");
  }

  if (phase === "idle") {
    return (
      <div>
        <div className="desk-header">
          <div>
            <div className="desk-eyebrow">EVALUATION · 분기 평가</div>
            <h1 className="desk-title"><em>롤플레이</em> 시험 응시</h1>
          </div>
          <div className="desk-meta"><b>총 {studied.length}개</b> 학습 완료<br/>5개 시추에이션 무작위</div>
        </div>
        <ApprovalLine doc="YB-EVAL-Q1" applicant={USER.name} status="응시 대기" />

        <div className="eval-wrap">
          <div className="eval-head">
            <div>
              <div className="eval-head-sub">QUARTERLY EVALUATION</div>
              <div className="eval-head-title">5개 시추에이션 · 객관식 4지선다</div>
            </div>
            <div className="stamp">평가</div>
          </div>
          <div className="eval-body">
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-soft)", marginBottom: 18 }}>
              실제 회의/이메일 상황이 주어집니다. 빈 칸에 들어갈 가장 자연스러운 영어 표현을 4개 보기에서 선택하세요.<br/>
              <b style={{ color: "var(--ink)" }}>틀려도 정답을 보여드려요. 모르는 단어는 다시 학습 노트에서 복습 가능.</b>
            </div>
            <div className="row">
              {[3, 5, 10].filter(n => n <= studied.length).map(n => (
                <button key={n} className={"filter-chip " + (count === n ? "active" : "")} onClick={() => setCount(n)}>{n}문제</button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 22 }}>
              <button className="btn btn-primary" onClick={() => start(count)} disabled={studied.length === 0}>
                평가 시작 · {count}문제 →
              </button>
              <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>실제 평가는 Day 30 자동 응시</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const correct = results.filter(r => r.ok).length;
    return (
      <div>
        <div className="desk-header">
          <div>
            <div className="desk-eyebrow">RESULT · 평가 결과서</div>
            <h1 className="desk-title"><em>{correct === queue.length ? "전원 통과!" : "수고했어요"}</em></h1>
          </div>
        </div>
        <div className="eval-wrap">
          <div className="eval-head">
            <div className="eval-head-title">평가 결과서</div>
            <div className={"stamp " + (correct >= queue.length * 0.6 ? "" : "blue")}>
              {correct === queue.length ? "통과" : correct >= queue.length * 0.6 ? "재검토" : "보류"}
            </div>
          </div>
          <div className="eval-body">
            <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: "-0.04em", color: "var(--orange)", lineHeight: 1 }}>
              {correct}<span style={{ fontSize: 24, color: "var(--ink-mute)", fontWeight: 600 }}> / {queue.length}</span>
            </div>
            <div style={{ marginTop: 12, fontSize: 14, color: "var(--ink-soft)" }}>
              {correct === queue.length ? "사수가 칭찬해요. 다음 평가도 이대로!" : "틀린 문제는 업무 노트에서 다시 만나요."}
            </div>
            <div className="row" style={{ marginTop: 22 }}>
              <button className="btn btn-primary" onClick={() => start(count)}>다시 풀기 →</button>
              <button className="btn btn-ghost" onClick={() => setPhase("idle")}>설정으로</button>
            </div>
            <hr className="divider" />
            <div className="label-doc" style={{ marginBottom: 10 }}>풀이 기록</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {results.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: r.ok ? "rgba(74,124,89,0.06)" : "rgba(178,58,44,0.06)", border: "1px solid var(--line)", fontSize: 13 }}>
                  <span style={{ fontWeight: 800, color: "var(--ink)" }}>{queue[i].word}</span>
                  <span style={{ fontWeight: 800, color: r.ok ? "var(--green)" : "var(--stamp-red)", letterSpacing: "0.04em", fontSize: 11 }}>
                    {r.ok ? "✓ 정답" : "✗ 오답"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // playing
  const npc = CHARACTERS[cur.npc];
  const cells = queue.map((_, i) => {
    if (i < results.length) return results[i].ok ? "done" : "wrong";
    if (i === idx) return "current";
    return "";
  });

  function pick(opt) {
    if (picked) return;
    const ok = opt === cur.word;
    setPicked(opt);
    setTimeout(() => {
      const next = [...results, { ok, picked: opt }];
      setResults(next);
      if (idx + 1 >= queue.length) { setPhase("done"); return; }
      setIdx(idx + 1); setPicked(null);
    }, 1200);
  }

  return (
    <div>
      <div className="desk-header">
        <div>
          <div className="desk-eyebrow">EVALUATION · IN PROGRESS</div>
          <h1 className="desk-title">{idx + 1} / {queue.length} 문제</h1>
        </div>
      </div>
      <div className="eval-wrap">
        <div className="eval-head">
          <div className="eval-head-sub">Q. {idx + 1} / {queue.length}</div>
          <div className="eval-head-title">{cur.tags && cur.tags.map(t => "#" + t).join(" ")}</div>
        </div>
        <div className="eval-body">
          <div className="eval-progress">
            {cells.map((c, i) => <div key={i} className={"eval-progress-cell " + c}></div>)}
          </div>
          <div className="eval-q-num">SITUATION</div>
          <div className="eval-q-scene">📍 {cur.scene}</div>
          <div className="scene-quote-row" style={{ marginTop: 14 }}>
            <div className="scene-avatar" style={{ background: npc.color }}>{npc.avatar}</div>
            <div style={{ flex: 1 }}>
              <div className="scene-npc-name">{npc.name}</div>
              <div className="scene-quote-bubble">
                "{cur.quote.split(cur.word).map((p, i, arr) => (
                  <React.Fragment key={i}>
                    {p}
                    {i < arr.length - 1 ? <span style={{ background: "var(--ink)", color: "var(--paper)", padding: "1px 16px", letterSpacing: "0.5em" }}>____</span> : null}
                  </React.Fragment>
                ))}"
              </div>
            </div>
          </div>
          <div className="label-doc" style={{ marginTop: 22 }}>빈 칸에 들어갈 표현은?</div>
          <div className="eval-options">
            {opts.map((o, i) => {
              let cls = "";
              if (picked) {
                if (o === cur.word) cls = "correct";
                else if (o === picked) cls = "wrong";
              } else if (o === picked) cls = "selected";
              return (
                <button key={o} className={"eval-option " + cls} onClick={() => pick(o)}>
                  <span className="eval-option-letter">{String.fromCharCode(65 + i)}</span>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 사내 메모 = 인박스
// ============================================================
function InboxPage({ openMemo }) {
  const { NOTICES, CHARACTERS, USER } = window.__SIM;
  return (
    <div>
      <div className="desk-header">
        <div>
          <div className="desk-eyebrow">INTRANET · 사내 메모함</div>
          <h1 className="desk-title"><em>유버디</em> 사내 메모</h1>
        </div>
        <div className="desk-meta"><b>{NOTICES.filter(n => n.unread).length}건</b> 미확인</div>
      </div>
      <ApprovalLine doc="YB-MEMO" applicant={USER.name} status={`${NOTICES.length}건 수신`} />

      <div className="inbox-list">
        {NOTICES.map(n => {
          const c = CHARACTERS[n.from];
          return (
            <button key={n.id} className={"inbox-row " + (n.unread ? "unread" : "")} onClick={() => openMemo(n)}>
              <div className="memo-from-avatar" style={{ background: c.color }}>{c.avatar}</div>
              <div className="inbox-from">{c.name}<br/><small style={{ color: "var(--ink-mute)", fontWeight: 500 }}>{c.role}</small></div>
              <div className="inbox-subject">
                <span className={"memo-tag " + (n.tag === "필수" ? "req" : "")}>{n.tag}</span>
                {n.subject}
                <small>· {n.preview.slice(0, 40)}…</small>
              </div>
              <div className="inbox-date">{n.date}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// 사원증 = 마이페이지
// ============================================================
function MyPage() {
  const { USER, CHARACTERS } = window.__SIM;
  const [notif, setNotif] = useState(true);
  const [notifTime, setNotifTime] = useState("09:00");
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPause, setShowPause] = useState(false);

  return (
    <div>
      <div className="desk-header">
        <div>
          <div className="desk-eyebrow">HR FILE · 사원증 / 인사 기록</div>
          <h1 className="desk-title"><em>{USER.name}</em>님의 사원 기록부</h1>
        </div>
        <div className="desk-meta"><b>입사일</b><br/>{USER.joinDate}</div>
      </div>
      <ApprovalLine doc="YB-HR-001" applicant={USER.name} status="수습 진행 중" />

      <div className="id-card">
        <div className="id-card-clip"></div>
        <div className="id-card-strip">
          <span>YOUBUDDY KOREA · EMPLOYEE ID</span>
          <b>NO. 2026-0416</b>
        </div>
        <div className="id-card-body">
          <div className="id-card-photo">{USER.name[0]}</div>
          <div className="id-card-fields" style={{ flex: 1 }}>
            <div className="id-field"><span className="id-field-label">성명</span><span className="id-field-value">{USER.name}</span></div>
            <div className="id-field"><span className="id-field-label">직급</span><span className="id-field-value">{USER.position} · {USER.positionEn}</span></div>
            <div className="id-field"><span className="id-field-label">소속</span><span className="id-field-value">{USER.team}</span></div>
            <div className="id-field"><span className="id-field-label">입사일</span><span className="id-field-value">{USER.joinDate}</span></div>
            <div className="id-field"><span className="id-field-label">수습</span><span className="id-field-value">DAY {USER.currentDay} / {USER.totalDays} · 🔥 {USER.streak}</span></div>
          </div>
        </div>
        <div className="id-card-foot">
          <span>유효기간 · 2026.04.16 ~ 2026.05.15 (수습)</span>
          <span><b>{USER.vacationDays}일</b> 휴가 보유</span>
        </div>
      </div>

      <div className="badge-row" style={{ justifyContent: "center", marginTop: 22 }}>
        {USER.badges.map(b => <span key={b} className="badge">{b}</span>)}
      </div>

      {/* 내 버디 카드 */}
      <div className="hr-section" style={{ marginTop: 28 }}>
        <div className="hr-section-head">내 버디 · 1:1 글로벌 코치</div>
        <div className="buddy-row">
          <div className="buddy-avatar">{CHARACTERS.buddy.avatar}</div>
          <div style={{ flex: 1 }}>
            <div className="buddy-name">{CHARACTERS.buddy.name} <span className="buddy-online">● 오늘도 출근 중</span></div>
            <div className="buddy-role">{CHARACTERS.buddy.role}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.55 }}>{CHARACTERS.buddy.note}</div>
          </div>
        </div>
        <div className="hr-row"><span className="hr-row-label">사수 · 매일 포스트잇</span><span className="hr-row-value">{CHARACTERS.mentor.name}</span></div>
        <div className="hr-row"><span className="hr-row-label">팀</span><span className="hr-row-value">Strategy · {CHARACTERS.manager.name} 팀장</span></div>
      </div>

      {/* 구독 정보 (읽기) — 가격/결제 정보는 정식 출시 후 노출 */}
      <div className="hr-section" style={{ marginTop: 16 }}>
        <div className="hr-section-head">구독 정보</div>
        <div className="hr-row"><span className="hr-row-label">현재 플랜</span><span className="hr-row-value"><b>1일 1비즈니스</b> · 베타</span></div>
        <div className="hr-row"><span className="hr-row-label">상태</span><span className="hr-row-value" style={{ color: paused ? "var(--ink-mute)" : "var(--green)" }}>{paused ? "● 일시중지" : "● 진행 중"}</span></div>
        <div className="hr-row"><span className="hr-row-label">휴가 (Saved Point)</span><span className="hr-row-value"><b>{USER.vacationDays}일</b> 보관 중 · 자동 이월</span></div>
      </div>

      {/* 설정 (쓰기) — 디스클로저 */}
      <div className="hr-section" style={{ marginTop: 16 }}>
        <button
          className="hr-section-head settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
          style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left" }}
        >
          <span>⚙️ 설정 · Settings</span>
          <span style={{ fontSize: 14, transition: "transform 0.2s", transform: showSettings ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
        </button>
        {showSettings && (
          <>
            <div className="hr-row">
              <span className="hr-row-label">매일 단어 알림</span>
              <button className={"toggle " + (notif ? "on" : "")} onClick={() => setNotif(!notif)}></button>
            </div>
            {notif && (
              <div className="hr-row">
                <span className="hr-row-label" style={{ paddingLeft: 14, fontSize: 12 }}>└ 알림 시간</span>
                <select className="settings-select" value={notifTime} onChange={e => setNotifTime(e.target.value)}>
                  {["07:00","07:30","08:00","08:30","09:00","09:30","10:00","12:00","18:00","21:00"].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="hr-row">
              <span className="hr-row-label">단어 발음 자동 재생</span>
              <button className={"toggle on"}></button>
            </div>
            <div className="hr-row">
              <span className="hr-row-label">사수 피드백 이메일 받기</span>
              <button className={"toggle on"}></button>
            </div>

            {/* 휴직(일시중지) — 한 단계 더 들어가야 보임 */}
            <button
              className="hr-row danger-zone-toggle"
              onClick={() => setShowPause(!showPause)}
              style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "none" }}
            >
              <span className="hr-row-label" style={{ color: "var(--stamp-red)", fontWeight: 800 }}>🚧 휴직 · 구독 일시중지</span>
              <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{showPause ? "닫기 ▲" : "열기 ▼"}</span>
            </button>
            {showPause && (
              <div style={{ background: "rgba(178,58,44,0.04)", padding: "16px 18px", borderTop: "1px dashed var(--line)" }}>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 12 }}>
                  ⚠️ 휴직 신청 시 다음 결제일까지 단어 배달이 멈춰요. 출근부 스트릭은 보존되지만, 누적 학습 기록이 잠깐 비게 됩니다. 복귀 신청은 언제든 가능.
                </div>
                <div className="row">
                  <button className="btn btn-sm btn-ghost" onClick={() => setPaused(!paused)} style={{ borderColor: "var(--stamp-red)", color: "var(--stamp-red)" }}>
                    {paused ? "↻ 복귀하기 (재개)" : "⏸ 휴직 신청"}
                  </button>
                  {paused ? <span style={{ fontSize: 11.5, color: "var(--stamp-red)", fontWeight: 700 }}>● 현재 일시중지 상태</span> : null}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Scene Modal — 시추에이션 상세 + 영어 답변 작성
// ============================================================
function SceneModal({ scenario, onClose }) {
  const { CHARACTERS, BUDDY_ANSWERS } = window.__SIM;
  const npc = CHARACTERS[scenario.npc];
  const buddy = CHARACTERS.buddy;
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [buddyMsgs, setBuddyMsgs] = useState([]);

  function askBuddy(kind) {
    const pool = BUDDY_ANSWERS[kind] || BUDDY_ANSWERS.default;
    const reply = pool[Math.floor(Math.random() * pool.length)];
    const userQ = kind === "nuance" ? "이거 뉘앙스가 좀 헷갈려요" : kind === "example" ? "예문 더 보고 싶어요" : "이 표현 어떻게 외우면 좋을까요?";
    setBuddyMsgs([...buddyMsgs, { from: "me", text: userQ }, { from: "buddy", text: reply }]);
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-doc" onClick={e => e.stopPropagation()}>
        <div className="modal-doc-head">
          <span>SITUATION SHEET · DAY {scenario.day}</span>
          <button onClick={onClose} style={{ color: "var(--paper)", fontSize: 16 }}>✕</button>
        </div>
        <div className="modal-doc-body">
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="label-doc label-orange">▶ 오늘의 단어</span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1.05 }}>{scenario.word}</div>
          <div style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 4, fontWeight: 600 }}>{scenario.pos} · {scenario.phonetic}</div>
          <div style={{ fontSize: 15, color: "var(--ink)", marginTop: 8, fontWeight: 700 }}>{scenario.meaning}</div>

          <hr className="divider" />

          <div className="label-doc">📍 시추에이션</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-soft)", marginTop: 6 }}>{scenario.scene}</div>

          <div className="scene-quote-row" style={{ marginTop: 16 }}>
            <div className="scene-avatar" style={{ background: npc.color }}>{npc.avatar}</div>
            <div style={{ flex: 1 }}>
              <div className="scene-npc-name">{npc.name} · {npc.role}</div>
              <div className="scene-quote-bubble">"{scenario.quote}"</div>
            </div>
          </div>

          <div className="scene-task">
            <div className="scene-task-label">▶ 오늘의 미션</div>
            <div className="scene-task-prompt"><b>{scenario.word}</b> 을(를) 써서 위 상황에 한 마디 답하세요.</div>
            <textarea
              className="scene-input"
              placeholder={`${scenario.word}을(를) 포함한 영어 한 문장…`}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              disabled={submitted}
            />
            {!submitted ? (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={!draft.trim()}>제출 → 사수 피드백 받기</button>
                <button className="btn btn-ghost" onClick={() => setDraft(scenario.sampleAnswer)}>예문 보기</button>
              </div>
            ) : (
              <div style={{ marginTop: 16, padding: 18, background: "#FFE9A6", border: "1px solid var(--line)" }}>
                <div className="postit-from" style={{ marginBottom: 8 }}>▶ 차윤아 사수의 피드백</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink)" }}>
                  좋아요 — <b>{scenario.word}</b> 의 뉘앙스를 잘 잡았어요. 모범 답안도 같이 봐둘게요:
                </div>
                <div style={{ marginTop: 10, padding: 10, background: "rgba(255,255,255,0.5)", fontSize: 13.5, fontWeight: 700 }}>
                  "{scenario.sampleAnswer}"
                </div>
                <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>{scenario.mentorTip}</div>
                <div className="postit-sig">— 차윤아 ✍︎</div>
              </div>
            )}
          </div>

          {/* 버디한테 물어보기 채팅 박스 */}
          <div className="buddy-chat">
            <div className="buddy-chat-head">
              <div className="buddy-avatar small">{buddy.avatar}</div>
              <div>
                <div className="buddy-name">{buddy.name} <span className="buddy-online">● online</span></div>
                <div className="buddy-role">모를 때 부담 없이 물어봐</div>
              </div>
            </div>
            {buddyMsgs.length > 0 && (
              <div className="buddy-chat-log">
                {buddyMsgs.map((m, i) => (
                  <div key={i} className={"buddy-msg " + m.from}>{m.text}</div>
                ))}
              </div>
            )}
            <div className="buddy-chat-quick">
              <button className="quick-q" onClick={() => askBuddy("nuance")}>🗨️ 뉘앙스가 헷갈려요</button>
              <button className="quick-q" onClick={() => askBuddy("example")}>📌 예문 더 주세요</button>
              <button className="quick-q" onClick={() => askBuddy("default")}>💬 어떻게 외워요?</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Memo Modal — 사내 메모 상세
// ============================================================
function MemoModal({ memo, onClose }) {
  const { CHARACTERS } = window.__SIM;
  const c = CHARACTERS[memo.from];
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-doc" onClick={e => e.stopPropagation()}>
        <div className="modal-doc-head">
          <span>INTRANET MEMO</span>
          <button onClick={onClose} style={{ color: "var(--paper)" }}>✕</button>
        </div>
        <div className="modal-doc-body">
          <div className="row" style={{ marginBottom: 14 }}>
            <span className={"memo-tag " + (memo.tag === "필수" ? "req" : "")}>{memo.tag}</span>
            <span className="label-doc">{memo.date}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.25 }}>{memo.subject}</div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", paddingBottom: 14, borderBottom: "1px dashed var(--line)" }}>
            <div className="memo-from-avatar" style={{ background: c.color, width: 36, height: 36, fontSize: 13 }}>{c.avatar}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              <b>{c.name}</b> · {c.role}<br/>
              <span style={{ color: "var(--ink-mute)" }}>받는 사람: {memo.to}</span>
            </div>
          </div>
          <div style={{ marginTop: 18, fontSize: 14, lineHeight: 1.7, color: "var(--ink)" }}>
            {memo.preview}<br/><br/>
            자세한 내용은 인트라넷 게시판에서 확인 부탁드립니다. 문의는 인사팀 (12F) 으로.
          </div>
          <div className="row" style={{ marginTop: 22 }}>
            <button className="btn btn-primary" onClick={onClose}>확인했습니다</button>
            <button className="btn btn-ghost" onClick={onClose}>나중에 보기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// App Shell
// ============================================================
function App() {
  const [active, setActive] = useState("home");
  const [scene, setScene] = useState(null);
  const [memo, setMemo] = useState(null);
  const { NOTICES, USER } = window.__SIM;
  const unread = NOTICES.filter(n => n.unread).length;

  return (
    <div className="office">
      <Locker active={active} setActive={setActive} user={USER} unread={unread} />
      <main className="desk">
        {active === "home" && <HomePage setActive={setActive} openScene={setScene} openMemo={setMemo} />}
        {active === "library" && <LibraryPage openScene={setScene} />}
        {active === "test" && <TestPage />}
        {active === "inbox" && <InboxPage openMemo={setMemo} />}
        {active === "mypage" && <MyPage />}
      </main>
      <MobileTabbar active={active} setActive={setActive} unread={unread} />
      {scene ? <SceneModal scenario={scene} onClose={() => setScene(null)} /> : null}
      {memo ? <MemoModal memo={memo} onClose={() => setMemo(null)} /> : null}
    </div>
  );
}

window.SimApp = App;
