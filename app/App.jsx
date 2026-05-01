/* global React, WORDS, NOTICES, USER_STATE */
const { useState: useS_app, useEffect: useE_app, useMemo: useM_app } = React;

// ============================================================
// Main App — 한 prototype 안에서 페이지 라우팅
// ============================================================
function ProtoApp({ isMobile, layout, cardStyle, testStyle, accent }) {
  const [active, setActive] = useS_app("home");
  const [user, setUser] = useS_app({ ...USER_STATE });
  const [notices, setNotices] = useS_app([...NOTICES]);
  const [openWord, setOpenWord] = useS_app(null);
  const [openNotice, setOpenNotice] = useS_app(null);

  const unreadNotices = notices.filter(n => n.unread).length;

  const onOpenWord = (w) => setOpenWord(w);
  const onCloseWord = () => setOpenWord(null);
  const onMarkStudied = (day, studied) => {
    setUser(u => {
      const studiedSet = new Set(u.studied);
      const unstudiedSet = new Set(u.unstudied);
      if (studied) { studiedSet.add(day); unstudiedSet.delete(day); }
      else { studiedSet.delete(day); unstudiedSet.add(day); }
      return { ...u, studied: [...studiedSet].sort((a,b)=>a-b), unstudied: [...unstudiedSet].sort((a,b)=>a-b) };
    });
  };

  const onOpenNotice = (n) => {
    setOpenNotice(n);
    setNotices(ns => ns.map(x => x.id === n.id ? { ...x, unread: false } : x));
  };

  const accessibleWords = useM_app(() => [...user.studied, ...user.unstudied, user.currentDay].map(d => WORDS.find(w => w.day === d)).filter(Boolean), [user]);

  return (
    <div className={"app " + (isMobile ? "mobile" : "")} style={{ position: "relative", height: "100%" }}>
      <window.Sidebar
        active={active} setActive={(id) => { setActive(id); setOpenWord(null); }}
        unreadNotices={unreadNotices} currentDay={user.currentDay} streak={user.streak}
        isMobile={isMobile}
      />
      <main className={"pane " + (isMobile ? "mobile" : "")} style={{ paddingBottom: isMobile ? 90 : 80 }}>
        {openWord ? (
          <window.StudyPage
            word={openWord}
            onBack={onCloseWord}
            isStudied={user.studied.includes(openWord.day)}
            onMarkStudied={onMarkStudied}
          />
        ) : (
          <>
            {active === "home" && <window.HomePage user={user} words={WORDS} onOpenWord={onOpenWord} onOpenNotice={onOpenNotice} notices={notices} onGoTest={() => setActive("test")} layout={layout} isMobile={isMobile} cardStyle={cardStyle} />}
            {active === "library" && <window.LibraryPage user={user} words={WORDS} onOpenWord={onOpenWord} cardStyle={cardStyle} />}
            {active === "test" && <window.TestPage user={user} words={WORDS} testStyle={testStyle} />}
            {active === "inbox" && <window.InboxPage notices={notices} onOpenNotice={onOpenNotice} />}
            {active === "mypage" && <window.MyPage user={user} setUser={setUser} />}
          </>
        )}
      </main>

      {isMobile && <window.MobileTabBar active={active} setActive={(id) => { setActive(id); setOpenWord(null); }} unreadNotices={unreadNotices} />}

      {openNotice && (
        <div className="modal-backdrop" onClick={() => setOpenNotice(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ position: "relative" }}>
            <button className="modal-close" onClick={() => setOpenNotice(null)}>×</button>
            <div className="modal-from">{openNotice.from} · {openNotice.fromHandle}</div>
            <div className="modal-subject">{openNotice.subject}</div>
            <div className="modal-meta">{openNotice.date}</div>
            <div className="modal-body">{openNotice.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}

window.ProtoApp = ProtoApp;
