export const colors = {
  // Surfaces — near-black with a subtle teal tint, layered for elevation
  bg: '#0A0F11',
  bgCard: '#13201F',
  bgInput: '#162825',
  bgMuted: '#1B302D',
  bgElevated: '#1E3633',

  // Text
  textPrimary: '#ECF3F1',
  textSecondary: '#8FA3A0',
  // Was #5A6B69 — 2.98:1 on bgCard, well under WCAG AA's 4.5:1, on the token used for
  // every caption, placeholder and disabled label in the app (`V2-09` / `N1`, deferred
  // once). Now 5.02:1 on bgCard, 5.78 on bg, 4.62 on bgInput. Same hue, minimally
  // lightened: going far enough to clear AA on bgMuted/bgElevated too would land on
  // #8A9D9A, indistinguishable from textSecondary (#8FA3A0), collapsing the two-level
  // text hierarchy to fix surfaces that carry no muted text — those are pills, tracks
  // and ring strokes. `contrast.test.ts` holds the line.
  textMuted: '#7C918E',

  // Brand — teal primary with coral highlight
  accent: '#20C4B8',
  accentDeep: '#15A89D',
  accentMuted: '#0E2C29',

  coral: '#FF6F61',
  coralMuted: '#3A1714',
  /** The streak flame — a warmer coral than `coral`, kept exact so the Home
   *  streak card is unchanged. */
  streakFlame: '#FF7A6D',

  // Semantic
  income: '#2BD49B',
  expense: '#FF6F61',
  settle: '#8B7CF8',

  healthGreen: '#2BD49B',
  healthAmber: '#F5B301',
  healthRed: '#FF5C5C',

  border: '#21302E',
  borderFocus: '#20C4B8',

  /** Text/icon color on accent/gradient/coloured fills (was raw '#fff' ~15 places). */
  onAccent: '#FFFFFF',

  /** Tinted surfaces for semantic cards (was re-invented as raw hex across ~20 files).
   *  Each has a soft (card bg) and strong (border/hover) variant. */
  expenseTint: '#2A1714',
  expenseTintStrong: '#3A1F1C',
  /** Deeper danger surface, below `expenseTint`. Collapses three near-identical
   *  raw hexes that were re-invented per screen (#1A1014 insights velocity card,
   *  #1F0E0E notifications denied banner, #1A0A0A LockGate) — all within
   *  0.002 relative luminance of each other. */
  expenseTintDeep: '#1A1014',
  incomeTint: '#081F16',
  incomeTintStrong: '#0C3D22',
  settleTint: '#1A1A3A',
  settleTintStrong: '#2A2A5A',
  /** Amber-tinted surface, e.g. the history "edited" badge. */
  amberTint: '#221A00',

  /** Modal / sheet scrim behind bottom sheets and dialogs. */
  overlay: 'rgba(0,0,0,0.6)',
};

/** Gradient stops for striking surfaces (FAB, hero accents). */
export const gradients = {
  accent: ['#22D3C4', '#15A89D'] as const,   // teal sheen
  brand: ['#20C4B8', '#FF6F61'] as const,     // teal → coral
};
