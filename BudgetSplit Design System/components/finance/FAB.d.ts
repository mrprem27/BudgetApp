import React from 'react';

export interface FABProps {
  /** Feather icon (default "plus"). */
  icon?: string;
  onClick?: () => void;
  /** Override positioning (default bottom-right, absolute). */
  style?: React.CSSProperties;
}

/** Floating action button — teal→coral gradient with a coral glow. Opens the add menu. */
export function FAB(props: FABProps): JSX.Element;
