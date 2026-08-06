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
  Cred = 'cred',
  AmazonPay = 'amazonpay',
  WhatsApp = 'whatsapp',
  Mobikwik = 'mobikwik',
  Freecharge = 'freecharge',
  Navi = 'navi',
  Slice = 'slice',
  Groww = 'groww',
  Jupiter = 'jupiter',
  IciciImobile = 'imobile',
  HdfcPayzapp = 'payzapp',
  AxisPay = 'axispay',
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
  { key: UpiApp.Cred, label: 'CRED', prefix: 'cred://upi/pay', probe: 'cred://' },
  { key: UpiApp.AmazonPay, label: 'Amazon Pay', prefix: 'amazonpay://pay', probe: 'amazonpay://' },
  { key: UpiApp.WhatsApp, label: 'WhatsApp', prefix: 'whatsapp://pay', probe: 'whatsapp://' },
  { key: UpiApp.Navi, label: 'Navi', prefix: 'navi://pay', probe: 'navi://' },
  { key: UpiApp.Slice, label: 'Slice', prefix: 'slice://pay', probe: 'slice://' },
  { key: UpiApp.Groww, label: 'Groww', prefix: 'groww://pay', probe: 'groww://' },
  { key: UpiApp.Jupiter, label: 'Jupiter', prefix: 'jupiter://pay', probe: 'jupiter://' },
  { key: UpiApp.Mobikwik, label: 'MobiKwik', prefix: 'mobikwik://pay', probe: 'mobikwik://' },
  { key: UpiApp.Freecharge, label: 'Freecharge', prefix: 'freecharge://pay', probe: 'freecharge://' },
  { key: UpiApp.IciciImobile, label: 'ICICI iMobile', prefix: 'imobileapp://pay', probe: 'imobileapp://' },
  { key: UpiApp.HdfcPayzapp, label: 'HDFC PayZapp', prefix: 'payzapp://pay', probe: 'payzapp://' },
  { key: UpiApp.AxisPay, label: 'Axis Pay', prefix: 'axispay://pay', probe: 'axispay://' },
];

/**
 * iOS caps `LSApplicationQueriesSchemes` at 50 entries and silently answers `false`
 * for everything once you exceed it — which would disable the picker wholesale rather
 * than trim it. Asserted in `iosPermissions.test.ts` against the real Info.plist config.
 */
export const IOS_QUERY_SCHEME_LIMIT = 50;

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

/**
 * Derived from the list above rather than restated. Held as a second literal, every
 * app added had to be written twice, and the compiler only caught it because the
 * `Record` is exhaustive — a lookup keyed by a subset type would have failed silently.
 */
const PREFIX: Record<string, string> = Object.fromEntries(
  [GENERIC_UPI_APP, ...UPI_APPS].map(a => [a.key, a.prefix]),
);

export type ScannedUpi = {
  vpa: string;
  name?: string;
  /**
   * Everything else the scanned code carried, to be re-emitted untouched.
   *
   * A UPI QR is not just a payee and an amount. It can carry a merchant category
   * (`mc`), a signature (`sign`), an originator (`orgid`), a mode, a reference. Those
   * are what tell the PSP the request is the one the payee actually published — so
   * dropping them and rebuilding a bare URI produces something indistinguishable from
   * a regenerated QR, which is what risk engines exist to decline.
   *
   * Excludes the fields we set ourselves (`pa`, `pn`, `am`, `cu`, `tn`); see
   * `buildUpiUri`, which layers those on top.
   */
  params?: Record<string, string>;
};

/** Set by us on every request, so carrying the scanned copy through would be noise. */
const OWN_PARAMS = new Set(['pa', 'pn', 'am', 'cu', 'tn']);

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

    const extras: Record<string, string> = {};
    for (const [k, v] of params.entries()) {
      if (!OWN_PARAMS.has(k.toLowerCase()) && v.trim()) extras[k] = v;
    }

    const out: ScannedUpi = name ? { vpa, name } : { vpa };
    // Omitted rather than set empty, so a plain `pa`+`pn` code stays a two-field object.
    if (Object.keys(extras).length) out.params = extras;
    return out;
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
  /** Optional note (`tn`). Leave unset on a scanned code — see `buildUpiUri`. */
  note?: string;
  /** Parameters from the scanned code, re-emitted beneath our own. */
  passthrough?: Record<string, string>;
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
  // A note we invented is not neutral on a scanned payment: the payee never wrote it,
  // and an unexpected `tn` is one more way the request differs from the published code.
  if (req.note?.trim()) params.push(['tn', req.note.trim()]);

  // Re-emitted last so they can never displace the payee, amount or currency above —
  // a scanned code must not be able to redirect where the money goes.
  for (const [k, v] of Object.entries(req.passthrough ?? {})) {
    if (!OWN_PARAMS.has(k.toLowerCase()) && v.trim()) params.push([k, v]);
  }

  // An enum member absent from UPI_APPS has no prefix. Returning null makes the caller
  // hide the action; the alternative is a literal "undefined?pa=…" handed to the OS.
  const prefix = PREFIX[app];
  if (!prefix) return null;

  // Every app takes the same NPCI parameter set; only the scheme and path differ.
  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${prefix}?${qs}`;
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
    // The merchant category travels on as `mc`. Note what still cannot: a merchant
    // QR's signature lives in sub-tags this parser doesn't decode, and no signature
    // we didn't receive can be reconstructed. A shop payment therefore reaches the
    // PSP less complete than one scanned in a UPI app, and may still be declined.
    ...(merchant.mcc ? { params: { mc: merchant.mcc } } : {}),
    kind: 'merchant',
  };
}
