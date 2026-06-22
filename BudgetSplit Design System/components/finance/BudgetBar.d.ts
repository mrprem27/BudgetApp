import React from 'react';

export interface BudgetBarProps {
  /** Percent used 0–100 (clamped). null renders an empty track. */
  pct: number | null;
  /** Drives the fill color. */
  health?: 'green' | 'amber' | 'red' | 'none';
  /** Track height in px (default 6). */
  height?: number;
  style?: React.CSSProperties;
}

/** Animated budget progress bar; fill color reflects spend health. */
export function BudgetBar(props: BudgetBarProps): JSX.Element;
