import { formatRupees } from './money';

/**
 * Build the nudge you send someone who owes you.
 *
 * Pure and separate from the sending, for the same reason `upiIntent.ts` is: the
 * message is the part with judgement in it, and judgement should be testable
 * without a device.
 *
 * **It is a message, never a request.** NPCI banned person-to-person collect
 * requests outright from 1 Oct 2025, and AGENTS §13 holds every request path here
 * to push — so this can carry a `upi://pay` link the other person *chooses* to
 * open, and can never pull money.
 */

export type ReminderInput = {
  name: string;
  /** What they owe me, in paise. Must be positive — see `canRemind`. */
  amountPaise: number;
  /** Optional per-group breakdown, so the message says what it is *for*. */
  groups?: Array<{ name: string; amount: number }>;
  /** My UPI link, if I have one. Turns a nudge into something actionable. */
  payLink?: string | null;
};

/**
 * Only ever nudge someone who owes YOU.
 *
 * Reminding a person about money *you* owe *them* is not a reminder, it is an
 * apology — and offering it as one button next to the other would eventually send
 * one. `net > 0` is the whole gate.
 */
export function canRemind(net: number, mobile: string | null | undefined): boolean {
  return net > 0 && !!mobile && mobile.trim().length > 0;
}

/**
 * Phone → the digits `wa.me` needs: no `+`, no spaces, no punctuation.
 *
 * Numbers are stored exactly as typed, on purpose — `friends.tsx` says so: they
 * are dialled by a human, never used as a key. So normalising happens here, at the
 * one moment a machine has to read one, and never writes back.
 *
 * Returns null rather than guessing a country code. A 10-digit Indian number with
 * no prefix is ambiguous to `wa.me`, and silently prepending 91 would send someone
 * else's phone a message about money.
 */
export function waNumber(mobile: string): string | null {
  const digits = mobile.replace(/[^\d]/g, '');
  if (digits.length < 11) return null;   // needs a country code to be unambiguous
  return digits;
}

/** The message body. Plain text — WhatsApp has no formatting we can rely on. */
export function reminderText(r: ReminderInput): string {
  const lines = [`Hi ${r.name}, just a nudge — ${formatRupees(r.amountPaise)} is still open between us.`];

  // Name what it is for when we can. "You owe me ₹2,400" invites an argument;
  // "₹1,600 Goa Trip, ₹800 Flat" invites a payment.
  const parts = (r.groups ?? []).filter(g => g.amount > 0);
  if (parts.length > 0) {
    lines.push(parts.map(g => `${g.name} ${formatRupees(g.amount)}`).join(' · '));
  }

  if (r.payLink) {
    lines.push(`If it's easier, this opens your UPI app: ${r.payLink}`);
  }
  return lines.join('\n\n');
}

/**
 * The deep link, or null when the number cannot be made unambiguous.
 *
 * Null is a real outcome the caller must handle by falling back to the share
 * sheet — not an error. A number without a country code is common, and losing the
 * reminder entirely over it would be worse than letting the user pick the app.
 */
export function whatsappUrl(mobile: string, text: string): string | null {
  const n = waNumber(mobile);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
