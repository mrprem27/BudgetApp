import { format } from 'date-fns';

/**
 * Role-named date formatting — the app-wide selection rule.
 *
 * The same semantic field was being formatted three ways ("next charge" was
 * 'd MMM' on /plan/recurring, 'MMM d' in RecurringRow and 'dd MMM yyyy' on the
 * group screen) because every screen called date-fns with its own inline
 * pattern. Pick by ROLE, not by taste:
 *
 * - `shortDate`    — a day inside a row/pill ("14 Jun"). List rows, next-charge
 *                    labels, chips. Add the year only via `fullDate` when the
 *                    date can plausibly be in another year.
 * - `fullDate`     — an unambiguous single date ("14 Jun 2026"). Detail
 *                    screens, exports meant for humans, pickers.
 * - `dateTime`     — a date *and* clock time ("14 Jun 2026 · 6:45 pm"). Backups,
 *                    transaction detail — anything where the minute matters.
 * - `monthLabel`   — a month as a heading ("June 2026").
 * - `monthShort`   — a month inline in a sentence ("Jun 2026 · 3 months away").
 *                    Not a smaller `monthLabel`: a heading gets the full month
 *                    name, prose beside other words does not.
 * - `timeOfDay`    — clock time ("6:45 pm").
 * - Machine formats (CSV, ids): keep ISO 'yyyy-MM-dd' inline — those are data,
 *   not display.
 * - Transaction list section headers: `dateSectionLabel` from `txnGrouping`
 *   (Today / Yesterday / 14 Jun) — already the single source for that role.
 *
 * Currency has the same rule, over in `lib/money.ts`: `formatRupees` for exact
 * amounts (detail, forms), `formatRupeesShort` for whole-rupee summaries,
 * `formatCompact` for space-tight secondary text (K/L/Cr), `formatAxisShort`
 * for chart axes, `AmountText` when the figure is the hero.
 */
export function shortDate(d: Date | number): string {
  return format(d, 'd MMM');
}

export function fullDate(d: Date | number): string {
  return format(d, 'd MMM yyyy');
}

/**
 * Date + time, middot-separated.
 *
 * The separator is fixed here because it was not fixed anywhere: transaction
 * detail rendered `'dd MMM yyyy · h:mm a'` and the backup screens rendered
 * `'d MMM yyyy, h:mm a'`, so the same fact wore a middot on one screen and a
 * comma on another — and a zero-padded day on one and not the other. Middot wins
 * because it is what the rest of the app already uses to join short facts.
 */
export function dateTime(d: Date | number): string {
  return `${fullDate(d)} · ${timeOfDay(d)}`;
}

export function monthLabel(d: Date | number): string {
  return format(d, 'MMMM yyyy');
}

export function monthShort(d: Date | number): string {
  return format(d, 'MMM yyyy');
}

export function timeOfDay(d: Date | number): string {
  return format(d, 'h:mm a');
}
