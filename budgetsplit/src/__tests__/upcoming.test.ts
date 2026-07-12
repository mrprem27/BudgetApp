import { buildUpcoming } from '../lib/upcoming';

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

  it('omits paused, deleted, ended, income and non-recurring series', () => {
    const paused: any = { ...base, id: 'p', recur_freq: 'monthly', date: ms(2024, 0, 1), recur_state: 'paused' };
    const deleted: any = { ...base, id: 'd', recur_freq: 'monthly', date: ms(2024, 0, 1), is_deleted: 1 };
    const income: any = { ...base, id: 'i', recur_freq: 'monthly', date: ms(2024, 0, 1), kind: 'income' };
    const oneOff: any = { ...base, id: 'o', recur_freq: null, date: ms(2024, 0, 1) };
    const ended: any = { ...base, id: 'e', recur_freq: 'monthly', date: ms(2024, 0, 1), recur_end: ms(2024, 0, 15) };
    const out = buildUpcoming([paused, deleted, income, oneOff, ended], 'me', ms(2024, 1, 20));
    expect(out).toHaveLength(0);
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
