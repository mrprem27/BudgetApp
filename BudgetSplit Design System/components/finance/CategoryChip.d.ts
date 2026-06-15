import React from 'react';

export interface CategoryChipProps {
  label: string;
  /** Feather icon name (defaults to "tag"). */
  icon?: string;
  /** Icon color when unselected (the category's own color). */
  color?: string;
  /** Selected fills solid teal with dark text. */
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/** A category pill for pickers & filter bars; solid teal when selected. */
export function CategoryChip(props: CategoryChipProps): JSX.Element;
