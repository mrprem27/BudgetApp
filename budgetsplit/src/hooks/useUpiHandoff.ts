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
  /** Installed apps on iOS; `null` on Android, where the OS draws its own chooser. */
  apps: UpiAppSpec[] | null;
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
  const apps = useUpiApps();
  const [preferredKey, setPreferredKey] = useState<string | null>(null);

  useEffect(() => { settings.preferredUpiApp().then(setPreferredKey).catch(() => {}); }, []);

  // Resolved against `apps` rather than trusted alone — this is the uninstall case.
  const preferred = apps?.find(a => a.key === preferredKey) ?? null;
  const target = preferred ?? (apps?.length === 1 ? apps[0] : null);
  const canChoose = (apps?.length ?? 0) > 1;

  const open = useCallback(async (
    req: UpiRequest,
    app: UpiApp | undefined,
    hooks?: PayHooks,
  ): Promise<boolean> => {
    // Minted per attempt, here rather than at the call sites, so Scan & Pay and
    // settle-up both get one and a retry never reuses the previous reference — PSPs
    // read a repeated `tr` as a duplicate of the earlier transaction.
    const uri = buildUpiUri({ ref: newUpiRef(), ...req }, app);
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
        message: 'We’ll use this app next time — you can change it before paying.',
      },
      i => {
        if (i <= 0) { hooks?.onCancel?.().catch(() => {}); resolve(false); return; }
        const app = list[i - 1];
        setPreferredKey(app.key);
        settings.setPreferredUpiApp(app.key).catch(() => {});
        open(req, app.key, hooks).then(resolve);
      },
    );
  }), [open]);

  const pay = useCallback(async (req: UpiRequest, hooks?: PayHooks): Promise<boolean> => {
    // Android: `upi://` reaches the OS chooser, which is complete and keeps its own
    // default. Ours would be a worse copy of something already better.
    if (apps === null) return open(req, undefined, hooks);
    if (apps.length === 0) { Alert.alert('No UPI app found', noAppMessage); return false; }
    if (target) return open(req, target.key, hooks);
    return ask(req, apps, hooks);
  }, [apps, target, noAppMessage, open, ask]);

  const choose = useCallback(async (req: UpiRequest, hooks?: PayHooks): Promise<boolean> => {
    if (apps === null) return open(req, undefined, hooks);
    if (apps.length === 0) { Alert.alert('No UPI app found', noAppMessage); return false; }
    return ask(req, apps, hooks);
  }, [apps, noAppMessage, open, ask]);

  const forget = useCallback(() => {
    setPreferredKey(null);
    settings.setPreferredUpiApp(null).catch(() => {});
  }, []);

  return { apps, preferred, target, canChoose, pay, choose, forget };
}
