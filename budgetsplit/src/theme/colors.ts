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
  textMuted: '#5A6B69',

  // Brand — teal primary with coral highlight
  accent: '#20C4B8',
  accentDeep: '#15A89D',
  accentMuted: '#0E2C29',

  coral: '#FF6F61',
  coralMuted: '#3A1714',

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
  incomeTint: '#081F16',
  incomeTintStrong: '#0C3D22',
  settleTint: '#1A1A3A',
  settleTintStrong: '#2A2A5A',

  /** Modal / sheet scrim behind bottom sheets and dialogs. */
  overlay: 'rgba(0,0,0,0.6)',
};

/** Gradient stops for striking surfaces (FAB, hero accents). */
export const gradients = {
  accent: ['#22D3C4', '#15A89D'] as const,   // teal sheen
  brand: ['#20C4B8', '#FF6F61'] as const,     // teal → coral
};
