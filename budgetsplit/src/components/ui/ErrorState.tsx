import React from 'react';
import { colors } from '../tokens';
import { EmptyState } from './EmptyState';

type Props = {
  /** Optional override copy. */
  title?: string;
  body?: string;
  /** Retry handler — renders a "Try again" button when provided. */
  onRetry?: () => void;
  retryLabel?: string;
};

/**
 * Shown in place of content when a load fails. Same layout as EmptyState but with
 * error styling and a Retry affordance, so every screen surfaces failures the
 * same way (per the decided error-UX pattern) instead of hanging on a loader or
 * masking the failure as an empty state.
 */
export function ErrorState({
  title = "Couldn't load this",
  body = 'Something went wrong. Check your connection to your data and try again.',
  onRetry,
  retryLabel = 'Try again',
}: Props) {
  return (
    <EmptyState
      icon="alert-triangle"
      tint={colors.expense}
      title={title}
      body={body}
      actionLabel={onRetry ? retryLabel : undefined}
      onAction={onRetry}
    />
  );
}
