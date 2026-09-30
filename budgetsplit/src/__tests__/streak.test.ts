import { streakFrom } from '../lib/streak';

// U-40: a streak breaks when a whole day passes empty, not at midnight.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const NOW = at(2026, 8, 30, 9);

describe('streakFrom', () => {
  it('counts today and the days before it', () => {
    expect(streakFrom([at(2026, 8, 30), at(2026, 8, 29), at(2026, 8, 28)], NOW).streak).toBe(3);
  });
  it('keeps yesterday\'s streak while today is still empty', () => {
    expect(streakFrom([at(2026, 8, 29), at(2026, 8, 28)], NOW).streak).toBe(2);
  });
  it('breaks when a whole day was missed', () => {
    expect(streakFrom([at(2026, 8, 28), at(2026, 8, 27)], NOW).streak).toBe(0);
    expect(streakFrom([at(2026, 8, 30), at(2026, 8, 28)], NOW).streak).toBe(1);
  });
  it('runs across a month boundary', () => {
    const days = Array.from({ length: 5 }, (_, i) => at(2026, 9, 2 - i));
    expect(streakFrom(days, at(2026, 9, 2, 20)).streak).toBe(5);
  });
});
