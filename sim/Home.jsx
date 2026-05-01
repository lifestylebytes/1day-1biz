/* global React */
const { useState, useMemo } = React;

// ============================================================
// Sidebar = 사물함
// ============================================================
function Locker({ active, setActive, user, unread }) {
  const items = [
    { id: "home", label: "오늘의 책상", icon: "📋" },
    { id: "library", label: "업무 노트", icon: "📓", badge: user.studiedDays },
    { id: "test", label: "분기 평가", icon: "✍️" },
    { id: "inbox", label: "사내 메모", icon: "✉️", badge: unread > 0 ? unread : null },
    { id: "mypage", label: "사원증 / 인사", icon: "🪪" },
  ];
  return (
    <aside className="locker">
      <button className="locker-brand" onClick={() => setActive("home")} title="홈으로">
        <div className="locker-brand-mark">1</div>
        <div className="locker-brand-text">
          <b>1일1비</b>
          <small>YOUBUDDY KOREA</small>
        </div>
      </button>

      <div className="locker-section">
        <div className="locker-label">Today</div>
        {items.slice(0, 1).map(it => (
          <button key={it.id} className={"locker-link " + (active === it.id ? "active" : "")} onClick={() => setActive(it.id)}>
            <span className="locker-link-l"><span className="locker-link-icon">{it.icon}</span>{it.label}</span>
            {it.badge ? <span className="locker-badge">{it.badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="locker-section">
        <div className="locker-label">Records</div>
        {items.slice(1, 3).map(it => (
          <button key={it.id} className={"locker-link " + (active === it.id ? "active" : "")} onClick={() => setActive(it.id)}>
            <span className="locker-link-l"><span className="locker-link-icon">{it.icon}</span>{it.label}</span>
            {it.badge ? <span className="locker-badge">{it.badge}</span> : null}
          </button>
        ))}
      </div>
      <div className="locker-section">
        <div className="locker-label">Office</div>
        {items.slice(3).map(it => (
          <button key={it.id} className={"locker-link " + (active === it.id ? "active" : "")} onClick={() => setActive(it.id)}>
            <span className="locker-link-l"><span className="locker-link-icon">{it.icon}</span>{it.label}</span>
            {it.badge ? <span className="locker-badge">{it.badge}</span> : null}
          </button>
        ))}
      </div>

      <div className="locker-card">
        <div className="locker-card-row">
          <div className="locker-card-photo">{user.name[0]}</div>
          <div className="locker-card-info">
            <div className="locker-card-name">{user.name}</div>
            <div className="locker-card-pos">{user.position}</div>
          </div>
        </div>
        <div className="locker-card-day">DAY <b>{user.currentDay}</b> / {user.totalDays} · 🔥 {user.streak}일</div>
      </div>
    </aside>
  );
}

// Mobile bottom tab bar
function MobileTabbar({ active, setActive, unread }) {
  const items = [
    { id: "home", label: "오늘", icon: "📋" },
    { id: "library", label: "노트", icon: "🗂️" },
    { id: "test", label: "평가", icon: "📝" },
    { id: "inbox", label: "메모", icon: "📨", badge: unread },
    { id: "mypage", label: "사원증", icon: "🪪" },
  ];
  return (
    <nav className="m-tabbar">
      {items.map(it => (
        <button key={it.id} className={"m-tab " + (active === it.id ? "active" : "")} onClick={() => setActive(it.id)}>
          <span className="m-tab-icon">{it.icon}</span>
          <span className="m-tab-label">{it.label}</span>
          {it.badge ? <span className="m-tab-badge">{it.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

// ============================================================
// 결재 라인 (페이지 상단 공통)
// ============================================================
function ApprovalLine({ doc, applicant, today, status }) {
  return (
    <div className="approval-line">
      <div className="approval-cell">
        <div className="approval-cell-label">문서번호 / DOC</div>
        <div className="approval-cell-value">{doc}</div>
      </div>
      <div className="approval-cell">
        <div className="approval-cell-label">담당 / APPLICANT</div>
        <div className="approval-cell-value">{applicant}</div>
      </div>
      <div className="approval-cell">
        <div className="approval-cell-label">상태 / STATUS</div>
        <div className="approval-cell-value" style={{ color: "var(--orange)", fontWeight: 900 }}>{status}</div>
      </div>
    </div>
  );
}

// ============================================================
// 홈 — 오늘의 책상
// ============================================================
function HomePage({ setActive, openScene, openMemo }) {
  const { SCENARIOS, NOTICES, USER, TODAY_SCHEDULE, CHARACTERS } = window.__SIM;
  const today = SCENARIOS.find(s => s.day === USER.currentDay);
  const npc = CHARACTERS[today.npc];
  const cells = Array.from({ length: 14 }, (_, i) => {
    const day = i + 1;
    if (day < USER.currentDay) return { day, state: "done" };
    if (day === USER.currentDay) return { day, state: "today" };
    return { day, state: "" };
  });

  return (
    <div>
      <div className="desk-header">
        <div>
          <div className="desk-eyebrow">2026.04.30 · 금요일 · DAY {USER.currentDay} / {USER.totalDays}</div>
          <h1 className="desk-title"><em>오늘의</em> 책상 위</h1>
        </div>
        <div className="desk-meta">
          <b>{USER.name}</b> · {USER.position}<br/>
          {USER.team}
        </div>
      </div>

      <ApplicationLine />

      <div className="desk-grid">
        <div className="col">
          <SceneCard scenario={today} npc={npc} onOpen={() => openScene(today)} />

          <div className="schedule">
            <div className="schedule-head">
              <span>오늘 일정 · DAY {USER.currentDay}</span>
              <span style={{ color: "var(--orange)" }}>● 진행 중</span>
            </div>
            {TODAY_SCHEDULE.map((row, i) => (
              <div key={i} className={"schedule-row " + row.status}>
                <span className="schedule-time">{row.time}</span>
                <span>
                  <span className="schedule-title">{row.title}</span>
                  {row.note ? <div className="schedule-note">{row.note}</div> : null}
                </span>
                <span className={"schedule-status " + row.status}>
                  {row.status === "done" ? "완료" : row.status === "now" ? "지금" : "예정"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="col">
          <BuddyCard buddy={CHARACTERS.buddy} day={USER.currentDay} />
          <Postit mentor={CHARACTERS.mentor} text={today.mentorTip} word={today.word} />

          <div className="attendance">
            <div className="attendance-head">
              <span className="attendance-title">출근부 · 14일</span>
              <span className="attendance-num">{USER.streak}<small>일 연속</small></span>
            </div>
            <div className="attendance-cells">
              {cells.map(c => <div key={c.day} className={"att-cell " + c.state} title={`Day ${c.day}`}>{c.state === "" ? c.day : ""}</div>)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 10, lineHeight: 1.5 }}>
              하루도 빠지지 않으면 30일차에 <b style={{ color: "var(--stamp-red)" }}>완주 도장</b> 찍혀요.
            </div>
          </div>

          <div className="memo-box">
            <div className="memo-box-head">
              <span>사내 메모 · INTRANET</span>
              <b>{NOTICES.filter(n => n.unread).length}건</b>
            </div>
            {NOTICES.slice(0, 3).map(n => {
              const c = CHARACTERS[n.from];
              return (
                <button key={n.id} className={"memo-row " + (n.unread ? "unread" : "")} onClick={() => openMemo(n)}>
                  <div className="memo-from-avatar" style={{ background: c.color }}>{c.avatar}</div>
                  <div>
                    <div className="memo-subject">
                      <span className={"memo-tag " + (n.tag === "필수" ? "req" : "")}>{n.tag}</span>
                      {n.subject}
                    </div>
                  </div>
                  <div className="memo-meta">{n.date}</div>
                </button>
              );
            })}
          </div>

          <button className="btn btn-ink" style={{ width: "100%", justifyContent: "center" }} onClick={() => setActive("test")}>
            ✍️ 분기 평가 응시하기 (Day 30 예정) →
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplicationLine() {
  return (
    <ApprovalLine
      doc="YB-2026-04-15"
      applicant="김지원 (수습 사원)"
      status="진행 중 · 수습 15/30일"
    />
  );
}

// ============================================================
// 시추에이션 카드 (홈)
// ============================================================
function SceneCard({ scenario, npc, onOpen }) {
  return (
    <div className="scene-card">
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
        <div className="stamp small">미결</div>
      </div>
      <div className="scene-card-tag">오늘의 시추에이션 · DAY {scenario.day}</div>
      <div className="scene-card-body">
        <div className="scene-card-time">{scenario.tags.map(t => "#" + t).join("  ")}</div>
        <div className="scene-card-scene">📍 {scenario.scene}</div>

        <div className="scene-quote-row">
          <div className="scene-avatar" style={{ background: npc.color }}>{npc.avatar}</div>
          <div style={{ flex: 1 }}>
            <div className="scene-npc-name">{npc.name} · {npc.role}</div>
            <div className="scene-quote-bubble">
              "{scenario.quote.split(scenario.word).map((part, i, arr) => (
                <React.Fragment key={i}>
                  {part}
                  {i < arr.length - 1 ? <span className="scene-target-word">{scenario.word}</span> : null}
                </React.Fragment>
              ))}"
            </div>
          </div>
        </div>

        <div className="scene-task">
          <div className="scene-task-label">▶ 오늘의 미션</div>
          <div className="scene-task-prompt">
            <b>{scenario.word}</b> 를 자연스럽게 써서, 위 상황에 한 마디 답하세요.
          </div>
          <div className="scene-actions">
            <button className="btn btn-primary" onClick={onOpen}>📝 책상에서 작성하기 →</button>
            <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>예상 소요 5분 · 사수 피드백 포함</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Postit({ mentor, text, word }) {
  return (
    <div className="postit">
      <div className="postit-from">▶ {mentor.name} 사수의 메모</div>
      <div>오늘 단어 <b style={{ background: "rgba(255,255,255,0.5)", padding: "1px 5px" }}>{word}</b> 야. {text}</div>
      <div className="postit-sig">— 차윤아 ✍︎</div>
    </div>
  );
}

// ============================================================
// 버디 카드 = 유버디가 매일 한 마디 (1:1 글로벌 코치 컨셉)
// ============================================================
function BuddyCard({ buddy, day }) {
  const { BUDDY_NUDGES } = window.__SIM;
  const nudge = BUDDY_NUDGES[day % BUDDY_NUDGES.length];
  return (
    <div className="buddy-card">
      <div className="buddy-card-head">
        <div className="buddy-avatar">{buddy.avatar}</div>
        <div className="buddy-meta">
          <div className="buddy-name">{buddy.name} <span className="buddy-online">● online</span></div>
          <div className="buddy-role">{buddy.role}</div>
        </div>
      </div>
      <div className="buddy-bubble">
        {nudge.text}
      </div>
      <div className="buddy-time">방금 · 오늘 한 마디</div>
    </div>
  );
}

window.HomePage = HomePage;
window.Locker = Locker;
window.MobileTabbar = MobileTabbar;
window.ApprovalLine = ApprovalLine;
window.BuddyCard = BuddyCard;
