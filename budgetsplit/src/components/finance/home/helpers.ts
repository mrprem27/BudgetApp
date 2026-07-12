import { colors } from '../../tokens';
import type { HealthBand } from '../../../lib/financialHealth';

// Budget utilisation label lives in the budget domain now (one source).
export { utilLabel } from '../../../lib/budget';

/** Time-of-day greeting for the Home header. */
export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Accent colour for a health band. */
export function healthBandColor(band: HealthBand): string {
  switch (band) {
    case 'great': return colors.income;
    case 'good':  return colors.accent;
    case 'fair':  return colors.healthAmber;
    case 'poor':  return colors.expense;
  }
}

/** Short human label for a health band. */
export function healthBandLabel(band: HealthBand): string {
  switch (band) {
    case 'great': return 'Great';
    case 'good':  return 'Good';
    case 'fair':  return 'Fair';
    case 'poor':  return 'Poor';
  }
}

/** Colour for a factor/dimension severity. */
export function sevColor(sev: 'good' | 'warn' | 'bad' | 'neutral'): string {
  switch (sev) {
    case 'good':    return colors.income;
    case 'bad':     return colors.expense;
    case 'warn':    return colors.healthAmber;
    case 'neutral': return colors.textMuted;
  }
}

/** Donut/category-bar palette (kept stable across the app). */
export const CHART_COLORS = [
  '#F0A500', '#3ECF8E', '#7C6AF7', '#F06060', '#60A5FA',
  '#FB923C', '#F472B6', '#34D399', '#A78BFA', '#8B8A99',
];
