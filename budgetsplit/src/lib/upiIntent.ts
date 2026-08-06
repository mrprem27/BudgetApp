/**
 * UPI intent handoff — build a `upi://pay?…` URI for the OS to hand to the user's
 * own UPI app, pre-filled.
 *
 * Why this is allowed under the no-backend, no-licence rules: the money moves
 * peer-to-peer between the two users' own bank accounts. This app never touches
 * funds, holds no float and is not a party to the transfer — so it is not the
 * payment-intermediary case that needs a PA/PG licence. Nothing leaves the device
 * except a URI the OS consumes locally.
 */

/**
 * A VPA looks like `name@bank`. Deliberately permissive — handle rules vary by
 * PSP, and rejecting a real user's VPA is far worse than passing a typo through
 * to their UPI app, which validates properly anyway.
 */
const VPA_RE = /^[a-zA-Z0-9.\-_]{1,256}@[a-zA-Z]{2,64}$/;

export function isValidVpa(vpa: string): boolean {
  return VPA_RE.test(vpa.trim());
}

/**
 * Where a UPI request can be sent.
 *
 * `Generic` is the NPCI-standard `upi://pay`. On **Android** that is all we ever
 * need: the OS resolves it to every UPI-capable app and shows its own chooser,
 * which is a better picker than anything we could draw, and it remembers a
 * default. Android is done.
 *
 * **iOS has no chooser for custom URL schemes at all.** If two apps register the
 * same scheme, which one wins is undefined by Apple — it is not a user choice and
 * not stable. Worse, the Indian UPI apps on iOS largely register their own scheme
 * rather than claiming the generic one, so `upi://` may resolve to nothing even
 * with four UPI apps installed. Hence the per-app entries: on iOS we probe which
 * are actually installed and draw the picker ourselves.
 *
 * ⚠️ These scheme strings are published by each app and DO shift between releases.
 * They are unverified on a physical device — `canOpenURL` failing for one is a
 * silent "not installed", so a stale entry degrades to a missing row, never a
 * crash. Re-check them when a handoff is reported broken.
 */
export enum UpiApp {
  Generic = 'generic',
  GooglePay = 'gpay',
  PhonePe = 'phonepe',
  Paytm = 'paytm',
  Bhim = 'bhim',
}

export type UpiAppSpec = {
  key: UpiApp;
  label: string;
  /** Scheme + path the payment params hang off. */
  prefix: string;
  /** Bare scheme, for a `canOpenURL` installed-check. */
  probe: string;
};

/**
 * Order is deliberate — it is the order the picker shows, roughly by Indian UPI
 * market share, so the most likely choice needs the least thought.
 */
export const UPI_APPS: UpiAppSpec[] = [
  { key: UpiApp.PhonePe, label: 'PhonePe', prefix: 'phonepe://pay', probe: 'phonepe://' },
  { key: UpiApp.GooglePay, label: 'Google Pay', prefix: 'tez://upi/pay', probe: 'tez://' },
  { key: UpiApp.Paytm, label: 'Paytm', prefix: 'paytmmp://pay', probe: 'paytmmp://' },
  { key: UpiApp.Bhim, label: 'BHIM', prefix: 'bhim://pay', probe: 'bhim://' },
];

/**
 * The escape hatch, and the reason the list above doesn't have to be complete.
 *
 * India has dozens of UPI apps — CRED, Amazon Pay, WhatsApp, Navi, Fi, Slice — and any
 * enumeration of them is out of date immediately. Worse, guessing an app's deep-link
 * *path* fails in the expensive direction: an unknown scheme merely looks uninstalled,
 * but a wrong path opens the app to its home screen having silently dropped the payee
 * and amount, which is precisely the typing this feature exists to remove.
 *
 * `upi://pay` is the NPCI standard, so any conforming app can claim it and receives
 * the parameters properly. Offering it as one more row costs nothing when no app
 * claims it (it simply doesn't appear) and covers every app we never listed when one
 * does. Which app iOS picks is undefined where several claim it — acceptable for a
 * clearly-labelled "other", not acceptable as the only route, which is why the named
 * entries above still exist.
 */
export const GENERIC_UPI_APP: UpiAppSpec = {
  key: UpiApp.Generic,
  label: 'Other UPI app',
  prefix: 'upi://pay',
  probe: 'upi://',
};

const PREFIX: Record<UpiApp, string> = {
  [UpiApp.Generic]: 'upi://pay',
  [UpiApp.PhonePe]: 'phonepe://pay',
  [UpiApp.GooglePay]: 'tez://upi/pay',
  [UpiApp.Paytm]: 'paytmmp://pay',
  [UpiApp.Bhim]: 'bhim://pay',
};

export type ScannedUpi = { vpa: string; name?: string };

/**
 * Pull a VPA (and payee name, if present) out of a scanned UPI QR code.
 *
 * A person's UPI QR *is* a `upi://pay?pa=…&pn=…` URI — the same shape this file
 * builds — so reading one gives both the handle and their name, and typing
 * `name@okhdfcbank` off someone else's phone screen stops being the way in.
 *
 * Accepted: a `upi://pay?…` URI (or any app's scheme, since the parameters are
 * identical), and a bare VPA, which a few apps encode instead.
 *
 * **Not** accepted: EMV/BharatQR merchant codes, which are a TLV binary format
 * rather than a URI. Those are for paying shops, and half-parsing one risks
 * extracting a wrong payee — the one error that must not happen when the next step
 * is sending money. `null` means "let them type it".
 */
export function parseUpiQr(raw: string): ScannedUpi | null {
  const data = raw.trim();
  if (!data) return null;

  const q = data.indexOf('?');
  if (q >= 0 && /^[a-z]+:\/\//i.test(data)) {
    const params = new URLSearchParams(data.slice(q + 1));
    const vpa = (params.get('pa') ?? '').trim();
    if (!isValidVpa(vpa)) return null;
    const name = (params.get('pn') ?? '').trim();
    return name ? { vpa, name } : { vpa };
  }

  return isValidVpa(data) ? { vpa: data } : null;
}

export type UpiRequest = {
  /** Payee VPA (`pa`). */
  vpa: string;
  /** Payee display name (`pn`). */
  name: string;
  /** Amount in integer paise — converted to rupees at this boundary only. */
  amountPaise: number;
  /** Optional note (`tn`). */
  note?: string;
};

/**
 * `null` when the request can't produce a payable URI (bad VPA, non-positive
 * amount) — callers should hide the action rather than open a broken sheet.
 *
 * Money is integer paise everywhere internally; the UPI spec wants rupees with two
 * decimals, so the conversion happens here and nowhere else.
 */
export function buildUpiUri(req: UpiRequest, app: UpiApp = UpiApp.Generic): string | null {
  const vpa = req.vpa.trim();
  if (!isValidVpa(vpa)) return null;
  if (!Number.isFinite(req.amountPaise) || req.amountPaise <= 0) return null;

  const rupees = (Math.round(req.amountPaise) / 100).toFixed(2);
  const params: Array<[string, string]> = [
    ['pa', vpa],
    ['pn', req.name.trim() || 'Payee'],
    ['am', rupees],
    ['cu', 'INR'],
  ];
  if (req.note?.trim()) params.push(['tn', req.note.trim()]);

  // Every app takes the same NPCI parameter set; only the scheme and path differ.
  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${PREFIX[app]}?${qs}`;
}

export type ScanTarget = ScannedUpi & {
  /** Amount the code fixes, in paise. Absent on open-amount and personal codes. */
  amountPaise?: number;
  kind: 'person' | 'merchant';
};

/**
 * Any payable UPI QR — a person's `upi://` code or a shop's EMV/BharatQR.
 *
 * Deliberately separate from `parseUpiQr`, which stays strict. The two callers want
 * genuinely different answers: **adding a friend** must reject a merchant code (you
 * cannot settle up with a shop, and storing its VPA on a contact would be wrong),
 * while **Scan & Pay** accepts both. One permissive parser used by both would quietly
 * let a shop QR become a person.
 *
 * `parseMerchantQr` is imported lazily-shaped — i.e. this module stays free of it at
 * the top — only because `emvQr` imports `isValidVpa` from here; the cycle is broken
 * by keeping that import inside this file's tail rather than its head.
 */
export function parseAnyUpiQr(raw: string): ScanTarget | null {
  const person = parseUpiQr(raw);
  if (person) return { ...person, kind: 'person' };

  // Required here rather than at the top: emvQr imports isValidVpa from this module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { parseMerchantQr } = require('./emvQr') as typeof import('./emvQr');
  const merchant = parseMerchantQr(raw);
  if (!merchant) return null;

  return {
    vpa: merchant.vpa,
    // City is dropped: it is useful for a receipt, not for naming a transaction.
    name: merchant.name,
    amountPaise: merchant.amountPaise,
    kind: 'merchant',
  };
}
