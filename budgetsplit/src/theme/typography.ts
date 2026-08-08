/** Line-height multipliers (design tokens --line-tight / --line-body).
 *  `tight` for headings/single-line, `body` for multi-line copy. */
export const line = {
  tight: 1.2,
  body: 1.5,
};

export const type = {
  amountXL: { fontFamily: 'SpaceMono_400Regular', fontSize: 36, letterSpacing: -0.5 },
  amountLG: { fontFamily: 'SpaceMono_400Regular', fontSize: 24, letterSpacing: -0.3 },
  amountMD: { fontFamily: 'SpaceMono_400Regular', fontSize: 18 },
  amountSM: { fontFamily: 'SpaceMono_400Regular', fontSize: 14 },

  title:      { fontFamily: 'Inter_600SemiBold', fontSize: 28, letterSpacing: -0.4 },
  heading:    { fontFamily: 'Inter_600SemiBold', fontSize: 20 },
  subheading: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  body:       { fontFamily: 'Inter_400Regular',  fontSize: 15, lineHeight: Math.round(15 * line.body) },
  label:      { fontFamily: 'Inter_400Regular',  fontSize: 13 },
  caption:    { fontFamily: 'Inter_400Regular',  fontSize: 11 },
  button:     { fontFamily: 'Inter_600SemiBold', fontSize: 15 },

  // SemiBold counterparts. Without these, emphasis was spliced in by hand as
  // `{ ...type.body, fontFamily: 'Inter_600SemiBold' }` in ~100 places.
  bodySemi:    { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: Math.round(15 * line.body) },
  labelSemi:   { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  captionSemi: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },

  /** The uppercase eyebrow above a section. Previously written four ways, with
   *  letterSpacing drifting between 0.5 / 0.6 / 0.8 / 1.0; AGENTS.md §12 fixes
   *  it at 0.5. Use `SectionHeader` rather than this style directly. */
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
};
