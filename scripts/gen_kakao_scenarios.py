# mainboard.html 의 SCENARIOS 에서 알림톡에 필요한 필드만 뽑아
# supabase/functions/kakao-daily/scenarios.ts 를 생성한다.
# 실행: python3 scripts/gen_kakao_scenarios.py   (표현 데이터 바꿀 때마다 재실행 후 함수 재배포)
# 첫 주 개정판(SCENARIOS_V2, 가입일 >= CONTENT_CUTOVER)도 같이 뽑는다.
import re, json, io
src = io.open("mainboard.html", encoding="utf-8").read()
HINTS = json.load(io.open("supabase/functions/kakao-daily/hints.json", encoding="utf-8"))  # 손으로 다듬은 뉘앙스 (우선)

def pick(b, key):
    mm = re.search(r"\b" + key + r": \"((?:[^\"\\]|\\.)*)\"", b)
    return json.loads('"' + mm.group(1) + '"') if mm else ""

def _jong(ch):
    o = ord(ch)
    return 0xAC00 <= o <= 0xD7A3 and (o - 0xAC00) % 28 != 0

def hint_of(nuance, word=""):
    # 알림톡 "오늘 상황"에 붙일 뉘앙스 한 줄: nuance 의 첫 문장만, 해요체로, 60자 안쪽.
    # 예) "deliverable은 '결과물' 보다 무거운 단어." -> "'결과물' 보다 무거운 단어예요."
    t = (nuance or "").strip().split("\n")[0].strip()
    t = re.sub(r"^[^=]{1,30}=\s*", "", t) if t.count("=") >= 2 else t
    t = re.split(r"(?<=[.!?。])\s", t)[0].strip()
    if word:
        t = re.sub(r"^" + re.escape(word) + r"\s*(은|는|이|가|을|를)\s+", "", t, flags=re.I)
    t = t.rstrip(".!。 ")
    if not t: return ""
    # 반말 -> 해요체 (자주 나오는 꼴만. 나머지는 명사 종결로 보고 예요/이에요)
    rules = [
        (r"아니야$", "아니에요"), (r"거야$", "거예요"), (r"이야$", "이에요"), (r"야$", "예요"),
        (r"있음$", "있어요"), (r"없음$", "없어요"), (r"씀$", "써요"), (r"함$", "해요"), (r"됨$", "돼요"), (r"임$", "이에요"),
        (r"한다$", "해요"), (r"된다$", "돼요"), (r"있다$", "있어요"), (r"없다$", "없어요"), (r"이다$", "이에요"), (r"온다$", "와요"), (r"간다$", "가요"),
        (r"해$", "해요"), (r"돼$", "돼요"), (r"써$", "써요"), (r"줘$", "줘요"), (r"봐$", "봐요"),
    ]
    done = False
    for pat, rep in rules:
        if re.search(pat, t):
            t = re.sub(pat, rep, t); done = True; break
    if not done and not re.search(r"(요|다|죠|네|까)$", t):
        last = t[-1]
        if re.match(r"[가-힣]", last):
            t += "이에요" if _jong(last) else "예요"
        elif re.match(r"[A-Za-z0-9)'\"]", last):
            t += "예요"
    if len(t) > 60: t = t[:57].rstrip() + "..."
    return t

def row(b, day, word):
    scene = re.sub(r"^\s*\d{1,2}:\d{2}\s*,?\s*", "", pick(b, "scene"))  # 앞머리 시각 제거 (mainboard 표시와 동일)
    return {"day": day, "word": word, "meaning": pick(b, "meaning"), "scene": scene, "quoteKo": pick(b, "quoteKo"), "hint": HINTS.get(word) or hint_of(pick(b, "nuance"), word)}

# 본편 90일
main_src = re.search(r"const SCENARIOS\s*=\s*\[[\s\S]*?\n\];", src).group(0)
out = []
for b in re.split(r"\n(?=  \{ day: \d+, word: )", main_src):
    m = re.match(r"  \{ day: (\d+), word: \"([^\"]*)\"", b)
    if m: out.append(row(b, int(m.group(1)), m.group(2)))
out.sort(key=lambda x: x["day"])
seen = {}
for o in out: seen.setdefault(o["day"], o)
rows = list(seen.values())

# 개정판 (Day 1~4)
v2_src = re.search(r"const SCENARIOS_V2\s*=\s*\{[\s\S]*?\n\};", src).group(0)
v2 = []
for b in re.split(r"\n(?=  \d+: \{ day: \d+, word: )", v2_src):
    m = re.match(r"  \d+: \{ day: (\d+), word: \"([^\"]*)\"", b)
    if m: v2.append(row(b, int(m.group(1)), m.group(2)))
cutover = re.search(r'const CONTENT_CUTOVER = "([^"]+)"', src).group(1)

# ── Day 91+ TF 트랙 (data/tf-scenarios-<id>.json, 트랙당 30일) ──
# 알림톡이 Day 90을 넘으면 SCENARIOS 를 나머지연산으로 되감아 엉뚱한 단어를 보내던 버그(2026-09-13) 수정용.
TF_IDS = ["nego", "people", "docs", "meeting"]
tf = {}
for _tid in TF_IDS:
    try:
        _d = json.load(io.open("data/tf-scenarios-%s.json" % _tid, encoding="utf-8"))
    except IOError:
        continue
    _rows = []
    for _s in (_d.get("scenarios") or []):
        _scene = re.sub(r"^\s*\d{1,2}:\d{2}\s*[.,]?\s*", "", (_s.get("scene") or "").strip())
        _scene = re.split(r"(?<=[.!?])\s", _scene)[0].strip()
        if len(_scene) > 120: _scene = _scene[:117].rstrip() + "..."
        _w = _s.get("word") or ""
        _rows.append({
            "day": int(_s.get("tfDay") or (len(_rows) + 1)),
            "word": _w,
            "meaning": (_s.get("meaning") or "").strip(),
            "scene": _scene,
            "quoteKo": (_s.get("quoteKo") or "").strip(),
            "hint": HINTS.get(_w) or hint_of(_s.get("mentorNuance") or "", _w),
        })
    _rows.sort(key=lambda x: x["day"])
    tf[_tid] = _rows

ts = "// 자동 생성: scripts/gen_kakao_scenarios.py (수정 금지, mainboard.html 이 원본)\n"
ts += "export type Scn = { day: number; word: string; meaning: string; scene: string; quoteKo: string; hint?: string };\n"
ts += "export const SCENARIOS: Scn[] = " + json.dumps(rows, ensure_ascii=False, indent=1) + ";\n"
ts += "// 첫 주 개정판: 가입일(KST) >= CONTENT_CUTOVER 인 회원은 Day 1~4 를 아래로 교체\n"
ts += "export const CONTENT_CUTOVER = " + json.dumps(cutover) + ";\n"
ts += "export const SCENARIOS_V2: Scn[] = " + json.dumps(v2, ensure_ascii=False, indent=1) + ";\n"
ts += "// Day 91+ TF 트랙 (트랙당 30일). 트랙 시작 day = 91 + 30 * (완주한 트랙 수)\n"
ts += "export const TF_SCENARIOS: Record<string, Scn[]> = " + json.dumps(tf, ensure_ascii=False, indent=1) + ";\n"
ts += "export const TF_LEN = 30;\n"
ts += "export const TF_START = 91;\n"
ts += """
// Day 91 이상은 사람마다 고른 TF 트랙이 달라서, 트랙/완주수 없이는 오늘 표현을 알 수 없다.
// 알 수 없으면 null 을 돌려주고 발송을 거른다. (예전엔 SCENARIOS 를 되감아 Day 1~ 단어를 잘못 보냈음)
export function scenarioFor(day: number, signupKst?: string, tfTrack?: string | null, tfDone?: unknown): Scn | null {
  const d = Math.max(1, day);
  if (d >= TF_START) {
    const doneN = Array.isArray(tfDone) ? tfDone.length : 0;
    const list = tfTrack ? TF_SCENARIOS[tfTrack] : null;
    if (!list || !list.length) return null;
    const idx = d - (TF_START + TF_LEN * doneN);
    if (idx < 0 || idx >= list.length) return null;
    return list[idx];
  }
  if (signupKst && signupKst >= CONTENT_CUTOVER) { const v = SCENARIOS_V2.find(x => x.day === d); if (v) return v; }
  return SCENARIOS[(d - 1) % SCENARIOS.length];
}
"""
io.open("supabase/functions/kakao-daily/scenarios.ts", "w", encoding="utf-8").write(ts)
print("tf:", {k: len(v) for k, v in tf.items()})
print("days:", len(rows), "with scene:", sum(1 for r in rows if r["scene"]), "range", rows[0]["day"], "-", rows[-1]["day"], "| v2:", [(r["day"], r["word"]) for r in v2], "cutover", cutover)
