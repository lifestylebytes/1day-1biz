# sampleAnswer 가 오늘 단어를 포함하는지 검사. 실행: python3 scripts/check_sample_answers.py
import re, io, json
s = io.open("mainboard.html", encoding="utf-8").read()
blocks = re.split(r"\n(?=  \{ day: \d+, word: )", s)
STOP = {"the","a","an","in","on","to","of","up","out","back","off","by","for","with","it"}
seen = set(); miss = []
for b in blocks:
    m = re.match(r"  \{ day: (\d+), word: \"([^\"]*)\"", b)
    if not m: continue
    d = int(m.group(1)); w = m.group(2)
    if d > 90 or d in seen: continue
    seen.add(d)
    sm = re.search(r"sampleAnswer: \"((?:[^\"\\]|\\.)*)\"", b)
    sa = json.loads('"' + sm.group(1) + '"') if sm else ""
    toks = [t for t in re.findall(r"[a-z]+", w.lower()) if t not in STOP] or re.findall(r"[a-z]+", w.lower())
    if not all(t[:4] in sa.lower() for t in toks):
        miss.append((d, w, sa))
print(f"checked {len(seen)} days, missing word: {len(miss)}")
for d, w, sa in miss: print(f"  D{d:02d} [{w}] {sa}")
