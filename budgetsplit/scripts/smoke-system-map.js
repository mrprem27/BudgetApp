/*
 * Renders every view of the built System Map under a minimal DOM shim.
 *
 *   node scripts/build-system-map.js out.html && node scripts/smoke-system-map.js out.html
 *
 * The jest suite never renders anything — AGENTS.md §11 names that as the gap that
 * shipped two launch crashes. This at least proves the page's own script runs, every
 * area and cross-cutting view produces markup, and searching does not throw.
 */
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

const nodes = {};
const el = (id) => ({
  id, innerHTML: '', textContent: '', value: '', dataset: {},
  classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {}, setAttribute() {}, getAttribute: () => null,
  focus() {}, blur() {}, closest: () => null,
  querySelector: () => ({ innerText: 'x' }), querySelectorAll: () => [],
});
global.window = { __DATA__: null, scrollTo() {}, matchMedia: () => ({ matches: false }) };
global.document = {
  getElementById: (id) => (nodes[id] = nodes[id] || el(id)),
  querySelector: () => el('nav'),
  querySelectorAll: () => [],
  addEventListener() {},
  documentElement: { setAttribute() {}, getAttribute: () => null },
};
global.matchMedia = () => ({ matches: false });
global.localStorage = { getItem: () => null, setItem() {} };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.setTimeout = () => 0;
global.clearTimeout = () => {};

new Function(scripts[0])();
new Function(scripts[1] + `
  ;globalThis.__p = { D, CROSS, render, go: k => { active = k; },
                      openBook: (key, pos) => { bk.book = key; bk.pos = pos || 0; active = 'shelf'; },
                      shelf: () => { bk.book = null; active = 'shelf'; },
                      answer: (id, k, v) => { bk.ans[id] = { ...(bk.ans[id] || {}), [k]: v }; },
                      addFinding: (text) => { bk.finds.push({ text, where: '', at: 0 }); },
                      reset: () => { bk.book = null; bk.pos = 0; bk.ans = {}; bk.finds = []; },
                      stopId, exportMarkdown, fullMarkdown, setScope: s => { mdScope = s; },
                      main: document.getElementById('main'), q: document.getElementById('q') };
`)();

const { D, CROSS, render, go, main, q } = globalThis.__p;
let bad = 0;

const check = (label, fn) => {
  try {
    fn();
    const n = main.innerHTML.length;
    if (n < 400) { console.log(`  EMPTY  ${label} — ${n} chars`); bad++; }
    else console.log(`  ok     ${label.padEnd(28)} ${(n / 1024).toFixed(1)}KB`);
  } catch (e) { console.log(`  THREW  ${label} — ${e.message}`); bad++; }
};

for (const a of D.AREAS) check(a.name, () => { q.value = ''; go(a.key); render(); });
for (const [k, c] of Object.entries(CROSS)) check(c.label, () => { q.value = ''; go(k); render(); });

/* Search spans every area, so it takes a different path through all of them. */
for (const term of ['settlement', 'balance', 'E-04', 'FL-06.E7', 'recurring']) {
  check(`search "${term}"`, () => { q.value = term; render(); });
}
try {
  q.value = 'zzzznotathing'; render();
  if (!/Nothing matches/.test(main.innerHTML)) { console.log('  BAD    empty state missing'); bad++; }
  else console.log('  ok     empty state');
} catch (e) { console.log('  THREW  empty state — ' + e.message); bad++; }

/* Every id must resolve to a name, or the page prints raw ids at the reader. */
const unresolved = new Set();
const scan = (s) => String(s || '').replace(/\b(E|SC|FL|AX|FE)-\d+[a-z]?\b/g, m => {
  if (!D.names[m]) unresolved.add(m); return m;
});
for (const k of ['entities', 'flows', 'screens', 'feats', 'ovs', 'dqs', 'ivs', 'axes']) {
  for (const row of D[k]) for (const v of Object.values(row)) {
    if (typeof v === 'string') scan(v);
    else if (Array.isArray(v)) v.forEach(x => typeof x === 'string' && scan(x));
  }
}
if (unresolved.size) { console.log('  BAD    ids with no human name: ' + [...unresolved].join(', ')); bad++; }
else console.log('  ok     every cross-reference resolves to a name');

/* The booklets are the point of the page: the shelf, every stop of every
   booklet, both ends of each one, and an export that carries what you answered. */
const { openBook, shelf, answer, addFinding, reset, stopId, exportMarkdown } = globalThis.__p;

check('the shelf', () => { q.value = ''; shelf(); render(); });

let stops = 0, empties = 0;
for (const b of D.booklets) {
  for (let i = 0; i < b.stops.length; i++) {
    stops++;
    try {
      q.value = ''; openBook(b.key, i); render();
      if (main.innerHTML.length < 400) { empties++; console.log(`  EMPTY  ${b.key} stop ${i}`); }
    } catch (e) { console.log(`  THREW  ${b.key} stop ${i} — ${e.message}`); bad++; }
  }
}
console.log(empties ? `  BAD    ${empties} empty stops` : `  ok     all ${stops} stops across ${D.booklets.length} booklets render`);
if (empties) bad++;

/* Coverage is the whole "nothing is missing" claim — assert it here too, so a
   broken build cannot quietly ship a page with a hole in it. */
const gaps = Object.entries(D.coverage).filter(([, v]) => v.missing.length);
console.log(gaps.length
  ? `  BAD    coverage gaps: ${gaps.map(([k, v]) => k + ' ' + v.missing.join(',')).join(' | ')}`
  : `  ok     covers every screen, task, component, rule, finding and question`);
if (gaps.length) bad++;

const first = D.booklets[0];
check('pager holds at the start', () => { openBook(first.key, -5); render(); });
check('pager holds at the end', () => { openBook(first.key, first.stops.length + 5); render(); });
check('notebook, empty', () => { reset(); go('notebook'); render(); });

try {
  reset();
  const b = D.booklets.find(x => x.stops.some(s => s.kind === 'flow'));
  const s = b.stops.find(x => x.kind === 'flow');
  answer(stopId(s), 'behave', 'broken');
  answer(stopId(s), 'numbers', 'wrong');
  answer(stopId(s), 'note', 'the total moved by the whole bill');
  addFinding('the back button on Reports goes to Home');
  go('notebook'); render();
  const md = exportMarkdown();
  const ok = /## Broken \(1\)/.test(md)
    && md.includes(stopId(s))
    && md.includes('the total moved by the whole bill')
    && md.includes('the back button on Reports goes to Home')
    && /Expected:/.test(md);
  console.log(ok ? '  ok     export carries answers, notes, your findings and the expectation'
                 : '  BAD    export incomplete');
  if (!ok) bad++;
  reset();
} catch (e) { console.log('  THREW  export — ' + e.message); bad++; }

/* The markdown section is the only way the whole thing leaves the page, so each
   scope must build, render, and actually contain what it claims. */
try {
  reset();
  const b3 = D.booklets.find(x => x.stops.some(s => s.kind === 'flow'));
  const s3 = b3.stops.find(x => x.kind === 'flow');
  answer(stopId(s3), 'numbers', 'wrong');
  answer(stopId(s3), 'note', 'markdown round trip');
  addFinding('a thing I noticed');
  const { fullMarkdown, setScope } = globalThis.__p;

  const sizes = {};
  for (const scope of ['answers', 'walk', 'all']) {
    setScope(scope); go('markdown'); render();
    const text = fullMarkdown(scope);
    sizes[scope] = Math.round(text.length / 1024);
    if (main.innerHTML.length < 400) { console.log(`  BAD    markdown "${scope}" renders empty`); bad++; }
    if (!text.length) { console.log(`  BAD    markdown "${scope}" is empty`); bad++; }
  }
  const all = fullMarkdown('all');
  const walk = fullMarkdown('walk');
  const ans = fullMarkdown('answers');
  const checks = [
    ['every booklet is in "walk"', D.booklets.every(b => walk.includes(b.name))],
    ['every stop is in "walk"', D.booklets.every(b => b.stops.every(s => walk.includes(stopId(s))))],
    ['"walk" holds none of your answers', !walk.includes('markdown round trip')],
    ['"all" holds your answers', all.includes('markdown round trip') && all.includes('a thing I noticed')],
    ['"answers" is only what you found', ans.includes('markdown round trip') && !ans.includes(D.booklets[1].blurb)],
  ];
  for (const [label, ok] of checks) {
    console.log(ok ? `  ok     ${label}` : `  BAD    ${label}`);
    if (!ok) bad++;
  }
  console.log(`  ok     markdown sizes — answers ${sizes.answers}KB · walk ${sizes.walk}KB · all ${sizes.all}KB`);
  reset();
} catch (e) { console.log('  THREW  markdown section — ' + e.message); bad++; }

console.log(bad ? `\n${bad} problem(s)` : '\nall views render');
process.exit(bad ? 1 : 0);
