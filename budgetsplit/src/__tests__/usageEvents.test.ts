import fs from 'fs';
import path from 'path';
import {
  allowedProps, allowedSuper, band, isCodeKey, routeOf, screenChanged, track,
  USAGE_EVENTS, SUPER_KEYS, __setClientForTests,
} from '../lib/usageEvents';
import { areaOf } from '../lib/usageAreas';

type Sent = { event: string; props: Record<string, unknown> };
function fakeClient() {
  const sent: Sent[] = [];
  const facts: Record<string, unknown>[] = [];
  __setClientForTests({
    track: (event, props) => { sent.push({ event, props: props ?? {} }); },
    registerSuperProperties: p => { facts.push(p); },
    optOutTracking: () => {}, optInTracking: () => {}, flush: () => {},
  });
  return { sent, facts };
}
afterEach(() => __setClientForTests(null));

// U-24: usage events carry only their listed keys, and nothing is sent without a token.
describe('usage events', () => {
  it('drop every key the event does not list — an amount, a name, a note cannot leave', () => {
    expect(allowedProps('Entry saved', { kind: 'expense', amount: 45000, note: 'dinner with Riya', category: 'Food' }))
      .toEqual({ kind: 'expense' });
    expect(allowedProps('Afford checked', { verdict: 'tight', frequency: 'once', amountPaise: 500000 }))
      .toEqual({ verdict: 'tight', frequency: 'once' });
  });
  it('lists no key that could carry money or a person', () => {
    const keys = [...Object.values(USAGE_EVENTS).flat(), ...SUPER_KEYS];
    expect(keys.filter(k => /amount|paise|name|note|email|category|person|group|vpa|phone/i.test(k))).toEqual([]);
  });
  it('names a route by its shape, never its id', () => {
    expect(routeOf(['(people)', 'group', '[id]'])).toBe('/group/[id]');
    expect(routeOf(['(tabs)'])).toBe('/');
  });
  it('is a no-op without a token', () => {
    expect(() => track('Screen', { route: '/' })).not.toThrow();
  });
});

describe('every event says where it happened', () => {
  it('adds the route and its area, and nothing the caller smuggles in', () => {
    const { sent } = fakeClient();
    screenChanged('/group/[id]');
    track('Saved', { amount: 500, route: '/secret/123' });
    expect(sent[1]).toEqual({ event: 'Saved', props: { route: '/group/[id]', area: 'Groups' } });
  });
  it('a screen change says where from and for how long, which is how time on a screen is read', () => {
    const { sent } = fakeClient();
    const t0 = Date.now();
    screenChanged('/insights', t0);
    // The first screen was not arrived at from anywhere, so it claims no time for one.
    expect(sent[0]).toEqual({ event: 'Screen', props: { route: '/insights', area: 'Insights' } });
    screenChanged('/reports', t0 + 42_000);
    expect(sent[1]).toEqual({ event: 'Screen', props: { from: '/insights', from_area: 'Insights', seconds: 42, route: '/reports', area: 'Reports' } });
    // A phone left open overnight is not twelve hours of use.
    screenChanged('/', t0 + 42_000 + 13 * 3_600_000);
    expect(sent[2].props.seconds).toBe(3600);
  });
  it('an event about a screen that is not in front names that screen', () => {
    const { sent } = fakeClient();
    screenChanged('/');
    track('Slow load', { ms: 900 }, '/insights');
    expect(sent[1].props).toEqual({ ms: 900, route: '/insights', area: 'Insights' });
  });
});

describe('install facts', () => {
  it('are a closed list, in their listed shapes', () => {
    expect(allowedSuper({ level: 'simple', features: ['recurring', 'reports'], email: 'a@b.c', entries: '25-99', signed_in: true, features2: [1] }))
      .toEqual({ level: 'simple', features: ['recurring', 'reports'], entries: '25-99', signed_in: true });
    expect(allowedSuper({ features: ['ok', 3] })).toEqual({});
  });
  it('a count leaves as a band', () => {
    expect([0, 1, 24, 25, 99, 100, 499, 500, 9000].map(band)).toEqual(['0', '1-24', '1-24', '25-99', '25-99', '100-499', '100-499', '500+', '500+']);
  });
  it('a tab is sent only by its key in code', () => {
    expect(['overview', 'goals', '12', 'near_limit'].every(isCodeKey)).toBe(true);
    expect(['Dinner with Riya', 'a@b.c', '', 'x'.repeat(30)].some(isCodeKey)).toBe(false);
  });
});

describe('capture sits where the app already funnels, not in each screen', () => {
  const read = (f: string) => fs.readFileSync(f, 'utf8');
  it('route changes, tabs, writes and loads each report from one place', () => {
    expect(read('src/hooks/useScreenEvents.ts')).toMatch(/screenChanged\(route\)/);
    expect(read('src/components/ui/TabPills.tsx')).toMatch(/isCodeKey\(t\.key\)\) track\('Tab'/);
    expect(read('src/components/system/DataRefreshProvider.tsx')).toMatch(/if \(byUser\.current\) track\('Saved'\)/);
    const data = read('src/hooks/useScreenData.ts');
    expect(data).toMatch(/track\('Slow load', \{ ms \}, path\)/);
    expect(data).toMatch(/track\('Load failed', \{\}, path\)/);
  });
  it('sync and the foreground catch-up reload the screens without counting as a save', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/const \{ refreshQuietly: refresh \} = useDataRefresh\(\)/);
  });
  it('never identifies anybody', () => {
    expect(read('src/lib/usageEvents.ts')).not.toMatch(/\.identify\(|getPeople\(/);
    expect(read('src/lib/usageEvents.ts')).toMatch(/setUseIpAddressForGeolocation\(false\)/);
  });
});

describe('every route has an area', () => {
  const routes: string[] = [];
  (function walk(dir: string, segs: string[]) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), [...segs, e.name]);
      else if (e.name.endsWith('.tsx') && e.name !== '_layout.tsx') {
        const name = e.name.replace(/\.tsx$/, '');
        routes.push(routeOf([...segs, ...(name === 'index' ? [] : [name])]));
      }
    }
  })('app', []);
  it('found the routes', () => { expect(routes.length).toBeGreaterThan(40); });
  it('none falls into Other, so a new screen cannot go unmeasured', () => {
    expect(routes.filter(r => areaOf(r) === 'Other')).toEqual([]);
  });
  it('the longest prefix wins', () => {
    expect(areaOf('/')).toBe('Home');
    expect(areaOf('/group/[id]/budget')).toBe('Groups');
    expect(areaOf('/plan/recurring')).toBe('Recurring');
    expect(areaOf('/groupies')).toBe('Other');
  });
});
