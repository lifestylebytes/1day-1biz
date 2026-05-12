/* global React */
const { useState: useS_st, useEffect: useE_st } = React;

// ============================================================
// Study Page (단어 상세 + 학습 표시)
// ============================================================
function StudyPage({ word, onBack, isStudied, onMarkStudied }) {
  const [marked, setMarked] = useS_st(isStudied);

  useE_st(() => setMarked(isStudied), [isStudied, word]);

  const speak = () => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(word.word);
      u.lang = "en-US";u.rate = 0.85;
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div className="study-frame">
      <button className="study-back" onClick={onBack}>← 돌아가기</button>

      <div className="study-hero">
        <div className="study-day-row">
          <span style={{ color: "var(--orange-dark)" }}>DAY {word.day}</span>
          <span className={"status-pill " + (marked ? "green" : "")}>{marked ? "✓ 학습 완료" : "● 미학습"}</span>
        </div>
        <div className="study-word" style={{ fontSize: "23px", fontFamily: "\"Noto Sans KR\"" }}>
          {word.word}<span className="study-pos">{word.pos}</span>
        </div>
        <div className="study-phonetic-row">
          <span>{word.phonetic}</span>
          <button className="study-speak-btn" onClick={speak} title="발음 듣기">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 010 7.07" /><path d="M19.07 4.93a10 10 0 010 14.14" /></svg>
          </button>
        </div>
        <div className="study-meaning">{word.meaning}</div>
      </div>

      <div className="study-block">
        <div className="study-block-label">📌 비즈니스 예문</div>
        <div className="study-example">
          {word.example}
          <div className="study-example-kr">→ {word.exampleKr}</div>
        </div>
      </div>

      <div className="study-block">
        <div className="study-block-label">🔁 유사표현 / 반대말</div>
        <div className="study-syn-grid">
          <div className="study-syn-card">
            <div className="study-syn-card-label">SYNONYMS</div>
            <div className="word">{word.synonyms.join(" · ")}</div>
          </div>
          <div className="study-syn-card">
            <div className="study-syn-card-label">ANTONYMS</div>
            <div className="word">{word.antonyms.length ? word.antonyms.join(" · ") : "-"}</div>
          </div>
        </div>
      </div>

      <div className="study-block">
        <div className="study-block-label">🏷️ 사용 상황</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {word.tags.map((t) => <span key={t} className="tag-pill" style={{ fontSize: 12, padding: "5px 12px" }}>#{t}</span>)}
        </div>
      </div>

      <div className="study-block">
        <div className="study-block-label">✏️ 메모</div>
        <textarea
          placeholder="이 단어를 내 상황에 어떻게 쓸까? 메모해보세요…"
          style={{ width: "100%", minHeight: 80, padding: 14, borderRadius: 12, border: "1px solid var(--line)", background: "var(--cream)", fontSize: 13.5, fontFamily: "inherit", color: "var(--ink)", resize: "vertical", outline: "none" }}
          onFocus={(e) => e.target.style.borderColor = "var(--orange)"}
          onBlur={(e) => e.target.style.borderColor = "var(--line)"}>
        </textarea>
      </div>

      <div className="study-actions">
        <button className="btn btn-ghost" onClick={onBack}>← 닫기</button>
        <button
          className={"btn " + (marked ? "btn-soft" : "btn-primary")}
          onClick={() => {setMarked(!marked);onMarkStudied(word.day, !marked);}}>
          
          {marked ? "✓ 학습 완료됨 (다시 미학습으로)" : "✓ 학습 완료로 표시"}
        </button>
      </div>
    </div>);

}

window.StudyPage = StudyPage;