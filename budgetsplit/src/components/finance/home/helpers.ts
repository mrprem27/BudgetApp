import { colors } from '../../tokens';
import type { HealthBand } from '../../../lib/financialHealth';

// Budget utilisation label lives in the budget domain now (one source).
export { utilLabel } from '../../../lib/budget';

/** Time-of-day greeting for the Home header. */
export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Accent colour for a health tier (FinHealth's three: see financialHealth.ts). */
export function healthBandColor(band: HealthBand): string {
  switch (band) {
    case 'healthy':    return colors.income;
    case 'coping':     return colors.healthAmber;
    case 'vulnerable': return colors.expense;
  }
}

/** Short human label for a health tier. */
export function healthBandLabel(band: HealthBand): string {
  switch (band) {
    case 'healthy':    return 'Healthy';
    case 'coping':     return 'Coping';
    case 'vulnerable': return 'Vulnerable';
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

