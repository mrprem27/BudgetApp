import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * "Review places showing Upcoming, Reminder, Notification, Subscription,
 * Recurring, etc… make the terminology and UI consistent" (`SPEC-2026-09-FEEDBACK.md` §6,
 * T17). `upcomingVocab.test.ts` (T16) covered the next-charges list; this
 * covers the toggle that turns those charges' reminders on, which Settings →
 * Notifications called "Bill reminders" and onboarding's permissions step
 * called "Bill & renewal reminders" — two names for one switch, on two
 * screens a new user sees back to back. Both now read "Reminders for
 * upcoming charges", the same string, so the summary line that echoes it
 * back at the end of onboarding doesn't invent a third.
 *
 * `renewalTime` / `renewalLeadDays` / `prefs.renewals` / the `'renewal'`
 * `timeEditing` state value are internal identifiers (the `ReminderPrefs`
 * schema field names) — left alone on purpose, same as `AddKind.Invest`
 * staying in `addKind.test.ts` while its user-facing switcher pill went
 * away. This guard is about copy a person reads, not the code underneath.
 *
 * Source-scanned, the same shape as `friendsNaming.test.ts` and
 * `upcomingVocab.test.ts` — there is no render test to catch a relabel
 * sliding back to "Bill reminders" on one of the two screens but not both.
 */
const ROOT = join(__dirname, '..', '..');

function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, keep, out);
    } else if (keep(full)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_FILES = [
  ...walk(join(ROOT, 'app'), f => f.endsWith('.tsx')),
  ...walk(join(ROOT, 'src', 'components'), f => f.endsWith('.tsx')),
];

it('finds source files to scan', () => {
  expect(SOURCE_FILES.length).toBeGreaterThan(50);
});

describe('no source file still calls the reminder toggle by its old names', () => {
  const BANNED = ['Bill reminders', 'Bill & renewal reminders', 'Renewal reminder time'];

  it('no visible copy reads "Bill reminders", "Bill & renewal reminders" or "Renewal reminder time"', () => {
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      const src = readFileSync(f, 'utf8');
      for (const phrase of BANNED) {
        if (src.includes(phrase)) offenders.push(`${f.replace(ROOT + '/', '')}: "${phrase}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Settings → Notifications and onboarding name the same toggle the same way', () => {
  it('both say "Reminders for upcoming charges"', () => {
    for (const f of [
      join(ROOT, 'app', 'settings', 'notifications.tsx'),
      join(ROOT, 'src', 'components', 'system', 'Onboarding.tsx'),
    ]) {
      expect(readFileSync(f, 'utf8')).toMatch(/Reminders for upcoming charges/);
    }
  });

  it('the onboarding summary echoes the same name back, not a third one', () => {
    const src = readFileSync(
      join(ROOT, 'src', 'components', 'system', 'onboarding', 'SummaryStage.tsx'),
      'utf8',
    );
    expect(src).toMatch(/Reminders for upcoming charges on/);
  });
});
