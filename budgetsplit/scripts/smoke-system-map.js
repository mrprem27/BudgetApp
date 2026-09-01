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
  ;globalThis.__p = { D, CROSS, render, go: k => { active = k; }, main: document.getElementById('main'), q: document.getElementById('q') };
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

console.log(bad ? `\n${bad} problem(s)` : '\nall views render');
process.exit(bad ? 1 : 0);
