import { useCallback, useEffect, useState } from 'react';
import { Linking, Alert } from 'react-native';
import { upiLaunchUrl, newUpiRef, pickDefaultApp, type UpiAppSpec, type UpiRequest, type UpiLaunchOpts } from '../lib/upiIntent';
import { useUpiApps } from './useUpiApps';
import { settings } from '../lib/settings';

/**
 * Handing a payment to a UPI app — the whole decision, in one place.
 *
 * Scan & Pay and settle-up had this copied between them, which is how two things that
 * must behave identically drift while both look right. It also left nowhere to put a
 * preference: choosing your app on every payment is a toll on the one flow whose
 * entire purpose is removing friction, and it is a question with the same answer every
 * time.
 *
 * So: ask once, remember, open straight in afterwards. The preference is re-validated
 * against what is installed on every use — an app can be deleted, and a stale
 * preference must degrade to asking again rather than to opening nothing.
 */
export type PayHooks = {
  /**
   * Runs *before* the app switch and is awaited. Anything started after `openURL`
   * races our own suspension, because that call resolves as the OS takes the
   * foreground away.
   */
  before?: () => Promise<void>;
  /** No app was opened — the user cancelled the picker, or the launch failed. */
  onCancel?: () => Promise<void>;
};

/**
 * What the caller knows about this payment that changes where the app should land.
 *
 * Defined alongside `upiLaunchUrl`, which consumes it, so the hook and the preview sheet
 * describe the same hand-off. `bare` is a signed merchant QR that cannot be re-emitted to
 * anybody; `hasCode` is a physical code in front of the user, which is the only thing that
 * makes an app's scanner a better landing than its home screen — Scan & Pay sets it,
 * settling up with a friend must not.
 */
export type PayOpts = UpiLaunchOpts;

export type UpiHandoff = {
  /**
   * Every installed UPI app; `null` on Android, where the OS draws its own chooser.
   *
   * **All of them, including the ones that refuse a pre-filled payment.** They were briefly
   * filtered out, and hiding them was the wrong fix: a user with PhonePe installed sees it
   * missing and reads that as our bug, and the app is still the one they want to pay from.
   * What actually cost them a rate-limited PIN attempt was sending PhonePe a payment it
   * would reject — so we stop doing *that* and open it instead. Nothing is hidden, and
   * every route records the expense first.
   */
  apps: UpiAppSpec[] | null;
  /**
   * Installed, but only openable — a payment we build gets rejected, so we send none.
   *
   * Still listed and still chooseable; `blocked` now decides *what we send*, not whether
   * the app appears. Opening it is the way round the refusal rather than a consolation:
   * PhonePe and Paytm reject *externally-supplied* intents, while a live camera scan
   * inside their own app is their most-trusted input, subject to no gallery-QR cap and no
   * intent risk scoring. With the shop's code still in front of you, scanning it there
   * completes the payment their refusal blocked.
   *
   * Weaker with no code to scan, i.e. a person-to-person transfer: the payee has to be
   * re-entered by hand, and we cannot even put the handle on the clipboard because no
   * clipboard package is installed.
   */
  blocked: UpiAppSpec[];
  /** Where the next payment goes without asking: the preference, or a lone installed app. */
  target: UpiAppSpec | null;
  /** True when there is a real choice to offer, so a "change app" affordance is worth drawing. */
  canChoose: boolean;
  /**
   * Record and go, to a specific app or (on Android) to the OS chooser.
   *
   * One action for both kinds of app — whether the destination arrives pre-filled is the
   * app's decision, not a different feature: apps that accept our intent get the full URI,
   * apps that reject it get opened, on their scanner where we have a guess at one and the
   * user has a code to point it at (see `PayOpts`). Passing an app other than `target`
   * remembers it as the new default, same as picking one used to through the old picker —
   * so `UpiPayButton`'s grid IS the picker, not a caller of one.
   */
  payWith: (app: UpiAppSpec | null, req: UpiRequest, hooks?: PayHooks, opts?: PayOpts) => Promise<boolean>;
  /**
   * Make `app` the target without paying — the inline picker under the Pay button selects,
   * and the button itself is still the one thing that sends money.
   */
  choose: (app: UpiAppSpec) => void;
  /** Forget the remembered app, so the next payment defaults to popularity order again. */
  forget: () => void;
};

/**
 * What the user does once a blocked app opens, in three words.
 *
 * Exported so the picker row and the destination line under the Pay button cannot say
 * different things about the same hand-off — they did, and the sheet was the one that
 * was wrong.
 */
export function handoffVerb(opts?: PayOpts): string {
  return opts?.hasCode ? 'scan it there' : 'enter it there';
}

export function useUpiHandoff(noAppMessage: string): UpiHandoff {
  const installed = useUpiApps();
  const [preferredKey, setPreferredKey] = useState<string | null>(null);

  useEffect(() => { settings.preferredUpiApp().then(setPreferredKey).catch(() => {}); }, []);

  /**
   * Every installed app is offered. `blocked` decides the payload, never the listing.
   *
   * These were filtered out for one commit, and that traded one confusion for a worse one:
   * PhonePe simply vanishing reads as a bug in our detection, and it is still the app the
   * user wants to pay from. What actually wasted a rate-limited PIN attempt was handing
   * PhonePe a payment it would reject — so we stop building one and open the app instead.
   *
   * The user learns which apps arrive pre-filled by using them, which is a small, honest
   * difference. Every route records the expense before leaving, so none of them can lose it.
   */
  const apps = installed;
  const blocked = installed?.filter(a => !!a.blocked) ?? [];

  // Last-used, else the most popular installed app, else nobody — see `pickDefaultApp`.
  // A single installed app was already this by construction; multiple installed apps
  // used to force a picker on every payment even with none remembered, which is the toll
  // U2 removes.
  const target = pickDefaultApp(apps, preferredKey);
  const canChoose = (apps?.length ?? 0) > 1;

  /**
   * Record, then go — with the payment attached where the app will take it.
   *
   * The whole difference between a working app and a refusing one lives on this line.
   * A blocked app is launched rather than handed a payment; everything else gets the full
   * URI and arrives pre-filled.
   *
   * `before` runs first and is awaited either way: after `openURL` we are racing our own
   * suspension, and losing that race loses the record — which is the one thing that must
   * survive regardless of what the payment app decides.
   */
  const open = useCallback(async (
    req: UpiRequest,
    spec: UpiAppSpec | null,
    hooks?: PayHooks,
    opts?: PayOpts,
  ): Promise<boolean> => {
    // Always minted, never conditionally: whether a `tr` actually goes on the wire is
    // `buildUpiUri`'s call, since only it knows the target app's quirks. Minted here
    // rather than at the call sites so a retry never reuses the previous reference —
    // PSPs read a repeated `tr` as a duplicate of the earlier transaction.
    //
    // Where it lands is `upiLaunchUrl`'s decision, shared with the preview sheet so the
    // two cannot disagree about what an app receives.
    const launch = upiLaunchUrl({ ...req, ref: req.ref ?? newUpiRef() }, spec, opts);
    if (!launch) return false;
    const { url } = launch;
    try { await hooks?.before?.(); } catch { /* record failed; paying is still the point */ }
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      await hooks?.onCancel?.().catch(() => {});
      // `onCancel` has just discarded whatever `before` recorded, so nothing is
      // saved on either route. The old wording promised "the expense is saved
      // either way", which was false for a settle-up — and false precisely when
      // the user was being told to go elsewhere and would not come back to check.
      Alert.alert(
        spec ? `Couldn’t open ${spec.label}` : 'Couldn’t open that app',
        'Try another UPI app, or record it here by hand, nothing has been saved yet.',
      );
      return false;
    }
  }, []);

  /**
   * `UpiPayButton` calls this both for the one-tap default and for a row tapped in its
   * app grid — the grid replaced `ActionSheetIOS`, which drew its own list from the same
   * `apps`/`blocked` this hook already exposes and could never show a real icon anyway.
   *
   * Android has no `app` to pass (`apps` is `null` there) — `open` already handles that,
   * landing on the OS chooser.
   */
  const payWith = useCallback(async (
    app: UpiAppSpec | null,
    req: UpiRequest,
    hooks?: PayHooks,
    opts?: PayOpts,
  ): Promise<boolean> => {
    if (apps !== null && apps.length === 0) { Alert.alert('No UPI app found', noAppMessage); return false; }
    if (app && app.key !== preferredKey) {
      setPreferredKey(app.key);
      settings.setPreferredUpiApp(app.key).catch(() => {});
    }
    return open(req, app, hooks, opts);
  }, [apps, preferredKey, noAppMessage, open]);

  const choose = useCallback((app: UpiAppSpec) => {
    setPreferredKey(app.key);
    settings.setPreferredUpiApp(app.key).catch(() => {});
  }, []);

  const forget = useCallback(() => {
    setPreferredKey(null);
    settings.setPreferredUpiApp(null).catch(() => {});
  }, []);

  return { apps, blocked, target, canChoose, payWith, choose, forget };
}
