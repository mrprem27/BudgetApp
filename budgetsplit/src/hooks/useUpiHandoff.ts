import { useCallback, useEffect, useState } from 'react';
import { Linking, Alert, ActionSheetIOS } from 'react-native';
import { buildUpiUri, newUpiRef, type UpiApp, type UpiAppSpec, type UpiRequest } from '../lib/upiIntent';
import { useUpiApps } from './useUpiApps';
import { settings } from '../lib/settings';
import { formatRupees } from '../lib/money';

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

/** What the caller knows about this payment that changes where the app should land. */
export type PayOpts = {
  /**
   * Send no payment parameters to *any* app, however well it behaves.
   *
   * For a signed merchant QR: it cannot be re-emitted to anybody, so pre-filling is not
   * on offer and the honest thing is to open the app for the user to scan the code again.
   */
  bare?: boolean;
  /**
   * The user has a physical QR code in front of them.
   *
   * The only thing that makes opening an app on its *scanner* better than its home screen.
   * Scan & Pay sets it; settling up with a friend must not, because there would be nothing
   * to point the camera at and a camera is a worse landing than a home screen.
   */
  hasCode?: boolean;
};

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
  /** The remembered app — only when it is set *and* still installed. */
  preferred: UpiAppSpec | null;
  /** Where the next payment goes without asking: the preference, or a lone installed app. */
  target: UpiAppSpec | null;
  /** True when there is a real choice to offer, so a "change app" affordance is worth drawing. */
  canChoose: boolean;
  /**
   * Record and go, asking which app only when there is a choice and nothing is remembered.
   *
   * One action for both kinds of app. Whether the destination arrives pre-filled is the
   * app's decision, not a different feature: apps that accept our intent get the full URI,
   * apps that reject it get opened — on their scanner where we have a guess at one and the
   * user has a code to point it at. See `PayOpts`.
   */
  pay: (req: UpiRequest, hooks?: PayHooks, opts?: PayOpts) => Promise<boolean>;
  /** Ask again even when one is remembered, and remember the new answer. */
  choose: (req: UpiRequest, hooks?: PayHooks, opts?: PayOpts) => Promise<boolean>;
  /** Forget the remembered app, so the next payment asks again. */
  forget: () => void;
};

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

  // Resolved against `apps` rather than trusted alone — this is the uninstall case.
  const preferred = apps?.find(a => a.key === preferredKey) ?? null;
  const target = preferred ?? (apps?.length === 1 ? apps[0] : null);
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
    // `scanPath` only when there is genuinely a code in front of the user. Dropping
    // someone into a camera to settle up with a friend would be worse than the home
    // screen, not better — there is nothing there to point it at.
    const url = opts?.bare || spec?.blocked
      ? ((opts?.hasCode ? spec?.scanPath : undefined) ?? spec?.probe ?? null)
      : buildUpiUri({ ...req, ref: req.ref ?? newUpiRef() }, spec?.key);
    if (!url) return false;
    try { await hooks?.before?.(); } catch { /* record failed; paying is still the point */ }
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      await hooks?.onCancel?.().catch(() => {});
      Alert.alert(
        spec ? `Couldn’t open ${spec.label}` : 'Couldn’t open that app',
        'Try another UPI app — the expense is saved either way.',
      );
      return false;
    }
  }, []);

  /** The picker, as a promise — so callers can close their own UI only once it resolves. */
  const ask = useCallback((
    req: UpiRequest,
    list: UpiAppSpec[],
    hooks?: PayHooks,
    opts?: PayOpts,
  ): Promise<boolean> => new Promise(resolve => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        // Every installed app, with a word on the ones that won't arrive pre-filled.
        // Not a warning — it opens and the payment still works, you just type it there —
        // so it reads as a description rather than a reason to avoid the row.
        options: ['Cancel', ...list.map(a => (opts?.bare || a.blocked ? `${a.label} — enter it there` : a.label))],
        cancelButtonIndex: 0,
        title: `Pay ${formatRupees(req.amountPaise)}`,
        message: 'We’ll save the expense either way, and use this app next time.',
      },
      i => {
        if (i <= 0) { hooks?.onCancel?.().catch(() => {}); resolve(false); return; }
        const app = list[i - 1];
        setPreferredKey(app.key);
        settings.setPreferredUpiApp(app.key).catch(() => {});
        open(req, app, hooks, opts).then(resolve);
      },
    );
  }), [open]);

  const pay = useCallback(async (req: UpiRequest, hooks?: PayHooks, opts?: PayOpts): Promise<boolean> => {
    // Android: `upi://` reaches the OS chooser, which is complete and keeps its own
    // default. Ours would be a worse copy of something already better.
    if (apps === null) return open(req, null, hooks, opts);
    if (apps.length === 0) { Alert.alert('No UPI app found', noAppMessage); return false; }
    if (target) return open(req, target, hooks, opts);
    return ask(req, apps, hooks, opts);
  }, [apps, target, noAppMessage, open, ask]);

  const choose = useCallback(async (req: UpiRequest, hooks?: PayHooks, opts?: PayOpts): Promise<boolean> => {
    if (apps === null) return open(req, null, hooks, opts);
    if (apps.length === 0) { Alert.alert('No UPI app found', noAppMessage); return false; }
    return ask(req, apps, hooks, opts);
  }, [apps, noAppMessage, open, ask]);

  const forget = useCallback(() => {
    setPreferredKey(null);
    settings.setPreferredUpiApp(null).catch(() => {});
  }, []);

  return { apps, blocked, preferred, target, canChoose, pay, choose, forget };
}
