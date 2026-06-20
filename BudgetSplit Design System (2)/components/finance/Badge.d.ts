import React from 'react';

export interface BadgeProps {
  label: string;
  /** Optional leading Feather icon. */
  icon?: string;
  /** Color family for the pill. */
  tone?: 'neutral' | 'accent' | 'income' | 'expense' | 'amber' | 'settle';
  style?: React.CSSProperties;
}

/** A small status pill ("2 over budget", "near limit") with a tinted background. */
export function Badge(props: BadgeProps): JSX.Element;
