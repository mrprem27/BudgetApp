import { settleRhythmDays, settleRhythmLabel, isReceivableStale } from '../lib/settleHistory';

const DAY = 86_400_000;
const days = (...ds: number[]) => ds.map(d => d * DAY);

describe('settleRhythmDays', () => {
  it('is null until there is enough history to call it a rhythm', () => {
    expect(settleRhythmDays([])).toBeNull();
    expect(settleRhythmDays(days(0))).toBeNull();
    // Two settlements make one gap, and one gap is an anecdote.
    expect(settleRhythmDays(days(0, 7))).toBeNull();
  });

  it('takes the median gap between settlements', () => {
    expect(settleRhythmDays(days(0, 7, 14, 21))).toBe(7);
  });

  it('is not dragged by one long gap', () => {
    // The reason it is a median: a trip that settled six months late must not
    // redefine someone who otherwise pays weekly.
    expect(settleRhythmDays(days(0, 7, 14, 21, 201))).toBe(7);
  });

  it('ignores order', () => {
    expect(settleRhythmDays(days(21, 0, 14, 7))).toBe(7);
  });

  it('does not count a settle-all as several occasions', () => {
    // "Settle all groups" writes one settlement per group on the same day. Counting
    // those as separate occasions would pull every rhythm toward zero.
    expect(settleRhythmDays([0, 0, 0, 30 * DAY, 60 * DAY, 90 * DAY])).toBe(30);
  });

  it('never returns zero', () => {
    expect(settleRhythmDays([0, DAY, 2 * DAY, 3 * DAY])).toBe(1);
  });
});

describe('settleRhythmLabel', () => {
  it('says nothing when there is nothing to say', () => {
    expect(settleRhythmLabel(null)).toBeNull();
  });

  it('bands the number rather than reciting it', () => {
    expect(settleRhythmLabel(1)).toBe('Usually settles within a couple of days');
    expect(settleRhythmLabel(7)).toBe('Usually settles every 7 days');
    expect(settleRhythmLabel(30)).toBe('Usually settles about once a month');
    expect(settleRhythmLabel(120)).toBe('Settles every few months');
  });
});

describe('isReceivableStale', () => {
  const now = 100 * DAY;

  it('says nothing when you have never settled with them', () => {
    // No history is not evidence of neglect — it is just no history.
    expect(isReceivableStale(null, now, 7)).toBe(false);
  });

  it('judges against their own rhythm, not a fixed number of days', () => {
    // 40 quiet days: overdue for a weekly settler, normal for a quarterly one.
    const lastSettled = 60 * DAY;
    expect(isReceivableStale(lastSettled, now, 7)).toBe(true);
    expect(isReceivableStale(lastSettled, now, 90)).toBe(false);
  });

  it('falls back to two months when there is no rhythm', () => {
    expect(isReceivableStale(now - 30 * DAY, now, null)).toBe(false);
    expect(isReceivableStale(now - 70 * DAY, now, null)).toBe(true);
  });
});
