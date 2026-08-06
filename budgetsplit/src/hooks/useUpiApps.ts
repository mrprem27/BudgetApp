import { useEffect, useState } from 'react';
import { Platform, Linking } from 'react-native';
import { UPI_APPS, type UpiAppSpec } from '../lib/upiIntent';

/**
 * Which UPI apps this phone can hand a payment to.
 *
 * Android returns `null`, meaning "don't draw a picker" — `upi://pay` resolves to
 * every UPI app there and the OS shows its own chooser, which is better than ours
 * and remembers a default. Building one on top would be a worse copy.
 *
 * iOS returns an array of **named** apps, because it has no chooser for custom schemes —
 * every row must be able to say which app it opens. An empty array is a real answer: no
 * UPI app we support is installed, so the caller can say that honestly instead of showing
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
      // **`GENERIC_UPI_APP` is deliberately not offered here.** It is the Android hand-off
      // (see above) and nothing else.
      //
      // As an iOS picker row it was incoherent. "Other UPI app" promises a choice among
      // your remaining apps, but iOS has no chooser for custom schemes: `upi://` resolves
      // to exactly one app, picked by the OS, and which one is undefined when several
      // claim it. So the row could not say where it went — and on a phone where WhatsApp
      // claims `upi://` it routed straight into an app we know refuses every payment,
      // dressed as a fallback.
      //
      // What it was really for — a UPI app outside our twelve, typically a bank's own —
      // it could not deliver either: `upi://` was as likely to land on a listed app. That
      // user is served honestly by "Record it, I'll pay", which promises nothing it cannot
      // do. A row whose destination we cannot name is not a fallback, it is a coin flip.
      const checks = await Promise.all(
        UPI_APPS.map(async a => {
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
