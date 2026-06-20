import React from 'react';

export interface MemberAvatarProps {
  /** Person's name — initials are derived from the first two words. */
  name: string;
  /** Circle fill; omit to derive a stable color from the name. */
  color?: string;
  /** Diameter in px (default 40). */
  size?: number;
  /** White ring when selected. */
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** Initials avatar in a solid color circle. */
export function MemberAvatar(props: MemberAvatarProps): JSX.Element;

/** Deterministic avatar color from a name (from the BudgetSplit palette). */
export function avatarColor(name: string): string;
