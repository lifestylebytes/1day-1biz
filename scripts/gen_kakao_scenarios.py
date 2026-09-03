# mainboard.html 의 SCENARIOS 에서 알림톡에 필요한 필드만 뽑아
# supabase/functions/kakao-daily/scenarios.ts 를 생성한다.
# 실행: python3 scripts/gen_kakao_scenarios.py   (표현 데이터 바꿀 때마다 재실행 후 함수 재배포)
import re, json, io
src = io.open("mainboard.html", encoding="utf-8").read()
blocks = re.split(r"\n(?=  \{ day: \d+, word: )", src)
out = []
for b in blocks:
    m = re.match(r"  \{ day: (\d+), word: \"([^\"]*)\"", b)
    if not m: continue
    day = int(m.group(1)); word = m.group(2)
    def pick(key):
        mm = re.search(r"\b" + key + r": \"((?:[^\"\\]|\\.)*)\"", b)
        return json.loads('"' + mm.group(1) + '"') if mm else ""
    out.append({"day": day, "word": word, "meaning": pick("meaning"), "scene": pick("scene"), "quoteKo": pick("quoteKo")})
out.sort(key=lambda x: x["day"])
seen = {}
for o in out: seen.setdefault(o["day"], o)
rows = list(seen.values())
ts = "// 자동 생성: scripts/gen_kakao_scenarios.py (수정 금지, mainboard.html 이 원본)\n"
ts += "export type Scn = { day: number; word: string; meaning: string; scene: string; quoteKo: string };\n"
ts += "export const SCENARIOS: Scn[] = " + json.dumps(rows, ensure_ascii=False, indent=1) + ";\n"
io.open("supabase/functions/kakao-daily/scenarios.ts", "w", encoding="utf-8").write(ts)
print("days:", len(rows), "with scene:", sum(1 for r in rows if r["scene"]), "range", rows[0]["day"], "-", rows[-1]["day"])
