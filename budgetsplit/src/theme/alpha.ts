/**
 * Colour transparency for the app's `#RRGGBB` tokens.
 *
 * The codebase expressed this by concatenating a raw hex suffix —
 * `colors.accent + '22'` — in ~150 places across 15 different opacities
 * (`'0D'`, `'14'`, `'22'`, `'44'`, `'55'`, …). That's unreadable at the call
 * site: nobody knows what `'44'` means without doing base-16 in their head.
 *
 * `alpha()` takes the percentage instead and returns the SAME string, so
 * migrating a call site is a pure rename with no visual change:
 *
 *   colors.accent + '22'   ===   alpha(colors.accent, 13)
 *
 * Percentages are restricted to the set already in use so a caller can't
 * silently introduce a 16th near-identical opacity. Need a new one? Add it
 * here, with the exact suffix, and it becomes available everywhere.
 */

/** Opacity percentage → the exact 2-digit hex suffix it corresponds to. */
export const OPACITY = {
  5: '0D',   // 13/255
  7: '11',   // 17/255
  8: '14',   // 20/255
  9: '18',   // 24/255
  10: '1A',  // 26/255
  13: '22',  // 34/255 — the AGENTS.md §8 default for icon-circle backgrounds
  14: '24',  // 36/255
  15: '26',  // 38/255
  16: '28',  // 40/255
  20: '33',  // 51/255
  25: '40',  // 64/255
  27: '44',  // 68/255
  33: '55',  // 85/255
  38: '60',  // 96/255
  40: '66',  // 102/255
  95: 'F2',  // 242/255 — near-opaque full-screen overlay backdrops
} as const;

export type OpacityPct = keyof typeof OPACITY;

/**
 * `#RRGGBB` at the given opacity, as `#RRGGBBAA`.
 *
 * @example alpha(colors.accent, 13)  // icon-circle background
 * @example alpha(colors.expense, 33) // a stronger wash
 */
export function alpha(color: string, pct: OpacityPct): string {
  return color + OPACITY[pct];
}
