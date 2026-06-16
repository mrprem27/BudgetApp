import React from 'react';

export interface AmountTextProps {
  /** Amount in integer paise (1 rupee = 100 paise). Money is never a float. */
  paise: number;
  /** xl (36px hero) · lg (24px) · md (18px) · sm (14px). */
  size?: 'xl' | 'lg' | 'md' | 'sm';
  /** Override the sign-based color (e.g. var(--text-primary) for a neutral total). */
  forceColor?: string;
  /** Drop the paise — for dashboard cards & summaries. */
  rounded?: boolean;
  /** Always prefix + / − (default only shows − for negatives). */
  showSign?: boolean;
  style?: React.CSSProperties;
}

/** Money rendered in Space Mono. Sign drives color: green income, coral expense. */
export function AmountText(props: AmountTextProps): JSX.Element;

/** "₹1,23,456.00" — full Indian-grouped rupees from integer paise. */
export function formatRupees(paise: number): string;
/** "₹1,501" — rounded rupees, no paise. */
export function formatRupeesShort(paise: number): string;
