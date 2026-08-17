import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getStoredSession, serverConfigured, type ServerSession } from '../lib/serverApi';

/**
 * Who's signed in to the optional server (`server/api`), re-read on focus.
 *
 * Read on focus rather than held in the zustand store: signing in and out
 * happens on exactly one screen, this is not hot on every render, and the store
 * is deliberately kept to `me`/`groups`. `configured` is false in any build
 * without `EXPO_PUBLIC_API_URL` — every caller must hide its account UI then,
 * because there is no server to talk to.
 */
export function useServerSession() {
  const [session, setSession] = useState<ServerSession | null>(null);
  const [ready, setReady] = useState(false);
  const configured = serverConfigured();

  const reload = useCallback(async () => {
    const next = configured ? await getStoredSession() : null;
    setSession(next);
    setReady(true);
  }, [configured]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return { session, ready, configured, reload, setSession };
}
