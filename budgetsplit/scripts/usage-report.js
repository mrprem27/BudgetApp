#!/usr/bin/env node
/**
 * What is being used, from Mixpanel (`docs/SPEC-ANALYTICS.md` §4).
 *
 *   MIXPANEL_PROJECT_ID=… MIXPANEL_SA_USER=… MIXPANEL_SA_SECRET=… node scripts/usage-report.js
 *     --days 30     the period, ending today (default 30)
 *     --json        the same numbers as JSON, for anything that wants to read them
 *     --all         include dev builds and installs running demo data (left out by default)
 *   MIXPANEL_REGION=in|eu picks the residency host; unset is the US one.
 *
 * One request to Mixpanel's Raw Event Export, summed here. The service account (Mixpanel →
 * Organization settings → Service accounts) needs only the Analyst role on the project.
 */

const HOST = { us: 'data.mixpanel.com', eu: 'data-eu.mixpanel.com', in: 'data-in.mixpanel.com' };
/** Mixpanel returns at most this many events per call; past it the report is a sample. */
const LIMIT = 100000;

const ymd = d => d.toISOString().slice(0, 10);

function exportUrl({ projectId, region = 'us', days = 30, now = new Date() }) {
  const from = new Date(now.getTime() - (days - 1) * 86400000);
  const q = new URLSearchParams({ project_id: String(projectId), from_date: ymd(from), to_date: ymd(now), limit: String(LIMIT) });
  return `https://${HOST[region] ?? HOST.us}/api/2.0/export?${q}`;
}

/** Export's body is one JSON object per line. */
function parseJsonl(text) {
  return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);
const sorted = map => [...map.entries()].sort((a, b) => b[1] - a[1]);

/**
 * Everything the report prints, from raw events. Pure.
 * `all` keeps dev builds and demo-data installs, which are otherwise your own testing.
 */
function summarise(events, { all = false } = {}) {
  const rows = all ? events : events.filter(e => e.properties.build !== 'dev' && e.properties.demo !== true);
  const installs = new Set();
  const areas = new Map(); // area → { views, installs:Set, seconds, saves }
  const area = name => {
    if (!areas.has(name)) areas.set(name, { views: 0, installs: new Set(), seconds: 0, saves: 0 });
    return areas.get(name);
  };
  const routes = new Map(), tabs = new Map(), entryKinds = new Map(), entryModes = new Map();
  const switched = new Map(), slow = new Map(), failed = new Map(), verdicts = new Map(), exports = new Map();
  const latestFacts = new Map(); // install → { time, features, level }
  let entries = 0, split = 0;

  for (const { event, properties: p } of rows) {
    const who = p.distinct_id;
    installs.add(who);
    if (Array.isArray(p.features) && (latestFacts.get(who)?.time ?? -1) <= (p.time ?? 0)) {
      latestFacts.set(who, { time: p.time ?? 0, features: p.features, level: p.level });
    }
    if (event === 'Screen') {
      const a = area(p.area ?? 'Other');
      a.views += 1;
      a.installs.add(who);
      bump(routes, p.route ?? '?');
      // The time belongs to the screen that was just left.
      if (p.from_area && typeof p.seconds === 'number') area(p.from_area).seconds += p.seconds;
    } else if (event === 'Saved') {
      area(p.area ?? 'Other').saves += 1;
    } else if (event === 'Tab') {
      bump(tabs, `${p.route ?? '?'} · ${p.value ?? '?'}`);
    } else if (event === 'Entry saved') {
      entries += 1;
      if (p.split === true) split += 1;
      bump(entryKinds, p.kind ?? '?');
      if (p.mode) bump(entryModes, p.mode);
    } else if (event === 'Feature switched') {
      bump(switched, `${p.feature ?? '?'} ${p.on ? 'on' : 'off'}`);
    } else if (event === 'Slow load') {
      const s = slow.get(p.route ?? '?') ?? { count: 0, worst: 0 };
      slow.set(p.route ?? '?', { count: s.count + 1, worst: Math.max(s.worst, p.ms ?? 0) });
    } else if (event === 'Load failed') {
      bump(failed, p.route ?? '?');
    } else if (event === 'Afford checked') {
      bump(verdicts, p.verdict ?? '?');
    } else if (event === 'Exported') {
      bump(exports, p.format ?? '?');
    }
  }

  const featuresOn = new Map(), levels = new Map();
  for (const f of latestFacts.values()) {
    for (const k of f.features) bump(featuresOn, k);
    if (f.level) bump(levels, f.level);
  }

  return {
    events: rows.length,
    left_out: events.length - rows.length,
    installs: installs.size,
    areas: [...areas.entries()]
      .map(([name, a]) => ({ area: name, views: a.views, installs: a.installs.size, minutes: Math.round(a.seconds / 60), saves: a.saves }))
      .sort((a, b) => b.views - a.views),
    routes: sorted(routes).slice(0, 20).map(([route, views]) => ({ route, views })),
    tabs: sorted(tabs).slice(0, 20).map(([tab, taps]) => ({ tab, taps })),
    entries: { total: entries, split, kinds: Object.fromEntries(sorted(entryKinds)), modes: Object.fromEntries(sorted(entryModes)) },
    features_on: sorted(featuresOn).map(([feature, n]) => ({ feature, installs: n })),
    levels: Object.fromEntries(sorted(levels)),
    switched: Object.fromEntries(sorted(switched)),
    slow_loads: [...slow.entries()].map(([route, s]) => ({ route, ...s })).sort((a, b) => b.count - a.count),
    load_failures: Object.fromEntries(sorted(failed)),
    afford: Object.fromEntries(sorted(verdicts)),
    exports: Object.fromEntries(sorted(exports)),
  };
}

function table(title, rows, cols) {
  if (rows.length === 0) return '';
  const width = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const line = cells => cells.map((c, i) => (i === 0 ? String(c).padEnd(width[i]) : String(c).padStart(width[i]))).join('  ');
  return [`\n${title}`, line(cols), ...rows.map(r => line(cols.map(c => r[c] ?? '')))].join('\n');
}

function print(s, days) {
  const pairs = obj => Object.entries(obj).map(([what, count]) => ({ what, count }));
  const out = [
    `Last ${days} days: ${s.installs} installs, ${s.events} events${s.left_out ? ` (${s.left_out} from dev builds and demo data left out; --all to include)` : ''}`,
    table('By area, most opened first', s.areas, ['area', 'views', 'installs', 'minutes', 'saves']),
    table('Screens', s.routes, ['route', 'views']),
    table('Tabs', s.tabs, ['tab', 'taps']),
    s.entries.total ? `\nEntries saved: ${s.entries.total}, ${s.entries.split} of them split` : '',
    table('  by kind', pairs(s.entries.kinds), ['what', 'count']),
    table('  by how', pairs(s.entries.modes), ['what', 'count']),
    table('Features on, by installs', s.features_on, ['feature', 'installs']),
    table('Levels', pairs(s.levels), ['what', 'count']),
    table('Switched', pairs(s.switched), ['what', 'count']),
    table('Slow loads', s.slow_loads, ['route', 'count', 'worst']),
    table('Loads that failed', pairs(s.load_failures), ['what', 'count']),
    table('Afford verdicts', pairs(s.afford), ['what', 'count']),
    table('Exports', pairs(s.exports), ['what', 'count']),
  ];
  console.log(out.filter(Boolean).join('\n'));
}

async function main() {
  const args = process.argv.slice(2);
  const flag = name => args.includes(`--${name}`);
  const days = Number(args[args.indexOf('--days') + 1]) > 0 && args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : 30;
  const { MIXPANEL_PROJECT_ID: projectId, MIXPANEL_SA_USER: user, MIXPANEL_SA_SECRET: secret, MIXPANEL_REGION: region } = process.env;
  if (!projectId || !user || !secret) {
    console.error('Set MIXPANEL_PROJECT_ID, MIXPANEL_SA_USER and MIXPANEL_SA_SECRET (a Mixpanel service account). See docs/SPEC-ANALYTICS.md §4.');
    process.exit(2);
  }
  const res = await fetch(exportUrl({ projectId, region, days }), {
    headers: { authorization: `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`, accept: 'text/plain' },
  });
  if (!res.ok) {
    console.error(`Mixpanel answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const events = parseJsonl(await res.text());
  if (events.length >= LIMIT) console.error(`Mixpanel's limit of ${LIMIT} events was reached: this is a sample. Use fewer --days.`);
  const summary = summarise(events, { all: flag('all') });
  if (flag('json')) console.log(JSON.stringify(summary, null, 2));
  else print(summary, days);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });

module.exports = { exportUrl, parseJsonl, summarise };
