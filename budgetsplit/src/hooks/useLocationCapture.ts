import { useState, useEffect } from 'react';
import { settings } from '../lib/settings';
import { getCurrentPlace, type CapturedPlace } from '../lib/location';

/**
 * Location tagging for the Add flow: on open (new txn only), if the user has it
 * enabled, capture the current place so it can be shown/cleared before saving.
 */
export function useLocationCapture(isEditing: boolean) {
  const [place, setPlace] = useState<CapturedPlace | null>(null);
  const [locEnabled, setLocEnabled] = useState(false);
  const [capturing, setCapturing] = useState(false);

  async function capture() {
    setCapturing(true);
    try { setPlace(await getCurrentPlace()); } finally { setCapturing(false); }
  }

  useEffect(() => {
    if (isEditing) return;
    // GPS takes seconds, and backing straight out of Add is normal — so the
    // awaits here routinely resolve after this hook is gone. Same `alive` guard
    // `ScanPaySheet` and `FeatureFlagsProvider` already use.
    let alive = true;
    (async () => {
      const on = await settings.saveLocation();
      if (!alive) return;
      setLocEnabled(on);
      if (!on) return;
      setCapturing(true);
      try {
        const p = await getCurrentPlace();
        if (alive) setPlace(p);
      } finally {
        if (alive) setCapturing(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  return { place, setPlace, locEnabled, capturing, capture };
}
