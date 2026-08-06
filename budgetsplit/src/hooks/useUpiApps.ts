import { useEffect, useState } from 'react';
import { Platform, Linking } from 'react-native';
import { UPI_APPS, GENERIC_UPI_APP, type UpiAppSpec } from '../lib/upiIntent';

/**
 * Which UPI apps this phone can hand a payment to.
 *
 * Android returns `null`, meaning "don't draw a picker" — `upi://pay` resolves to
 * every UPI app there and the OS shows its own chooser, which is better than ours
 * and remembers a default. Building one on top would be a worse copy.
 *
 * iOS returns an array, because it has no chooser for custom schemes and the
 * generic `upi://` may resolve to nothing at all. An empty array is a real answer:
 * no UPI app is installed, so the caller can say that honestly instead of showing
 * a button that dead-ends.
 *
 * `canOpenURL` on iOS only ever answers for schemes declared in
 * `LSApplicationQueriesSchemes` (see app.json) — an undeclared scheme reads as
 * "not installed", which is why adding an app here means adding it there too.
 */
export function useUpiApps(): UpiAppSpec[] | null {
  const [apps, setApps] = useState<UpiAppSpec[] | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    (async () => {
      // Generic goes last: it opens whichever app iOS decides claims `upi://`, which is
      // undefined when several do. A named app is always the better answer when we have
      // one, so this is the fallback row, never the first suggestion.
      const checks = await Promise.all(
        [...UPI_APPS, GENERIC_UPI_APP].map(async a => {
          // A throw here means "can't tell", which we treat as absent: showing a
          // row that dead-ends is worse than omitting one that might have worked.
          try { return (await Linking.canOpenURL(a.probe)) ? a : null; } catch { return null; }
        }),
      );
      if (alive) setApps(checks.filter((a): a is UpiAppSpec => a !== null));
    })();
    return () => { alive = false; };
  }, []);

  return Platform.OS === 'ios' ? (apps ?? []) : null;
}
