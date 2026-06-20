/**
 * Pure reminder-scheduling logic — no expo / DB imports, so it's unit-testable
 * in isolation. `reminders.ts` builds on this with permission, persistence, and
 * OS scheduling.
 */

/** A local wall-clock time of day. */
export type ReminderTime = { hour: number; minute: number };

export type ReminderPrefs = {
  /** Remind before a recurring charge renews. */
  renewals: boolean;
  /** Remind on each of the last N days before the charge (1–7). */
  renewalLeadDays: number;
  /** Time of day for renewal reminders. */
  renewalTime: ReminderTime;
  /** Daily "log your spending" nudge. */
  daily: boolean;
  /** Time of day for the daily nudge. */
  dailyTime: ReminderTime;
};

export type PlannedReminder = { id: string; fireAt: number; title: string; body: string };

export const DEFAULT_RENEWAL_TIME: ReminderTime = { hour: 9, minute: 0 };
export const DEFAULT_DAILY_TIME: ReminderTime = { hour: 20, minute: 0 };
export const DEFAULT_LEAD_DAYS = 1;
export const MAX_LEAD_DAYS = 7;

/** Min spacing between two delivered reminders so they don't all buzz at once. */
export const REMINDER_GAP_MS = 5000;
/** Cap on scheduled one-offs — stays well under iOS's 64 pending-notification limit. */
export const REMINDER_CAP = 50;

export function clampLead(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_LEAD_DAYS;
  return Math.max(1, Math.min(MAX_LEAD_DAYS, Math.round(n)));
}

export function clampTime(t: Partial<ReminderTime> | undefined, fallback: ReminderTime): ReminderTime {
  const h = t?.hour;
  const m = t?.minute;
  const hour = typeof h === 'number' && Number.isFinite(h) ? Math.max(0, Math.min(23, Math.round(h))) : fallback.hour;
  const minute = typeof m === 'number' && Number.isFinite(m) ? Math.max(0, Math.min(59, Math.round(m))) : fallback.minute;
  return { hour, minute };
}

export function defaultReminderPrefs(): ReminderPrefs {
  return {
    renewals: false, renewalLeadDays: DEFAULT_LEAD_DAYS, renewalTime: DEFAULT_RENEWAL_TIME,
    daily: false, dailyTime: DEFAULT_DAILY_TIME,
  };
}

/** "9:05 AM" / "8:00 PM" for display. */
export function formatReminderTime(t: ReminderTime): string {
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  const ampm = t.hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(t.minute).padStart(2, '0')} ${ampm}`;
}

/**
 * Enforce a minimum gap between delivered reminders and cap the count. Reminders
 * that would land within `gapMs` of the previous one are pushed forward just
 * enough to keep the spacing — this is the "release the queue 5s apart" done at
 * schedule time (local notifications fire while the app is closed, so we can't
 * drip-feed them at runtime). Only ever moves a fire time later, never earlier.
 */
export function staggerReminders(items: PlannedReminder[], gapMs = REMINDER_GAP_MS, cap = REMINDER_CAP): PlannedReminder[] {
  const sorted = [...items].sort((a, b) => a.fireAt - b.fireAt);
  const out: PlannedReminder[] = [];
  let last = -Infinity;
  for (const it of sorted) {
    if (out.length >= cap) break;
    const fireAt = Math.max(it.fireAt, last + gapMs);
    out.push({ ...it, fireAt });
    last = fireAt;
  }
  return out;
}

/** Set a date to a given wall-clock time (local), returning epoch ms. */
export function atTimeOfDay(base: number, time: ReminderTime): number {
  const d = new Date(base);
  d.setHours(time.hour, time.minute, 0, 0);
  return d.getTime();
}
