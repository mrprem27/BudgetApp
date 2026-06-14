import React from 'react';
import { Text, TextStyle } from 'react-native';
import { formatRupees } from '../lib/money';
import { type, colors } from './tokens';

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
};

export function AmountText({ paise, size = 'md', style, forceColor }: Props) {
  const color = forceColor
    ? forceColor
    : paise > 0
    ? colors.income
    : paise < 0
    ? colors.expense
    : colors.textPrimary;

  return (
    <Text
      style={[styleMap[size], { color }, style]}
      accessibilityLabel={formatRupees(Math.abs(paise))}
    >
      {formatRupees(paise)}
    </Text>
  );
}
