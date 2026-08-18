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

/**
 * Short human label for a health tier.
 *
 * The bottom band says **"Stretched thin"**, not "Vulnerable". Same threshold,
 * same score, different object: one describes the money, the other diagnoses the
 * person. Retention research names a "guilt cycle" — two or three months of red
 * and users conclude they are bad at budgeting and leave — and a word that reads
 * as a verdict on them is the cheapest way to start it. The number is unchanged
 * and nothing is hidden; only what it is a statement *about* is.
 */
export function healthBandLabel(band: HealthBand): string {
  switch (band) {
    case 'healthy':    return 'Healthy';
    case 'coping':     return 'Coping';
    case 'vulnerable': return 'Stretched thin';
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

