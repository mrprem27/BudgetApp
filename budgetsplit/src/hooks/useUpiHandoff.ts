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

export type UpiHandoff = {
  /**
   * Apps that are installed **and** will accept a payment we started; `null` on Android,
   * where the OS draws its own chooser.
   *
   * Blocked apps are absent. Offering an app that refuses every payment is not a choice,
   * it is a trap that costs a rate-limited UPI PIN attempt to discover.
   */
  apps: UpiAppSpec[] | null;
  /** Installed but refusing, with the reason. Named where it helps, never offered. */
  blocked: UpiAppSpec[];
  /** The remembered app — only when it is set *and* still installed. */
  preferred: UpiAppSpec | null;
  /** Where the next payment goes without asking: the preference, or a lone installed app. */
  target: UpiAppSpec | null;
  /** True when there is a real choice to offer, so a "change app" affordance is worth drawing. */
  canChoose: boolean;
  /** Hand off, asking only when there is a choice and nothing is remembered. */
  pay: (req: UpiRequest, hooks?: PayHooks) => Promise<boolean>;
  /** Ask again even when one is remembered, and remember the new answer. */
  choose: (req: UpiRequest, hooks?: PayHooks) => Promise<boolean>;
  /** Forget the remembered app, so the next payment asks again. */
  forget: () => void;
};

export function useUpiHandoff(noAppMessage: string): UpiHandoff {
  const installed = useUpiApps();
  const [preferredKey, setPreferredKey] = useState<string | null>(null);

  useEffect(() => { settings.preferredUpiApp().then(setPreferredKey).catch(() => {}); }, []);

  /**
   * Blocked apps are removed from every decision below, not merely labelled.
   *
   * PhonePe, Paytm, Amazon Pay and WhatsApp each refuse every payment we start — proven
   * across path, `mode`, `tr`, `pn` and finally withholding `am` so the payer typed the
   * amount in the app itself. Listing them was costing a real UPI PIN attempt per
   * discovery, of a supply NPCI rate-limits per day, and leaving the user unsure whether
   * they had been debited.
   *
   * `blocked` is still surfaced by name where its absence would otherwise read as a bug —
   * a user with PhonePe installed deserves to know why it is missing rather than assume we
   * failed to find it.
   */
  const apps = installed?.filter(a => !a.blocked) ?? null;
  const blocked = installed?.filter(a => !!a.blocked) ?? [];

  // Resolved against `apps` rather than trusted alone — this covers both an uninstall and
  // a preference remembered before that app was known to refuse us.
  const preferred = apps?.find(a => a.key === preferredKey) ?? null;
  const target = preferred ?? (apps?.length === 1 ? apps[0] : null);
  const canChoose = (apps?.length ?? 0) > 1;

  /** One sentence explaining an absence, or nothing to explain. Plural-correct. */
  const blockedNote = blocked.length === 0 ? null : (() => {
    const names = blocked.map(a => a.label);
    const list = names.length === 1 ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return names.length === 1
      ? `${list} isn’t listed — it refuses payments started in another app.`
      : `${list} aren’t listed — they refuse payments started in another app.`;
  })();

  const open = useCallback(async (
    req: UpiRequest,
    app: UpiApp | undefined,
    hooks?: PayHooks,
  ): Promise<boolean> => {
    // Always minted, never conditionally: whether a `tr` actually goes on the wire is
    // `buildUpiUri`'s call, since only it knows the target app's quirks. Minted here
    // rather than at the call sites so a retry never reuses the previous reference —
    // PSPs read a repeated `tr` as a duplicate of the earlier transaction.
    const uri = buildUpiUri({ ...req, ref: req.ref ?? newUpiRef() }, app);
    if (!uri) return false;
    try { await hooks?.before?.(); } catch { /* record failed; paying is still the point */ }
    try {
      await Linking.openURL(uri);
      return true;
    } catch {
      await hooks?.onCancel?.().catch(() => {});
      Alert.alert('Couldn’t open that app', 'Try another UPI app, or record this payment yourself.');
      return false;
    }
  }, []);

  /** The picker, as a promise — so callers can close their own UI only once it resolves. */
  const ask = useCallback((
    req: UpiRequest,
    list: UpiAppSpec[],
    hooks?: PayHooks,
  ): Promise<boolean> => new Promise(resolve => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', ...list.map(a => a.label)],
        cancelButtonIndex: 0,
        title: `Pay ${formatRupees(req.amountPaise)}`,
        // Naming the absences matters: a user who has PhonePe and does not see it will read
        // that as us failing to find it, and go looking for the bug.
        message: blockedNote
          ? `We’ll use this app next time. ${blockedNote}`
          : 'We’ll use this app next time — you can change it before paying.',
      },
      i => {
        if (i <= 0) { hooks?.onCancel?.().catch(() => {}); resolve(false); return; }
        const app = list[i - 1];
        setPreferredKey(app.key);
        settings.setPreferredUpiApp(app.key).catch(() => {});
        open(req, app.key, hooks).then(resolve);
      },
    );
  }), [open, blockedNote]);

  /**
   * Nothing left to offer — but *why* decides what to say.
   *
   * Filtering created a second empty case: apps are installed, they are simply all ones
   * that refuse us. Telling that user "no UPI app found" would be false, and they would go
   * looking for a detection bug that isn't there. Name what was skipped and point at the
   * one route that always works.
   */
  const reportNothingToOpen = useCallback(() => {
    if (blockedNote) {
      Alert.alert('Can’t open a UPI app for this', `${blockedNote}\n\nUse “Record it, I’ll pay” — the expense is still saved and split.`);
    } else {
      Alert.alert('No UPI app found', noAppMessage);
    }
    return false;
  }, [blockedNote, noAppMessage]);

  const pay = useCallback(async (req: UpiRequest, hooks?: PayHooks): Promise<boolean> => {
    // Android: `upi://` reaches the OS chooser, which is complete and keeps its own
    // default. Ours would be a worse copy of something already better.
    if (apps === null) return open(req, undefined, hooks);
    if (apps.length === 0) return reportNothingToOpen();
    if (target) return open(req, target.key, hooks);
    return ask(req, apps, hooks);
  }, [apps, target, open, ask, reportNothingToOpen]);

  const choose = useCallback(async (req: UpiRequest, hooks?: PayHooks): Promise<boolean> => {
    if (apps === null) return open(req, undefined, hooks);
    if (apps.length === 0) return reportNothingToOpen();
    return ask(req, apps, hooks);
  }, [apps, open, ask, reportNothingToOpen]);

  const forget = useCallback(() => {
    setPreferredKey(null);
    settings.setPreferredUpiApp(null).catch(() => {});
  }, []);

  return { apps, blocked, preferred, target, canChoose, pay, choose, forget };
}
