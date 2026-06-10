// ============================================================
// 시즌 2 데이터 일관성 검증 스크립트
// 실행: node scripts/validate-season2.js
// mainboard.html의 데이터 블록을 추출해 실제로 실행한 뒤 검사한다.
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'mainboard.html'), 'utf8');

// 데이터 <script> 블록 추출 (babel 블록 제외, SCENARIOS 포함된 평범한 script)
const blocks = [...html.matchAll(/<script(?![^>]*src)([^>]*)>([\s\S]*?)<\/script>/g)];
const dataBlock = blocks.find(b => !/babel/.test(b[1]) && /const SCENARIOS = \[/.test(b[2]));
if (!dataBlock) { console.error('FAIL: 데이터 스크립트 블록을 못 찾음'); process.exit(1); }

// 브라우저 환경 스텁
const storage = {};
const sandbox = {
  console,
  window: {},
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; },
  },
  location: { href: 'https://example.com/mainboard.html', search: '' },
  history: { replaceState: () => {} },
  URL, URLSearchParams, Date, JSON, Math, Set, Map, Array, Object, Number, String,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(dataBlock[2], sandbox, { filename: 'mainboard-data.js' });

const SIM = sandbox.window.__SIM || sandbox.__SIM;
if (!SIM) { console.error('FAIL: window.__SIM 없음'); process.exit(1); }
const { SCENARIOS, RECAP_DATA } = SIM;
const NUDGE = sandbox._BUDDY_NUDGE_BY_DAY || vm.runInContext('_BUDDY_NUDGE_BY_DAY', sandbox);
const LUNCH = vm.runInContext('LUNCH_SCRIPTS', sandbox);
const AFTERNOON = vm.runInContext('_AFTERNOON_TASKS', sandbox);

let errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

// 1) SCENARIOS: day 1-60 전부, 중복 없이
const days = SCENARIOS.map(s => s.day);
for (let d = 1; d <= 60; d++) ok(days.includes(d), `SCENARIOS day ${d} 누락`);
ok(new Set(days).size === days.length, 'SCENARIOS day 중복 존재');

// 2) 각 시나리오 필수 필드 + mcOptions 구조
SCENARIOS.forEach(s => {
  ['word', 'pos', 'meaning', 'phonetic', 'scene', 'npc', 'quote', 'mentorTip', 'sampleAnswer'].forEach(f =>
    ok(s[f], `day ${s.day}: ${f} 누락`));
  ok(Array.isArray(s.mcOptions) && s.mcOptions.length === 3, `day ${s.day}: mcOptions 3개 아님`);
  if (Array.isArray(s.mcOptions)) {
    ok(s.mcOptions.filter(o => o.kind === 'correct').length === 1, `day ${s.day}: correct가 정확히 1개 아님`);
    s.mcOptions.forEach((o, i) => ok(o.text && o.note && o.kind, `day ${s.day}: mcOptions[${i}] 필드 누락`));
  }
  ok(s.buddyAnswers && s.buddyAnswers.nuance && s.buddyAnswers.example && s.buddyAnswers.default,
    `day ${s.day}: buddyAnswers 불완전`);
  ok(s.task && s.task.to && s.task.channel && s.task.promptKo && s.task.koSentence,
    `day ${s.day}: task 불완전`);
  const validCh = ['face', 'slack-dm', 'slack-channel', 'email', 'video-call'];
  ok(validCh.includes(s.task.channel), `day ${s.day}: 잘못된 channel "${s.task.channel}"`);
});

// 3) VARIANT_ROTATION 정합성: 점심 day = (day-1)%4===1
for (let d = 1; d <= 60; d++) {
  const isLunchDay = (d - 1) % 4 === 1;
  if (isLunchDay) ok(LUNCH[d], `LUNCH_SCRIPTS day ${d} 누락 (점심 day인데 스크립트 없음)`);
  else ok(!LUNCH[d], `LUNCH_SCRIPTS day ${d} 불필요 (점심 day 아님)`);
}
Object.entries(LUNCH).forEach(([d, sc]) => {
  ok(sc.greet && sc.reply, `LUNCH ${d}: greet/reply 누락`);
  ['turn1', 'turn2'].forEach(t => {
    ok(Array.isArray(sc[t]) && sc[t].length === 3, `LUNCH ${d}: ${t} 3개 아님`);
    if (Array.isArray(sc[t])) ok(sc[t].filter(o => o.kind === 'correct').length === 1, `LUNCH ${d}: ${t} correct 1개 아님`);
  });
});

// 4) RECAP: recap day((day-1)%4===2)에 본인 + 직전 2개 윈도우에서 3문제 확보 가능한지
for (let d = 3; d <= 60; d += 4) {
  ok(RECAP_DATA[d], `RECAP_DATA day ${d} 누락 (recap day 본인 단어)`);
  let cnt = 0;
  for (let x = d; x >= 1 && cnt < 3; x--) if (RECAP_DATA[x]) cnt++;
  ok(cnt >= 3, `RECAP day ${d}: 출제 가능 문제 ${cnt}개 (<3)`);
}
// RECAP 엔트리는 모두 SCENARIOS에 존재하는 day여야 하고 blank 형식 확인
Object.entries(RECAP_DATA).forEach(([d, r]) => {
  ok(SCENARIOS.find(s => s.day === Number(d)), `RECAP ${d}: SCENARIOS에 없는 day`);
  ok(r.blank && r.blank.includes('_____'), `RECAP ${d}: blank에 _____ 없음`);
  ok(r.explain, `RECAP ${d}: explain 누락`);
});

// 5) 버디 넛지: day 1-60 전부 + day별 단어가 넛지 텍스트에 등장 (off-by-one 버그 방지)
for (let d = 1; d <= 60; d++) ok(NUDGE[d], `BUDDY_NUDGE day ${d} 누락`);
SCENARIOS.filter(s => s.day >= 31).forEach(s => {
  const n = NUDGE[s.day];
  if (!n) return;
  const w = s.word.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const t = (n.text || '').toLowerCase().replace(/[^a-z0-9 가-힣]/g, '');
  ok(t.includes(w) || w.split(' ').every(p => t.includes(p)),
    `BUDDY_NUDGE day ${s.day}: 텍스트에 단어 "${s.word}" 미포함 (off-by-one 의심)`);
});

// 6) 점심 스크립트에 그날 단어가 등장하는지 (시즌 2만)
[34, 38, 42, 46, 50, 54, 58].forEach(d => {
  const s = SCENARIOS.find(x => x.day === d);
  const sc = LUNCH[d];
  if (!s || !sc) return;
  const all = JSON.stringify(sc).toLowerCase();
  const w = s.word.toLowerCase().split(' ')[0];
  ok(all.includes(w), `LUNCH ${d}: 스크립트에 단어 "${s.word}" 미등장`);
});

// 7) 오후 업무 폴백 확인 (31-60 어느 day든 lower-bound 매칭 가능)
const aDays = Object.keys(AFTERNOON).map(Number).sort((a, b) => b - a);
for (let d = 31; d <= 60; d++) ok(aDays.find(x => x <= d), `AFTERNOON day ${d}: 폴백 불가`);

// 8) em-dash (U+2014) 전수 검사
const em = String.fromCharCode(0x2014);
['mainboard.html', 'onboarding.html', 'operator.html', 'lib/supabase-client.js'].forEach(f => {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) return;
  const c = fs.readFileSync(p, 'utf8');
  ok(!c.includes(em), `${f}: em-dash ${c.split(em).length - 1}개 발견`);
});

// 결과
if (errors.length) {
  console.error('FAIL (' + errors.length + '건):');
  errors.forEach(e => console.error('  ✕ ' + e));
  process.exit(1);
}
console.log('PASS: SCENARIOS ' + SCENARIOS.length + '개 (day 1-60), LUNCH ' + Object.keys(LUNCH).length +
  '개, RECAP ' + Object.keys(RECAP_DATA).length + '개, NUDGE ' + Object.keys(NUDGE).length + '개. 모든 검사 통과.');
