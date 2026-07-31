/**
 * Typography tokens.
 *
 * Design principles:
 *  - Numerals use SpaceMono for tabular consistency (₹1,234 aligns with ₹9,876).
 *  - Titles use tighter negative tracking at larger sizes (Apple/Linear/Stripe
 *    pattern) — improves optical density and premium feel.
 *  - `overline` is the single source of truth for the small uppercase section
 *    labels used across every screen (was re-invented ~20 times as inline
 *    TextStyles). Change here → cascades everywhere.
 */

/** Line-height multipliers. `tight` for headings/single-line, `body` for
 *  multi-line copy. */
export const line = {
  tight: 1.2,
  body:  1.5,
};

export const type = {
  // Numerals — tabular, tightened at scale for that Apple-numeric feel.
  amountXXL: { fontFamily: 'SpaceMono_400Regular', fontSize: 48, letterSpacing: -1.2, lineHeight: 52 },
  amountXL:  { fontFamily: 'SpaceMono_400Regular', fontSize: 36, letterSpacing: -0.8, lineHeight: 40 },
  amountLG:  { fontFamily: 'SpaceMono_400Regular', fontSize: 24, letterSpacing: -0.5, lineHeight: 28 },
  amountMD:  { fontFamily: 'SpaceMono_400Regular', fontSize: 18, letterSpacing: -0.2, lineHeight: 22 },
  amountSM:  { fontFamily: 'SpaceMono_400Regular', fontSize: 14, lineHeight: 18 },

  // Titles & headings — Inter SemiBold with progressively tighter tracking.
  display:    { fontFamily: 'Inter_600SemiBold', fontSize: 34, letterSpacing: -0.8, lineHeight: 40 },
  title:      { fontFamily: 'Inter_600SemiBold', fontSize: 28, letterSpacing: -0.6, lineHeight: 34 },
  heading:    { fontFamily: 'Inter_600SemiBold', fontSize: 20, letterSpacing: -0.3, lineHeight: 26 },
  subheading: { fontFamily: 'Inter_600SemiBold', fontSize: 16, letterSpacing: -0.1, lineHeight: 22 },

  // Body & supporting.
  body:       { fontFamily: 'Inter_400Regular',  fontSize: 15, lineHeight: Math.round(15 * line.body) },
  label:      { fontFamily: 'Inter_400Regular',  fontSize: 13, lineHeight: 18 },
  caption:    { fontFamily: 'Inter_400Regular',  fontSize: 11, lineHeight: 15 },

  // Interactive.
  button:     { fontFamily: 'Inter_600SemiBold', fontSize: 15, letterSpacing: 0.1 },

  /**
   * The single source of truth for uppercase section labels
   * ("RECOMMENDATIONS", "ACTIVE · 3", "GET STARTED", …).
   * Was re-invented as inline TextStyle in ~20 screens with slightly different
   * fontSize (10/11/12), letterSpacing (0.5/0.8/1) and colour. One token → one
   * look everywhere.
   */
  overline:   { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' as const, lineHeight: 14 },
};
