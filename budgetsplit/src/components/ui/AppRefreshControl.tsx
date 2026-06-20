import React, { useState, useCallback } from 'react';
import { RefreshControl } from 'react-native';
import { colors } from '../tokens';

/**
 * The single pull-to-refresh control used across the app, themed with the accent
 * spinner on a card background (consistent on iOS + Android). Pair with
 * {@link useRefresh}.
 */
export function AppRefreshControl({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accent}
      colors={[colors.accent]}
      progressBackgroundColor={colors.bgCard}
    />
  );
}

/** Wraps a `load()` with the refreshing state needed by {@link AppRefreshControl}. */
export function useRefresh(load: () => Promise<void> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);
  return { refreshing, onRefresh };
}
