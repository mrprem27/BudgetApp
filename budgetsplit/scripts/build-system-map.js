/*
 * Builds the browsable System Map from `docs/SYSTEM.md`.
 *
 *   node scripts/build-system-map.js out.html
 *
 * The page is EXTRACTED, never retyped: the whole point of SYSTEM.md is that it
 * cannot drift from the code, and a hand-copied artifact would reintroduce exactly
 * the drift the document exists to end. Run this after editing SYSTEM.md and
 * republish to the same artifact URL.
 *
 * Palette in the template comes from the app's own tokens (AGENTS.md §10).
 */
const fs = require('fs');
const doc = fs.readFileSync('docs/SYSTEM.md', 'utf8');

function section(n) {
  const re = new RegExp(`^## §${n} · [\\s\\S]*?(?=^## §|(?![\\s\\S]))`, 'm');
  const m = doc.match(re);
  return m ? m[0] : '';
}
const clean = s => s.replace(/\s+/g, ' ').trim();

// ---- §2 entities: heading + the Is not / Aliases / Open fields ---------------
const entities = [];
for (const block of doc.split(/^### (?=E-\d)/m).slice(1)) {
  const head = block.split('\n')[0];
  const hm = head.match(/^(E-\d+[a-z]?) · (.+?)(?: — (.*))?$/);
  if (!hm) continue;
  const field = (name) => {
    const re = new RegExp(`^${name}\\.\\s+([\\s\\S]*?)(?=^[A-Z][A-Za-z/ ]*\\.\\s|^\`\`\`)`, 'm');
    const m = block.match(re);
    return m ? clean(m[1]) : '';
  };
  const isNot = field('Is not').split('·').map(s => clean(s)).filter(Boolean);
  const aliases = field('Aliases');
  const am = aliases.match(/(\w+)\.\s*(?:OV-\d+)?\.?\s*$/);
  entities.push({
    id: hm[1],
    name: hm[2],
    gloss: hm[3] ? clean(hm[3]) : '',
    kind: Number(hm[1].slice(2)) < 50 ? 'table' : Number(hm[1].slice(2)) < 80 ? 'derived' : 'external',
    isNot,
    aliases: aliases.replace(/\s*(OV-\d+)\.?\s*$/, '').trim(),
    aliasWord: am ? am[1] : '',
    open: field('Open').replace(/^—$/, ''),
    storage: field('Storage'),
  });
}

// ---- §10 complexity ---------------------------------------------------------
const ovs = [];
{
  const s = section(10);
  for (const chunk of s.split(/^(OV-\d+) · /m).slice(1).reduce((a, v, i, arr) => {
    if (i % 2 === 0) a.push([v, arr[i + 1]]);
    return a;
  }, [])) {
    const [id, body] = chunk;
    if (!body) continue;
    const title = clean(body.split('\n')[0].replace(/\s*\[[a-z-]+\]\s*$/, ''));
    const kindM = body.split('\n')[0].match(/\[([a-z-]+)\]/);
    const get = (label) => {
      const m = body.match(new RegExp(`^\\s*${label}\\.?\\s+([\\s\\S]*?)(?=^\\s*[A-Z][a-z]+\\.?\\s{2,}|^\`\`\`|$)`, 'm'));
      return m ? clean(m[1]) : '';
    };
    const vm = body.match(/^\s*Verdict\.?\s+([A-Z][A-Z-]*(?:\s*→\s*[A-Z][A-Z-]*)?)/m);
    ovs.push({
      id, title,
      kind: kindM ? kindM[1] : '',
      verdict: vm ? clean(vm[1]) : '',
      cost: get('Cost'),
      collapse: get('Collapse') || get('Why keep it') || get('Why it is not simply wrong') || get('Blocked on'),
      trigger: get('Trigger'),
      note: get('Note') || get('But'),
    });
  }
}

// ---- §11 decisions ----------------------------------------------------------
const dqs = [];
for (const m of section(11).matchAll(/^\| `(DQ-\d+)` \| ([\s\S]*?) \| ([\s\S]*?) \| ([\s\S]*?) \|$/gm)) {
  const q = clean(m[2]);
  dqs.push({
    id: m[1],
    q,
    closed: /Closed \d{4}/.test(q) || m[3].trim() === '—',
    fallback: clean(m[3]),
    trigger: clean(m[4]),
    group: Number(m[1].slice(3)) >= 80 ? 'blocked' : Number(m[1].slice(3)) <= 8 ? 'product' : 'technical',
  });
}

// ---- §5 invariants ----------------------------------------------------------
const ivs = [];
for (const m of section(5).matchAll(/^\| `(IV-\d+)` \| ([\s\S]*?) \| ([\s\S]*?) \| ([\s\S]*?) \|$/gm)) {
  ivs.push({ id: m[1], rule: clean(m[2]), heldBy: clean(m[3]), on: clean(m[4]) });
}

// ---- §8 flows ---------------------------------------------------------------
const flows = [];
for (const m of doc.matchAll(/^### (FL-\d+) · ([^—\n]+?)(?: — (\d+) entry points?(?:, (\d+) params)?)?$/gm)) {
  flows.push({ id: m[1], name: clean(m[2]), entries: m[3] ? Number(m[3]) : null, params: m[4] ? Number(m[4]) : null, terse: false });
}
for (const m of doc.matchAll(/^(FL-\d+) · ([^—\n]+?) — (\d+) entr\w+ ?\(?([^\n)]*)\)?$/gm)) {
  if (!flows.some(f => f.id === m[1])) flows.push({ id: m[1], name: clean(m[2]), entries: Number(m[3]), params: null, terse: true });
}
for (const m of doc.matchAll(/^(FL-\d+) · ([^\n]+)$/gm)) {
  if (!flows.some(f => f.id === m[1])) {
    const t = clean(m[2]);
    const em = t.match(/— (\d+) entr/);
    flows.push({ id: m[1], name: t.replace(/ — .*$/, ''), entries: em ? Number(em[1]) : null, params: null, terse: true });
  }
}
flows.sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));

// ---- §7 screens -------------------------------------------------------------
const screens = [];
for (const m of section(7).matchAll(/^\| `(SC-\d+[a-z]?)` \| `([^`]+)` \|([^|]*)\|([^|]*)\|/gm)) {
  const c3 = clean(m[3]), c4 = clean(m[4]);
  const n = /^\*?\*?\d+\*?\*?$/.test(c4) ? Number(c4.replace(/\*/g, '')) : (/^\*?\*?\d+\*?\*?$/.test(c3) ? Number(c3.replace(/\*/g, '')) : null);
  screens.push({ id: m[1], route: m[2], purpose: /^\*?\*?\d+\*?\*?$/.test(c3) ? '' : c3, entries: n });
}

// ---- §6 features ------------------------------------------------------------
const feats = [];
for (const m of section(6).matchAll(/^\| `(FE-\d+)` \| ([^|]*)\| ([^|]*)\|/gm)) {
  feats.push({ id: m[1], name: clean(m[2]), state: clean(m[3]) });
}

const out = { entities, ovs, dqs, ivs, flows, screens, feats };

const tpl = fs.readFileSync('scripts/system-map.template.html', 'utf8');
const json = JSON.stringify(out);
if (/<\/script|<!--/i.test(json)) throw new Error('doc text would break out of the <script> block');
const html = tpl.replace(/\/\*__DATA__\*\/[\s\S]*?\/\*__DATA__\*\//, JSON.stringify(out));
fs.writeFileSync(process.argv[2] || 'system-map.html', html);
console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join('  '));
