import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRefreshOnDataChange } from '../components/system/DataRefreshProvider';

/**
 * Focus-aware cross-screen reload for screens that hand-roll their data loading
 * (i.e. don't use {@link useScreenData}). Drop-in replacement for
 * `useRefreshOnDataChange(load)` on the always-mounted tabs (Home/Groups/Savings).
 *
 * Only reloads on a cross-screen write when this screen is the one the user is
 * *looking at*. A write that happens while the screen is backgrounded is ignored
 * here — the screen's own `useFocusEffect(load)` already reloads it the next time
 * it regains focus. Without this, one write fans out into a full re-query of every
 * mounted tab at once (the refresh() cascade).
 *
 * Requires the screen to still reload on focus (the standard
 * `useFocusEffect(useCallback(() => { load(); }, []))`), which every tab already does.
 */
export function useReloadOnDataChange(load: () => void) {
  const loadRef = useRef(load);
  loadRef.current = load;

  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));

  useRefreshOnDataChange(() => {
    if (focused.current) loadRef.current();
  });
}
