import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { areaOf } from './usageAreas';

/**
 * Product analytics (Mixpanel), `U-24`, `docs/SPEC-ANALYTICS.md`. What people use, never what
 * they spend:
 *
 * - **Events are a closed list**, and each one may carry only its listed keys — `track` drops
 *   anything else, so an amount, a name, a note or a category cannot leave by accident.
 * - **Most of it is captured where the app already funnels**, not screen by screen: a route
 *   change (`useScreenEvents`), a tab switch (`TabPills`), a write (`refresh()`), a load that
 *   failed or was slow (`useScreenData`). A new screen is measured without a line of code in it.
 * - **Every event says where**: `route` (its shape, never an id) and `area` (`lib/usageAreas`)
 *   are added here, so "which feature is used most" is one breakdown.
 * - **No token, no calls.** `EXPO_PUBLIC_MIXPANEL_TOKEN` unset (a dev build, a test) means the
 *   SDK is never even loaded.
 * - **Anonymous.** A random install id; never `identify`, never a profile, and no location from
 *   the IP address.
 * - **Opt-out** in Settings → Security, on by default; off stops sending at once.
 *
 * `EXPO_PUBLIC_MIXPANEL_SERVER` picks the data-residency endpoint (e.g. `https://api-in.mixpanel.com`
 * for an India-resident project); unset is Mixpanel's default.
 */
export const USAGE_EVENTS = {
  // ── captured automatically ──
  /** A screen opened. `from` and `seconds` describe the one just left: time on a screen is the sum of `seconds` by `from`. */
  Screen: ['from', 'from_area', 'seconds'],
  /** A tab or segment chosen (`TabPills`); `value` is its key in code. */
  Tab: ['value'],
  /** Something was written from this screen. */
  Saved: [],
  /** A screen's load threw. */
  'Load failed': [],
  /** A screen's load took `SLOW_LOAD_MS` or longer. */
  'Slow load': ['ms'],
  /** The app came to the front after a break. */
  'App opened': ['days_away'],
  // ── named, at the one place each happens ──
  'Entry saved': ['kind', 'split', 'mode', 'repeats'],
  'Afford checked': ['verdict', 'frequency'],
  'Import committed': ['rows'],
  'Feature switched': ['feature', 'on'],
  'Level set': ['level'],
  'Onboarding finished': ['intent'],
  'Signed in': [],
  Exported: ['format'],
} as const;
export type UsageEvent = keyof typeof USAGE_EVENTS;
type Value = string | number | boolean;

/** Facts about the install sent with every event. A closed list too. */
export const SUPER_KEYS = ['app_version', 'platform', 'build', 'level', 'signed_in', 'features', 'entries', 'demo'] as const;
export type SuperProps = Partial<{
  app_version: string; platform: string; build: 'dev' | 'release'; level: string;
  signed_in: boolean; features: string[]; entries: string; demo: boolean;
}>;

export const SLOW_LOAD_MS = 400;
/** A return after this long counts as opening the app again. */
const AWAY_MS = 30 * 60_000;
const OFF_KEY = 'usage_events_off';

type Client = {
  track: (e: string, p?: Record<string, unknown>) => void;
  registerSuperProperties: (p: Record<string, unknown>) => void;
  optOutTracking: () => void;
  optInTracking: () => void;
  flush: () => void;
};
let client: Client | null = null;
/** The route on screen, by shape. Set by `useScreenEvents`, read by every event. */
let route = '/';

/** Keep only what this event is allowed to carry. */
export function allowedProps(event: UsageEvent, props: Record<string, unknown> = {}): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const k of USAGE_EVENTS[event] as readonly string[]) {
    const v = props[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** Keep only the listed install facts, in the listed shapes. */
export function allowedSuper(props: Record<string, unknown>): Record<string, Value | string[]> {
  const out: Record<string, Value | string[]> = {};
  for (const k of SUPER_KEYS) {
    const v = props[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v) && v.every(x => typeof x === 'string')) out[k] = v as string[];
  }
  return out;
}

/** A count as a band, so a ledger's size is never a number that could single somebody out. */
export function band(n: number): string {
  return n <= 0 ? '0' : n < 25 ? '1-24' : n < 100 ? '25-99' : n < 500 ? '100-499' : '500+';
}

/** A tab key as written in code (`overview`, `goals`, `12`); anything else is not sent. */
export const isCodeKey = (v: string): boolean => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,23}$/.test(v);

/** Boot, once. Loads the SDK only with a token, and only when you have not switched it off. */
export async function startUsageEvents(): Promise<void> {
  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
  if (!token || client) return;
  const off = (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) === 'true';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Mixpanel } = require('mixpanel-react-native');
  const mp = new Mixpanel(token, false, false); // no automatic events; JavaScript mode, no native module
  await mp.init(off, {}, process.env.EXPO_PUBLIC_MIXPANEL_SERVER || undefined);
  // Mixpanel places an install on a map from its IP address unless told not to.
  mp.setUseIpAddressForGeolocation(false);
  client = mp;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const version = (require('../../app.json') as { expo: { version: string } }).expo.version;
  setUsageFacts({ app_version: version, platform: Platform.OS, build: __DEV__ ? 'dev' : 'release' });

  // JavaScript mode does not send on its own when the app leaves the screen, so a short visit
  // would sit unsent until the next one.
  let leftAt = 0;
  AppState.addEventListener('change', state => {
    if (state === 'active') {
      if (leftAt && Date.now() - leftAt >= AWAY_MS) track('App opened', { days_away: Math.floor((Date.now() - leftAt) / 86_400_000) });
      leftAt = 0;
    } else {
      if (!leftAt) leftAt = Date.now();
      try { client?.flush(); } catch { /* ignore */ }
    }
  });
  track('App opened', { days_away: 0 });
  // The first screen was on show before the SDK had loaded, so its `Screen` went nowhere.
  if (shown) track('Screen');
}

/** `at`: the screen the event is about, when that is not the one in front (a background load). */
export function track(event: UsageEvent, props?: Record<string, unknown>, at: string = route): void {
  try {
    client?.track(event, { ...allowedProps(event, props), route: at, area: areaOf(at) });
  } catch { /* never let analytics break a screen */ }
}

/** Install facts for every later event (`SUPER_KEYS`). */
export function setUsageFacts(facts: SuperProps): void {
  try { client?.registerSuperProperties(allowedSuper(facts)); } catch { /* ignore */ }
}

/** The screen changed. Says where from and how long it was open, then moves `route` on. */
let enteredAt = Date.now();
/** Whether a screen has been shown yet: the first one was not arrived at from anywhere. */
let shown = false;
export function screenChanged(next: string, now: number = Date.now()): void {
  const from = route;
  const seconds = Math.min(3600, Math.max(0, Math.round((now - enteredAt) / 1000)));
  route = next;
  enteredAt = now;
  track('Screen', shown ? { from, from_area: areaOf(from), seconds } : {});
  shown = true;
}

export async function usageEventsOn(): Promise<boolean> {
  return (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) !== 'true';
}

export async function setUsageEventsOn(on: boolean): Promise<void> {
  await AsyncStorage.setItem(OFF_KEY, on ? 'false' : 'true');
  try { if (on) client?.optInTracking(); else client?.optOutTracking(); } catch { /* ignore */ }
}

/** `['(people)', 'group', '[id]']` → `/group/[id]` — the route's shape, never an id. */
export function routeOf(segments: readonly string[]): string {
  return '/' + segments.filter(s => !/^\(.*\)$/.test(s)).join('/');
}

/** Tests only: stand in for the SDK, and start from a known screen. */
export function __setClientForTests(c: Client | null, at: string = '/'): void {
  client = c;
  route = at;
  enteredAt = Date.now();
  shown = false;
}
