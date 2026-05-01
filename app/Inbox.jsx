/* global React */
const { useState: useS_in, useState: _, useEffect: useE_in } = React;

// ============================================================
// Inbox / Notice page (full)
// ============================================================
function InboxPage({ notices, onOpenNotice }) {
  return (
    <div>
      <div className="pane-header">
        <div className="pane-eyebrow">INBOX · 유버디로부터</div>
        <h1 className="pane-title"><em>Mail from</em> Buddy<span className="kr">유버디가 보낸 공지함.</span></h1>
      </div>
      <div className="notice-list">
        {notices.map(n => (
          <div key={n.id} className={"notice-row " + (n.unread ? "unread" : "")} onClick={() => onOpenNotice(n)}>
            <span className="notice-dot"></span>
            <div style={{ minWidth: 0 }}>
              <div className="notice-from">{n.from} · {n.fromHandle} {n.pinned ? <span className="notice-pin">📌 PINNED</span> : null}</div>
              <div className="notice-subject">{n.subject}</div>
              <div className="notice-preview">{n.preview}</div>
            </div>
            <div className="notice-date">{window.formatDate(n.date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MyPage — 구독/Saved Point/일시중지/알림설정
// ============================================================
function MyPage({ user, setUser }) {
  const [confirmPause, setConfirmPause] = useS_in(false);

  const togglePause = () => {
    if (user.subscriptionStatus === "active") setConfirmPause(true);
    else {
      // resume
      setUser({ ...user, subscriptionStatus: "active" });
      alert("재구독 완료! Saved Point + 1일부터 단어 제공이 재개됩니다.");
    }
  };

  const confirmDoPause = () => {
    setUser({ ...user, subscriptionStatus: "paused", savedPoints: user.savedPoints + (30 - user.studied.length) });
    setConfirmPause(false);
  };

  return (
    <div>
      <div className="pane-header">
        <div className="pane-eyebrow">MY · 구독 관리</div>
        <h1 className="pane-title"><em>Hello,</em> {user.name}<span className="kr">구독 상태와 알림을 관리하세요.</span></h1>
      </div>

      <div className="mypage-grid">
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: "var(--muted)", textTransform: "uppercase" }}>SUBSCRIPTION</span>
            <span className={"status-pill " + (user.subscriptionStatus === "active" ? "green" : "muted")}>{user.subscriptionStatus === "active" ? "● 진행 중" : "● 일시중지"}</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ink-hi)", letterSpacing: "-0.03em", marginTop: 6, fontFamily: "'Noto Sans KR', sans-serif" }}>월 9,900원 플랜</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.6 }}>매일 오전 8시 비즈니스 단어 1개 + 누적 단어 사전 + 월말 시험 페이지</div>
          <div style={{ marginTop: 18 }}>
            <div className="kvrow"><span className="k">구독 시작일</span><span className="v">{user.subscribedAt}</span></div>
            <div className="kvrow"><span className="k">현재 일자</span><span className="v">Day {user.currentDay}</span></div>
            <div className="kvrow"><span className="k">다음 결제일</span><span className="v">2026-05-16</span></div>
            <div className="kvrow"><span className="k">결제 수단</span><span className="v">카카오페이 ··· 7842</span></div>
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
            <button className={"btn " + (user.subscriptionStatus === "active" ? "btn-danger" : "btn-primary")} onClick={togglePause}>
              {user.subscriptionStatus === "active" ? "일시중지" : "재구독하기"}
            </button>
            <button className="btn btn-ghost">결제수단 변경</button>
          </div>
        </div>

        <div className="card card-soft" style={{ padding: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: "var(--muted)", textTransform: "uppercase" }}>SAVED POINT</span>
          <div style={{ fontSize: 44, fontWeight: 900, color: "var(--orange)", lineHeight: 1, letterSpacing: "-0.04em", marginTop: 6, fontFamily: "'Noto Sans KR', sans-serif" }}>{user.savedPoints}<span style={{ fontSize: 18, color: "var(--muted)", marginLeft: 4, fontWeight: 500 }}>일</span></div>
          <div className="savedpoint-bar" style={{ marginTop: 14 }}>
            <div className="savedpoint-bar-fill" style={{ width: Math.min(100, (user.savedPoints / 30) * 100) + "%" }}></div>
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65, wordBreak: "keep-all" }}>
            일시중지 기간 동안엔 단어가 제공되지 않아요. <br/>
            <b style={{ color: "var(--orange-dark)" }}>재구독 시 Saved Point + 1일</b>부터 단어 제공이 재개됩니다.
            (예: 14일째 일시중지 → 재구독 시 Day 15 단어부터)
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: "var(--muted)", textTransform: "uppercase" }}>NOTIFICATIONS</span>
          <div style={{ marginTop: 14 }}>
            <NotifRow label="매일 단어 도착 알림" sub="오전 8시" value={user.notificationsEnabled} onChange={() => setUser({ ...user, notificationsEnabled: !user.notificationsEnabled })} />
            <NotifRow label="스트릭 끊기 직전 리마인더" sub="저녁 9시" value={true} />
            <NotifRow label="월말 시험 안내" sub="매월 말일" value={true} />
            <NotifRow label="유버디 공지" sub="수시" value={true} />
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: "var(--muted)", textTransform: "uppercase" }}>STATS</span>
          <div style={{ marginTop: 14 }}>
            <div className="kvrow"><span className="k">학습한 단어</span><span className="v">{user.studied.length}개</span></div>
            <div className="kvrow"><span className="k">미학습 단어</span><span className="v">{user.unstudied.length}개</span></div>
            <div className="kvrow"><span className="k">스트릭</span><span className="v">{user.streak}일</span></div>
            <div className="kvrow"><span className="k">최근 시험 점수</span><span className="v">{user.testHistory[0] ? `${user.testHistory[0].score}/${user.testHistory[0].total}` : "—"}</span></div>
          </div>
        </div>
      </div>

      {confirmPause && (
        <div className="modal-backdrop" onClick={() => setConfirmPause(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: 440 }}>
            <div className="modal-from">⚠️ 일시중지 확인</div>
            <div className="modal-subject">정말 일시중지하시겠어요?</div>
            <div className="modal-body" style={{ borderTop: 0, marginTop: 14, paddingTop: 0 }}>
              일시중지 시 다음달부터 단어 제공이 멈춰요. 재구독하면 Saved Point + 1일부터 단어가 다시 도착합니다. 학습 기록은 그대로 유지됩니다.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmPause(false)} style={{ flex: 1, justifyContent: "center" }}>취소</button>
              <button className="btn btn-danger" onClick={confirmDoPause} style={{ flex: 1, justifyContent: "center" }}>일시중지</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NotifRow({ label, sub, value, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px dashed var(--line)" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
      </div>
      <div className={"toggle " + (value ? "on" : "")} onClick={onChange}></div>
    </div>
  );
}

window.InboxPage = InboxPage;
window.MyPage = MyPage;
