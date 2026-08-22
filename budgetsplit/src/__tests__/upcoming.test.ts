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

  it('falls back to full amount when I am not in the split', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1), shares: [{ personId: 'a', amount: 1000 }] };
    const out = buildUpcoming([t], 'me', ms(2024, 1, 20));
    expect(out[0].amount).toBe(1000);
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
