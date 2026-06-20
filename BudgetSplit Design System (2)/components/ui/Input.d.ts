import React from 'react';

export interface InputProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** Optional leading Feather icon. */
  icon?: string;
  /** "text" (default) or "amount" — amount right-aligns in Space Mono. */
  type?: 'text' | 'amount';
  /** A fixed prefix shown before the value, e.g. "₹". */
  prefix?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Text input on the bgInput surface; teal border on focus. Use type="amount" for money entry. */
export function Input(props: InputProps): JSX.Element;
