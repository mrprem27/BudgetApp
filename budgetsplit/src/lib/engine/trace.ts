/**
 * `affordTrace` — every step `afford()` took, with its actual numbers, for the
 * Afford screen's "How we got this" panel. Pure.
 *
 * It re-runs the engine's own functions (`projectKnown`, `essentialFloor`,
 * `budgetCheck`, `monthlyAffordability`, …) rather than re-deriving anything, so
 * the trace can't tell a different story from the verdict it sits under. The
 * verdict, reasons and search results come straight from the `AffordResult`
 * passed in — this never re-decides, it only shows the working.
 *
 * The engine is rule-based, not a weighted score: four checks, each with a
 * rupee figure, and a fixed order that turns them into a verdict. The trace
 * says exactly that, instead of implying weights that don't exist.
 */
import type { AffordResult, FinanceSnapshot, KnownEvent, Purchase } from './types';
import { projectKnown, horizonDaysFor } from './projection';
import { dailySample, essentialFloor, incomeModel, monthlyAffordability, defaultNecessity, IRREGULAR_MIN_HORIZON_DAYS } from './behaviour';
import { budgetCheck, purchaseEvents } from './assess';
import { EVERYDAY_MIN_DAYS, STS_HORIZON_DAYS } from '../safeToSpend';
import { formatRupees } from '../money';
import { shortDate } from '../dateFormat';

const DAY_MS = 86_400_000;

export type TraceStatus = 'pass' | 'warn' | 'fail' | 'info';

export type TraceLine = {
  label: string;
  value: string;
  /** The "because" — where the number came from. */
  detail?: string;
  status?: TraceStatus;
  /** Signed paise, when the line is money — lets the screen colour in/out. */
  amountPaise?: number;
};

export type TraceSection = { key: string; title: string; lines: TraceLine[] };

export type AffordTrace = { sections: TraceSection[] };

/** Past this many dated events, the rest fold into one summary line. */
const MAX_EVENT_LINES = 12;

const VERDICT_LABEL = {
  'comfortable': 'Comfortable',
  'tight': 'Tight',
  'not-affordable': 'Not right now',
} as const;

const signed = (paise: number) => (paise > 0 ? `+${formatRupees(paise)}` : formatRupees(paise));

function eventLines(events: KnownEvent[]): TraceLine[] {
  const shown = events.slice(0, MAX_EVENT_LINES).map(e => ({
    label: e.label,
    value: signed(e.amountPaise),
    detail: shortDate(e.date),
    amountPaise: e.amountPaise,
  }));
  const rest = events.slice(MAX_EVENT_LINES);
  if (rest.length > 0) {
    const sum = rest.reduce((s, e) => s + e.amountPaise, 0);
    shown.push({ label: `${rest.length} more`, value: signed(sum), detail: `${shortDate(rest[0].date)} – ${shortDate(rest[rest.length - 1].date)}`, amountPaise: sum });
  }
  return shown;
}

export function affordTrace(
  snapshot: FinanceSnapshot,
  purchase: Purchase,
  result: AffordResult,
  horizonDays: number = horizonDaysFor(snapshot),
  withIncome = true,
): AffordTrace {
  const horizonEndMs = snapshot.asOf + horizonDays * DAY_MS;
  const income = incomeModel(snapshot);
  const historyDays = dailySample(snapshot).length;
  const floor = essentialFloor(snapshot);
  const necessity = purchase.necessity ?? defaultNecessity(purchase.category);

  const before = projectKnown(snapshot, horizonDays, [], withIncome);
  const buy = purchaseEvents(purchase, snapshot.asOf, horizonEndMs);
  const after = projectKnown(snapshot, horizonDays, buy, withIncome);
  const rate = before.dailyRate;

  const known = before.days.flatMap(d => d.events);
  const knownOut = known.filter(e => e.amountPaise < 0).reduce((s, e) => s + e.amountPaise, 0);
  const knownIn = known.filter(e => e.amountPaise > 0).reduce((s, e) => s + e.amountPaise, 0);
  const everydayTotal = rate != null ? rate * horizonDays : 0;
  const buyTotal = buy.reduce((s, e) => s + e.amountPaise, 0);
  const endBefore = before.days[before.days.length - 1]?.balance ?? snapshot.cash.available;
  const endAfter = after.days[after.days.length - 1]?.balance ?? snapshot.cash.available;

  // ── 1. Where you start ────────────────────────────────────────────────
  const horizonWhy = income.consistency === 'irregular'
    ? `Income is irregular, so we look at least ${IRREGULAR_MIN_HORIZON_DAYS} days ahead`
    : income.nextDate != null && horizonDays > STS_HORIZON_DAYS
      ? `Stretched to your next income on ${shortDate(income.nextDate)}`
      : `At least ${STS_HORIZON_DAYS} days, or to your next income if later`;

  const start: TraceLine[] = [
    { label: 'Cash you can spend now', value: formatRupees(snapshot.cash.available), detail: 'Bank + cash accounts; card limit is never counted as money', amountPaise: snapshot.cash.available },
  ];
  if (snapshot.cash.creditUsed > 0) {
    start.push({
      label: 'Card balance to repay',
      value: formatRupees(snapshot.cash.creditUsed),
      detail: snapshot.cash.cardDueDay != null ? `Due on day ${snapshot.cash.cardDueDay} of the month` : 'No due day set, so it’s counted as due today',
    });
  }
  start.push(
    {
      label: 'Spending history used',
      value: `${historyDays} day${historyDays === 1 ? '' : 's'}`,
      detail: `Needs ${EVERYDAY_MIN_DAYS}+ days for any verdict, ${EVERYDAY_MIN_DAYS * 2}+ for high confidence`,
      status: historyDays < EVERYDAY_MIN_DAYS ? 'fail' : historyDays < EVERYDAY_MIN_DAYS * 2 ? 'warn' : 'pass',
    },
    rate != null
      ? { label: 'Everyday spending', value: `${formatRupees(rate)}/day`, detail: 'Trimmed average of your non-bill spending — outlier days don’t skew it' }
      : { label: 'Everyday spending', value: 'Not counted', detail: `Under ${EVERYDAY_MIN_DAYS} days of history — we don’t guess`, status: 'warn' },
    {
      label: 'Income pattern',
      value: income.consistency[0].toUpperCase() + income.consistency.slice(1),
      detail: income.nextDate != null && income.eventAmountPaise != null
        ? `Next: ${formatRupees(income.eventAmountPaise)} on ${shortDate(income.nextDate)}${withIncome ? '' : ' (not counted)'}`
        : 'No next payday we can date, so none is counted',
    },
    { label: 'Looking ahead', value: `${horizonDays} days`, detail: `${horizonWhy} · till ${shortDate(horizonEndMs)}` },
  );

  // ── 2. Known money in & out ───────────────────────────────────────────
  const flows: TraceLine[] = [
    ...eventLines(known),
    ...(rate != null ? [{ label: 'Everyday spending', value: signed(-everydayTotal), detail: `${formatRupees(rate)} × ${horizonDays} days`, amountPaise: -everydayTotal }] : []),
    {
      label: 'Balance at the end, without this',
      value: formatRupees(endBefore),
      detail: `${formatRupees(snapshot.cash.available)} ${signed(knownIn)} ${signed(knownOut)}${rate != null ? ` ${signed(-everydayTotal)}` : ''}`,
      amountPaise: endBefore,
    },
  ];
  if (known.length === 0) flows.unshift({ label: 'No bills, income or dues in this window', value: '—' });

  // ── 3. This purchase ──────────────────────────────────────────────────
  const freqLabel = purchase.recurrence ?? 'one-time';
  const thisBuy: TraceLine[] = [
    { label: 'Amount', value: formatRupees(purchase.amountPaise), detail: purchase.category ? `Category: ${purchase.category}` : 'No category picked' },
    {
      label: 'Times it lands in the window',
      value: `${buy.length}×`,
      detail: `${freqLabel[0].toUpperCase()}${freqLabel.slice(1)} = ${formatRupees(-buyTotal)} total${purchase.recurrence === 'yearly' ? ' (yearly lands once in this window)' : ''}`,
      amountPaise: buyTotal,
    },
    { label: 'Treated as', value: necessity === 'need' ? 'Need' : 'Want', detail: purchase.category ? 'From the category' : 'Uncategorised purchases count as a Want' },
    { label: 'Balance at the end, with this', value: formatRupees(endAfter), detail: `${formatRupees(endBefore)} ${signed(buyTotal)}`, amountPaise: endAfter },
  ];

  // ── 4. The low point ──────────────────────────────────────────────────
  const lowWhy = (events: string[]) => (events.length > 0 ? `after ${events.join(', ')}` : 'lowest day in the window');
  const low: TraceLine[] = [
    { label: 'Lowest balance without it', value: formatRupees(before.lowPoint.amount), detail: `${shortDate(before.lowPoint.date)} · ${lowWhy(before.lowPoint.events)}`, amountPaise: before.lowPoint.amount },
    { label: 'Lowest balance with it', value: formatRupees(after.lowPoint.amount), detail: `${shortDate(after.lowPoint.date)} · ${lowWhy(after.lowPoint.events)}`, amountPaise: after.lowPoint.amount },
    { label: 'This purchase moves it by', value: signed(after.lowPoint.amount - before.lowPoint.amount), amountPaise: after.lowPoint.amount - before.lowPoint.amount },
    {
      label: 'Safety floor',
      value: formatRupees(floor),
      detail: floor > 0 ? 'One week of essentials: your median daily Need spend × 7' : 'Not enough essentials history yet, so the floor is ₹0',
    },
  ];

  // ── 5. Checks ─────────────────────────────────────────────────────────
  const lowAfter = after.lowPoint.amount;
  const checks: TraceLine[] = [
    {
      label: 'Never goes below ₹0',
      value: lowAfter >= 0 ? 'Pass' : `Short by ${formatRupees(-lowAfter)}`,
      detail: `Lowest point ${formatRupees(lowAfter)} vs ₹0`,
      status: lowAfter >= 0 ? 'pass' : 'fail',
    },
    {
      label: 'Keeps a week of essentials',
      value: lowAfter >= floor ? 'Pass' : `${formatRupees(floor - lowAfter)} under`,
      detail: `Lowest point ${formatRupees(lowAfter)} vs floor ${formatRupees(floor)}`,
      status: lowAfter >= floor ? 'pass' : lowAfter >= 0 ? 'warn' : 'fail',
    },
  ];

  const budget = budgetCheck(snapshot, purchase);
  checks.push(budget
    ? {
      label: `${purchase.category} budget`,
      value: budget.afterPaise <= budget.budgetPaise ? 'Pass' : `${formatRupees(budget.afterPaise - budget.budgetPaise)} over`,
      detail: `Spent ${formatRupees(budget.spentPaise)} + this ${formatRupees(budget.effectPaise)}${purchase.recurrence ? '/mo' : ''} = ${formatRupees(budget.afterPaise)} of ${formatRupees(budget.budgetPaise)}`,
      status: budget.afterPaise <= budget.budgetPaise ? 'pass' : 'warn',
    }
    : {
      label: 'Category budget',
      value: 'Skipped',
      detail: purchase.category ? `No monthly budget set for ${purchase.category}` : 'No category picked',
      status: 'info',
    });

  if (withIncome) {
    const months = monthlyAffordability(snapshot);
    const broken = months.find(m => m.unfundable);
    const sample = months[0];
    checks.push(sample?.surplusPaise == null
      ? { label: 'Next 12 months of commitments', value: 'Skipped', detail: 'Irregular income — no monthly figure to test against', status: 'info' }
      : broken
        ? {
          label: 'Next 12 months of commitments',
          value: `${formatRupees(broken.requiredPaise - (broken.surplusPaise ?? 0))} short`,
          detail: `From ${shortDate(broken.monthStart)}: set-asides ${formatRupees(broken.requiredPaise)}/mo vs spare ${formatRupees(broken.surplusPaise ?? 0)}/mo`,
          status: 'fail',
        }
        : {
          label: 'Next 12 months of commitments',
          value: 'Pass',
          detail: `Spare ${formatRupees(sample.surplusPaise)}/mo covers yearly bills and goals (up to ${formatRupees(Math.max(...months.map(m => m.requiredPaise)))}/mo)`,
          status: 'pass',
        });
  }

  for (const r of result.tippingReceivables) {
    checks.push({
      label: 'Money owed to you',
      value: formatRupees(r.amountPaise),
      detail: `Would make this comfortable if repaid — usually takes ~${r.delayDays} days, so it isn’t counted`,
      status: 'info',
    });
  }

  // ── 6. Verdict ────────────────────────────────────────────────────────
  const failed = checks.some(c => c.status === 'fail');
  const warned = checks.some(c => c.status === 'warn');
  const verdict: TraceLine[] = [
    { label: 'Any check failed → Not right now', value: failed ? 'Yes' : 'No', status: failed ? 'fail' : 'pass' },
    { label: 'Any check warned → Tight', value: warned ? 'Yes' : 'No', status: warned ? 'warn' : 'pass' },
    { label: 'Otherwise → Comfortable', value: !failed && !warned ? 'Yes' : 'No', status: !failed && !warned ? 'pass' : 'info' },
  ];
  if (result.verdict == null) {
    verdict.push({ label: 'Verdict held back', value: 'Not enough data', detail: `${historyDays} of ${EVERYDAY_MIN_DAYS} days of history — ${result.explanation.missing}`, status: 'warn' });
  } else {
    verdict.push({ label: 'Result', value: VERDICT_LABEL[result.verdict], status: result.verdict === 'comfortable' ? 'pass' : result.verdict === 'tight' ? 'warn' : 'fail' });
  }
  verdict.push({
    label: 'Confidence',
    value: result.explanation.confidence[0].toUpperCase() + result.explanation.confidence.slice(1),
    detail: result.explanation.missing ? `Would improve with ${result.explanation.missing}` : 'Enough history and a steady income',
  });
  // For the simple case the search's answer is plain subtraction — show it when
  // it is, rather than claiming a formula that the budget or a repeat would break.
  const headroom = before.lowPoint.amount - floor;
  const isSubtraction = buy.length === 1 && Math.abs(headroom - result.largestComfortableAmount) <= 1;
  verdict.push({
    label: 'Most you can spend comfortably',
    value: formatRupees(result.largestComfortableAmount),
    detail: isSubtraction
      ? `Lowest balance without it ${formatRupees(before.lowPoint.amount)} − floor ${formatRupees(floor)}`
      : 'The largest amount of this same purchase that passes every check',
  });
  if (result.earliestComfortableDate != null) {
    verdict.push({ label: 'Comfortable if you wait until', value: shortDate(result.earliestComfortableDate), detail: 'First day in the window this passes every check' });
  }

  return {
    sections: [
      { key: 'start', title: 'Where you start', lines: start },
      { key: 'flows', title: `Money in & out till ${shortDate(horizonEndMs)}`, lines: flows },
      { key: 'purchase', title: 'This purchase', lines: thisBuy },
      { key: 'low', title: 'The low point', lines: low },
      { key: 'checks', title: 'Checks', lines: checks },
      { key: 'verdict', title: 'How the verdict was reached', lines: verdict },
    ],
  };
}
