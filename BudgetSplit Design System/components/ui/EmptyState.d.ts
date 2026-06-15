import React from 'react';

/**
 * @startingPoint section="Core" subtitle="Icon-circle empty state with CTA" viewport="700x300"
 */
export interface EmptyStateProps {
  /** Feather icon shown in the 64px circle. */
  icon: string;
  title: string;
  /** 1–2 line explanation. */
  body?: string;
  /** Optional CTA label — renders a primary Button. */
  actionLabel?: string;
  onAction?: () => void;
  /** Icon + circle tint (defaults to accent). */
  tint?: string;
  style?: React.CSSProperties;
}

/** The mandatory empty-state layout: icon circle → title → body → optional CTA. */
export function EmptyState(props: EmptyStateProps): JSX.Element;
