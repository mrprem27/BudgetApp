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
};
