import React from 'react';

/** Format integer paise → "₹1,23,456.00" (Indian grouping). */
export function formatRupees(paise) {
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Rounded, no paise — for dashboard cards. 150050 → "₹1,501". */
export function formatRupeesShort(paise) {
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}

const SIZE = {
  xl: 'var(--amount-xl-size)',
  lg: 'var(--amount-lg-size)',
  md: 'var(--amount-md-size)',
  sm: 'var(--amount-sm-size)',
};
const SPACING = { xl: '-0.5px', lg: '-0.3px', md: '0', sm: '0' };

/**
 * Money, always in Space Mono. Sign drives the color: positive → income green,
 * negative → expense coral, unless forceColor is given. Pass `rounded` for
 * card/summary contexts (no paise), `showSign` to prefix +/−.
 */
export function AmountText({ paise, size = 'md', forceColor, rounded = false, showSign = false, style }) {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const formatted = rounded ? formatRupeesShort(abs) : formatRupees(abs);
  const color = forceColor ?? (paise === 0 ? 'var(--text-primary)' : negative ? 'var(--expense)' : 'var(--income)');
  const sign = showSign ? (negative ? '−' : '+') : (negative ? '−' : '');
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: SIZE[size],
        letterSpacing: SPACING[size],
        color,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {sign}{formatted}
    </span>
  );
}
