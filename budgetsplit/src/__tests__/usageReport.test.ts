// eslint-disable-next-line @typescript-eslint/no-require-imports
const { exportUrl, parseJsonl, summarise } = require('../../scripts/usage-report.js');

const ev = (event: string, who: string, p: Record<string, unknown> = {}) => ({ event, properties: { distinct_id: who, time: 1, build: 'release', ...p } });

describe('the usage report (SPEC-ANALYTICS §4)', () => {
  it('asks the residency host for the period, inclusive of today', () => {
    const url = exportUrl({ projectId: 42, region: 'in', days: 7, now: new Date('2026-10-01T10:00:00Z') });
    expect(url).toBe('https://data-in.mixpanel.com/api/2.0/export?project_id=42&from_date=2026-09-25&to_date=2026-10-01&limit=100000');
    expect(exportUrl({ projectId: 1, now: new Date('2026-10-01T10:00:00Z') })).toMatch(/^https:\/\/data\.mixpanel\.com/);
  });

  it('reads one JSON object per line', () => {
    expect(parseJsonl('{"event":"a","properties":{}}\n\n{"event":"b","properties":{}}\n')).toHaveLength(2);
  });

  const events = [
    ev('Screen', 'a', { route: '/', area: 'Home', from: '/insights', from_area: 'Insights', seconds: 120 }),
    ev('Screen', 'a', { route: '/insights', area: 'Insights', from: '/', from_area: 'Home', seconds: 30 }),
    ev('Screen', 'b', { route: '/insights', area: 'Insights', from: '/', from_area: 'Home', seconds: 30 }),
    ev('Saved', 'a', { route: '/add/quick', area: 'Add' }),
    ev('Tab', 'a', { route: '/group/[id]', value: 'budget' }),
    ev('Entry saved', 'a', { kind: 'expense', split: true, mode: 'typed' }),
    ev('Entry saved', 'b', { kind: 'income', split: false, mode: 'voice' }),
    ev('Slow load', 'b', { route: '/insights', ms: 900 }),
    ev('Slow load', 'b', { route: '/insights', ms: 450 }),
    ev('Screen', 'a', { route: '/', area: 'Home', time: 5, features: ['recurring', 'reports'], level: 'standard' }),
    ev('Screen', 'a', { route: '/', area: 'Home', time: 9, features: ['recurring'], level: 'simple' }),
    ev('Screen', 'me', { route: '/', area: 'Home', demo: true }),
    ev('Screen', 'me', { route: '/', area: 'Home', build: 'dev' }),
  ];

  it('ranks areas by views, with installs, time and saves beside them', () => {
    const s = summarise(events);
    expect(s.installs).toBe(2);
    expect(s.areas[0]).toEqual({ area: 'Home', views: 3, installs: 1, minutes: 1, saves: 0 });
    // Time on Insights is what the NEXT screen reported leaving behind.
    expect(s.areas.find((a: { area: string }) => a.area === 'Insights')).toEqual({ area: 'Insights', views: 2, installs: 2, minutes: 2, saves: 0 });
    expect(s.areas.find((a: { area: string }) => a.area === 'Add').saves).toBe(1);
  });

  it('counts entries, tabs and slow screens', () => {
    const s = summarise(events);
    expect(s.entries).toEqual({ total: 2, split: 1, kinds: { expense: 1, income: 1 }, modes: { typed: 1, voice: 1 } });
    expect(s.tabs).toEqual([{ tab: '/group/[id] · budget', taps: 1 }]);
    expect(s.slow_loads).toEqual([{ route: '/insights', count: 2, worst: 900 }]);
  });

  it('reads which features are on from each install\'s latest event, not from every event', () => {
    const s = summarise(events);
    expect(s.features_on).toEqual([{ feature: 'recurring', installs: 1 }]);
    expect(s.levels).toEqual({ simple: 1 });
  });

  it('leaves out dev builds and demo data unless asked', () => {
    expect(summarise(events).left_out).toBe(2);
    expect(summarise(events, { all: true }).installs).toBe(3);
  });

  it('is empty, not broken, with no events', () => {
    expect(summarise([])).toMatchObject({ events: 0, installs: 0, areas: [], routes: [] });
  });
});
