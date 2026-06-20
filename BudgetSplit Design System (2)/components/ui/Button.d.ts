import React from 'react';

/**
 * @startingPoint section="Core" subtitle="Primary, secondary, ghost & destructive button" viewport="700x140"
 */
export interface ButtonProps {
  /** Button text (or use children). */
  label?: string;
  children?: React.ReactNode;
  /**
   * primary — teal gradient fill, white text (the main CTA).
   * secondary — 1px accent border, accent text.
   * ghost — accent text only, no fill or border.
   * destructive — coral fill for delete/remove.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  /** lg = 52px (default), md = 44px, sm = 36px. */
  size?: 'lg' | 'md' | 'sm';
  /** Optional leading Feather icon name. */
  icon?: string;
  disabled?: boolean;
  /** Shows a loading indicator and blocks presses. */
  loading?: boolean;
  /** Stretch to fill the container width. */
  fullWidth?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** The BudgetSplit button. Use `primary` for the single main action on a screen. */
export function Button(props: ButtonProps): JSX.Element;
