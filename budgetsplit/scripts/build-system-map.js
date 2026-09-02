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
    friendly: '',
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

/* "Getting there" — taps, not routes. A path is not a direction. */
const reachRows = rows(section(7))
  .filter(r => /^`SC-\d+[a-z]?`$/.test(r[0]) && r.length === 2 && !/^`\S+`$/.test(r[1] || ''));
const reachOf = Object.fromEntries(reachRows.map(r => [bare(r[0]), r[1]]));
for (const s of screens) s.reach = reachOf[s.id] || '';

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
    state: f['State'] || '',
    numbers: f['Numbers'] || '',
    alsoTry: f['Also try'] || '',
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
    summary: clean(m[4].replace(/```/g, '')).replace(/\s*Ladder SN-\d+\.\s*$/, ''),
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
  if (!rows.length) {
    // Matrix form: header names the tiers, the first cell is the case letter.
    const tbl = block.split('\n').filter(l => /^\|/.test(l));
    const head = (tbl[0] || '').split('|').map(clean);
    const tiers = head.map(h => (h.match(/^T\d$/) ? h : null));
    for (const line of tbl.slice(2)) {
      const cells = line.split('|').map(clean);
      const letter = cells[1];
      if (!/^[a-z]$/.test(letter || '')) continue;
      cells.forEach((c, i) => {
        if (!tiers[i] || !c) return;
        const st = (c.match(/`([^`]*)`\s*$/) || [, '❓'])[1];
        rows.push({ t: tiers[i] + letter, text: clean(c.replace(/`[^`]*`\s*$/, '')), status: st });
      });
    }
    rows.sort((a, b) => a.t.localeCompare(b.t));
  }
  const raw = rows.length ? '' : ((block.match(/```\n([\s\S]*?)```/) || [, ''])[1] || '').trimEnd();
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

// ---- Areas: the app as eight things it does, not nine id namespaces --------
//
// Assignment is an explicit list, not a keyword guess, and every id must appear
// exactly once — asserted below. A map you can read is worth more than a clever
// one you cannot check.

const AREAS = [
  {
    key: 'add', name: 'Recording money',
    blurb: 'Getting a transaction into the app — typed, spoken, scanned or split by item — and everything that describes it afterwards: category, receipt, note, the ledger you find it in again.',
    ent: ['E-04','E-06','E-07','E-08','E-09','E-10','E-60','E-83','E-86','E-92'],
    fl:  ['FL-04','FL-05','FL-12','FL-13','FL-14','FL-17','FL-18','FL-40','FL-41','FL-53'],
    sc:  ['SC-07','SC-08','SC-14','SC-15','SC-16','SC-23','SC-25','SC-35'],
    fe:  ['FE-01','FE-02','FE-03','FE-04','FE-05','FE-06','FE-07','FE-08','FE-09','FE-10','FE-38','FE-40'],
    ov:  ['OV-01','OV-06','OV-08','OV-18'],
    dq:  ['DQ-16','DQ-18','DQ-20','DQ-22'],
  },
  {
    key: 'split', name: 'Splitting and settling',
    blurb: 'Groups, the people in them, who owes whom, and paying each other back. Balances are never stored — they are recomputed from payments and shares every time you look.',
    ent: ['E-01','E-02','E-03','E-50','E-51','E-52','E-64','E-84','E-85'],
    fl:  ['FL-06','FL-19','FL-20','FL-21','FL-22','FL-23','FL-26','FL-46','FL-47','FL-52'],
    sc:  ['SC-04','SC-09','SC-11','SC-13','SC-26','SC-26a'],
    fe:  ['FE-11','FE-12','FE-13','FE-14','FE-15','FE-17','FE-18','FE-19','FE-20','FE-21','FE-22'],
    ov:  ['OV-02','OV-04','OV-05','OV-11','OV-14','OV-27'],
    dq:  ['DQ-09','DQ-10','DQ-11','DQ-13','DQ-84'],
  },
  {
    key: 'budget', name: 'Budgets and insight',
    blurb: 'What you meant to spend, what you actually spent, and what the month is going to look like. Every figure here is your share of a bill, never the whole bill.',
    ent: ['E-12','E-53','E-55','E-56','E-57','E-61','E-63'],
    fl:  ['FL-07','FL-09','FL-38','FL-39','FL-42','FL-43'],
    sc:  ['SC-03','SC-10','SC-10b','SC-20','SC-21','SC-22','SC-33'],
    fe:  ['FE-25','FE-26','FE-32','FE-33','FE-34','FE-35','FE-36','FE-37','FE-42'],
    ov:  ['OV-07','OV-19'],
    dq:  ['DQ-02','DQ-12'],
  },
  {
    key: 'savings', name: 'Savings and assets',
    blurb: 'Money set aside and things you own. Buying gold or funding an SIP is a transfer, not an expense: the cash moved, nothing was consumed, and net worth must not change.',
    ent: ['E-11','E-14','E-15','E-16','E-54','E-62'],
    fl:  ['FL-10','FL-33','FL-34','FL-35','FL-36','FL-37','FL-45'],
    sc:  ['SC-05','SC-17','SC-42'],
    fe:  ['FE-27','FE-28','FE-29','FE-30','FE-31'],
    ov:  ['OV-20'],
    dq:  ['DQ-14','DQ-15'],
  },
  {
    key: 'recurring', name: 'Recurring and reminders',
    blurb: 'Things that happen every month, and being told about them. A recurring rule lives in the same table as a transaction — it is a row that has never happened, and every money query has to exclude it.',
    ent: ['E-05','E-58','E-59','E-67','E-90','E-91'],
    fl:  ['FL-15','FL-16','FL-44'],
    sc:  ['SC-30','SC-31','SC-32','SC-41'],
    fe:  ['FE-23','FE-24','FE-50','FE-60'],
    ov:  ['OV-03','OV-12','OV-22'],
    dq:  [],
  },
  {
    key: 'import', name: 'Importing and review',
    blurb: 'Statements, exports and pasted alerts, parsed into a staging inbox you edit in place before anything reaches the ledger. Nothing commits until you say so.',
    ent: ['E-17','E-66'],
    fl:  ['FL-08','FL-48'],
    sc:  ['SC-18','SC-19'],
    fe:  ['FE-43','FE-44','FE-45','FE-46','FE-47','FE-48','FE-49','FE-51'],
    ov:  ['OV-21','OV-24'],
    dq:  ['DQ-81','DQ-82','DQ-83'],
  },
  {
    key: 'sync', name: 'Accounts, sync and backup',
    blurb: 'The optional half. An account buys off-device backup and shared-group sync and nothing else. Built end to end, encrypted per group — and no part of it has run on a phone.',
    ent: ['E-18','E-19','E-20','E-21','E-22','E-65','E-82','E-87','E-88','E-89'],
    fl:  ['FL-11','FL-24','FL-25','FL-27','FL-28','FL-29','FL-30','FL-31','FL-32','FL-49'],
    sc:  ['SC-34','SC-36','SC-37','SC-38','SC-39','SC-40','SC-43','SC-44'],
    fe:  ['FE-16','FE-52','FE-53','FE-54','FE-55','FE-56','FE-57','FE-58','FE-59'],
    ov:  [],
    dq:  ['DQ-04','DQ-05','DQ-07','DQ-08','DQ-85','DQ-86'],
  },
  {
    key: 'shell', name: 'The app itself',
    blurb: 'First run, settings, feature switches, the lock screen, storage and the history log — plus the navigation shell everything else sits inside.',
    ent: ['E-13','E-80','E-81'],
    fl:  ['FL-01','FL-02','FL-03','FL-50','FL-51','FL-54'],
    sc:  ['SC-01','SC-02','SC-06','SC-24','SC-27','SC-27a','SC-28','SC-29'],
    fe:  ['FE-39','FE-41','FE-61','FE-62','FE-63','FE-64','FE-65','FE-66','FE-67','FE-68','FE-69','FE-70'],
    ov:  ['OV-09','OV-10','OV-13','OV-15','OV-16','OV-17','OV-23','OV-25','OV-26'],
    dq:  ['DQ-01','DQ-03','DQ-06','DQ-17','DQ-19','DQ-21','DQ-23','DQ-80'],
  },
];

/* Every id lands in exactly one area, or the build fails. An unassigned entry
   would simply vanish from the page — the silent-loss failure this whole
   document exists to end. */
function assertPartition(label, all, picked) {
  const seen = new Map();
  for (const a of AREAS) for (const id of a[picked]) {
    if (seen.has(id)) throw new Error(`${label}: ${id} is in both ${seen.get(id)} and ${a.key}`);
    seen.set(id, a.key);
  }
  const ids = all.map(x => x.id);
  const missing = ids.filter(id => !seen.has(id));
  const unknown = [...seen.keys()].filter(id => !ids.includes(id));
  if (missing.length) throw new Error(`${label}: unassigned — ${missing.join(', ')}`);
  if (unknown.length) throw new Error(`${label}: assigned but not in the doc — ${unknown.join(', ')}`);
}
assertPartition('entities', entities, 'ent');
assertPartition('flows', flows, 'fl');
assertPartition('screens', screens, 'sc');
assertPartition('features', feats, 'fe');
assertPartition('complexity', ovs, 'ov');
assertPartition('decisions', dqs, 'dq');


/* Plain-English names. The document is written for someone editing the code; the
   page is read by someone deciding what is wrong with the app. "txn_payment" and
   "who paid" are the same thing, and only one of them is readable in a sentence. */
const FRIENDLY = {
  'E-01': 'people', 'E-02': 'groups', 'E-03': 'membership', 'E-04': 'transactions',
  'E-05': 'skipped dates', 'E-06': 'who paid', 'E-07': 'who owes', 'E-08': 'bill lines',
  'E-09': 'categories', 'E-10': 'deleted-category markers', 'E-11': 'stored settings',
  'E-12': 'budget lines', 'E-13': 'the history log', 'E-14': 'assets', 'E-15': 'goals',
  'E-16': 'goal movements', 'E-17': 'the review inbox', 'E-18': 'the send queue',
  'E-19': 'invites', 'E-20': 'approvals', 'E-21': 'per-group trust', 'E-22': 'disputes',
  'E-50': 'balances', 'E-51': 'what you owe and are owed', 'E-52': 'the settle-up plan',
  'E-53': 'yours to spend', 'E-54': 'total money', 'E-55': 'the health score',
  'E-56': 'the budget that applies', 'E-57': 'the forecast', 'E-58': 'upcoming bills',
  'E-59': 'a recurring occurrence', 'E-60': 'the split maths', 'E-61': 'the afford verdict',
  'E-62': 'the savings plan', 'E-63': 'spending by category', 'E-64': 'what you may do in a group',
  'E-65': 'the trust decision', 'E-66': 'what saving will do', 'E-67': 'a suggested rule',
  'E-80': 'app preferences', 'E-81': 'feature switches', 'E-82': 'this device key',
  'E-83': 'receipt photos', 'E-84': 'an unconfirmed payment', 'E-85': 'an unconfirmed settle-up',
  'E-86': 'a voice capture', 'E-87': 'your account', 'E-88': 'what syncs',
  'E-89': 'the backup file', 'E-90': 'scheduled reminders', 'E-91': 'reminder preferences',
  'E-92': 'learned categories',
};

/* A short human name per id, so the page can say "payments and shares" where the
   document says "E-06 and E-07". The ids stay on the rows themselves, which is
   where they are needed — for citing. */
const names = {};
for (const e of entities) names[e.id] = FRIENDLY[e.id] || e.name;
for (const s of screens) names[s.id] = s.route;
for (const f of flows) names[f.id] = f.name.toLowerCase();
for (const a of axes) names[a.id] = a.name.toLowerCase();
for (const l of ladders) names[l.id] = l.name.toLowerCase();
/* Short labels for the pointer namespaces, so a list of them reads as English.
   Derived from the entry's own first clause — no second place to keep in sync. */
const short = (s, n) => {
  const first = String(s).replace(/[`*]/g, '').split(/(?<=[a-z)])[.;—]\s/)[0].trim();
  return first.length > n ? first.slice(0, n - 1).replace(/[\s,]+$/, '') + '…' : first;
};
for (const v of ivs) names[v.id] = short(v.rule, 46).toLowerCase();
for (const o of ovs) names[o.id] = short(o.title, 52).toLowerCase();
for (const d of dqs) names[d.id] = short(d.q.replace(/^~~|~~$/g, ''), 52).toLowerCase();
for (const f of flows) names['SN-' + f.id.slice(3)] = names['SN-' + f.id.slice(3)] || f.name.toLowerCase();
for (const f of feats) names[f.id] = f.name.toLowerCase();

/* ---- Components, and which screen each one is reachable from ---------------
 *
 * Nothing tracked this before, so "no component is missing" could not be said,
 * let alone checked. Screens import components, components import components, so
 * the map is the transitive closure of the import graph rooted at each route.
 */
const path = require('path');

const SRC = 'src';
const COMP_DIR = path.join(SRC, 'components');

function allFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) allFiles(f, out);
    else if (/\.tsx?$/.test(e.name)) out.push(f);
  }
  return out;
}

const compFiles = allFiles(COMP_DIR).filter(f => f.endsWith('.tsx'));
/** `src/components/finance/add/AmountSheet.tsx` → `AmountSheet` */
const compName = f => path.basename(f, '.tsx');
const byName = new Map(compFiles.map(f => [compName(f), f]));

/** Every component a file imports, by name, resolved against the component tree. */
function importsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = new Set();
  for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const name = path.basename(spec).replace(/\.tsx?$/, '');
    if (byName.has(name)) out.add(name);
  }
  /* A barrel like `components/ui` re-exports; catch named imports off it too. */
  for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'[^']*components?\/[^']*'/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (byName.has(name)) out.add(name);
    }
  }
  return [...out];
}

const importCache = new Map();
const cachedImports = (file) => {
  if (!importCache.has(file)) importCache.set(file, importsOf(file));
  return importCache.get(file);
};

/** Transitive closure from one route file. */
function reachable(routeFile) {
  const seen = new Set();
  const stack = [...cachedImports(routeFile)];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    const f = byName.get(n);
    if (f) stack.push(...cachedImports(f));
  }
  return seen;
}

const routeFileFor = {};
for (const f of allFiles('app')) {
  if (!f.endsWith('.tsx')) continue;
  const base = path.basename(f);
  const rel = path.relative('app', f).replace(/\.tsx$/, '');
  const segs = rel.split(path.sep).filter(s => !/^\(.*\)$/.test(s));
  if (segs[segs.length - 1] === 'index') segs.pop();
  const route = '/' + segs.join('/');
  if (base === '_layout.tsx') {
    routeFileFor[rel.includes(path.sep) ? '/(tabs)' : '/(root)'] = f;
  } else {
    routeFileFor[route] = f;
  }
}

/* screen id → component names, and the reverse */
const screenByRoute = Object.fromEntries(screens.map(s => [s.route, s.id]));
screenByRoute['/(root)'] = 'SC-01';
screenByRoute['/(tabs)'] = 'SC-02';

const componentsOf = {};   // SC-id → [component]
const screensOf = {};      // component → [SC-id]
for (const [route, file] of Object.entries(routeFileFor)) {
  const sc = screenByRoute[route];
  if (!sc) continue;
  const names = [...reachable(file)].sort();
  componentsOf[sc] = names;
  for (const n of names) (screensOf[n] = screensOf[n] || []).push(sc);
}

/** A component nothing reaches is either dead or reached only dynamically. */
const orphanComponents = compFiles.map(compName).filter(n => !screensOf[n]).sort();

/* Which bucket a component lives in — a `ui/` primitive is checked as part of a
   screen, a `finance/` widget is worth naming on its own. */
const bucketOf = {};
for (const f of compFiles) {
  const rel = path.relative(COMP_DIR, f);
  bucketOf[compName(f)] = rel.split(path.sep)[0];
}
const componentList = compFiles.map(compName).sort().map(n => ({
  name: n,
  bucket: bucketOf[n],
  screens: (screensOf[n] || []).sort(),
  sheet: /Sheet$/.test(n),
}));

/* ---- The walkthrough ------------------------------------------------------
 * A task is a test script already: it says where to start, what to do, what should
 * happen and what goes wrong. Stitching them into one ordered route is what turns
 * this document into something you can walk with a phone in your hand.
 */
const areaOf = {};
for (const a of AREAS) for (const id of a.fl) areaOf[id] = a.key;
for (const f of flows) {
  f.area = areaOf[f.id];
  /* Which sweep this belongs to, read off its own State line rather than
     guessed: "empty" only in a wiped app, "second device" not walkable alone,
     everything else on demo data. */
  const st = (f.state || '').toLowerCase();
  /* What a person can do right now, which is a question about state and about
     whether the task CHANGES anything — a read-only task is safe in any order,
     a writing one leaves the app different for everything after it. */
  const readOnly = /^\s*(nothing|none)\b/i.test((f.writes || '').replace(/[*_`]/g, ''));
  f.sweep = /second device|needs a second|real email|not walkable|needs an account/.test(st) ? 'pair'
          : /^\s*empty\b|only way to see|erase all data, then relaunch/.test(st) ? 'cold'
          : readOnly ? 'demo'
          : 'hands';
  const txt = [f.entry, f.steps, f.exit, f.problems, f.summary].join(' ');
  f.screens = [...new Set(txt.match(/\bSC-\d+[a-z]?\b/g) || [])];
  const sn = 'SN-' + f.id.slice(3);
  f.cases = (ladders.find(l => l.id === sn) || {}).rows || [];
  f.t0 = (ladders.find(l => l.id === sn) || {}).t0 || '';
  f.crossing = (crossings.find(c => c.id === sn || c.also === sn) || {}).bites || '';
}
/* Screens no task walks you through still need looking at once. */
/* The route: cold first (it needs a wiped app), then everything demo data can
   answer, then the write paths, then the ones needing a second phone. Within a
   sweep, area order — which is roughly the order a person meets the app. */
const SWEEPS = ['cold', 'demo', 'hands', 'pair'];
const areaRank = Object.fromEntries(AREAS.map((a, i) => [a.key, i]));
const route = [...flows].sort((a, b) =>
  SWEEPS.indexOf(a.sweep) - SWEEPS.indexOf(b.sweep)
  || areaRank[a.area] - areaRank[b.area]
  || Number(a.id.slice(3)) - Number(b.id.slice(3))).map(f => f.id);

const flowScreens = new Set(flows.flatMap(f => f.screens));
for (const a of AREAS) a.orphanScreens = a.sc.filter(id => !flowScreens.has(id));

/* ---- Attribution: one home screen per component ---------------------------
 *
 * `SC-07` reaches 48 components and `SC-29` reaches 2, because the Add screen
 * pulls in half the primitive library. Listing all 48 on one stop is useless, so
 * each component gets exactly one home: the screen that reaches it with the
 * FEWEST components, which is the most specific screen that uses it.
 */
const homeOf = {};
for (const c of componentList) {
  if (!c.screens.length) continue;
  c.home = [...c.screens].sort((a, b) =>
    (componentsOf[a] || []).length - (componentsOf[b] || []).length || a.localeCompare(b))[0];
  homeOf[c.home] = homeOf[c.home] || [];
  homeOf[c.home].push(c.name);
}
/* Only `finance/` and `system/` are named on a stop — those have behaviour worth
   checking. The `ui/` primitives render on every screen; a broken one is obvious
   the moment you open anything. */
const notableAt = sc => (homeOf[sc] || [])
  .filter(n => (componentList.find(c => c.name === n) || {}).bucket !== 'ui').sort();

/* ---- Booklets -------------------------------------------------------------
 *
 * Small enough to finish in a sitting. Built from each area, split when a list
 * runs long, plus four that cut across everything.
 */
const AREA_BOOKS = {
  add:       [['screens', 'the screens'], ['do', 'logging it'], ['capture', 'capture']],
  split:     [['screens', 'the screens'], ['do', 'groups and people'], ['settle', 'settling up']],
  budget:    [['screens', 'the screens'], ['do', 'setting them']],
  savings:   [['screens', 'the screens'], ['do', 'money and assets'], ['goals', 'goals']],
  recurring: [['screens', 'the screens'], ['do', 'rules and reminders']],
  import:    [['screens', 'the screens'], ['do', 'inbox and export']],
  sync:      [['screens', 'the screens'], ['peer', 'when someone else is involved'], ['do', 'accounts and sync']],
  shell:     [['screens', 'the screens'], ['do', 'settings and safety']],
};
/* Which "doing" booklet a task belongs to when an area has more than one. */
const BOOK_OF_FLOW = {
  'FL-17': 'capture', 'FL-18': 'capture', 'FL-41': 'capture', 'FL-53': 'capture',
  'FL-06': 'settle', 'FL-19': 'settle', 'FL-20': 'settle', 'FL-21': 'settle',
  'FL-46': 'settle', 'FL-47': 'settle',
  'FL-27': 'peer', 'FL-28': 'peer', 'FL-29': 'peer',
  'FL-10': 'goals', 'FL-36': 'goals', 'FL-37': 'goals',
};

const BOOKS = [];
const seenFlow = new Set();

/* The cold sweep first: a wiped app is the only place empty states exist, and
   you cannot be in it and in demo data at the same time. */
BOOKS.push({
  key: 'cold', name: 'First run and empty states', state: 'empty',
  blurb: 'Erase everything and start from nothing. The only way to see first run, and the only way to see an empty state — demo data can never show you one.',
  stops: [
    ...flows.filter(f => f.sweep === 'cold').map(f => { seenFlow.add(f.id); return { kind: 'flow', id: f.id }; }),
    { kind: 'empty' },
  ],
});

for (const a of AREAS) {
  for (const [sub, label] of AREA_BOOKS[a.key]) {
    let stops;
    if (sub === 'screens') {
      stops = a.sc.map(id => ({ kind: 'screen', id }));
    } else {
      const mine = a.fl.filter(id => (BOOK_OF_FLOW[id] || 'do') === sub && !seenFlow.has(id));
      mine.forEach(id => seenFlow.add(id));
      stops = mine.map(id => ({ kind: 'flow', id }));
    }
    if (!stops.length) continue;
    const states = [...new Set(stops.filter(s => s.kind === 'flow')
      .map(s => flows.find(f => f.id === s.id).sweep))];
    BOOKS.push({
      key: `${a.key}-${sub}`,
      name: `${a.name} · ${label}`,
      state: sub === 'screens' ? 'demo' : (states.includes('pair') ? 'pair' : states.includes('hands') ? 'hands' : 'demo'),
      blurb: sub === 'screens'
        ? `Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right.`
        : a.blurb,
      stops,
    });
  }
}

/* Anything the area lists missed, so a new task cannot fall through. */
const orphanFlows = flows.filter(f => !seenFlow.has(f.id));
if (orphanFlows.length) {
  BOOKS.push({
    key: 'other', name: 'Everything else', state: 'demo',
    blurb: 'Tasks no other booklet claimed.',
    stops: orphanFlows.map(f => ({ kind: 'flow', id: f.id })),
  });
}

BOOKS.push({
  key: 'rules', name: 'Rules that must hold', state: 'demo',
  blurb: 'Twenty-two things that must never be false. Nine have a test behind them; the rest are held by people remembering, which is exactly why they are worth checking by hand.',
  stops: ivs.map(v => ({ kind: 'rule', id: v.id })),
});
BOOKS.push({
  key: 'problems', name: 'Known problems', state: 'demo',
  blurb: 'Twenty-seven findings already written down. Confirm each is still real, still this bad, and still worth the verdict it carries.',
  stops: ovs.map(o => ({ kind: 'problem', id: o.id })),
});
BOOKS.push({
  key: 'questions', name: 'Open questions', state: 'demo',
  blurb: 'Thirty things nobody has decided. Your opinion is the answer to most of them — that is not a figure of speech, it is why they are still open.',
  stops: dqs.map(d => ({ kind: 'decision', id: d.id })),
});

/* ---- How long each stop takes ---------------------------------------------
 *
 * Read off the same fields the stop renders, never typed: a task that grows a
 * step grows its estimate, and nothing has to be kept in sync by hand. Rough on
 * purpose — the number is there to help you pick a booklet for the time you have,
 * not to be defended to the minute.
 */
const partsCount = v => String(v || '').split('·').filter(x => x.trim()).length;
const stepsCount = v => String(v || '').split(/\s+(?=\.(?:S|FM|B|E)\d)/).filter(x => x.trim()).length;
const SETUP_MIN = 2;   // getting the app into the state a booklet asks for

function stopMinutes(s) {
  if (s.kind === 'flow') {
    const f = flows.find(x => x.id === s.id);
    const writes = !/^\s*(nothing|none)\b/i.test((f.writes || '').replace(/[*_`]/g, ''));
    return 3 + stepsCount(f.steps) * 0.5 + partsCount(f.numbers) * 0.7
             + partsCount(f.alsoTry) * 1.2 + (writes ? 2 : 0);
  }
  if (s.kind === 'screen') return 2 + (s.parts ? s.parts.length * 0.5 : 0);
  if (s.kind === 'rule') return 3;
  if (s.kind === 'problem') return 2.5;
  if (s.kind === 'decision') return 2;
  return screens.filter(x => x.reach).length * 0.75;   // every empty state
}

/* Components have to be attached before anything can be timed. */
for (const b of BOOKS) for (const s of b.stops) if (s.kind === 'screen') s.parts = notableAt(s.id);
for (const b of BOOKS) for (const s of b.stops) s.min = Math.round(stopMinutes(s) * 10) / 10;

/* ---- Split on TIME, not on stop count -------------------------------------
 *
 * Capping at eight stops produced an 89-minute "booklet", which is not a sitting
 * and defeats the point of the word. Half an hour is a sitting.
 */
const CAP_MIN = 30;
const booklets = [];
for (const b of BOOKS) {
  const total = b.stops.reduce((n, s) => n + s.min, 0);
  if (total + SETUP_MIN <= CAP_MIN) { booklets.push({ ...b, min: Math.round(total + SETUP_MIN) }); continue; }
  /* Fill each part up to the cap rather than slicing evenly — an even slice by
     count puts three long stops in one part and three short ones in another. */
  const chunks = [];
  let cur = [];
  let acc = 0;
  for (const s of b.stops) {
    /* Greedy, with no cap on the number of parts — bounding the parts was what
       left a 39-minute booklet at the end of the run. A single stop longer than
       the cap cannot be split and gets a booklet of its own. */
    if (cur.length && acc + s.min > CAP_MIN - SETUP_MIN) { chunks.push(cur); cur = []; acc = 0; }
    cur.push(s); acc += s.min;
  }
  if (cur.length) chunks.push(cur);
  chunks.forEach((stops, i) => booklets.push({
    ...b,
    key: `${b.key}-${i + 1}`,
    name: `${b.name} (${i + 1}/${chunks.length})`,
    stops,
    min: Math.round(stops.reduce((n, s) => n + s.min, 0) + SETUP_MIN),
  }));
}

/* The roll-up the shelf shows. Asserted in the smoke test, because a total that
   does not equal its parts is worse than no total. */
const eta = {
  total: booklets.reduce((n, b) => n + b.min, 0),
  solo: booklets.filter(b => b.state !== 'pair').reduce((n, b) => n + b.min, 0),
  pair: booklets.filter(b => b.state === 'pair').reduce((n, b) => n + b.min, 0),
  longest: Math.max(...booklets.map(b => b.min)),
  cap: CAP_MIN,
  setup: SETUP_MIN,
};


/* ---- Coverage: the claim, made checkable ---------------------------------- */
const covered = { screen: new Set(), flow: new Set(), part: new Set(), rule: new Set(), problem: new Set(), decision: new Set() };
for (const b of booklets) for (const s of b.stops) {
  if (s.kind === 'screen') { covered.screen.add(s.id); (s.parts || []).forEach(p => covered.part.add(p)); }
  if (s.kind === 'flow') covered.flow.add(s.id);
  if (s.kind === 'rule') covered.rule.add(s.id);
  if (s.kind === 'problem') covered.problem.add(s.id);
  if (s.kind === 'decision') covered.decision.add(s.id);
}
const notable = componentList.filter(c => c.bucket !== 'ui').map(c => c.name);
const coverage = {
  screens:    { total: screens.length, missing: screens.filter(s => !covered.screen.has(s.id)).map(s => s.id) },
  flows:      { total: flows.length,   missing: flows.filter(f => !covered.flow.has(f.id)).map(f => f.id) },
  components: { total: notable.length, missing: notable.filter(n => !covered.part.has(n)) },
  rules:      { total: ivs.length,     missing: ivs.filter(v => !covered.rule.has(v.id)).map(v => v.id) },
  problems:   { total: ovs.length,     missing: ovs.filter(o => !covered.problem.has(o.id)).map(o => o.id) },
  decisions:  { total: dqs.length,     missing: dqs.filter(d => !covered.decision.has(d.id)).map(d => d.id) },
};

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

for (const e of entities) e.friendly = FRIENDLY[e.id] || e.name;

const out = {
  meta, legend, subIds, issueTpl, router, worlds, notList, egress, AREAS, names, route, SWEEPS, eta, componentList, componentsOf, orphanComponents, booklets, coverage,
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
