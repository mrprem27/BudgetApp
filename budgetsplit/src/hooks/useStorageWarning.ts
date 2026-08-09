import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { settings } from '../lib/settings';
import { freeBytes } from '../lib/deviceStorage';
import {
  StorageVerdict, storageVerdict, storageAdvice, isWorseThan, type StorageAdvice,
} from '../lib/storage';

/**
 * Whether to warn the user about device storage right now, and what to say.
 *
 * All the thresholds and the copy live in `lib/storage.ts` (pure, tested); the probe lives
 * in `lib/deviceStorage.ts`. This hook is only the *when*: it re-checks on foreground and
 * remembers what has been dismissed.
 *
 * Dismissal is stored as the **tier** that was dismissed, not a boolean, so waving away
 * "running low" doesn't also silence "saving may fail". That's the difference between a
 * warning the user can trust and one they learn to ignore.
 */
export function useStorageWarning(): {
  verdict: StorageVerdict;
  /** Non-null only when there is something worth showing that hasn't been dismissed. */
  advice: StorageAdvice | null;
  dismiss: () => void;
} {
  const [verdict, setVerdict] = useState<StorageVerdict>(StorageVerdict.Ample);
  const [dismissed, setDismissed] = useState<StorageVerdict | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const read = () => { if (alive) setVerdict(storageVerdict(freeBytes())); };

    read();
    settings.storageWarnDismissed()
      .then(v => { if (alive) { setDismissed(asVerdict(v)); setReady(true); } })
      .catch(() => { if (alive) setReady(true); });

    // Free space changes because of things happening *outside* this app — a video
    // download, a photo import — so re-read whenever we come back to the foreground
    // rather than trusting the value from launch.
    const sub = AppState.addEventListener('change', s => { if (s === 'active') read(); });
    return () => { alive = false; sub.remove(); };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(verdict);
    settings.setStorageWarnDismissed(verdict).catch(() => {});
  }, [verdict]);

  // Held back until the dismissal has loaded: showing the banner and then yanking it away
  // a frame later is worse than showing it a frame late.
  const advice = ready && isWorseThan(verdict, dismissed) ? storageAdvice(verdict) : null;

  return { verdict, advice, dismiss };
}

/** Narrow a stored string back to a verdict; anything unrecognised reads as "never dismissed". */
function asVerdict(v: string | null): StorageVerdict | null {
  const all = Object.values(StorageVerdict) as string[];
  return v && all.includes(v) ? (v as StorageVerdict) : null;
}
