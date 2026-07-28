import { groupByDate } from '../lib/txnGrouping';

const at = (d: Date) => ({ date: d.getTime() });
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
};

describe('groupByDate', () => {
  it('labels today\'s items "Today"', () => {
    const out = groupByDate([at(new Date())]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Today');
  });

  it('formats older days as "dd MMM yyyy"', () => {
    const out = groupByDate([at(new Date(2026, 0, 5, 12))]);
    expect(out[0].title).toBe('05 Jan 2026');
  });

  it('puts every item from the same day in one section', () => {
    const d = daysAgo(3);
    const a = new Date(d); a.setHours(9);
    const b = new Date(d); b.setHours(21);
    const out = groupByDate([at(a), at(b)]);
    expect(out).toHaveLength(1);
    expect(out[0].data).toHaveLength(2);
  });

  it('separates different days', () => {
    const out = groupByDate([at(daysAgo(1)), at(daysAgo(2))]);
    expect(out).toHaveLength(2);
  });

  it('preserves the incoming order of sections and items', () => {
    const older = at(daysAgo(5));
    const newer1 = at(daysAgo(1));
    const newer2 = at(new Date(daysAgo(1).getTime() + 1000));
    const out = groupByDate([newer1, newer2, older]);
    expect(out[0].data).toEqual([newer1, newer2]);
    expect(out[1].data).toEqual([older]);
  });

  it('does not re-sort — it groups an unsorted list in first-seen order', () => {
    const d1 = at(daysAgo(1));
    const d2 = at(daysAgo(2));
    const d1b = at(new Date(daysAgo(1).getTime() + 500));
    const out = groupByDate([d1, d2, d1b]);
    // d1 seen first, so its section leads; d1b joins that existing section.
    expect(out.map(s => s.data.length)).toEqual([2, 1]);
  });

  it('returns an empty array for no items', () => {
    expect(groupByDate([])).toEqual([]);
  });

  it('carries the full item through, not just the date', () => {
    const item = { date: daysAgo(1).getTime(), id: 'x1', note: 'coffee' };
    const out = groupByDate([item]);
    expect(out[0].data[0]).toEqual(item);
  });

  it('handles the epoch without throwing', () => {
    const out = groupByDate([{ date: 0 }]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toMatch(/\d{2} \w{3} \d{4}/);
  });
});
