# mainboard.html 의 SCENARIOS 에서 알림톡에 필요한 필드만 뽑아
# supabase/functions/kakao-daily/scenarios.ts 를 생성한다.
# 실행: python3 scripts/gen_kakao_scenarios.py   (표현 데이터 바꿀 때마다 재실행 후 함수 재배포)
# 첫 주 개정판(SCENARIOS_V2, 가입일 >= CONTENT_CUTOVER)도 같이 뽑는다.
import re, json, io
src = io.open("mainboard.html", encoding="utf-8").read()

def pick(b, key):
    mm = re.search(r"\b" + key + r": \"((?:[^\"\\]|\\.)*)\"", b)
    return json.loads('"' + mm.group(1) + '"') if mm else ""

def row(b, day, word):
    scene = re.sub(r"^\s*\d{1,2}:\d{2}\s*,?\s*", "", pick(b, "scene"))  # 앞머리 시각 제거 (mainboard 표시와 동일)
    return {"day": day, "word": word, "meaning": pick(b, "meaning"), "scene": scene, "quoteKo": pick(b, "quoteKo")}

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

ts = "// 자동 생성: scripts/gen_kakao_scenarios.py (수정 금지, mainboard.html 이 원본)\n"
ts += "export type Scn = { day: number; word: string; meaning: string; scene: string; quoteKo: string };\n"
ts += "export const SCENARIOS: Scn[] = " + json.dumps(rows, ensure_ascii=False, indent=1) + ";\n"
ts += "// 첫 주 개정판: 가입일(KST) >= CONTENT_CUTOVER 인 회원은 Day 1~4 를 아래로 교체\n"
ts += "export const CONTENT_CUTOVER = " + json.dumps(cutover) + ";\n"
ts += "export const SCENARIOS_V2: Scn[] = " + json.dumps(v2, ensure_ascii=False, indent=1) + ";\n"
ts += "export function scenarioFor(day: number, signupKst?: string): Scn {\n"
ts += "  const d = Math.max(1, day);\n"
ts += "  if (signupKst && signupKst >= CONTENT_CUTOVER) { const v = SCENARIOS_V2.find(x => x.day === d); if (v) return v; }\n"
ts += "  return SCENARIOS[(d - 1) % SCENARIOS.length];\n"
ts += "}\n"
io.open("supabase/functions/kakao-daily/scenarios.ts", "w", encoding="utf-8").write(ts)
print("days:", len(rows), "with scene:", sum(1 for r in rows if r["scene"]), "range", rows[0]["day"], "-", rows[-1]["day"], "| v2:", [(r["day"], r["word"]) for r in v2], "cutover", cutover)
