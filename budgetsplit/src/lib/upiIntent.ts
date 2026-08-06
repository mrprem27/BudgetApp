import { v4 as uuid } from 'uuid';

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
  Navi = 'navi',
  Mobikwik = 'mobikwik',
  Airtel = 'airtel',
  SuperMoney = 'supermoney',
  Kiwi = 'kiwi',
}

/**
 * Optional fields an app is known to want, or to choke on.
 *
 * These exist because the apps genuinely disagree, and device testing proved it rather
 * than suggested it: **CRED and Airtel moved in opposite directions across the same
 * payload change.** CRED paid on a bare `pa/pn/am/cu` and failed the moment `mode` and
 * `tr` were added; Airtel paid *with* both. There is no single payload that is simply
 * "correct" — so instead of sweeping every app again and breaking one to fix another,
 * each app carries what it is known to accept.
 *
 * Absent means the default, which is what an unproven app gets: `mode` on, `tr` only
 * for merchant payments. Only set a flag from an observed device result, and say which
 * one in a comment — a guess here is indistinguishable from evidence later.
 */
export type UpiPayloadQuirks = {
  /** Send `mode`. Default `true`. */
  mode?: boolean;
  /** Send `tr` even on a personal transfer. Default: merchant payments only. */
  refOnPersonal?: boolean;
  /**
   * Send `pn`. Default `true`.
   *
   * Confirmed unused for display: PhonePe showed the payee's registered name resolved
   * from the handle, not the one we sent. `pn` is mandatory in the NPCI spec, though,
   * so this is off only where an app is already failing — there is nothing to gain by
   * removing it from one that works.
   */
  name?: boolean;
};

export type UpiAppSpec = {
  key: UpiApp;
  label: string;
  /** Scheme + path the payment params hang off. */
  prefix: string;
  /** Bare scheme, for a `canOpenURL` installed-check. */
  probe: string;
  /** Per-app payload deviations. Omit unless a device proved one is needed. */
  payload?: UpiPayloadQuirks;
  /**
   * Why this app refuses a payment we started — user-facing, one sentence.
   *
   * **A blocked app is not offered as a payment target.** It stays in `UPI_APPS` for
   * detection and for the explanation, but `useUpiHandoff` filters it out of the picker.
   *
   * Set only where every payload lever has been pulled and the app failed identically
   * each time: path, `mode`, `tr`, `pn`, and finally withholding `am` so the payer typed
   * the amount in the app itself. That is a claim that retrying cannot work, so the bar is
   * higher than for `provenance` — and unlike `provenance` it is not about our URI at all.
   *
   * Vendor documentation is not required. PhonePe and Paytm publish the merchant-credential
   * gate that explains theirs; Amazon Pay and WhatsApp publish nothing and fail just as
   * consistently. Requiring a citation would have meant listing two apps we know refuse
   * every payment, which serves the documentation rather than the user.
   *
   * The failure is expensive in a way a blank screen is not: the user reaches PIN entry
   * before being refused, spends one of a day's rate-limited UPI PIN attempts, and is left
   * unsure whether they were debited.
   */
  blocked?: string;
  /**
   * How much we actually know about this row.
   *
   * In the type rather than a comment because the distinction kept collapsing: I called
   * an inference a finding more than once in this file's history, and a comment saying
   * so is easy to contradict later while a field is not.
   *
   *   `device`      — a payment completed, or the app opened correctly pre-filled, here.
   *   `documented`  — the vendor publishes this path. Not the same as it working.
   *   `unverified`  — the scheme is from a maintained list, the path is inferred.
   */
  provenance: 'device' | 'documented' | 'unverified';
};

/**
 * Order is deliberate — it is the order the picker shows, roughly by Indian UPI
 * market share, so the most likely choice needs the least thought.
 */
export const UPI_APPS: UpiAppSpec[] = [
  // `pn` off because PhonePe was watched resolving and displaying the payee's registered
  // name from the handle, ignoring ours (NPCI now requires exactly that). Tidiness only —
  // it will not make PhonePe accept us.
  //
  // **PhonePe's refusal is onboarding, not payload.** Their own iOS Intent SDK requires a
  // merchant ID, a salt key, a server-side checksum and a PhonePeAppId issued after you
  // share your Apple Team ID with their integration team — over `ppemerchantsdkv1..v5`,
  // not `phonepe://` — and their docs say it is for merchants, not third-party apps
  // making P2P payments. So an unauthorised app-to-app payment is bucketed with
  // untrusted sources, which is the "QR via gallery" message. That decision is made
  // before our parameters are read, which is why path, `mode`, `tr` and `pn` all moved
  // nothing.
  //
  // **Withholding `am` was the last lever, and it moved nothing either.** The ₹2,000
  // gallery-QR message had suggested the objection was to *where the amount came from*, so
  // the payee was handed over with the amount left for the user to type in PhonePe itself.
  // Same refusal. That was a canned string, not a clue, and the hypothesis is dead. Every
  // parameter has now been varied. Closed — do not reopen it without merchant credentials.
  {
    key: UpiApp.PhonePe, label: 'PhonePe', prefix: 'phonepe://upi/pay', probe: 'phonepe://',
    payload: { name: false }, provenance: 'documented',
    blocked: 'PhonePe only accepts payments started by registered merchants, so it will refuse this one — even if you type the amount yourself.',
  },
  { key: UpiApp.GooglePay, label: 'Google Pay', prefix: 'tez://upi/pay', probe: 'tez://', provenance: 'documented' },
  // Paytm's own docs give `paytmmp://pay` — a bare `pay`, unlike almost everything else.
  //
  // **Closed for the same reason as PhonePe, and documented.** Paytm's iOS UPI Intent
  // guide requires a merchant account (MID + merchant key) and the deep link must be
  // produced by *Paytm's server* — Initiate Transaction, then Process Transaction —
  // never constructed by the calling app. Their docs say the model is not designed for
  // third-party apps to build deep links, and that non-merchant apps cannot use it for
  // person-to-person payments. The path below is therefore correct and irrelevant.
  // Its "UPI risk policy" refusal also survived withholding `am` — the risk engine scores
  // the *source* of the intent, not the origin of the figure.
  {
    key: UpiApp.Paytm, label: 'Paytm', prefix: 'paytmmp://pay', probe: 'paytmmp://',
    provenance: 'documented',
    blocked: 'Paytm blocks payments started outside its own apps as a risk policy, so it will refuse this one — typing the amount there does not help.',
  },
  { key: UpiApp.Bhim, label: 'BHIM', prefix: 'bhim://upi/pay', probe: 'bhim://', provenance: 'unverified' },
  // Paid on a bare `pa/pn/am/cu`, then failed the moment `mode` and `tr` arrived — path
  // byte-identical across both builds, so the payload is the only explanation. Pinned to
  // exactly what worked.
  { key: UpiApp.Cred, label: 'CRED', prefix: 'credpay://upi/pay', probe: 'credpay://', payload: { mode: false }, provenance: 'device' },
  // **This path is right, and that is now settled by observation.** Amazon Pay opened with
  // the payee, the handle and the amount all populated, ran ValidateAddress against the
  // handle and displayed a green-ticked "Banking name" that matched. Everything a deep link
  // is responsible for succeeded. It then failed *after* submission with "the transaction
  // failed due to some technical error… you should get a refund within 24 hrs" — a decline
  // from Amazon's PSP, on a third party's handle, which is downstream of anything a URI
  // controls. I earlier read that generic error as evidence of a wrong path; the screenshot
  // refutes that reading. No parameter change is indicated, and each attempt costs a real
  // debit, so do not spend rounds guessing at the payload here.
  //
  // **Closed too, on evidence rather than documentation.** It also failed with `am` withheld
  // and the amount typed in Amazon Pay itself, giving the same "technical error". So the
  // decline is not about the figure or its provenance, and every lever is spent. The URI is
  // demonstrably perfect and the app refuses anyway — which is the clearest case in this
  // file that a correct link is not sufficient.
  {
    key: UpiApp.AmazonPay, label: 'Amazon Pay', prefix: 'amazonpay://upi/pay', probe: 'amazonpay://',
    provenance: 'device',
    blocked: 'Amazon Pay reads the payment correctly but its own system declines anything started in another app — every attempt has failed.',
  },
  // **Fails ValidateAddress, and it is not our URI.** "Couldn't verify UPI ID" appeared on
  // a friend's `@kotak` handle, so it is not the self-payment confound. More decisively, the
  // same failure occurs through the generic `upi://pay` route, which WhatsApp itself claims
  // on this device: that URI *is* the NPCI spec, so a refusal there cannot be a malformed
  // link of ours. WhatsApp populates the payment sheet and then cannot resolve the handle it
  // was handed. That is its own PSP integration, not our payload.
  //
  // Consequence worth remembering: on a device where WhatsApp claims `upi://`, the generic
  // "Other UPI app" row inherits this failure. It is still correct to offer — elsewhere
  // `upi://` resolves to whatever the user actually has.
  {
    key: UpiApp.WhatsApp, label: 'WhatsApp', prefix: 'whatsapp-consumer://upi/pay', probe: 'whatsapp-consumer://',
    provenance: 'device',
    blocked: 'WhatsApp cannot verify the payee when the payment is started somewhere else, so it refuses before you can pay.',
  },
  { key: UpiApp.Navi, label: 'Navi', prefix: 'navipay://upi/pay', probe: 'navipay://', provenance: 'unverified' },
  { key: UpiApp.Mobikwik, label: 'MobiKwik', prefix: 'mobikwik://upi/pay', probe: 'mobikwik://', provenance: 'unverified' },
  // Paid with `mode` and `tr` both present, on a personal transfer. Its path changed in
  // the same build, so we cannot say *which* fixed it — but this reproduces the exact
  // payload it succeeded with, rather than betting that it did not need them.
  { key: UpiApp.Airtel, label: 'Airtel', prefix: 'myairtel://upi/pay', probe: 'myairtel://', payload: { mode: true, refOnPersonal: true }, provenance: 'device' },
  { key: UpiApp.SuperMoney, label: 'super.money', prefix: 'super://upi/pay', probe: 'super://', provenance: 'unverified' },
  { key: UpiApp.Kiwi, label: 'Kiwi', prefix: 'kiwi://upi/pay', probe: 'kiwi://', provenance: 'unverified' },
];

/**
 * **Schemes are sourced. Paths come from device results, and only CRED is proven.**
 *
 * The two failure modes are not symmetric, which is why the distinction matters:
 *   - wrong **scheme** → `canOpenURL` reports absent → the row never appears. Harmless.
 *   - wrong **path** → the app opens to its own home screen having dropped the payee and
 *     amount. The user has left BudgetSplit and must now type what they came here not
 *     to type. Only a device catches this.
 *
 * CRED demonstrated both at once. `cred://` *is* a CRED scheme, so it launched and the
 * row looked fine — but CRED's UPI entry point is `credpay://`, so our parameters went
 * nowhere. With `credpay://upi/pay` a real payment went through.
 *
 * Device results so far, and what each one can and cannot prove:
 *
 *              build      path                     payload        result
 *   CRED       e7f2438    credpay://upi/pay        pa/pn/am/cu    ✅ paid
 *              4cec88d    credpay://upi/pay        + mode + tr    ✗ failed
 *   Airtel     e7f2438    myairtel://pay           pa/pn/am/cu    ✗ failed
 *              4cec88d    myairtel://upi/pay       + mode + tr    ✅ paid
 *
 * **CRED is a clean experiment; Airtel is not.** CRED's path was byte-identical across
 * both builds, so only the payload can explain it breaking — that is why `tr` became
 * merchant-only. Airtel had *both* variables change at once, so its recovery could be
 * the path, the payload, or both, and it cannot be cited as evidence for either. An
 * earlier version of this comment claimed Airtel proved the path; it does not.
 *
 * The two apps also moved in opposite directions across the same change, which is the
 * uncomfortable possibility worth stating: **there may be no single payload every app
 * accepts.** If so, the answer is per-app payload quirks rather than one more sweep.
 *
 * `upi/pay` is still the better bet — `upi://pay` and `credpay://upi/pay` both populate
 * correctly, while `whatsapp-consumer://pay` and `paytmmp://pay` opened blank — but it
 * rests on those, not on Airtel.
 *
 * **PhonePe, Paytm and Amazon Pay refuse by policy, not by payload.** Their errors
 * survived a payload change (`mode`, `tr`) and a path change together — PhonePe still
 * calls a ₹2 transfer a gallery-QR breaching a ₹2,000 cap. They classify
 * externally-supplied intents as untrusted whatever we send, which is a judgement about
 * *who* is asking, and nothing in this file can answer that. They stay listed because a
 * row that fails is recoverable — see the always-available "Record it, I'll pay".
 *
 * Removed as invented, not merely unverified: `slice`, `groww`, `jupiter`, `imobileapp`,
 * `payzapp`, `axispay` — none appear in any maintained UPI-intent list.
 */

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
 * `upi://pay` is the NPCI standard, so any conforming app can claim it and receives the
 * parameters properly.
 *
 * **This is the Android hand-off, and on iOS only the URI-preview baseline. It is not a
 * picker row.** On Android `upi://pay` reaches the OS chooser, which lists every UPI app
 * and remembers a default — better than anything we would draw. On iOS there is no chooser
 * for custom schemes: `upi://` resolves to exactly one app, chosen by the OS, undefined
 * when several claim it.
 *
 * It was offered as an "Other UPI app" row and that was a mistake. The label promised a
 * choice among your remaining apps; what it delivered was one unnameable destination — and
 * on a phone where WhatsApp claims `upi://`, that destination was an app we know refuses
 * every payment. `label` is kept for the preview sheet, which shows what the standard URI
 * looks like; it is no longer shown as something to tap.
 */
export const GENERIC_UPI_APP: UpiAppSpec = {
  key: UpiApp.Generic,
  label: 'Other UPI app',
  prefix: 'upi://pay',
  probe: 'upi://',
  provenance: 'device',
};

/**
 * Derived from the list above rather than restated. Held as a second literal, every
 * app added had to be written twice, and the compiler only caught it because the
 * `Record` is exhaustive — a lookup keyed by a subset type would have failed silently.
 */
const PREFIX: Record<string, string> = Object.fromEntries(
  [GENERIC_UPI_APP, ...UPI_APPS].map(a => [a.key, a.prefix]),
);

/** The whole spec by key, so `buildUpiUri` can read an app's payload quirks. */
const SPEC: Record<string, UpiAppSpec> = Object.fromEntries(
  [GENERIC_UPI_APP, ...UPI_APPS].map(a => [a.key, a]),
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
   * Excludes the fields we set ourselves (`pa`, `pn`, `am`, `cu`, `tn`, `tr`, `mode`);
   * see `buildUpiUri`, which layers those on top.
   */
  params?: Record<string, string>;
};

/** Set by us on every request, so carrying the scanned copy through would be noise. */
const OWN_PARAMS = new Set(['pa', 'pn', 'am', 'cu', 'tn', 'tr', 'mode']);

/**
 * `mode` says how the payment was initiated. NPCI's values: `00` default · `01` QR ·
 * `02` secure QR · `04` **intent** · `05` secure intent · `06` NFC · `07` BLE.
 *
 * We generate an intent and hand it to another app, so `04` is a description rather
 * than a claim. `05` would be a claim — it asserts a signature we do not have.
 *
 * Omitting it entirely is what we did before, and PSPs then guess. PhonePe guessed
 * "QR shared from the gallery" and refused a ₹2 payment against a ₹2,000 cap, which is
 * how we learned that the message is a generic parse/typing failure rather than a
 * limit.
 */
export const UPI_MODE_INTENT = '04';

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
    // The code's own `mode` is read and discarded — `OWN_PARAMS` already keeps it out of
    // `extras`, and nothing should carry it onward. See `buildUpiUri`.
    return out;
  }

  return isValidVpa(data) ? { vpa: data } : null;
}

export type UpiRequest = {
  /** Payee VPA (`pa`). */
  vpa: string;
  /**
   * Payee display name (`pn`), omitted entirely when we don't genuinely have one.
   *
   * NPCI now requires UPI apps to show only the payee's **bank-registered** name,
   * resolved from the VPA via ValidateAddress — names carried by QR codes, contacts or
   * user labels may no longer be displayed. So `pn` is close to decorative, and a
   * placeholder is strictly worse than nothing: we used to send the literal string
   * `Payee`, which is a fabricated name attached to a real payment.
   *
   * This is also how a merchant app's hand-off looks from the outside — it passes the
   * VPA and lets the payer's app resolve who that is.
   */
  name?: string;
  /** Amount in integer paise — converted to rupees at this boundary only. */
  amountPaise: number;
  // There was an `omitAmount` here, which left `am` off so the payer typed the amount in
  // their own app. It was the last lever with a mechanism behind it — the only one that
  // changed *who supplied the amount* rather than how the request was spelled — and it
  // failed on PhonePe, Paytm and Amazon Pay alike, with each app giving the identical error
  // it gave with the amount pre-filled. Removed rather than kept as a dead option: it never
  // helped anything, and an unproven control on the payment path is worse than none.
  // The negative result is recorded in docs/FEATURES_AND_FLOWS.md so it is not re-tried.
  /** Optional note (`tn`). Leave unset on a scanned code — see `buildUpiUri`. */
  note?: string;
  /**
   * Transaction reference (`tr`), unique **per attempt** — a retry needs a fresh one.
   * Use `newUpiRef()`. Supplied by the caller rather than minted here so that
   * `buildUpiUri` stays pure and every URI assertion stays deterministic.
   */
  ref?: string;
  /** Initiation mode (`mode`). Defaults to `UPI_MODE_INTENT`. */
  mode?: string;
  /**
   * What kind of payment this is, which decides whether `tr` is sent at all.
   *
   * `tr` is documented **mandatory for merchant payments**, so attaching one to a
   * person-to-person transfer makes the intent merchant-shaped while still carrying no
   * `mc` and no `sign` — i.e. it looks like a malformed merchant payment rather than a
   * well-formed P2P one.
   *
   * This is not theoretical. CRED completed a real payment on the `pa/pn/am/cu` payload
   * and **failed once `tr` and `mode` were added**, with the path unchanged. Airtel paid
   * with both present, so neither field is universally fatal — but attaching a merchant
   * reference to a personal transfer is the part that has no justification, so it goes
   * first. If CRED still fails without it, `mode` follows.
   */
  kind?: 'person' | 'merchant';
  /** Parameters from the scanned code, re-emitted beneath our own. */
  passthrough?: Record<string, string>;
};

/**
 * A fresh `tr` for one payment attempt.
 *
 * The spec allows up to 35 alphanumeric characters. The `BS` prefix makes ours
 * identifiable in a PSP's logs, and the hyphen-stripped uuid supplies the uniqueness —
 * PSPs treat a repeated reference as a duplicate of the earlier transaction, so
 * reusing one across a retry could suppress the retry entirely.
 */
export function newUpiRef(): string {
  return `BS${uuid().replace(/-/g, '').slice(0, 14)}`.toUpperCase();
}

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
  const quirks = SPEC[app]?.payload;

  const params: Array<[string, string]> = [['pa', vpa]];
  if ((quirks?.name ?? true) && req.name?.trim()) params.push(['pn', req.name.trim()]);
  params.push(['am', rupees], ['cu', 'INR']);
  // A note we invented is not neutral on a scanned payment: the payee never wrote it,
  // and an unexpected `tn` is one more way the request differs from the published code.
  if (req.note?.trim()) params.push(['tn', req.note.trim()]);

  // Which optional fields this particular app gets — the apps disagree, and one payload
  // for all of them means breaking one to fix another. See UpiPayloadQuirks.
  const wantMode = quirks?.mode ?? true;
  const wantRef = quirks?.refOnPersonal ?? req.kind === 'merchant';

  // Always our own mode, never the scanned code's.
  //
  // `mode` says how the transaction reached *the app receiving it* — and that app is
  // receiving an intent from us, whatever the payment details were originally printed
  // on. A UPI QR routinely carries `mode=01` ("QR Code"), and forwarding that told the
  // receiving app the payment came from a QR *it* had scanned. PhonePe believed us and
  // applied its QR rules, including the gallery-image cap that refused ₹2 against a
  // ₹2,000 limit.
  //
  // An earlier version of this comment argued the opposite — that echoing `01` was
  // honest about the code's origin. That confused the origin of the *data* with the
  // origin of the *transaction*. `04` is what is actually true at the receiving end.
  if (wantMode) params.push(['mode', req.mode?.trim() || UPI_MODE_INTENT]);
  if (wantRef && req.ref?.trim()) params.push(['tr', req.ref.trim()]);

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
  /**
   * Whether we can hand this off to a UPI app pre-filled, or can only record it.
   *
   * Always true for a person's code: those are unsigned `upi://pay?pa=&pn=` URIs, and
   * re-emitting one with an amount is exactly what any UPI app does when you scan a
   * friend's QR. Merchant codes inherit `reproducible` from the EMV parser — a signed
   * shop QR cannot survive having an amount added to it. See `emvQr.ts`.
   *
   * False does not mean the scan was wasted: payee, amount and category are all still
   * known, so the transaction can be recorded without being paid through us, which is
   * the manual entry this feature exists to remove.
   */
  canHandoff: boolean;
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
  if (person) return { ...person, kind: 'person', canHandoff: true };

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
    // The merchant category travels on as `mc`; an unknown category is itself one of
    // the fail-closed rejection triggers.
    ...(merchant.mcc ? { params: { mc: merchant.mcc } } : {}),
    kind: 'merchant',
    canHandoff: merchant.reproducible,
  };
}
