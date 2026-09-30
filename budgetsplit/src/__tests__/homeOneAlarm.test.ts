import { readFileSync } from 'fs';
import { join } from 'path';
import { homeHealthColor, healthBandColor } from '../components/finance/home/helpers';
import { colors } from '../theme';

/**
 * `DQ-12`, decided 2026-09-30: on Home, Safe to spend is the one red alarm. The budget bar and the
 * health ring read amber even at their worst; the health sheet keeps the band's own red.
 */
describe('Home has one red alarm', () => {
  it('the health ring is amber at the bottom band on Home, red in the sheet', () => {
    expect(homeHealthColor('vulnerable')).toBe(colors.healthAmber);
    expect(homeHealthColor('healthy')).toBe(healthBandColor('healthy'));
    expect(healthBandColor('vulnerable')).toBe(colors.expense);
  });

  it('the budget bar never turns red', () => {
    const src = readFileSync(join(__dirname, '../components/finance/home/HeroCard.tsx'), 'utf8');
    const pace = src.split('\n').find(l => l.includes('const paceColor'))!;
    expect(pace).not.toMatch(/healthRed|expense/);
  });
});
