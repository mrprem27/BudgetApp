import { isValidVpa } from './upiIntent';

/**
 * EMVCo Merchant-Presented-Mode QR ("BharatQR") — the code stuck to a shop counter.
 *
 * Unlike a person's QR, which is a plain `upi://pay?…` URI, a merchant code is a flat
 * string of `TT LL VALUE` triplets where some values are themselves triplet strings.
 * That is why `parseUpiQr` refuses these outright: they are a different format, and
 * guessing at one risks producing a *wrong payee*, which is the failure that matters
 * when the next step is sending money.
 *
 * ```
 * 00 02 01            payload format
 * 26 40 0010in.gov.upi0119merchant@okhdfcbank   merchant account template (nested)
 * 53 03 356           currency (356 = INR)
 * 54 06 100.00        amount, on a fixed-price code
 * 59 09 Chai Stop     merchant name
 * 60 06 Mumbai        city
 * ```
 *
 * ⚠️ Written from the EMVCo spec, **not** validated against a wide sample of real
 * Indian QRs — those vary by acquirer. Everything here fails closed: a tag that
 * doesn't parse, a length that runs past the end, or a VPA that doesn't look like one
 * all return `null` rather than a half-read payee.
 */

/** Tags 26–51 hold merchant-account templates; only the UPI one interests us. */
const ACCOUNT_TEMPLATE_MIN = 26;
const ACCOUNT_TEMPLATE_MAX = 51;
const UPI_GUID = 'in.gov.upi';

const TAG_CURRENCY = '53';
const TAG_AMOUNT = '54';
const TAG_MERCHANT_NAME = '59';
const TAG_MERCHANT_CITY = '60';

/** ISO-4217 numeric for INR. A code in any other currency is not ours to pay. */
const INR = '356';

export type MerchantQr = {
  vpa: string;
  /** Merchant name (tag 59), when present. */
  name?: string;
  /** Merchant city (tag 60), when present. */
  city?: string;
  /** Amount in paise, only on a fixed-price code (tag 54). */
  amountPaise?: number;
};

/**
 * Split one level of `TTLLVALUE` triplets.
 *
 * Returns `null` — never a partial map — if any length header runs past the end of the
 * string. A truncated or corrupted scan must not yield "most of" a payee.
 */
function parseTlv(input: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = 0;
  while (i < input.length) {
    // A trailing fragment shorter than a tag+length header is corruption, not padding.
    if (i + 4 > input.length) return null;
    const tag = input.slice(i, i + 2);
    const len = Number(input.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len)) return null;
    const start = i + 4;
    const end = start + len;
    if (end > input.length) return null;
    // First occurrence wins: a duplicated tag is malformed, and silently taking the
    // last one would let a trailing forgery override the real payee.
    if (!out.has(tag)) out.set(tag, input.slice(start, end));
    i = end;
  }
  return out;
}

/** The VPA out of whichever 26–51 template declares the UPI GUID. */
function findVpa(top: Map<string, string>): string | null {
  for (let t = ACCOUNT_TEMPLATE_MIN; t <= ACCOUNT_TEMPLATE_MAX; t++) {
    const raw = top.get(String(t).padStart(2, '0'));
    if (!raw) continue;
    const inner = parseTlv(raw);
    if (!inner) continue;
    if (inner.get('00')?.trim().toLowerCase() !== UPI_GUID) continue;
    const vpa = inner.get('01')?.trim();
    if (vpa && isValidVpa(vpa)) return vpa;
  }
  return null;
}

/**
 * `null` unless this is a UPI merchant code we can pay in rupees.
 *
 * A code carrying no UPI template (a card-network-only BharatQR, say) is not an error
 * to report in detail — from the user's side it simply isn't payable this way.
 */
export function parseMerchantQr(raw: string): MerchantQr | null {
  const data = raw.trim();
  // Every EMV MPM payload opens with the payload-format indicator `000201`. Checking
  // it first means a `upi://` URI or random text exits immediately instead of being
  // tortured through the TLV reader.
  if (!data.startsWith('0002')) return null;

  const top = parseTlv(data);
  if (!top) return null;

  const currency = top.get(TAG_CURRENCY)?.trim();
  if (currency && currency !== INR) return null;

  const vpa = findVpa(top);
  if (!vpa) return null;

  const out: MerchantQr = { vpa };

  const name = top.get(TAG_MERCHANT_NAME)?.trim();
  if (name) out.name = name;

  const city = top.get(TAG_MERCHANT_CITY)?.trim();
  if (city) out.city = city;

  // Tag 54 is decimal rupees ("100.00"), not paise. Absent on an open-amount code,
  // which is the common case — the user types the amount then.
  const amount = top.get(TAG_AMOUNT)?.trim();
  if (amount && /^\d+(\.\d{1,2})?$/.test(amount)) {
    const paise = Math.round(Number(amount) * 100);
    if (paise > 0) out.amountPaise = paise;
  }

  return out;
}
