import { detectSubscriptions } from '../lib/subscriptions';

const DAY = 24 * 60 * 60 * 1000;
const day0 = new Date(2025, 0, 1).getTime();
const at = (d: number) => day0 + d * DAY;

describe('detectSubscriptions', () => {
  it('detects a monthly subscription (same category + amount, ~30-day gaps)', () => {
    const txns = [
      { category: 'Subscriptions', amount: 19900, date: at(0) },
      { category: 'Subscriptions', amount: 19900, date: at(30) },
      { category: 'Subscriptions', amount: 19900, date: at(61) },
    ];
    const subs = detectSubscriptions(txns);
    expect(subs).toHaveLength(1);
    expect(subs[0].cadence).toBe('monthly');
    expect(subs[0].count).toBe(3);
    expect(subs[0].monthlyEquivalent).toBe(19900);
  });

  it('normalizes a weekly charge to a monthly equivalent', () => {
    const txns = [0, 7, 14, 21].map(d => ({ category: 'Chai & Snacks', amount: 5000, date: at(d) }));
    const subs = detectSubscriptions(txns);
    expect(subs[0].cadence).toBe('weekly');
    expect(subs[0].monthlyEquivalent).toBeGreaterThan(5000 * 4);
  });

  it('ignores irregular spending and fewer than 3 occurrences', () => {
    expect(detectSubscriptions([
      { category: 'Shopping', amount: 19900, date: at(0) },
      { category: 'Shopping', amount: 19900, date: at(3) },
      { category: 'Shopping', amount: 19900, date: at(50) },
    ])).toHaveLength(0);
    expect(detectSubscriptions([
      { category: 'Subscriptions', amount: 19900, date: at(0) },
      { category: 'Subscriptions', amount: 19900, date: at(30) },
    ])).toHaveLength(0);
  });

  it('treats different amounts as separate (or no) subscriptions', () => {
    const subs = detectSubscriptions([
      { category: 'Subscriptions', amount: 19900, date: at(0) },
      { category: 'Subscriptions', amount: 49900, date: at(30) },
      { category: 'Subscriptions', amount: 19900, date: at(61) },
    ]);
    expect(subs).toHaveLength(0); // only 2 of the 199 charge → below threshold
  });
});
