import React from 'react';

export interface IconProps {
  /** Feather icon name, e.g. "home", "credit-card", "trending-up". */
  name: string;
  /** Pixel size of the square icon. */
  size?: number;
  /** Stroke color — any CSS color or var(). Defaults to currentColor. */
  color?: string;
  /** Stroke width in px (Feather default 2). */
  strokeWidth?: number;
  style?: React.CSSProperties;
}

/** A single Feather icon rendered inline as SVG. */
export function Icon(props: IconProps): JSX.Element;

export interface IconCircleProps {
  /** Feather icon name. */
  name: string;
  /** Icon + tint color (the circle is this color at ~13% opacity). */
  color?: string;
  /** Circle diameter in px. */
  size?: number;
  /** Override the icon size (defaults to ~45% of the circle). */
  iconSize?: number;
  style?: React.CSSProperties;
}

/** A colored icon circle — the core BudgetSplit motif for categories, rows and empty states. */
export function IconCircle(props: IconCircleProps): JSX.Element;
