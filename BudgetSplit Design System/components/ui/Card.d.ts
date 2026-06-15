import React from 'react';

/**
 * @startingPoint section="Core" subtitle="Grouping card with border & soft shadow" viewport="700x150"
 */
export interface CardProps {
  children?: React.ReactNode;
  /** Apply default 16px padding (default true). Set false for edge-to-edge row lists. */
  padded?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** The container that groups everything in BudgetSplit. bgCard, 1px border, radius-lg, soft shadow. */
export function Card(props: CardProps): JSX.Element;

export interface DividerProps {
  /** Left inset in px (indent the hairline past an icon). */
  inset?: number;
}

/** A 1px hairline divider for between rows inside a card. */
export function Divider(props: DividerProps): JSX.Element;
