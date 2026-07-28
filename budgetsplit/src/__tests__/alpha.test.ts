import { alpha, OPACITY, type OpacityPct } from '../theme/alpha';

describe('alpha', () => {
  it('appends the suffix, leaving the base colour untouched', () => {
    expect(alpha('#20C4B8', 13)).toBe('#20C4B822');
  });

  it('reproduces the AGENTS.md §8 default exactly', () => {
    // The whole point of the migration: alpha(c, 13) must equal the old c + '22'
    // byte-for-byte, so converting a call site changes nothing on screen.
    const c = '#FF6F61';
    expect(alpha(c, 13)).toBe(c + '22');
  });

  it('reproduces every suffix that existed before the helper', () => {
    const c = '#123456';
    for (const [pct, suffix] of Object.entries(OPACITY)) {
      expect(alpha(c, Number(pct) as OpacityPct)).toBe(c + suffix);
    }
  });

  it('produces a valid 8-digit hex for every supported opacity', () => {
    for (const pct of Object.keys(OPACITY)) {
      expect(alpha('#20C4B8', Number(pct) as OpacityPct)).toMatch(/^#[0-9A-Fa-f]{8}$/);
    }
  });

  it('keeps opacity ordered — a higher percentage is a higher alpha byte', () => {
    const pcts = Object.keys(OPACITY).map(Number).sort((a, b) => a - b);
    const bytes = pcts.map(p => parseInt(OPACITY[p as OpacityPct], 16));
    expect(bytes).toEqual([...bytes].sort((a, b) => a - b));
  });

  it('maps each percentage to the nearest byte, so the names are honest', () => {
    for (const [pct, suffix] of Object.entries(OPACITY)) {
      const expected = Math.round((Number(pct) / 100) * 255);
      // within 1 of the true byte — the suffixes are the pre-existing values
      expect(Math.abs(parseInt(suffix, 16) - expected)).toBeLessThanOrEqual(1);
    }
  });

  it('has no duplicate suffixes (each opacity is distinct)', () => {
    const suffixes = Object.values(OPACITY);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});
