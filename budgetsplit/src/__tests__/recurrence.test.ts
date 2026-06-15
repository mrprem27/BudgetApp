import { materializeInstances } from '../lib/recurrence';

const base = {
  id: 'r1', group_id: 'g', kind: 'expense', entry_mode: 'quick',
  category: 'Rent', note: null, attachment_uri: null, tags: null,
  recur_interval: 1, recur_end: null, recur_override_date: null,
  recur_state: 'active', is_deleted: 0, created_at: 0, updated_at: 0,
  payments: [{ personId: 'a', amount: 1000 }], shares: [{ personId: 'a', amount: 1000 }],
};

const ms = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe('materializeInstances', () => {
  it('returns nothing when not recurring', () => {
    const t: any = { ...base, recur_freq: null, date: ms(2024, 0, 1) };
    expect(materializeInstances(t, ms(2024, 0, 1), ms(2024, 2, 31))).toEqual([]);
  });

  it('generates one monthly instance per month in range', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1) };
    const out = materializeInstances(t, ms(2024, 0, 1), ms(2024, 2, 31)); // Jan, Feb, Mar
    expect(out).toHaveLength(3);
  });

  it('respects recur_end', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1), recur_end: ms(2024, 1, 1) };
    const out = materializeInstances(t, ms(2024, 0, 1), ms(2024, 5, 30)); // capped at Feb
    expect(out).toHaveLength(2);
  });

  it('gives each instance a unique virtual id', () => {
    const t: any = { ...base, recur_freq: 'monthly', date: ms(2024, 0, 1) };
    const out = materializeInstances(t, ms(2024, 0, 1), ms(2024, 2, 31));
    expect(new Set(out.map(i => i.id)).size).toBe(out.length);
  });
});
