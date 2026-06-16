import React from 'react';
import { Text, TextStyle } from 'react-native';
import { formatRupees, formatRupeesShort, formatCompact } from '../../lib/money';
import { type, colors } from '../tokens';

type Size = 'xl' | 'lg' | 'md' | 'sm';

const styleMap: Record<Size, TextStyle> = {
  xl: type.amountXL,
  lg: type.amountLG,
  md: type.amountMD,
  sm: type.amountSM,
};

type Props = {
  paise: number;
  size?: Size;
  style?: TextStyle;
  forceColor?: string;
  /**
   * Shrink to fit one line. Off by default so an amount keeps a stable size
   * regardless of sign or digit count (otherwise the same field visibly
   * resizes when it goes negative or grows).
   */
  fit?: boolean;
  /** Drop the paise/decimals — for dashboard cards and summaries. */
  rounded?: boolean;
  /**
   * Abbreviate large amounts (₹1.2L / $3.4M) so they never overflow on tight
   * surfaces like dashboard tiles and legends. Takes precedence over `rounded`.
   */
  compact?: boolean;
};

export function AmountText({ paise, size = 'md', style, forceColor, fit = false, rounded = false, compact = false }: Props) {
  const color = forceColor
    ? forceColor
    : paise > 0
    ? colors.income
    : paise < 0
    ? colors.expense
    : colors.textPrimary;

  // Screen readers always announce the exact amount, even when shown compact.
  const fullText = formatRupees(paise);
  const text = compact ? formatCompact(paise) : rounded ? formatRupeesShort(paise) : fullText;

  return (
    <Text
      style={[styleMap[size], { color }, style]}
      numberOfLines={1}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.6 : undefined}
      accessibilityLabel={fullText}
    >
      {text}
    </Text>
  );
}
