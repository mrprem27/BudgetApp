import React from 'react';

export interface SwitchProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** iOS-style toggle; track turns teal when on. */
export function Switch(props: SwitchProps): JSX.Element;
