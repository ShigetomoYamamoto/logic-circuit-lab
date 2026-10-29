/*
 * End-to-end test (Node + Playwright). Run: node tests/e2e.js
 * Opens index.html via file:// and checks every gate page, the inside views,
 * the quiz, layout at 360px, console errors, and saves screenshots.
 * Expected values are hardcoded here (independent of logic.js).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const SHOT_DIR = '/tmp/logic-lab-shots';

// ---------- locate Playwright / a browser ----------
function loadChromium() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return require(name).chromium; } catch (e) { /* try next */ }
  }
  // Fallback: a playwright-core nested in a globally installed package.
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    for (const d of fs.readdirSync(root)) {
      for (const sub of [['node_modules', 'playwright-core'], ['node_modules', 'playwright'], []]) {
        const dir = path.join(root, d, ...sub);
        if (sub.length === 0 && !/^playwright(-core)?$/.test(d)) { continue; }
        if (fs.existsSync(path.join(dir, 'package.json'))) {
          try { return require(dir).chromium; } catch (e) { /* keep looking */ }
        }
      }
    }
  } catch (e) { /* ignore */ }
  throw new Error('Playwright was not found (tried playwright, playwright-core, global packages).');
}

async function launch(chromium) {
  try {
    return await chromium.launch();
  } catch (e) {
    const cands = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    for (const p of cands) {
      if (p && fs.existsSync(p)) { return chromium.launch({ executablePath: p }); }
    }
    throw e;
  }
}

// ---------- tiny assertion helpers ----------
let checks = 0;
const failures = [];
function ok(cond, msg) {
  checks++;
  if (!cond) { failures.push(msg); console.error('FAIL: ' + msg); }
}
function eq(actual, expected, msg) {
  ok(actual === expected, msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}
function deepEq(actual, expected, msg) {
  eq(JSON.stringify(actual), JSON.stringify(expected), msg);
}

// ---------- expected data (hardcoded) ----------
// 1-input: [a, out]; 2-input: [a, b, out]
const TABLES = {
  WIRE: [[0, 0], [1, 1]],
  NOT: [[0, 1], [1, 0]],
  AND: [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]],
  OR: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]],
  XOR: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]],
  NAND: [[0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]],
  NOR: [[0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 1, 0]]
};
const ORDER = ['WIRE', 'NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR'];
const RULES = {
  WIRE: '入力をそのまま出力します。1なら1、0なら0。',
  NOT: '入力を反対にします。1なら0、0なら1。',
  AND: 'AとBが両方1のときだけ1になります。',
  OR: 'AとBの少なくとも一方が1なら1になります。',
  XOR: 'AとBのどちらか片方だけが1のとき1になります。両方1、または両方0なら0です。',
  NAND: 'ANDの反対です。AとBが両方1のときだけ0になります。',
  NOR: 'ORの反対です。AとBが両方0のときだけ1になります。'
};
const READINGS = {
  WIRE: 'そのまま', NOT: 'ノット・否定', AND: 'アンド・論理積', OR: 'オア・論理和',
  XOR: 'エックスオア・排他的論理和', NAND: 'ナンド', NOR: 'ノア'
};
// Switch kinds per gate, in order A, B (spec).
const KINDS = {
  WIRE: ['NO'], NOT: ['NC'], AND: ['NO', 'NO'], OR: ['NO', 'NO'], NAND: ['NC', 'NC'], NOR: ['NC', 'NC']
};
const WIRING_WORD = { WIRE: '1つだけ', NOT: '1つだけ', AND: '直列', OR: '並列', NAND: '並列', NOR: '直列' };
const TRANSISTOR = '実際のコンピュータの中では、このスイッチの役目をトランジスタ（電気の信号で開け閉めできる、とても小さなスイッチ）が担っています。';
// XOR composition: [a, b, or, and, notAnd, out]
const XOR_INTERNAL = [[0, 0, 0, 0, 1, 0], [0, 1, 1, 0, 1, 1], [1, 0, 1, 0, 1, 1], [1, 1, 1, 1, 0, 0]];
const SUMMARY_COLS = ['AND', 'OR', 'XOR', 'NAND', 'NOR'];

const nIn = (name) => TABLES[name][0].length - 1;
const inputsOf = (name, row) => (nIn(name) === 1 ? { A: row[0] } : { A: row[0], B: row[1] });
const outOf = (row) => row[row.length - 1];
const tagOf = (name, row) => name + '(' + row.slice(0, -1).join(',') + ')';
function lookup(name, inputs) {
  const rows = TABLES[name];
  const hit = rows.find((r) => r[0] === inputs.A && (nIn(name) === 1 || r[1] === inputs.B));
  return hit;
}

// ---------- page helpers ----------
function watch(page, label, problems) {
  page.on('console', (m) => { if (m.type() === 'error') { problems.push(label + ' console error: ' + m.text()); } });
  page.on('pageerror', (e) => problems.push(label + ' page error: ' + e.message));
  page.on('requestfailed', (r) => problems.push(label + ' request failed: ' + r.url()));
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(file:|data:|about:|blob:)/.test(u)) { problems.push(label + ' external request: ' + u); }
  });
}

async function gotoPage(page, id) {
  await page.click('.tab[data-page="' + id + '"]');
  await page.waitForSelector('main[data-page="' + id + '"]');
}

async function readInputs(page) {
  return page.evaluate(() => {
    const o = {};
    document.querySelectorAll('.board .toggle').forEach((t) => { o[t.dataset.input] = t.getAttribute('aria-pressed') === 'true' ? 1 : 0; });
    return o;
  });
}

async function setInputs(page, name, inputs) {
  for (const k of Object.keys(inputs)) {
    const t = page.locator('.board .toggle[data-input="' + k + '"]');
    const want = inputs[k] ? 'true' : 'false';
    if ((await t.getAttribute('aria-pressed')) !== want) { await t.click(); }
    eq(await t.getAttribute('aria-pressed'), want, name + ' toggle ' + k + ' pressed after set');
  }
}

// Collect everything we assert on in one round trip.
async function snapshot(page) {
  return page.evaluate(() => {
    const board = document.querySelector('.board');
    const led = board.querySelector('[data-role="led"]');
    const toggles = {};
    board.querySelectorAll('.toggle').forEach((t) => {
      toggles[t.dataset.input] = {
        pressed: t.getAttribute('aria-pressed'), val: t.querySelector('.t-val').textContent,
        state: t.querySelector('.t-state').textContent, disabled: t.disabled
      };
    });
    const root = document.querySelector('[data-role="gate-root"]');
    const wires = {};
    board.querySelectorAll('svg .wire[data-wire]').forEach((w) => {
      wires[w.dataset.wire] = { value: w.getAttribute('data-value'), on: w.classList.contains('on') };
    });
    const badges = {};
    board.querySelectorAll('svg .badge').forEach((b) => {
      badges[b.dataset.badge] = { value: b.getAttribute('data-value'), text: b.textContent.trim(), on: b.classList.contains('on') };
    });
    const switches = [...board.querySelectorAll('svg .sw')].map((s) => ({
      input: s.dataset.switch, kind: s.dataset.kind, pressed: s.dataset.pressed, closed: s.dataset.closed, live: s.dataset.live,
      liveWires: s.querySelectorAll('.wire.on').length,
      stateText: s.querySelector('[data-role="sw-state"]').textContent.trim(),
      stateClosedClass: s.querySelector('[data-role="sw-state"]').classList.contains('closed'),
      stateOpenClass: s.querySelector('[data-role="sw-state"]').classList.contains('open')
    }));
    const note = root.querySelector('[data-role="note"]');
    return {
      view: root.dataset.view,
      ledOut: led.getAttribute('data-output'),
      ledText: led.querySelector('.led-value').textContent,
      ledLit: led.classList.contains('on'),
      toggles, wires, badges, switches,
      activeRows: [...document.querySelectorAll('table[data-role="truth"] tr[data-active="true"]')].map((tr) => [...tr.cells].map((c) => c.textContent)),
      litParts: board.querySelectorAll('svg .wire.on, svg .junction.on, svg .terminal.on').length,
      noteVisible: !!note && !note.hidden,
      noteText: note && !note.hidden ? note.textContent : '',
      wiringText: note && note.querySelector('.note-wiring') ? note.querySelector('.note-wiring').textContent : ''
    };
  });
}

async function checkGateView(page, name, row) {
  const tag = tagOf(name, row) + ' [gate]';
  const out = outOf(row);
  const s = await snapshot(page);
  eq(s.view, 'gate', tag + ' view');
  eq(s.ledOut, String(out), tag + ' LED data-output');
  eq(s.ledText, String(out), tag + ' LED text');
  eq(s.ledLit, out === 1, tag + ' LED lit class');
  eq(s.wires.out && s.wires.out.value, String(out), tag + ' output wire value');
  eq(s.wires.out && s.wires.out.on, out === 1, tag + ' output wire lit');
  const ins = inputsOf(name, row);
  Object.keys(ins).forEach((k) => {
    eq(s.toggles[k] && s.toggles[k].val, String(ins[k]), tag + ' toggle ' + k + ' text');
    eq(s.toggles[k] && s.toggles[k].state, ins[k] ? 'ON' : 'OFF', tag + ' toggle ' + k + ' ON/OFF text');
    eq(s.wires[k] && s.wires[k].on, ins[k] === 1, tag + ' input wire ' + k + ' lit');
  });
  eq(Object.keys(s.toggles).length, nIn(name), tag + ' toggle count');
  eq(s.activeRows.length, 1, tag + ' exactly one highlighted row');
  deepEq(s.activeRows[0], row.map(String), tag + ' highlighted row cells');
}

async function checkInsideView(page, name, row) {
  const tag = tagOf(name, row) + ' [inside]';
  const out = outOf(row);
  const s = await snapshot(page);
  eq(s.view, 'inside', tag + ' view');
  eq(s.ledOut, String(out), tag + ' LED data-output');
  eq(s.ledText, String(out), tag + ' LED text');
  eq(s.ledLit, out === 1, tag + ' LED lit class');
  const ins = inputsOf(name, row);
  Object.keys(ins).forEach((k) => {
    eq(s.toggles[k] && s.toggles[k].val, String(ins[k]), tag + ' toggle ' + k + ' text');
  });
  eq(s.activeRows.length, 1, tag + ' exactly one highlighted row');
  deepEq(s.activeRows[0], row.map(String), tag + ' highlighted row cells');
  ok(s.noteVisible, tag + ' note visible');

  if (name === 'XOR') {
    const x = XOR_INTERNAL.find((r) => r[0] === row[0] && r[1] === row[1]);
    const exp = { or: x[2], and: x[3], notAnd: x[4], out: x[5] };
    eq(exp.out, out, tag + ' (test table sanity)');
    Object.keys(exp).forEach((k) => {
      eq(s.wires[k] && s.wires[k].value, String(exp[k]), tag + ' wire ' + k + ' value');
      eq(s.wires[k] && s.wires[k].on, exp[k] === 1, tag + ' wire ' + k + ' lit');
      if (k !== 'out') {
        eq(s.badges[k] && s.badges[k].text, String(exp[k]), tag + ' badge ' + k + ' text');
        eq(s.badges[k] && s.badges[k].on, exp[k] === 1, tag + ' badge ' + k + ' lit');
      }
    });
    ['A', 'A-or', 'A-and'].forEach((k) => eq(s.wires[k] && s.wires[k].on, row[0] === 1, tag + ' wire ' + k + ' lit'));
    ['B-or', 'B-and'].forEach((k) => eq(s.wires[k] && s.wires[k].on, row[1] === 1, tag + ' wire ' + k + ' lit'));
    ok(s.noteText.includes('XORは、ORとANDとNOTを組み合わせて作れます。'), tag + ' XOR caption');
    return;
  }

  // switch circuit
  const kinds = KINDS[name];
  eq(s.switches.length, kinds.length, tag + ' switch count');
  const letters = ['A', 'B'];
  s.switches.forEach((sw, i) => {
    const pressed = ins[letters[i]];
    const closed = kinds[i] === 'NO' ? pressed : (pressed ? 0 : 1);
    const live = out === 1 && closed === 1 ? 1 : 0;
    eq(sw.input, letters[i], tag + ' switch ' + i + ' input');
    eq(sw.kind, kinds[i], tag + ' switch ' + i + ' kind');
    eq(sw.pressed, String(pressed), tag + ' switch ' + i + ' pressed');
    eq(sw.closed, String(closed), tag + ' switch ' + i + ' closed');
    eq(sw.live, String(live), tag + ' switch ' + i + ' on the lit path');
    eq(sw.liveWires > 0, live === 1, tag + ' switch ' + i + ' lit wires present');
    // third label line: closed = (input==1) for NO, (input==0) for NC
    eq(sw.stateText, closed ? '→ つながっている' : '→ 切れている', tag + ' switch ' + i + ' state line');
    eq(sw.stateClosedClass, closed === 1, tag + ' switch ' + i + ' state line accent class');
    eq(sw.stateOpenClass, closed === 0, tag + ' switch ' + i + ' state line muted class');
  });
  if (out === 1) {
    ok(s.litParts > 0, tag + ' current path highlighted');
    eq(s.wires['to-led'].on, true, tag + ' wire to LED lit');
  } else {
    eq(s.litParts, 0, tag + ' nothing highlighted when not conducting');
  }
  ok(s.noteText.includes(TRANSISTOR), tag + ' transistor sentence');
  ok(s.wiringText.includes(WIRING_WORD[name]), tag + ' wiring sentence mentions ' + WIRING_WORD[name]);
}

// ---------- test sections ----------
async function testStatic() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(!/type\s*=\s*["']module["']/.test(html), 'no type=module scripts');
  ok(/<script src="logic\.js"><\/script>/.test(html) && /<script src="app\.js"><\/script>/.test(html), 'classic script tags');
  ['index.html', 'style.css', 'logic.js', 'app.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(!/https?:\/\//.test(src), f + ' has no external URL');
  });
  ok(fs.existsSync(path.join(ROOT, '.nojekyll')), '.nojekyll exists');
}

async function testShell(page) {
  eq(await page.title(), 'さわって学ぶ論理回路', 'document title');
  eq((await page.textContent('.site-title')).trim(), 'さわって学ぶ論理回路', 'site title');
  const ch = await page.$$eval('.chapters .chapter', (els) => els.map((e) => ({
    text: e.textContent.replace(/\s+/g, ''), current: e.getAttribute('aria-current'), disabled: !!e.disabled
  })));
  eq(ch.length, 4, 'chapter count');
  eq(ch[0].text, '第1章ゲート編', 'chapter 1 label');
  eq(ch[0].current, 'page', 'chapter 1 active');
  ['第2章計算編準備中', '第3章記憶編準備中', '第4章CPU編準備中'].forEach((t, i) => {
    eq(ch[i + 1].text, t, 'chapter ' + (i + 2) + ' label');
    ok(ch[i + 1].disabled, 'chapter ' + (i + 2) + ' disabled');
  });
  const tabs = await page.$$eval('#tabs .tab', (els) => els.map((e) => e.textContent.trim()));
  deepEq(tabs, ['はじめに', 'WIRE', 'NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR', 'まとめ'], 'tab labels');
  eq(await page.getAttribute('#tabs .tab:nth-child(1)', 'aria-current'), 'page', 'first tab current');
  ok(await page.isDisabled('#prev'), 'prev disabled on first page');
  // pager navigation
  await page.click('#next');
  await page.waitForSelector('main[data-page="WIRE"]');
  ok(!(await page.isDisabled('#prev')), 'prev enabled on page 2');
  await page.click('#prev');
  await page.waitForSelector('main[data-page="intro"]');
  await gotoPage(page, 'summary');
  ok(await page.isDisabled('#next'), 'next disabled on last page');
  await gotoPage(page, 'intro');
  const intro = await page.textContent('main');
  ['電気が来ている', '電気が来ていない', '中を開く', '予想クイズ', 'タップ', '灰色'].forEach((w) => {
    ok(intro.includes(w), 'intro mentions ' + w);
  });
  // the intro demo toggle works
  const demo = page.locator('[data-role="demo"] .toggle[data-input="A"]');
  await demo.click();
  eq(await demo.getAttribute('aria-pressed'), 'true', 'intro demo toggle pressed');
  eq(await page.getAttribute('[data-role="demo"] [data-role="led"]', 'data-output'), '1', 'intro demo LED on');
}

async function testGatePages(page) {
  for (const name of ORDER) {
    await gotoPage(page, name);
    const head = await page.textContent('.gate-title');
    ok(head.includes(name) && head.includes(READINGS[name]), name + ' header shows name and reading');
    eq((await page.textContent('[data-role="rule"]')).trim(), RULES[name], name + ' rule text');
    const rows = TABLES[name];
    // gate view, all combinations
    for (const row of rows) {
      await setInputs(page, name, inputsOf(name, row));
      await checkGateView(page, name, row);
    }
    // inside view, all combinations in reverse order
    await page.click('[data-action="inside"]');
    eq(await page.getAttribute('[data-action="inside"]', 'aria-pressed'), 'true', name + ' inside toggle pressed');
    for (const row of rows.slice().reverse()) {
      await setInputs(page, name, inputsOf(name, row));
      await checkInsideView(page, name, row);
    }
    await page.click('[data-action="inside"]');
    eq(await page.getAttribute('[data-action="inside"]', 'aria-pressed'), 'false', name + ' inside toggle released');
    await checkGateView(page, name, lookup(name, await readInputs(page)));
  }
}

async function testSummary(page) {
  await gotoPage(page, 'summary');
  const head = await page.$$eval('[data-role="summary-table"] thead th', (e) => e.map((x) => x.textContent.trim()));
  deepEq(head, ['A', 'B'].concat(SUMMARY_COLS), 'summary header');
  const body = await page.$$eval('[data-role="summary-table"] tbody tr', (rs) => rs.map((r) => [...r.cells].map((c) => c.textContent.trim())));
  const expected = [[0, 0], [0, 1], [1, 0], [1, 1]].map((ab) => {
    const cells = [ab[0], ab[1]];
    SUMMARY_COLS.forEach((g) => { cells.push(lookup(g, { A: ab[0], B: ab[1] })[2]); });
    return cells.map(String);
  });
  deepEq(body, expected, 'summary rows');
  eq((await page.textContent('[data-role="teaser"]')).trim(), '実は NAND だけで、ほかのゲートを全部作れます（第2章で）', 'summary teaser');
}

async function testQuiz(page, name) {
  const tag = name + ' quiz';
  await gotoPage(page, name);
  await page.click('[data-action="quiz"]');
  eq(await page.getAttribute('[data-action="quiz"]', 'aria-pressed'), 'true', tag + ' toggle pressed');
  ok(await page.isVisible('[data-role="quiz"]'), tag + ' panel visible');

  async function asking(prev) {
    const s = await snapshot(page);
    eq(s.ledOut, '?', tag + ' LED output hidden');
    eq(s.ledText, '？', tag + ' LED shows ？');
    eq(s.activeRows.length, 0, tag + ' no row highlighted while asking');
    Object.keys(s.toggles).forEach((k) => ok(s.toggles[k].disabled, tag + ' toggle ' + k + ' locked'));
    ok(await page.isDisabled('[data-action="inside"]'), tag + ' inside disabled while asking');
    eq((await page.textContent('[data-action="answer"][data-value="1"]')).trim(), '光る（1）', tag + ' answer 1 label');
    eq((await page.textContent('[data-action="answer"][data-value="0"]')).trim(), '光らない（0）', tag + ' answer 0 label');
    ok(await page.isVisible('[data-action="answer"][data-value="1"]'), tag + ' answers visible');
    ok(!(await page.isVisible('[data-action="next"]')), tag + ' next hidden while asking');
    const cur = await readInputs(page);
    if (prev) { ok(JSON.stringify(cur) !== JSON.stringify(prev), tag + ' question differs from previous'); }
    return cur;
  }

  async function score() {
    return (await page.textContent('[data-role="score"]')).trim();
  }

  // 1) correct answer
  const q1 = await asking(null);
  const row1 = lookup(name, q1);
  await page.click('[data-action="answer"][data-value="' + outOf(row1) + '"]');
  let fb = (await page.textContent('[data-role="feedback"]')).trim();
  ok(fb.includes('正解！'), tag + ' correct feedback text: ' + fb);
  ok(fb.includes('出力は ' + outOf(row1)), tag + ' correct feedback shows value');
  eq(await page.getAttribute('[data-role="feedback"]', 'data-result'), 'correct', tag + ' result attr correct');
  eq(await score(), '正解数 1 / 回答数 1', tag + ' score after correct');
  let s = await snapshot(page);
  eq(s.ledOut, String(outOf(row1)), tag + ' LED revealed');
  deepEq(s.activeRows[0], row1.map(String), tag + ' correct row highlighted');
  ok(await page.isVisible('[data-action="next"]'), tag + ' next visible after answer');
  ok(!(await page.isVisible('[data-action="answer"][data-value="1"]')), tag + ' answers hidden after answer');
  ok(!(await page.isDisabled('[data-action="inside"]')), tag + ' inside enabled after answer');
  // reveal via inside view, then close it again
  await page.click('[data-action="inside"]');
  await checkInsideView(page, name, row1);
  await page.click('[data-action="inside"]');

  // 2) next question, wrong answer
  await page.click('[data-action="next"]');
  const q2 = await asking(q1);
  const row2 = lookup(name, q2);
  eq(await page.getAttribute('[data-role="feedback"]', 'data-result'), null, tag + ' feedback cleared');
  await page.click('[data-action="answer"][data-value="' + (1 - outOf(row2)) + '"]');
  fb = (await page.textContent('[data-role="feedback"]')).trim();
  ok(fb.includes('ざんねん'), tag + ' wrong feedback text: ' + fb);
  ok(!fb.includes('正解！'), tag + ' wrong feedback has no 正解！');
  ok(fb.includes('出力は ' + outOf(row2)), tag + ' wrong feedback shows correct value');
  eq(await page.getAttribute('[data-role="feedback"]', 'data-result'), 'wrong', tag + ' result attr wrong');
  eq(await score(), '正解数 1 / 回答数 2', tag + ' score after wrong');
  s = await snapshot(page);
  deepEq(s.activeRows[0], row2.map(String), tag + ' correct row highlighted after wrong answer');

  // 3) many questions: never the same combination twice in a row; score counts
  let prev = q2, right = 1, total = 2;
  for (let i = 0; i < 12; i++) {
    await page.click('[data-action="next"]');
    const q = await asking(prev);
    prev = q;
    const exp = outOf(lookup(name, q));
    const answerCorrectly = i % 3 !== 0;
    await page.click('[data-action="answer"][data-value="' + (answerCorrectly ? exp : 1 - exp) + '"]');
    total += 1;
    if (answerCorrectly) { right += 1; }
  }
  eq(await score(), '正解数 ' + right + ' / 回答数 ' + total, tag + ' score after many questions');

  // 4) score survives navigating away and back
  await gotoPage(page, name === 'AND' ? 'OR' : 'AND');
  await gotoPage(page, name);
  eq(await score(), '正解数 ' + right + ' / 回答数 ' + total, tag + ' score kept after navigation');

  // 5) quiz off restores normal mode
  await page.click('[data-action="quiz"]');
  eq(await page.getAttribute('[data-action="quiz"]', 'aria-pressed'), 'false', tag + ' toggle released');
  ok(!(await page.isVisible('[data-role="quiz"]')), tag + ' panel hidden');
  s = await snapshot(page);
  Object.keys(s.toggles).forEach((k) => ok(!s.toggles[k].disabled, tag + ' toggle ' + k + ' unlocked'));
  const cur = await readInputs(page);
  const rowNow = lookup(name, cur);
  await checkGateView(page, name, rowNow);
  // toggling works again
  const flip = { A: cur.A ? 0 : 1 };
  if (nIn(name) === 2) { flip.B = cur.B; }
  await setInputs(page, name, flip);
  await checkGateView(page, name, lookup(name, flip));
}

async function testReducedMotion(browser, problems) {
  const motion = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p1 = await motion.newPage();
  watch(p1, 'motion', problems);
  await p1.goto(URL);
  await gotoPage(p1, 'AND');
  await setInputs(p1, 'AND', { A: 1, B: 1 });
  eq(await p1.$eval('.board .wire.on', (e) => getComputedStyle(e).animationName), 'flow', 'lit wire is animated by default');
  await motion.close();
  const still = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p2 = await still.newPage();
  watch(p2, 'reduced-motion', problems);
  await p2.goto(URL);
  await gotoPage(p2, 'AND');
  await setInputs(p2, 'AND', { A: 1, B: 1 });
  eq(await p2.$eval('.board .wire.on', (e) => getComputedStyle(e).animationName), 'none', 'no animation with prefers-reduced-motion');
  await still.close();
}

async function testNarrow(browser, problems) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  watch(page, 'narrow', problems);
  await page.goto(URL);
  const overflow = async (label) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 360, label + ': scrollWidth ' + w + ' <= 360');
  };
  const toggleSizes = async (label) => {
    const boxes = await page.$$eval('.board .toggle', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    ok(boxes.length > 0, label + ': toggles present');
    boxes.forEach((b) => ok(b[0] >= 48 && b[1] >= 48, label + ': toggle size ' + b.map(Math.round).join('x') + ' >= 48px'));
  };
  for (const id of ['intro'].concat(ORDER, ['summary'])) {
    await gotoPage(page, id);
    await overflow(id + ' default');
    if (ORDER.includes(id)) {
      await toggleSizes(id + ' gate view');
      await page.click('[data-action="inside"]');
      await overflow(id + ' inside');
      await toggleSizes(id + ' inside view');
      if (id !== 'XOR') {
        // switches must be large enough to tell open from closed on a phone
        const levers = await page.$$eval('.board svg .sw .lever', (els) => els.map((e) => e.getBoundingClientRect().width));
        ok(levers.length > 0, id + ' inside view: levers present');
        levers.forEach((w) => ok(w >= 60, id + ' inside view: lever width ' + Math.round(w) + 'px >= 60px at 360px'));
        const cells = await page.$$eval('.board svg .sw', (els) => els.map((e) => e.getBoundingClientRect().width));
        cells.forEach((w) => ok(w >= 100, id + ' inside view: switch width ' + Math.round(w) + 'px >= 100px at 360px'));
      }
      await page.click('[data-action="inside"]');
      await page.click('[data-action="quiz"]');
      await overflow(id + ' quiz asking');
      await toggleSizes(id + ' quiz');
      const q = await readInputs(page);
      await page.click('[data-action="answer"][data-value="' + (1 - outOf(lookup(id, q))) + '"]');
      await overflow(id + ' quiz answered (wrong)');
      await page.click('[data-action="inside"]');
      await overflow(id + ' quiz answered + inside');
      await page.click('[data-action="inside"]');
      await page.click('[data-action="quiz"]');
    }
  }
  // the page tab row scrolls horizontally on its own (not the page)
  const tabScroll = await page.$eval('#tabs', (e) => e.scrollWidth > e.clientWidth);
  ok(tabScroll, 'tab row is horizontally scrollable at 360px');
  await ctx.close();
}

async function screenshots(browser, problems, kind, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  watch(page, 'shots-' + kind, problems);
  await page.goto(URL);
  const shot = async (n, label) => {
    const file = path.join(SHOT_DIR, kind + '-' + n + '-' + label + '.png');
    await page.screenshot({ path: file, fullPage: true });
    ok(fs.existsSync(file) && fs.statSync(file).size > 2000, 'screenshot saved: ' + file);
  };
  await gotoPage(page, 'intro');
  await shot('01', 'intro');
  await gotoPage(page, 'AND');
  await setInputs(page, 'AND', { A: 1, B: 1 });
  await shot('02', 'and-A1-B1');
  await gotoPage(page, 'XOR');
  await setInputs(page, 'XOR', { A: 1, B: 0 });
  await shot('03', 'xor-A1-B0');
  await setInputs(page, 'XOR', { A: 1, B: 1 });
  await page.click('[data-action="inside"]');
  await shot('04', 'xor-inside-A1-B1');
  await gotoPage(page, 'NOR');
  await setInputs(page, 'NOR', { A: 0, B: 0 });
  await page.click('[data-action="inside"]');
  await shot('05', 'nor-inside-A0-B0');
  await gotoPage(page, 'NAND');
  await setInputs(page, 'NAND', { A: 1, B: 1 });
  await page.click('[data-action="inside"]');
  await shot('06', 'nand-inside-A1-B1');
  await gotoPage(page, 'AND');
  await page.click('[data-action="quiz"]');
  const q = await readInputs(page);
  await page.click('[data-action="answer"][data-value="' + outOf(lookup('AND', q)) + '"]');
  await shot('07', 'quiz-correct');
  await gotoPage(page, 'summary');
  await shot('08', 'summary');
  await ctx.close();
}

// ---------- main ----------
(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const problems = [];
  const chromium = loadChromium();
  const browser = await launch(chromium);
  try {
    await testStatic();

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    watch(page, 'main', problems);
    await page.goto(URL);
    await testShell(page);
    await testGatePages(page);
    await testSummary(page);
    await testQuiz(page, 'AND');
    await testQuiz(page, 'NOT');
    await testQuiz(page, 'XOR');
    await ctx.close();

    await testReducedMotion(browser, problems);
    await testNarrow(browser, problems);
    await screenshots(browser, problems, 'mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await screenshots(browser, problems, 'desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  } catch (e) {
    failures.push('exception: ' + (e && e.stack ? e.stack : e));
    console.error(e);
  } finally {
    await browser.close();
  }

  checks++;
  if (problems.length) { problems.forEach((p) => { failures.push(p); console.error('FAIL: ' + p); }); }
  console.log('Screenshots: ' + (fs.existsSync(SHOT_DIR) ? fs.readdirSync(SHOT_DIR).sort().map((f) => SHOT_DIR + '/' + f).join('\n             ') : '(none)'));
  if (failures.length) {
    console.error('e2e FAILED: ' + failures.length + ' problem(s) in ' + checks + ' checks');
    process.exit(1);
  }
  console.log('e2e: ' + checks + ' checks passed, 0 console/page errors');
})();
