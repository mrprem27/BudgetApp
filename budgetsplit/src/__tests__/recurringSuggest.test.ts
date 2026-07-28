import { detectRecurringCandidates, type RecurRow } from '../lib/recurringSuggest';

const DAY = 24 * 60 * 60 * 1000;
const day = (n: number) => new Date(2026, 0, n).getTime();

const row = (p: Partial<RecurRow> & { id: string; date: number }): RecurRow => ({
  description: 'Netflix subscription',
  amountPaise: 49900,
  category: 'Entertainment',
  ...p,
});

describe('detectRecurringCandidates', () => {
  it('flags two same-merchant rows a month apart at a stable amount', () => {
    const rows = [
      row({ id: '1', date: day(1) }),
      row({ id: '2', date: day(1) + 30 * DAY }),
    ];
    const out = detectRecurringCandidates(rows);
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(2);
    expect(out[0].mostRecentTxnId).toBe('2'); // the later occurrence, not the first
    expect(out[0].amountPaise).toBe(49900);
  });

  it('ignores a single occurrence — nothing to compare against', () => {
    const rows = [row({ id: '1', date: day(1) })];
    expect(detectRecurringCandidates(rows)).toEqual([]);
  });

  it('ignores rows whose gap is too short to be monthly (e.g. a week apart)', () => {
    const rows = [
      row({ id: '1', date: day(1) }),
      row({ id: '2', date: day(8) }),
    ];
    expect(detectRecurringCandidates(rows)).toEqual([]);
  });

  it('ignores rows whose gap is too long to be monthly (e.g. a quarter apart)', () => {
    const rows = [
      row({ id: '1', date: day(1) }),
      row({ id: '2', date: day(1) + 90 * DAY }),
    ];
    expect(detectRecurringCandidates(rows)).toEqual([]);
  });

  it('ignores amounts that drift too far apart, even at a monthly cadence', () => {
    const rows = [
      row({ id: '1', date: day(1), amountPaise: 10000 }),
      row({ id: '2', date: day(1) + 30 * DAY, amountPaise: 20000 }),
    ];
    expect(detectRecurringCandidates(rows)).toEqual([]);
  });

  it('tolerates a small amount wobble within the tolerance band', () => {
    const rows = [
      row({ id: '1', date: day(1), amountPaise: 10000 }),
      row({ id: '2', date: day(1) + 30 * DAY, amountPaise: 10300 }), // 3% higher
    ];
    expect(detectRecurringCandidates(rows)).toHaveLength(1);
  });

  it('treats different merchants as separate, unrelated groups', () => {
    const rows = [
      row({ id: '1', description: 'Netflix subscription', date: day(1) }),
      row({ id: '2', description: 'Netflix subscription', date: day(1) + 30 * DAY }),
      row({ id: '3', description: 'Spotify premium', date: day(2) }),
      row({ id: '4', description: 'Spotify premium', date: day(2) + 31 * DAY }),
    ];
    const out = detectRecurringCandidates(rows);
    expect(out.map(c => c.description).sort()).toEqual(['Netflix subscription', 'Spotify premium']);
  });

  it('requires every consecutive gap to be monthly across 3+ occurrences', () => {
    const rows = [
      row({ id: '1', date: day(1) }),
      row({ id: '2', date: day(1) + 30 * DAY }),
      row({ id: '3', date: day(1) + 35 * DAY }), // too soon after the second
    ];
    expect(detectRecurringCandidates(rows)).toEqual([]);
  });

  it('sorts multiple candidates by occurrence count, most first', () => {
    const rows = [
      row({ id: '1', description: 'Gym membership', date: day(1) }),
      row({ id: '2', description: 'Gym membership', date: day(1) + 30 * DAY }),
      row({ id: '3', description: 'Gym membership', date: day(1) + 60 * DAY }),
      row({ id: '4', description: 'Netflix subscription', date: day(2) }),
      row({ id: '5', description: 'Netflix subscription', date: day(2) + 30 * DAY }),
    ];
    const out = detectRecurringCandidates(rows);
    expect(out.map(c => c.description)).toEqual(['Gym membership', 'Netflix subscription']);
  });

  it('ignores rows with no distinctive words in the description', () => {
    const rows = [
      row({ id: '1', description: 'the a an', date: day(1) }),
      row({ id: '2', description: 'the a an', date: day(1) + 30 * DAY }),
    ];
    expect(detectRecurringCandidates(rows)).toEqual([]);
  });
});
