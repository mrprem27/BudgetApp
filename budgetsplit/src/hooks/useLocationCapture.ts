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
    (async () => {
      const on = await settings.saveLocation();
      setLocEnabled(on);
      if (on) await capture();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  return { place, setPlace, locEnabled, capturing, capture };
}
