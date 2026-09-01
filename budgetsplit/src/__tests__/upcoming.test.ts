import { buildUpcoming, expandUpcoming } from '../lib/upcoming';

const base = {
  id: 'r1', group_id: 'g', kind: 'expense', entry_mode: 'quick',
  category: 'Rent', note: null, attachment_uri: null, tags: null,
  recur_interval: 1, recur_end: null, recur_override_date: null,
  recur_state: 'active', is_deleted: 0, created_at: 0, updated_at: 0,
  payments: [{ personId: 'a', amount: 1000 }], shares: [{ personId: 'me', amount: 400 }, { personId: 'a', amount: 600 }],
};

const ms = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe('buildUpcoming', () => {
  it('projects the next occurrence with my share and days-until', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1) };
    const out = buildUpcoming([t], 'me', ms(2024, 1, 20)); // Feb 20 → next is Mar 1
    expect(out).toHaveLength(1);
    expect(out[0].dateMs).toBe(ms(2024, 2, 1));
    expect(out[0].amount).toBe(400); // my share, not the full 1000
    expect(out[0].daysUntil).toBeGreaterThan(0);
  });

  it('falls back to the full amount only when the bill is unsplit', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1), shares: [], payments: [{ personId: 'a', amount: 1000 }] };
    expect(buildUpcoming([t], 'me', ms(2024, 1, 20))[0].amount).toBe(1000);
  });

  /**
   * A bill split between two other people is coming for THEM. Presuming it mine
   * put a flatmate's ₹18,000 car EMI on my list, under my forecast and against my
   * Safe-to-Spend, every month.
   */
  it('omits a split I am not on rather than charging me the whole thing', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1), shares: [{ personId: 'a', amount: 1000 }] };
    expect(buildUpcoming([t], 'me', ms(2024, 1, 20))).toHaveLength(0);
  });

  /**
   * A rule I have not accepted is a proposal, not a bill — and this list feeds
   * the reminder scheduler, so including it would announce somebody else's
   * intention as my commitment.
   */
  it('omits a rule still waiting on my approval', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1), pendingApproval: true };
    expect(buildUpcoming([t], 'me', ms(2024, 1, 20))).toHaveLength(0);
  });

  it('omits paused, deleted, ended and non-recurring series', () => {
    const paused: any = { ...base, id: 'p', recur_freq: 'monthly', date: ms(2024, 0, 1), recur_state: 'paused' };
    const deleted: any = { ...base, id: 'd', recur_freq: 'monthly', date: ms(2024, 0, 1), is_deleted: 1 };
    const oneOff: any = { ...base, id: 'o', recur_freq: null, date: ms(2024, 0, 1) };
    const ended: any = { ...base, id: 'e', recur_freq: 'monthly', date: ms(2024, 0, 1), recur_end: ms(2024, 0, 15) };
    const out = buildUpcoming([paused, deleted, oneOff, ended], 'me', ms(2024, 1, 20));
    expect(out).toHaveLength(0);
  });

  /**
   * Income used to be dropped here too. It is a LIST of what is coming, and a
   * recurring salary is exactly the sort of thing you want on it — the reason to
   * exclude it was never about this function.
   */
  it('includes income and transfers, tagged by kind', () => {
    const income: any = { ...base, id: 'i', recur_freq: 'monthly', date: ms(2024, 0, 1), kind: 'income' };
    const transfer: any = { ...base, id: 't', recur_freq: 'monthly', date: ms(2024, 0, 2), kind: 'settlement' };
    const out = buildUpcoming([income, transfer], 'me', ms(2024, 1, 20));
    expect(out.map(i => i.kind)).toEqual(['income', 'settlement']);
  });

  /**
   * ...but Safe-to-Spend's "committed bills" must stay outgoings only. Income is
   * not a bill and a settlement is not consumption (AGENTS §12), and summing them
   * into one figure is the bug two other screens already shipped.
   */
  it('keeps expandUpcoming — which feeds Safe-to-Spend — to expenses alone', () => {
    const income: any = { ...base, id: 'i', recur_freq: 'monthly', date: ms(2024, 0, 1), kind: 'income' };
    const transfer: any = { ...base, id: 't', recur_freq: 'monthly', date: ms(2024, 0, 2), kind: 'settlement' };
    const bill: any = { ...base, id: 'b', recur_freq: 'monthly', date: ms(2024, 0, 3) };
    const out = expandUpcoming([income, transfer, bill], 'me', ms(2024, 1, 1), ms(2024, 2, 1));
    expect(out.every(o => o.seriesId === 'b')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  /**
   * The money half of the same rule. `getRecurringForGroup` is a LEDGER view and
   * includes a peer's pending rule on purpose, marked — but everything downstream
   * of `expandUpcoming` is a figure: Safe-to-Spend's committed bills, the
   * month-end forecast floor, Afford, and the health score's bills-covered.
   *
   * Aarav proposing "Gym ₹12,000/mo" used to take my ₹4,000 share off
   * Safe-to-Spend the moment it arrived, while `getMyExposure` and every ledger
   * total correctly ignored it. One figure moving while the rest do not is the
   * failure AGENTS §13 calls worse than all of them moving.
   */
  it('keeps a rule I have not accepted out of Safe-to-Spend', () => {
    const mine: any = { ...base, id: 'mine', recur_freq: 'monthly', date: ms(2024, 0, 1) };
    const theirs: any = { ...base, id: 'theirs', recur_freq: 'monthly', date: ms(2024, 0, 1), pendingApproval: true };

    const out = expandUpcoming([mine, theirs], 'me', ms(2024, 1, 1), ms(2024, 2, 1));
    expect(out.every(o => o.seriesId === 'mine')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('reports whether a rule posts itself or waits to be logged', () => {
    const auto: any = { ...base, id: 'a', recur_freq: 'monthly', date: ms(2024, 0, 1), recur_mode: 'auto' };
    const remind: any = { ...base, id: 'r', recur_freq: 'monthly', date: ms(2024, 0, 2), recur_mode: 'remind' };
    const out = buildUpcoming([auto, remind], 'me', ms(2024, 1, 20));
    expect(out.map(i => i.mode)).toEqual(['auto', 'remind']);
  });

  it('sorts soonest first and respects the limit', () => {
    const a: any = { ...base, id: 'a', recur_freq: 'monthly', date: ms(2024, 0, 5) };
    const b: any = { ...base, id: 'b', recur_freq: 'monthly', date: ms(2024, 0, 1) };
    const c: any = { ...base, id: 'c', recur_freq: 'monthly', date: ms(2024, 0, 10) };
    const out = buildUpcoming([a, b, c], 'me', ms(2024, 1, 20), 2);
    expect(out).toHaveLength(2);
    expect(out[0].dateMs).toBeLessThan(out[1].dateMs);
  });
});

/**
 * "Due this month" has to be a month.
 *
 * `loadSavingsTabData` passed `withinDays = undefined` — no window — so the block
 * headed **"Due this month"** was really "the next five charges, whenever they
 * fall". A yearly insurance bill due in eleven months appeared under it for anyone
 * with fewer than five rules.
 *
 * That is not a wording slip. The comment beside that heading argues the title is
 * the entire thing separating this block from the Recurring inventory — *"Due this
 * month is a window, Recurring is the inventory"* — so a false title collapses the
 * distinction the two screens rest on.
 */
describe('a windowed list only shows what falls inside the window', () => {
  const NOW = ms(2026, 5, 10);          // 10 June
  const daysLeftInJune = 20;            // to the 30th

  /** A yearly rule whose next charge is eleven months out. */
  const yearly = {
    ...base, id: 'yr', category: 'Insurance', recur_freq: 'yearly',
    date: ms(2026, 4, 20),              // last charged 20 May → next 20 May 2027
  } as never;
  const monthly = {
    ...base, id: 'mo', category: 'Rent', recur_freq: 'monthly',
    date: ms(2026, 4, 15),              // → 15 June, inside the month
  } as never;

  it('drops a charge that falls outside it', () => {
    const rows = buildUpcoming([yearly, monthly], 'me', NOW, 5, daysLeftInJune);
    expect(rows.map(r => r.category)).toEqual(['Rent']);
  });

  it('kept it when no window was given — the bug', () => {
    // Proof the old call signature really did include it, so this test is
    // guarding a behaviour change and not restating the implementation.
    const rows = buildUpcoming([yearly, monthly], 'me', NOW, 5, undefined);
    expect(rows.map(r => r.category)).toContain('Insurance');
  });

  it('shows nothing rather than something wrong when the month is empty', () => {
    expect(buildUpcoming([yearly], 'me', NOW, 5, daysLeftInJune)).toEqual([]);
  });
});

/**
 * A rule somebody else proposed is not money you have committed.
 *
 * `getRecurringForGroup` deliberately returns pending peer rules so the group
 * ledger can show them marked. Every consumer filters them — except the global
 * Recurring inventory, which summed them into the hero. A flatmate's proposed
 * "Gym ₹12,000/mo" added ₹4,000 to your committed total the moment they typed it,
 * and appeared in no upcoming list to explain where it came from.
 */
describe('a peer rule awaiting approval is nobody else’s commitment', () => {
  const pending = {
    ...base, id: 'pk', category: 'Gym', recur_freq: 'monthly',
    date: ms(2026, 5, 1), pendingApproval: true,
  } as never;
  const mine = {
    ...base, id: 'mk', category: 'Rent', recur_freq: 'monthly', date: ms(2026, 5, 1),
  } as never;

  it('is excluded from the upcoming projection', () => {
    const rows = buildUpcoming([pending, mine], 'me', ms(2026, 5, 10), 5, 60);
    expect(rows.map(r => r.category)).toEqual(['Rent']);
  });
});
