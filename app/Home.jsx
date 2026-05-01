/* global React, WORDS */
const { useState: useS_home, useEffect: useE_home, useMemo: useM_home } = React;

// ============================================================
// Home / Dashboard
// ============================================================
function HomePage({ user, words, onOpenWord, onOpenNotice, notices, onGoTest, layout, isMobile, cardStyle }) {
  const todayWord = words.find(w => w.day === user.currentDay);
  const studiedWords = user.studied.map(d => words.find(w => w.day === d)).filter(Boolean);
  const unstudiedWords = user.unstudied.map(d => words.find(w => w.day === d)).filter(Boolean);
  const recentStudied = [...studiedWords].reverse().slice(0, 6);

  // streak calendar (last 14 days)
  const streakCells = useM_home(() => {
    const cells = [];
    for (let i = -10; i <= 3; i++) {
      const day = user.currentDay + i;
      if (day < 1) cells.push({ day, label: "", state: "future" });
      else if (day === user.currentDay) cells.push({ day, label: day, state: "today" });
      else if (day < user.currentDay) cells.push({ day, label: day, state: user.studied.includes(day) ? "studied" : "missed" });
      else cells.push({ day, label: day, state: "future" });
    }
    return cells;
  }, [user.currentDay, user.studied]);

  return (
    <div>
      {!user.notificationsEnabled && (
        <div className="notif-banner">
          <span>🔔 매일 오전 8시 단어 알림을 켜두세요. <b>스트릭 끊기는 분 90%가 알림 미설정.</b></span>
          <button onClick={() => alert("마이페이지 → 알림 설정에서 활성화해주세요!")}>알림 켜기</button>
        </div>
      )}

      <div className="pane-header">
        <div className="pane-eyebrow">DAY {user.currentDay} · {new Date().getMonth()+1}월 {new Date().getDate()}일</div>
        <h1 className="pane-title">
          <em>Good morning,</em>
          <span className="kr">{user.name} 님 — 오늘의 단어 도착했어요.</span>
        </h1>
      </div>

      {layout === "split3" && !isMobile ? (
        <Layout3Col todayWord={todayWord} onOpenWord={onOpenWord} onOpenNotice={onOpenNotice} notices={notices} recentStudied={recentStudied} unstudiedWords={unstudiedWords} user={user} streakCells={streakCells} onGoTest={onGoTest} cardStyle={cardStyle} />
      ) : layout === "newspaper" ? (
        <LayoutNewspaper todayWord={todayWord} onOpenWord={onOpenWord} onOpenNotice={onOpenNotice} notices={notices} recentStudied={recentStudied} unstudiedWords={unstudiedWords} user={user} streakCells={streakCells} onGoTest={onGoTest} cardStyle={cardStyle} isMobile={isMobile} />
      ) : (
        <LayoutHero todayWord={todayWord} onOpenWord={onOpenWord} onOpenNotice={onOpenNotice} notices={notices} recentStudied={recentStudied} unstudiedWords={unstudiedWords} user={user} streakCells={streakCells} onGoTest={onGoTest} cardStyle={cardStyle} isMobile={isMobile} />
      )}
    </div>
  );
}

// ===== Layout A: Hero (오늘의 단어 가장 큼) =====
function LayoutHero({ todayWord, onOpenWord, onOpenNotice, notices, recentStudied, unstudiedWords, user, streakCells, onGoTest, cardStyle, isMobile }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.8fr 1fr", gap: 18 }}>
      <div className="col">
        <TodayHero word={todayWord} day={user.currentDay} onOpen={() => onOpenWord(todayWord)} />
        <Section title="이어서 학습할 단어" sub={unstudiedWords.length ? `${unstudiedWords.length}개 미학습` : "다 따라잡았어요 🎉"}>
          {unstudiedWords.length === 0 ? (
            <div className="card card-soft" style={{ textAlign: "center", padding: 28, color: "var(--ink-soft)", fontSize: 13.5 }}>지금까지 모든 단어 학습 완료. 멋져요 🌟</div>
          ) : (
            <div className="grid-2">
              {unstudiedWords.map(w => <WordCard key={w.day} word={w} onClick={() => onOpenWord(w)} status="unstudied" cardStyle={cardStyle} />)}
            </div>
          )}
        </Section>
        <Section title="최근 학습한 단어" sub="누적 단어장에서 더 보기 →">
          <div className="grid-2">
            {recentStudied.slice(0, 4).map(w => <WordCard key={w.day} word={w} onClick={() => onOpenWord(w)} status="studied" cardStyle={cardStyle} />)}
          </div>
        </Section>
      </div>
      <div className="col">
        <StreakCard user={user} cells={streakCells} />
        <SavedPointCard user={user} />
        <NoticeBox notices={notices} onOpenNotice={onOpenNotice} compact />
        <TestCTA onGoTest={onGoTest} count={user.studied.length} />
      </div>
    </div>
  );
}

// ===== Layout B: 3-column split (오늘 + 누적 + 공지) =====
function Layout3Col({ todayWord, onOpenWord, onOpenNotice, notices, recentStudied, unstudiedWords, user, streakCells, onGoTest, cardStyle }) {
  return (
    <div>
      <TodayHero word={todayWord} day={user.currentDay} onOpen={() => onOpenWord(todayWord)} compact />
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="col">
          <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-soft)" }}>📚 누적 단어</h3>
          <SavedPointCard user={user} />
          <div className="col gap-sm" style={{ marginTop: 12 }}>
            {recentStudied.slice(0, 3).map(w => <WordCard key={w.day} word={w} onClick={() => onOpenWord(w)} status="studied" cardStyle={cardStyle} />)}
          </div>
        </div>
        <div className="col">
          <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-soft)" }}>🔥 스트릭 + 시험</h3>
          <StreakCard user={user} cells={streakCells} />
          <TestCTA onGoTest={onGoTest} count={user.studied.length} />
        </div>
        <div className="col">
          <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-soft)" }}>✉️ 공지함</h3>
          <NoticeBox notices={notices} onOpenNotice={onOpenNotice} />
        </div>
      </div>
    </div>
  );
}

// ===== Layout C: Newspaper (날짜·이슈 강조) =====
function LayoutNewspaper({ todayWord, onOpenWord, onOpenNotice, notices, recentStudied, unstudiedWords, user, streakCells, onGoTest, cardStyle, isMobile }) {
  const dateStr = `Issue No. ${user.currentDay}  ·  ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;
  return (
    <div>
      <div style={{ borderTop: "3px solid var(--ink)", borderBottom: "1px solid var(--ink)", padding: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: 18, fontWeight: 900, color: "var(--ink-hi)", letterSpacing: "-0.02em" }}>The Daily Business Word</span>
        <span style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", letterSpacing: "0.06em" }}>{dateStr.toUpperCase()}</span>
      </div>
      <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 28 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--orange-dark)", letterSpacing: "0.18em", fontWeight: 800, textTransform: "uppercase", marginBottom: 8 }}>TODAY'S HEADLINE</div>
          <div style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: isMobile ? 42 : 68, lineHeight: 1.0, letterSpacing: "-0.04em", color: "var(--ink-hi)", fontWeight: 900 }}>{todayWord.word}</div>
          <div style={{ marginTop: 8, fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink-soft)" }}>{todayWord.phonetic} · {todayWord.pos}</div>
          <div style={{ marginTop: 18, fontSize: 17, fontWeight: 600, color: "var(--ink)", lineHeight: 1.55, wordBreak: "keep-all", maxWidth: 540 }}>
            {todayWord.meaning}
          </div>
          <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => onOpenWord(todayWord)}>학습하러 가기 →</button>
            <button className="btn btn-ghost" onClick={() => onOpenWord(todayWord)}>예문 보기</button>
          </div>
          <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 11, color: "var(--orange-dark)", letterSpacing: "0.16em", fontWeight: 800, textTransform: "uppercase", marginBottom: 12 }}>최근 학습</div>
            <div className="grid-2">
              {recentStudied.slice(0, 4).map(w => <WordCard key={w.day} word={w} onClick={() => onOpenWord(w)} status="studied" cardStyle={cardStyle} />)}
            </div>
          </div>
        </div>
        <div className="col">
          <StreakCard user={user} cells={streakCells} />
          <SavedPointCard user={user} />
          <NoticeBox notices={notices} onOpenNotice={onOpenNotice} compact />
          <TestCTA onGoTest={onGoTest} count={user.studied.length} />
        </div>
      </div>
    </div>
  );
}

// ===== Today's Word Hero =====
function TodayHero({ word, day, onOpen, compact }) {
  return (
    <div className="today-hero" style={compact ? { padding: "24px 28px" } : {}}>
      <div className="today-hero-glow"></div>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="today-hero-eyebrow"><span className="ping"></span> 오늘 도착한 단어</div>
        <div className="today-hero-day">Day {day} · {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}</div>
        <div className="today-hero-word" style={compact ? { fontSize: 48 } : {}}>
          {word.word}<span className="today-hero-pos">{word.pos}</span>
        </div>
        <div className="today-hero-phonetic">{word.phonetic}</div>
        <div className="today-hero-meaning">{word.meaning}</div>
        <div className="today-hero-cta-row">
          <button className="btn btn-primary" onClick={onOpen}>학습하기 →</button>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
            예문 · 유사표현 · 발음 포함
          </span>
        </div>
      </div>
    </div>
  );
}

// ===== Word Card (compact) =====
function WordCard({ word, onClick, status, cardStyle }) {
  if (cardStyle === "minimal") {
    return (
      <button onClick={onClick} className="word-card" style={{ background: "transparent", border: "1px dashed var(--line)", textAlign: "left", boxShadow: "none" }}>
        <div className="word-card-top">
          <span className="word-card-day">DAY {word.day}</span>
          <span className={"word-card-status " + (status || "studied")}><span className="dot"></span>{status === "unstudied" ? "미학습" : "학습완료"}</span>
        </div>
        <div className="word-card-word">{word.word}</div>
        <div className="word-card-meaning">{word.meaning}</div>
      </button>
    );
  }
  if (cardStyle === "stamp") {
    return (
      <button onClick={onClick} className="word-card" style={{ background: "var(--cream-warm)", textAlign: "left", border: "1px solid var(--line)", position: "relative" }}>
        <div className="word-card-top">
          <span className="word-card-day">№ {String(word.day).padStart(3, "0")}</span>
          <span className={"word-card-status " + (status || "studied")}><span className="dot"></span>{status === "unstudied" ? "TODO" : "DONE"}</span>
        </div>
        <div className="word-card-word">{word.word}</div>
        <div className="word-card-meaning">{word.meaning}</div>
        <div className="word-card-tags">
          {word.tags.map(t => <span key={t} className="tag-pill">#{t}</span>)}
        </div>
      </button>
    );
  }
  // default
  return (
    <button onClick={onClick} className="word-card" style={{ textAlign: "left" }}>
      <div className="word-card-top">
        <span className="word-card-day">DAY {word.day}</span>
        <span className={"word-card-status " + (status || "studied")}><span className="dot"></span>{status === "unstudied" ? "미학습" : "학습완료"}</span>
      </div>
      <div className="word-card-word">{word.word}</div>
      <div className="word-card-meaning">{word.meaning}</div>
      <div className="word-card-tags">
        {word.tags.map(t => <span key={t} className="tag-pill">#{t}</span>)}
      </div>
    </button>
  );
}

// ===== Section header =====
function Section({ title, sub, children }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 22, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: "var(--ink-hi)", fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "'Noto Sans KR', sans-serif" }}>{title}</h3>
        {sub ? <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}

// ===== Streak card =====
function StreakCard({ user, cells }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: "var(--muted)", textTransform: "uppercase" }}>🔥 STREAK</span>
        <span style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: 28, fontWeight: 900, color: "var(--orange)", lineHeight: 1, letterSpacing: "-0.03em" }}>{user.streak}<span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 4, fontWeight: 600 }}>일</span></span>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.5 }}>최근 14일 출석 — 오늘 도장 찍으면 13일!</div>
      <div className="streak-cal">
        {cells.map((c, i) => (
          <div key={i} className={"streak-cell " + c.state} title={c.day > 0 ? `Day ${c.day}` : ""}>{c.label || ""}</div>
        ))}
      </div>
    </div>
  );
}

// ===== Saved Point card =====
function SavedPointCard({ user }) {
  const totalDays = 30;
  const progress = (user.studied.length / totalDays) * 100;
  return (
    <div className="savedpoint-card">
      <div className="savedpoint-row">
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: "var(--muted)", textTransform: "uppercase" }}>SAVED POINT</div>
          <div className="savedpoint-num">{user.savedPoints}<small>일 저장됨</small></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>현재 누적</div>
          <div style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: 22, fontWeight: 900, color: "var(--ink)", lineHeight: 1, letterSpacing: "-0.03em" }}>{user.studied.length}<span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 3 }}>/ {totalDays}</span></div>
        </div>
      </div>
      <div className="savedpoint-bar">
        <div className="savedpoint-bar-fill" style={{ width: progress + "%" }}></div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 }}>일시중지 시 다음달부턴 단어 미제공 · 재구독 시 <b style={{ color: "var(--orange-dark)" }}>Saved + 1일</b>부터 재개</div>
    </div>
  );
}

// ===== Notice box =====
function NoticeBox({ notices, onOpenNotice, compact }) {
  const list = compact ? notices.slice(0, 3) : notices;
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: "var(--muted)", textTransform: "uppercase" }}>✉️ 유버디로부터</span>
        <span style={{ fontSize: 11, color: "var(--orange-dark)", fontWeight: 700 }}>{notices.filter(n => n.unread).length}개 새 메시지</span>
      </div>
      <div className="notice-list">
        {list.map(n => (
          <div key={n.id} className={"notice-row " + (n.unread ? "unread" : "")} onClick={() => onOpenNotice(n)} style={{ gridTemplateColumns: "auto 1fr auto" }}>
            <span className="notice-dot"></span>
            <div style={{ minWidth: 0 }}>
              <div className="notice-from">{n.from} {n.pinned ? <span className="notice-pin">📌 PINNED</span> : null}</div>
              <div className="notice-subject" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.subject}</div>
              {!compact ? <div className="notice-preview">{n.preview}</div> : null}
            </div>
            <div className="notice-date">{formatDate(n.date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(d) {
  const dt = new Date(d);
  const today = new Date("2026-04-29");
  const diff = Math.floor((today - dt) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return diff + "일 전";
  return (dt.getMonth() + 1) + "/" + dt.getDate();
}

// ===== Test CTA =====
function TestCTA({ onGoTest, count }) {
  return (
    <div className="card card-ink" style={{ padding: 22 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: "rgba(251,247,240,0.55)", textTransform: "uppercase" }}>✍️ 단어 시험</div>
      <div style={{ fontSize: 20, lineHeight: 1.3, marginTop: 6, fontWeight: 900, letterSpacing: "-0.02em", fontFamily: "'Noto Sans KR', sans-serif" }}>지금까지 <em style={{ color: "var(--orange)", fontStyle: "normal" }}>{count}개</em> · 랜덤으로 시험봐요</div>
      <div style={{ fontSize: 12.5, color: "rgba(251,247,240,0.7)", marginTop: 8, lineHeight: 1.55 }}>주관식 · 직접 입력 · 맞출 때까지 다음으로 못 넘어가요.</div>
      <button className="btn btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} onClick={onGoTest}>시험 시작 →</button>
    </div>
  );
}

window.HomePage = HomePage;
window.WordCard = WordCard;
window.formatDate = formatDate;
