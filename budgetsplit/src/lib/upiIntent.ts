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
export function buildUpiUri(req: UpiRequest): string | null {
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

  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `upi://pay?${qs}`;
}
