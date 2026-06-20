import React from 'react';

/**
 * @startingPoint section="Finance" subtitle="Transaction list row with category & amount" viewport="700x80"
 */
export interface TransactionRowProps {
  /** Category name shown as the primary label. */
  category: string;
  /** Optional secondary note line. */
  note?: string;
  /** Category Feather icon (used for expenses). */
  icon?: string;
  /** Category color (used for expenses). */
  color?: string;
  /** Amount in integer paise; sign drives the color. */
  paise: number;
  /** expense (category visual) · income (green) · settlement (purple). */
  kind?: 'expense' | 'income' | 'settlement';
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** A transaction list row: category icon circle + name/note + signed amount. Min 64px tall. */
export function TransactionRow(props: TransactionRowProps): JSX.Element;
