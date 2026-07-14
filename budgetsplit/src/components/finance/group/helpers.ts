import { colors } from '../../tokens';

/**
 * Presentation-only colour helpers for the Group Detail tabs (depend on the
 * palette, so they live with the components, not in pure `src/lib`).
 */

export function healthColor(h: 'green' | 'amber' | 'red' | 'none'): string {
  return h === 'red' ? colors.healthRed
    : h === 'amber' ? colors.healthAmber
    : h === 'green' ? colors.healthGreen
    : colors.textSecondary;
}

export function recBg(sev: 'warn' | 'info' | 'good'): string {
  return sev === 'warn' ? colors.expenseTint : sev === 'good' ? colors.accentMuted : colors.bgMuted;
}

export function recColor(sev: 'warn' | 'info' | 'good'): string {
  return sev === 'warn' ? colors.expense : sev === 'good' ? colors.income : colors.textSecondary;
}
