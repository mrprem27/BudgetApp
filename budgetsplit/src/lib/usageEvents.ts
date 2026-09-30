import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Product analytics (Mixpanel), `U-24`. What people use, never what they spend:
 *
 * - **Events are a closed list**, and each one may carry only its listed keys — `track` drops
 *   anything else, so an amount, a name, a note or a category cannot leave by accident.
 * - **No token, no calls.** `EXPO_PUBLIC_MIXPANEL_TOKEN` unset (a dev build, a test) means the SDK
 *   is never even loaded.
 * - **Opt-out** in Settings → Security, on by default; off stops sending at once.
 *
 * `EXPO_PUBLIC_MIXPANEL_SERVER` picks the data-residency endpoint (e.g. `https://api-in.mixpanel.com`
 * for an India-resident project); unset is Mixpanel's default.
 */
export const USAGE_EVENTS = {
  Screen: ['route'],
  'Entry saved': ['kind', 'split'],
  'Afford checked': ['verdict', 'frequency'],
  'Import committed': ['rows'],
} as const;
export type UsageEvent = keyof typeof USAGE_EVENTS;
type Value = string | number | boolean;

const OFF_KEY = 'usage_events_off';

type Client = { track: (e: string, p?: Record<string, Value>) => void; optOutTracking: () => void; optInTracking: () => void };
let client: Client | null = null;

/** Keep only what this event is allowed to carry. */
export function allowedProps(event: UsageEvent, props: Record<string, unknown> = {}): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const k of USAGE_EVENTS[event] as readonly string[]) {
    const v = props[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** Boot, once. Loads the SDK only with a token, and only when you have not switched it off. */
export async function startUsageEvents(): Promise<void> {
  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
  if (!token || client) return;
  const off = (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) === 'true';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Mixpanel } = require('mixpanel-react-native');
  const mp = new Mixpanel(token, false, false); // no automatic events; JavaScript mode, no native module
  await mp.init(off);
  const server = process.env.EXPO_PUBLIC_MIXPANEL_SERVER;
  if (server) mp.setServerURL(server);
  client = mp;
}

export function track(event: UsageEvent, props?: Record<string, unknown>): void {
  try { client?.track(event, allowedProps(event, props)); } catch { /* never let analytics break a screen */ }
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
