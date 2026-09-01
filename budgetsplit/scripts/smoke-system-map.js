/* Renders every tab of the built page under a minimal DOM shim.
   The jest suite never renders a component; this at least proves the page's own
   script runs, every section produces markup, and no tab throws. */
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

const el = (id) => ({
  id, innerHTML: '', textContent: '', value: '', children: [],
  dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {}, setAttribute() {}, getAttribute: () => null,
  focus() {}, blur() {}, querySelector: () => ({ innerText: 'x' }), closest: () => null,
});
const nodes = {};
global.window = { __DATA__: null, scrollTo() {}, matchMedia: () => ({ matches: false }) };
global.document = {
  getElementById: (id) => (nodes[id] = nodes[id] || el(id)),
  addEventListener() {},
  documentElement: { setAttribute() {}, getAttribute: () => null },
};
global.matchMedia = () => ({ matches: false });
global.localStorage = { getItem: () => null, setItem() {} };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.setTimeout = () => 0;
global.clearTimeout = () => {};

new Function(scripts[0])();           // the data block
new Function(scripts[1] + `
  ;globalThis.__probe = { SECTIONS, render, setTab: k => { active = k; }, view: document.getElementById('view') };
`)();

const { SECTIONS, render, setTab, view } = globalThis.__probe;
let bad = 0;
for (const s of SECTIONS) {
  try {
    setTab(s.key);
    render();
    const n = view.innerHTML.length;
    if (n < 200) { console.log(`  EMPTY  ${s.key.padEnd(5)} ${s.label} — ${n} chars`); bad++; }
    else console.log(`  ok     ${s.key.padEnd(5)} ${s.label.padEnd(12)} ${(n / 1024).toFixed(1)}KB`);
  } catch (e) {
    console.log(`  THREW  ${s.key.padEnd(5)} ${s.label} — ${e.message}`);
    bad++;
  }
}
// and with a filter applied, which takes a different path through every section
const q = document.getElementById('q');
q.value = 'settlement';
for (const s of SECTIONS) {
  try { setTab(s.key); render(); } catch (e) { console.log(`  THREW (filtered) ${s.key} — ${e.message}`); bad++; }
}
console.log(bad ? `\n${bad} problem(s)` : '\nall tabs render, filtered and unfiltered');
process.exit(bad ? 1 : 0);
