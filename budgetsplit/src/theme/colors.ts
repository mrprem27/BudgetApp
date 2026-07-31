export const colors = {
  // Surfaces — near-black with a subtle teal tint, layered for elevation.
  // bgCard was raised a touch (13201F → 141F1D) to reduce the strong stripe
  // that appeared between bg and card. Difference is imperceptible in
  // isolation but reads as "one surface breathing" instead of "two panels".
  bg: '#0A0F11',
  bgCard: '#141F1D',
  bgInput: '#162825',
  bgMuted: '#1B302D',
  bgElevated: '#1E3633',

  // Text
  textPrimary: '#ECF3F1',
  textSecondary: '#8FA3A0',
  textMuted: '#5A6B69',

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
  /** Softer border for hairline dividers inside cards (rowBorder). Was
   *  re-declared as `colors.border` in ~15 places with a light opacity trick
   *  applied per-screen. One token, one look. */
  divider: '#1A2725',
  borderFocus: '#20C4B8',

  /** Text/icon color on accent/gradient/coloured fills. */
  onAccent: '#FFFFFF',

  /** Tinted surfaces for semantic cards. */
  expenseTint: '#2A1714',
  expenseTintStrong: '#3A1F1C',
  expenseTintDeep: '#1A1014',
  incomeTint: '#081F16',
  incomeTintStrong: '#0C3D22',
  settleTint: '#1A1A3A',
  settleTintStrong: '#2A2A5A',
  amberTint: '#221A00',

  /** Modal / sheet scrim behind bottom sheets and dialogs. */
  overlay: 'rgba(0,0,0,0.6)',
};

/** Gradient stops for striking surfaces (FAB, hero accents). Tighter delta
 *  than before so buttons feel like a lit-from-behind surface rather than a
 *  two-tone stripe. Kept `brand` (teal→coral) for the FAB only. */
export const gradients = {
  accent: ['#22D0C3', '#1AB7AC'] as const,   // teal sheen, closer stops
  brand:  ['#20C4B8', '#FF6F61'] as const,   // teal → coral (FAB only)
};
