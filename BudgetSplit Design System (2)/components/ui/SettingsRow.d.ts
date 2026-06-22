import React from 'react';

export interface SettingsRowProps {
  /** Leading Feather icon name (rendered in a tinted circle). */
  icon: string;
  label: string;
  /** Right-aligned value text. */
  value?: string;
  /** Icon circle tint (defaults to accent). */
  tint?: string;
  onClick?: () => void;
  /** Force-show or hide the chevron (defaults to shown when onClick set). */
  chevron?: boolean;
  /** Custom right-side node (e.g. a Switch) — overrides value/chevron. */
  right?: React.ReactNode;
  /** Render in destructive (coral) treatment. */
  danger?: boolean;
  style?: React.CSSProperties;
}

/** A settings-style row: icon circle + label + value/chevron. Group inside a Card. */
export function SettingsRow(props: SettingsRowProps): JSX.Element;
