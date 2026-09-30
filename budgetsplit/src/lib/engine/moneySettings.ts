/**
 * What you tell the engine about how you are paid (`SPEC-ENGINE.md` §10b, `U-33`). Every setting
 * defaults to today's inference, so an untouched install behaves exactly as before. Pure — the
 * values reach the engine on the snapshot; `lib/moneySettingsStore.ts` keeps them.
 */

export type PayCycle = 'auto' | 'monthly' | 'twice' | 'weekly' | 'daily' | 'irregular';
export type LookAhead = 'payday' | '7' | '30' | 'monthEnd';
export type KeepAside = 'week' | 'none' | 'month' | 'custom';

export type MoneySettings = {
  payCycle: PayCycle;
  /** Day of the month (1–31) for monthly / twice a month; weekday (0 = Sunday) for weekly. */
  payDay: number | null;
  lookAhead: LookAhead;
  keepAside: KeepAside;
  /** Paise, for `keepAside: 'custom'`. */
  keepAsideAmount: number;
};

export const DEFAULT_MONEY_SETTINGS: MoneySettings = {
  payCycle: 'auto', payDay: null, lookAhead: 'payday', keepAside: 'week', keepAsideAmount: 0,
};

const DAY_MS = 86_400_000;

function monthDay(year: number, month: number, day: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(day, last));
}

/**
 * The next payday strictly after today, from a stated cycle. `null` when the cycle names no date
 * (`auto`, `irregular`). UTC, like the rest of the engine. A payday that is today counts as passed:
 * the money has arrived, and "until next payday" means the one after.
 */
export function nextPayday(asOf: number, cycle: PayCycle, payDay: number | null): number | null {
  const d = new Date(asOf);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const todayStart = Date.UTC(y, m, d.getUTCDate());
  const after = (t: number) => t > todayStart;
  switch (cycle) {
    case 'daily':
      return todayStart + DAY_MS;
    case 'weekly': {
      const want = payDay ?? 1;
      const gap = ((want - d.getUTCDay() + 7) % 7) || 7;
      return todayStart + gap * DAY_MS;
    }
    case 'monthly': {
      const day = payDay ?? 1;
      const thisMonth = monthDay(y, m, day);
      return after(thisMonth) ? thisMonth : monthDay(y, m + 1, day);
    }
    case 'twice': {
      const a = payDay ?? 1;
      const b = a <= 15 ? a + 15 : a - 15;
      const candidates = [monthDay(y, m, a), monthDay(y, m, b), monthDay(y, m + 1, a), monthDay(y, m + 1, b)];
      return candidates.filter(after).sort((p, q) => p - q)[0];
    }
    default:
      return null;
  }
}

/** Days from `asOf` to the end of its month, at least 1. */
export function daysToMonthEnd(asOf: number): number {
  const d = new Date(asOf);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((end - asOf) / DAY_MS));
}
