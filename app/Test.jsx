/* global React */
const { useState: useS_t, useEffect: useE_t, useRef: useR_t, useMemo: useM_t } = React;

// ============================================================
// Test Page, 주관식 단어 시험 (유버디 스타일)
// ============================================================
function TestPage({ user, words, testStyle }) {
  const studiedWords = useM_t(() => user.studied.map(d => words.find(w => w.day === d)).filter(Boolean), [user, words]);

  const [phase, setPhase] = useS_t("idle"); // idle | playing | done
  const [count, setCount] = useS_t(10);
  const [queue, setQueue] = useS_t([]);
  const [idx, setIdx] = useS_t(0);
  const [input, setInput] = useS_t("");
  const [feedback, setFeedback] = useS_t({ type: "", msg: "" });
  const [results, setResults] = useS_t([]); // {wordDay, attempts, status:'correct'|'wrong'}
  const [revealed, setRevealed] = useS_t(false);
  const inputRef = useR_t(null);

  const start = (n) => {
    const shuffled = [...studiedWords].sort(() => Math.random() - 0.5).slice(0, Math.min(n, studiedWords.length));
    setQueue(shuffled); setIdx(0); setInput(""); setFeedback({ type: "", msg: "" });
    setResults([]); setRevealed(false); setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const current = queue[idx];

  const submit = () => {
    if (!current) return;
    const guess = input.trim().toLowerCase();
    if (!guess) return;
    const target = current.word.toLowerCase();
    if (guess === target) {
      setFeedback({ type: "correct", msg: "✓ 정답!" });
      setResults(r => [...r, { day: current.day, status: "correct" }]);
      setRevealed(false);
      setTimeout(() => {
        if (idx + 1 >= queue.length) setPhase("done");
        else { setIdx(idx + 1); setInput(""); setFeedback({ type: "", msg: "" }); setTimeout(() => inputRef.current?.focus(), 50); }
      }, 700);
    } else {
      if (testStyle === "hardcore") {
        // 못 넘어감 - 흔들기만
        setFeedback({ type: "wrong", msg: `다시, 입력한 답: "${input}". 맞출 때까진 못 넘어가요.` });
        if (inputRef.current) {
          inputRef.current.classList.add("shake");
          setTimeout(() => inputRef.current?.classList.remove("shake"), 450);
        }
      } else {
        // 1번 틀리면 정답 보여주고 진행
        setFeedback({ type: "wrong", msg: `정답은 "${current.word}". 다음으로 넘어가요.` });
        setResults(r => [...r, { day: current.day, status: "wrong" }]);
        setTimeout(() => {
          if (idx + 1 >= queue.length) setPhase("done");
          else { setIdx(idx + 1); setInput(""); setFeedback({ type: "", msg: "" }); setTimeout(() => inputRef.current?.focus(), 50); }
        }, 1400);
      }
    }
  };

  if (phase === "idle") {
    return (
      <div>
        <div className="pane-header">
          <div className="pane-eyebrow">TEST · 누적 단어 시험</div>
          <h1 className="pane-title"><em>Random</em> Recall<span className="kr">진짜 외웠는지, 직접 입력으로 확인해요.</span></h1>
        </div>
        <div className="test-frame">
          <div style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: 28, fontWeight: 900, color: "var(--ink-hi)", lineHeight: 1.1, letterSpacing: "-0.03em" }}>{studiedWords.length}<span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500, marginLeft: 4 }}>개 학습 단어 중</span></div>
          <div style={{ marginTop: 10, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, wordBreak: "keep-all" }}>
            한국어 뜻을 보고, 영어 단어를 직접 입력하면 됩니다. <br/>
            <b>{testStyle === "hardcore" ? "맞출 때까지 다음으로 못 넘어가요." : "한 번 틀리면 정답 보여주고 다음으로."}</b>
          </div>
          <div style={{ marginTop: 22, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            {[5, 10, 20].filter(n => n <= studiedWords.length).map(n => (
              <button key={n} className="filter-pill" onClick={() => setCount(n)} style={count === n ? { background: "var(--ink)", color: "var(--cream)", borderColor: "var(--ink)" } : {}}>{n}문제</button>
            ))}
            {studiedWords.length > 0 && studiedWords.length < 5 ? <button className="filter-pill" onClick={() => setCount(studiedWords.length)} style={count === studiedWords.length ? { background: "var(--ink)", color: "var(--cream)", borderColor: "var(--ink)" } : {}}>{studiedWords.length}문제 (전부)</button> : null}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => start(count)} disabled={studiedWords.length === 0}>
            {studiedWords.length === 0 ? "학습한 단어가 없어요" : `시험 시작 · ${count}문제 →`}
          </button>
          <div style={{ marginTop: 14, fontSize: 11, color: "var(--muted)", letterSpacing: "0.04em" }}>
            ENTER 키로 제출 · ESC 로 종료
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const correct = results.filter(r => r.status === "correct").length;
    const wrong = results.filter(r => r.status === "wrong").length;
    return (
      <div>
        <div className="pane-header">
          <div className="pane-eyebrow">RESULT</div>
          <h1 className="pane-title"><em>잘했어요!</em><span className="kr">시험 완료 · 결과를 확인하세요.</span></h1>
        </div>
        <div className="test-frame">
          <div style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: 56, fontWeight: 900, color: "var(--orange)", lineHeight: 1, letterSpacing: "-0.04em" }}>{correct}<span style={{ fontSize: 20, color: "var(--muted)", fontWeight: 500 }}> / {queue.length}</span></div>
          <div style={{ marginTop: 14, fontSize: 14, color: "var(--ink-soft)" }}>{wrong === 0 ? "전부 맞췄어요. 진짜 외웠네요 🌟" : `${wrong}개 놓쳤어요. 미학습으로 표시해서 다시 보는 거 추천!`}</div>
          <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => start(count)}>다시 풀기 →</button>
            <button className="btn btn-ghost" onClick={() => setPhase("idle")}>설정으로</button>
          </div>
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px dashed var(--line)", textAlign: "left" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 10 }}>풀이 기록</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {results.map((r, i) => {
                const w = queue[i];
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: r.status === "correct" ? "rgba(74,124,89,0.06)" : "rgba(184,74,63,0.06)", fontSize: 13 }}>
                    <span style={{ fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14, fontWeight: 800, color: "var(--ink-hi)", letterSpacing: "-0.02em" }}>{w.word}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", color: r.status === "correct" ? "var(--green)" : "var(--red)" }}>{r.status === "correct" ? "✓ 정답" : "✗ 오답"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // playing
  const cells = queue.map((_, i) => {
    if (i < results.length) return results[i].status === "correct" ? "done" : "wrong";
    if (i === idx) return "current";
    return "";
  });

  return (
    <div>
      <div className="pane-header">
        <div className="pane-eyebrow">TEST IN PROGRESS</div>
      </div>
      <div className="test-frame">
        <div className="test-counter">{idx + 1} / {queue.length}</div>
        <div className="test-progress">
          {cells.map((c, i) => <div key={i} className={"test-progress-cell " + c}></div>)}
        </div>
        <div className="test-hint">한국어 뜻 → 영어 단어로</div>
        <div className="test-meaning">{current.meaning}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18, marginTop: 4 }}>{current.pos} · #{current.tags.join(" #")}</div>
        <div className="test-input-wrap">
          <input
            ref={inputRef}
            className={"test-input " + (feedback.type === "correct" ? "correct" : "")}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder="영어 단어를 입력하세요"
            autoComplete="off"
            spellCheck="false"
          />
        </div>
        <div className={"test-feedback " + feedback.type}>{feedback.msg || "\u00A0"}</div>
        <div className="test-actions">
          <button className="btn btn-ghost" onClick={() => setPhase("idle")}>중단</button>
          <button className="btn btn-soft" onClick={() => { setRevealed(true); setFeedback({ type: "", msg: `힌트: ${current.word.slice(0,1)}${current.word.slice(1).replace(/[a-z]/gi, "_")}` }); }}>힌트</button>
          <button className="btn btn-primary" onClick={submit}>Enter ↵</button>
        </div>
      </div>
    </div>
  );
}

window.TestPage = TestPage;
