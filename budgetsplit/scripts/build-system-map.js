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
 * It carries ALL THIRTEEN sections. A first cut carried seven and silently dropped
 * the scenario ladders, the cascade table and the axes — which is where the
 * findings you cannot get anywhere else actually live.
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

/**
 * Entity and flow entries are fenced blocks of `Label.   value` with hanging
 * continuation lines. Slice on the label positions rather than guessing at each
 * field's terminator — a lookahead per field silently truncates whenever a value
 * happens to start a line with a capitalised word.
 */
function fields(block) {
  const body = (block.match(/```([\s\S]*?)```/) || [null, block])[1];
  const lines = body.split('\n');
  const out = {};
  let key = null, buf = [];
  const flush = () => { if (key) out[key] = clean(buf.join(' ')); };
  for (const line of lines) {
    const m = line.match(/^( {0,2})([A-Z][A-Za-z/ ]{1,22})(\.?)( +)(\S.*)$/);
    // Values are aligned to a column, so "Definition.    x" and "Verdict. x" are
    // both labels while a wrapped prose line is not. Column position decides.
    const isLabel = m && (m[1] + m[2] + m[3] + m[4]).length >= 9;
    if (isLabel) { flush(); key = m[2].trim(); buf = [m[5]]; }
    else if (key) buf.push(line.trim());
  }
  flush();
  return out;
}
/** `· a · b · c` → ['a','b','c'] */
const bullets = s => (s || '').split('·').map(x => clean(x)).filter(Boolean);

/**
 * Every row of every pipe table in `src`, as arrays of trimmed cells. Arity-free on
 * purpose: a fixed-column regex drops every row the day a table gains a column, and
 * does it silently — which is the failure mode this whole document exists to end.
 */
function rows(src) {
  return src.split('\n')
    .filter(l => /^\|/.test(l) && !/^\|[\s:|-]+\|$/.test(l))
    .map(l => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map(clean));
}
const cellNum = c => (/^\*?\*?\d+\*?\*?$/.test(c) ? Number(c.replace(/\*/g, '')) : null);
const bare = c => String(c || '').replace(/`/g, '');

// ---- §2 entities ------------------------------------------------------------
const entities = [];
for (const block of doc.split(/^### (?=E-\d)/m).slice(1)) {
  const head = block.split('\n')[0];
  const hm = head.match(/^(E-\d+[a-z]?) · (.+?)(?: — (.*))?$/);
  if (!hm) continue;
  const f = fields(block);
  const aliases = f['Aliases'] || '';
  const am = aliases.match(/(\w+)\.\s*(?:OV-\d+)?\.?\s*$/);
  entities.push({
    id: hm[1],
    name: hm[2],
    gloss: hm[3] ? clean(hm[3]) : '',
    kind: Number(hm[1].slice(2)) < 50 ? 'table' : Number(hm[1].slice(2)) < 80 ? 'derived' : 'external',
    isNot: bullets(f['Is not']),
    storage: f['Storage'] || '',
    identity: f['Identity'] || '',
    owned: f['Owned by'] || '',
    refs: f['References'] || f['Derived from'] || '',
    refBy: f['Referenced by'] || '',
    lifecycle: f['Lifecycle'] || '',
    create: f['Create'] || f['Create/Edit/Delete'] || f['Create/Delete'] || '',
    edit: f['Edit'] || '',
    del: f['Delete'] || '',
    sync: f['Sync'] || '',
    scopes: f['Scopes'] || '',
    reading: f['Reading'] || f['Note'] || f['Shapes'] || f['Constants'] || f['Destination'] || '',
    aliases: aliases.replace(/\s*(OV-\d+)\.?\s*$/, '').trim(),
    aliasWord: am ? am[1] : '',
    surfaces: f['Surfaces'] || '',
    invariants: f['Invariants'] || '',
    open: (f['Open'] || '').replace(/^—$/, ''),
  });
}

// ---- §3 relationships: the tree, cardinality and the cascade table ----------
const s3 = section(3);
const tree = (s3.match(/```\n([\s\S]*?)```/) || [, ''])[1].replace(/\s+$/, '');
const cardinality = [...s3.matchAll(/^\| `?(E-\d+)`? ([a-z_]*) \| ([^|]+) \| `?(E-\d+)`? ?([a-z_]*) \| ([^|]*)\|$/gm)]
  .map(m => ({ from: m[1], fromName: m[2], card: clean(m[3]), to: m[4], toName: m[5], note: clean(m[6]) }));
const cascade = [...s3.matchAll(/^\| \*\*`(E-\d+)` ([a-z]+)\*\* \| ([\s\S]*?) \| ([^|]*)\|$/gm)]
  .map(m => ({ id: m[1], verb: m[2], effect: clean(m[3]), where: clean(m[4]) }));

// ---- §4 axes ----------------------------------------------------------------
const axes = [...section(4).matchAll(/^\| `(AX-\d+)` \| \*\*([^*]+)\*\* \| ([^|]*)\| ([^|]*)\|$/gm)]
  .map(m => ({ id: m[1], name: clean(m[2]), values: clean(m[3]), why: clean(m[4]) }));

// ---- §5 invariants ----------------------------------------------------------
const ivs = [...section(5).matchAll(/^\| `(IV-\d+)` \| ([\s\S]*?) \| ([\s\S]*?) \| ([\s\S]*?) \|$/gm)]
  .map(m => ({ id: m[1], rule: clean(m[2]), heldBy: clean(m[3]), on: clean(m[4]) }));

// ---- §6 features ------------------------------------------------------------
const feats = rows(section(6))
  .filter(r => /^`FE-\d+`$/.test(r[0]))
  .map(r => ({ id: bare(r[0]), name: r[1] || '', state: r[2] || '', where: r[3] || '', ents: r[4] || '' }));
const flagRows = rows(section(6))
  .filter(r => /^\d+$/.test(r[0]) && /^`\w+`$/.test(r[1] || ''))
  .map(r => ({ key: bare(r[1]), def: r[2] || '', gates: r[3] || '' }));

// ---- §7 screens -------------------------------------------------------------
const screens = rows(section(7))
  .filter(r => /^`SC-\d+[a-z]?`$/.test(r[0]) && /^`\S+`$/.test(r[1] || ''))
  .map(r => {
    const rest = r.slice(2);
    const at = rest.findIndex(c => cellNum(c) !== null);
    return {
      id: bare(r[0]),
      route: bare(r[1]),
      purpose: at > 0 ? rest[0] : '',
      entries: at >= 0 ? cellNum(rest[at]) : null,
      note: at >= 0 ? (rest[at + 1] || '') : '',
    };
  });

// ---- §8 flows ---------------------------------------------------------------
const flows = [];
for (const block of doc.split(/^### (?=FL-\d)/m).slice(1)) {
  const head = block.split('\n')[0];
  const hm = head.match(/^(FL-\d+) · ([^—]+?)(?: — (\d+) entry points?(?:, (\d+) params)?)?$/);
  if (!hm) continue;
  const f = fields(block);
  flows.push({
    id: hm[1], name: clean(hm[2]),
    entries: hm[3] ? Number(hm[3]) : null,
    params: hm[4] ? Number(hm[4]) : null,
    trigger: f['Trigger'] || '',
    entry: f['Entry'] || '',
    pre: f['Pre'] || '',
    steps: f['Steps'] || '',
    ents: f['Entities'] || '',
    writes: f['Writes'] || '',
    exit: f['Exit'] || '',
    branches: f['Branches'] || '',
    failures: f['Failures'] || '',
    reversible: f['Reversible'] || '',
    problems: f['Problems'] || '',
    terse: false,
  });
}
/* The tail of §8 is one fenced block of `FL-nn · name — n entries (where)` stanzas. */
const tail = section(8).split('### FL-21 → FL-54 · the rest')[1] || '';
for (const st of tail.split(/\n(?=FL-\d+ · )/)) {
  const m = st.match(/^(FL-\d+) · ([^\n—]+?)(?:\s+— ([^\n]*))?\n([\s\S]*)/);
  if (!m || flows.some(f => f.id === m[1])) continue;
  flows.push({
    id: m[1], name: clean(m[2]),
    entries: /(\d+)[^\n]*entr/.test(m[3] || '') ? Number(m[3].match(/(\d+)[^\n]*entr/)[1]) : null,
    params: null,
    trigger: '', entry: clean(((m[3] || '').match(/\(([^)]*)\)/) || [, ''])[1]),
    pre: '', steps: '', ents: '', writes: '', exit: '', branches: '', failures: '',
    reversible: '', problems: '',
    summary: clean(m[4].replace(/```/g, '')),
    terse: true,
  });
}
flows.sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));

// ---- §9 scenario ladders ----------------------------------------------------
const s9 = section(9);
const ladders = [];
for (const block of s9.split(/^### (?=SN-\d)/m).slice(1)) {
  const head = block.split('\n')[0];
  const hm = head.match(/^(SN-\d+) · (.+)$/);
  if (!hm) continue;
  const t0 = (block.match(/^\*\*T0\*\* — ([\s\S]*?)(?=\n\n)/m) || [, ''])[1];
  const rows = [...block.matchAll(/^\| \.(T[0-4][a-z]) \| ([\s\S]*?) \| `([^`]*)` \|$/gm)]
    .map(m => ({ t: m[1], text: clean(m[2]), status: m[3] }));
  const raw = rows.length ? '' : block.split('\n').slice(1).join('\n').trim().slice(0, 4000);
  ladders.push({ id: hm[1], name: clean(hm[2]), t0: clean(t0), rows, raw });
}
/* The compact ladders and the crossings table both matter; carry them as prose. */
const laddersCompact = [...s9.matchAll(/^(SN-\d+)\s+T0\s+([\s\S]*?)(?=^SN-\d+\s+T0|^```)/gm)]
  .map(m => ({ id: m[1], text: clean(m[2]).slice(0, 900) }));
const crossings = [...s9.matchAll(/^\| `(SN-\d+)`(?:\/`(SN-\d+)`)? \| ([^|]*)\| ([^|]*)\|$/gm)]
  .map(m => ({ id: m[1], also: m[2] || '', name: clean(m[3]), bites: clean(m[4]) }));

// ---- §10 complexity ---------------------------------------------------------
const ovs = [];
for (const st of section(10).split(/\n(?=OV-\d+ · )/)) {
  const m = st.match(/^(OV-\d+) · ([^\n]+)\n([\s\S]*)/);
  if (!m) continue;
  const f = fields('```\n' + m[3] + '\n```');
  const kindM = m[2].match(/\[([a-z-]+)\]/);
  ovs.push({
    id: m[1],
    title: clean(m[2].replace(/\s*\[[a-z-]+\]\s*$/, '')),
    kind: kindM ? kindM[1] : '',
    verdict: ((f['Verdict'] || '').match(/^([A-Z][A-Z-]+)/) || [, ''])[1],
    verdictNote: clean((f['Verdict'] || '').replace(/^[A-Z][A-Z-]+[,.]?\s*/, '')),
    detail: f['The N'] || f['The four'] || f['The N things'] || '',
    evidence: f['Evidence'] || '',
    cost: f['Cost'] || '',
    collapse: f['Collapse'] || f['Why keep it'] || f['Why it is not simply wrong'] || f['Blocked on'] || '',
    blast: f['Blast'] || '',
    risk: f['Risk'] || '',
    trigger: (f['Trigger'] || '').replace(/^—$/, ''),
    note: f['Note'] || f['But'] || '',
  });
}

// ---- §11 decisions ----------------------------------------------------------
const dqs = [];
for (const m of section(11).matchAll(/^\| `(DQ-\d+)` \| ([\s\S]*?) \| ([\s\S]*?) \| ([\s\S]*?) \|$/gm)) {
  const q = clean(m[2]);
  dqs.push({
    id: m[1], q,
    closed: /Closed \d{4}/.test(q) || m[3].trim() === '—',
    fallback: clean(m[3]), trigger: clean(m[4]),
    group: Number(m[1].slice(3)) >= 80 ? 'blocked' : Number(m[1].slice(3)) <= 8 ? 'product' : 'technical',
  });
}

// ---- §0, §1, §12 prose ------------------------------------------------------
const legend = [...section(0).matchAll(/^\| `([A-Z]{1,2})-` \| ([^|]*)\| ([^|]*)\| ([^|]*)\|$/gm)]
  .map(m => ({ p: m[1], is: clean(m[2]), eg: clean(m[3]), answers: clean(m[4]) }));
const subIds = (section(0).match(/```\n(FL-04\.E5[\s\S]*?)```/) || [, ''])[1] || '';
const issueTpl = (section(0).match(/```\n(Where:[\s\S]*?)```/) || [, ''])[1] || '';
const router = [...section(0).matchAll(/^\| ([^|]+?) \| (§\d+(?:, §\d+)?) \|$/gm)]
  .map(m => ({ q: clean(m[1]), s: clean(m[2]) }));

const s1 = section(1);
const notList = [...s1.matchAll(/^- \*\*Not ([^*]+)\*\*\s*([\s\S]*?)(?=\n- \*\*|\n\n)/gm)]
  .map(m => ({ what: 'Not ' + clean(m[1]).replace(/\.$/, ''), why: clean(m[2]) }));
const worlds = [...s1.matchAll(/^\| \*\*([A-Za-z ]+)\*\* \| ([^|]*)\| ([^|]*)\|$/gm)]
  .map(m => ({ w: clean(m[1]), q: clean(m[2]), e: clean(m[3]) }));
const egress = [...s1.matchAll(/^\| ([^|]*?Worker[^|]*|The user's UPI app|WhatsApp|The OS share sheet) \| ([^|]*)\| ([^|]*)\| ([^|]*)\|$/gm)]
  .map(m => ({ to: clean(m[1]), what: clean(m[2]), when: clean(m[3]), gate: clean(m[4]) }));

const s12 = section(12);
const supersede = [...s12.matchAll(/^\| `?([A-Za-z0-9_. -]+?)`?(?: \([^)]*\))? \| (\*\*[^|]*|[^|]*) \|$/gm)]
  .map(m => ({ was: clean(m[1]), now: clean(m[2]) }))
  .filter(r => r.was && !/^(Namespace|Origin|Before|Test|New|ID|Doc)/.test(r.was));
const guards = [...s12.matchAll(/^\| `([a-zA-Z]+\.test\.ts)` \| ([^|]*)\|$/gm)]
  .map(m => ({ file: m[1], holds: clean(m[2]) }));

const meta = {
  lines: doc.split('\n').length,
  sections: (doc.match(/^## §/gm) || []).length,
};

const out = {
  meta, legend, subIds, issueTpl, router, worlds, notList, egress,
  entities, tree, cardinality, cascade, axes, ivs, feats, flagRows,
  screens, flows, ladders, laddersCompact, crossings, ovs, dqs,
  supersede, guards,
};

const tpl = fs.readFileSync('scripts/system-map.template.html', 'utf8');
const json = JSON.stringify(out);
if (/<\/script|<!--/i.test(json)) throw new Error('doc text would break out of the <script> block');
fs.writeFileSync(process.argv[2] || 'system-map.html',
  tpl.replace(/\/\*__DATA__\*\/[\s\S]*?\/\*__DATA__\*\//, json));

console.log(Object.entries(out)
  .filter(([, v]) => Array.isArray(v))
  .map(([k, v]) => `${k}:${v.length}`).join('  '));
