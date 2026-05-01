/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// Sidebar Navigation
// ============================================================
function Sidebar({ active, setActive, unreadNotices, currentDay, streak, isMobile }) {
  if (isMobile) return null;
  const items = [
    { id: "home", label: "오늘", icon: "🏠" },
    { id: "library", label: "누적 단어", icon: "📚", badge: currentDay - 1 },
    { id: "test", label: "단어 시험", icon: "✍️" },
    { id: "inbox", label: "공지함", icon: "✉️", badge: unreadNotices > 0 ? unreadNotices : null },
    { id: "mypage", label: "마이페이지", icon: "⚙️" },
  ];
  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-brand"
        onClick={() => setActive("home")}
        title="홈으로 이동"
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", width: "100%", font: "inherit", color: "inherit" }}
      >
        <div className="sidebar-brand-mark">1</div>
        <div className="sidebar-brand-text">
          <b>1일1비</b>
          <small>BY YOUBUDDY</small>
        </div>
      </button>

      <div className="sidebar-section-label">Today</div>
      {items.slice(0, 1).map((it) => (
        <button key={it.id} className={"sidebar-link " + (active === it.id ? "active" : "")} onClick={() => setActive(it.id)}>
          <span className="sidebar-link-left"><span className="sidebar-link-icon">{it.icon}</span>{it.label}</span>
          {it.badge ? <span className="sidebar-badge">{it.badge}</span> : null}
        </button>
      ))}

      <div className="sidebar-section-label">Library</div>
      {items.slice(1, 3).map((it) => (
        <button key={it.id} className={"sidebar-link " + (active === it.id ? "active" : "")} onClick={() => setActive(it.id)}>
          <span className="sidebar-link-left"><span className="sidebar-link-icon">{it.icon}</span>{it.label}</span>
          {it.badge ? <span className="sidebar-badge">{it.badge}</span> : null}
        </button>
      ))}

      <div className="sidebar-section-label">Inbox</div>
      {items.slice(3).map((it) => (
        <button key={it.id} className={"sidebar-link " + (active === it.id ? "active" : "")} onClick={() => setActive(it.id)}>
          <span className="sidebar-link-left"><span className="sidebar-link-icon">{it.icon}</span>{it.label}</span>
          {it.badge ? <span className="sidebar-badge">{it.badge}</span> : null}
        </button>
      ))}

      <div className="sidebar-streak">
        <span className="sidebar-streak-lbl">🔥 STREAK</span>
        <div className="sidebar-streak-num">{streak}<small>일 연속</small></div>
      </div>
    </aside>
  );
}

// ============================================================
// Mobile Tab Bar
// ============================================================
function MobileTabBar({ active, setActive, unreadNotices }) {
  const tabs = [
    { id: "home", label: "오늘", svg: "M3 12l9-9 9 9M5 10v10h14V10" },
    { id: "library", label: "단어장", svg: "M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4V4zM4 4v16" },
    { id: "test", label: "시험", svg: "M5 4h11l3 3v13a1 1 0 01-1 1H5zM9 12l2 2 4-4" },
    { id: "inbox", label: "공지", svg: "M3 8l9 6 9-6M3 8v10a1 1 0 001 1h16a1 1 0 001-1V8M3 8l9-5 9 5" },
    { id: "mypage", label: "MY", svg: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6" },
  ];
  return (
    <div className="mobile-tabbar">
      {tabs.map((t) => (
        <button key={t.id} className={"mobile-tab " + (active === t.id ? "active" : "")} onClick={() => setActive(t.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={t.svg} />
          </svg>
          <span>{t.label}</span>
          {t.id === "inbox" && unreadNotices > 0 ? <span style={{ position: "absolute", top: 4, right: "30%", width: 6, height: 6, background: "var(--orange)", borderRadius: "50%" }}></span> : null}
        </button>
      ))}
    </div>
  );
}

window.Sidebar = Sidebar;
window.MobileTabBar = MobileTabBar;
