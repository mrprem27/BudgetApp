/**
 * One shape check and one normaliser for email addresses.
 *
 * ## Why normalising is not cosmetic
 *
 * Addresses are compared in several places and were being **stored** in whatever
 * case they were typed. `friends.tsx` lowercases on save; onboarding did not — so a
 * contact created during setup as `Aarav@Example.com` came back from the DB
 * differing from the lowercased value the rename sheet computed, opening that sheet
 * and saving without touching anything read as *"the email changed"* and could fire
 * an unrequested friend request. `friendRequests.ts` already normalises for its own
 * comparisons, which is the codebase agreeing that case does not carry meaning.
 *
 * So: every writer calls `normalizeEmail`, and the stored form is the compared form.
 *
 * The pattern is deliberately permissive — the same shape the server uses. It is a
 * typo check, not an authority on what is deliverable; the real proof that an
 * address works is that mail arrives at it.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed and lower-cased, or `null` for blank. Never throws. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().toLowerCase();
  return t.length > 0 ? t : null;
}

/** True when `raw` is blank (optional fields) or looks like an address. */
export function isEmailish(raw: string | null | undefined): boolean {
  const t = normalizeEmail(raw);
  return t === null || EMAIL_RE.test(t);
}
