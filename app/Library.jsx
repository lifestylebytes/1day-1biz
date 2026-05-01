/* global React */
const { useState: useS_lib, useMemo: useM_lib } = React;

// ============================================================
// Library — 누적 단어 라이브러리
// ============================================================
function LibraryPage({ user, words, onOpenWord, cardStyle }) {
  const [filter, setFilter] = useS_lib("all"); // all | studied | unstudied
  const [tagFilter, setTagFilter] = useS_lib(null);
  const [search, setSearch] = useS_lib("");

  const accessibleDays = [...user.studied, ...user.unstudied].sort((a,b) => a-b);
  const accessibleWords = accessibleDays.map(d => words.find(w => w.day === d)).filter(Boolean);

  const allTags = useM_lib(() => {
    const set = new Set();
    accessibleWords.forEach(w => w.tags.forEach(t => set.add(t)));
    return [...set];
  }, [accessibleWords]);

  const filtered = accessibleWords.filter(w => {
    if (filter === "studied" && !user.studied.includes(w.day)) return false;
    if (filter === "unstudied" && !user.unstudied.includes(w.day)) return false;
    if (tagFilter && !w.tags.includes(tagFilter)) return false;
    if (search && !w.word.toLowerCase().includes(search.toLowerCase()) && !w.meaning.includes(search)) return false;
    return true;
  });

  return (
    <div>
      <div className="pane-header">
        <div className="pane-eyebrow">LIBRARY · 내 누적 단어</div>
        <h1 className="pane-title">
          <em>My</em> Business Dictionary
          <span className="kr">차곡차곡 쌓인 {accessibleWords.length}개의 단어.</span>
        </h1>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <input
          type="text"
          placeholder="단어 또는 뜻 검색…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid var(--line)", background: "#fff", fontSize: 13, fontFamily: "inherit", minWidth: 220, outline: "none", color: "var(--ink)" }}
        />
        <button className={"filter-pill " + (filter === "all" ? "active" : "")} onClick={() => setFilter("all")}>전체 {accessibleWords.length}</button>
        <button className={"filter-pill " + (filter === "studied" ? "active" : "")} onClick={() => setFilter("studied")}>학습 {user.studied.length}</button>
        <button className={"filter-pill " + (filter === "unstudied" ? "active" : "")} onClick={() => setFilter("unstudied")}>미학습 {user.unstudied.length}</button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
        <button className={"filter-pill " + (!tagFilter ? "active" : "")} onClick={() => setTagFilter(null)} style={{ fontSize: 11 }}>모든 태그</button>
        {allTags.map(t => (
          <button key={t} className={"filter-pill " + (tagFilter === t ? "active" : "")} onClick={() => setTagFilter(t)} style={{ fontSize: 11 }}>#{t}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card card-soft" style={{ textAlign: "center", padding: 50, color: "var(--ink-soft)" }}>조건에 맞는 단어가 없어요.</div>
      ) : (
        <div className="grid-2">
          {filtered.map(w => (
            <window.WordCard
              key={w.day} word={w}
              onClick={() => onOpenWord(w)}
              status={user.studied.includes(w.day) ? "studied" : "unstudied"}
              cardStyle={cardStyle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

window.LibraryPage = LibraryPage;
