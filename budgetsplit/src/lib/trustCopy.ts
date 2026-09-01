/**
 * Every sentence the app says about trust, in one place.
 *
 * ## Why this file exists
 *
 * Trust was explained **six different ways** across six files, and two of them were
 * not merely differently worded but differently *true*: `usePersonScreen`'s confirm
 * dialog omitted the transfer carve-out entirely, so the same decision was described
 * as unconditional on one screen and conditional on another.
 *
 * Worse, two buttons carried the identical label `Trust {name}` and did different
 * things — the one in the approvals queue also approved everything waiting. A user
 * who learned what the word meant in one place learned the wrong thing for the other.
 *
 * ## The rule, in full
 *
 * Trust has two halves and **both must always be said together**, because omitting
 * the second one is what made the copy wrong rather than just inconsistent:
 *
 * 1. Their entries count immediately, in every group you share.
 * 2. Money arriving as a transfer still waits for you, every time — "did that reach
 *    me, and where" is not a question about honesty (`lib/trust.ts`, AGENTS §13).
 *
 * Trust is **per person, never per group** (§13), with a per-person-per-group
 * exception that must stay clearable.
 *
 * Pure strings, no React and no db, so `trustCopy.test.ts` can assert that no screen
 * hand-writes its own version.
 */

/** What trust does, as one sentence. The `and` clause is not optional — see above. */
export const trustMeans = (name: string): string =>
  `Anything ${name} adds in a group you share counts straight away, without waiting for you. `
  + 'Money they say they have sent you still has to be confirmed each time.';

/** What NOT trusting does. The mirror, so the two read as one choice. */
export const reviewMeans = (name: string): string =>
  `Anything ${name} adds waits for your approval before it touches your numbers. `
  + 'Entries you have already accepted stay accepted.';

/**
 * Why the control can't do anything yet.
 *
 * A person with no linked account has no write path at all (`lib/trust.ts`), so
 * their trust value is inert. Saying "protected" here would be theatre — nothing is
 * being held back, because nothing can arrive.
 */
export const trustInert = (name: string): string =>
  `${name} has no linked account yet, so nothing can reach your ledger on their behalf. `
  + 'This becomes a real choice once you match them to an account.';

/** The current state, as a value rather than an instruction. Used on setting rows. */
export const trustStateLabel = (state: 'trusted' | 'review'): string =>
  state === 'trusted' ? 'Counts straight away' : 'Waits for you';

/** A per-group exception's value, including "no opinion here". */
export const groupTrustLabel = (state: 'trusted' | 'review' | null, inherited: 'trusted' | 'review'): string =>
  state === null
    // Spelled out, not "Same as above" — "above" was two blocks and a paragraph
    // away, so the row told you nothing without scrolling back.
    ? `${trustStateLabel(inherited)} (from the setting above)`
    : trustStateLabel(state);

/** Titles for the confirm dialogs, so both screens ask the same question. */
export const trustConfirmTitle = (name: string, next: 'trusted' | 'review'): string =>
  next === 'trusted' ? `Trust ${name}?` : `Review ${name}'s entries?`;

export const trustConfirmBody = (name: string, next: 'trusted' | 'review'): string =>
  next === 'trusted' ? trustMeans(name) : reviewMeans(name);

export const trustConfirmCta = (next: 'trusted' | 'review'): string =>
  next === 'trusted' ? 'Trust' : 'Review each one';

/**
 * The approvals queue's button is a DIFFERENT action and must say so.
 *
 * It sets trust *and* approves everything already waiting (except money arriving,
 * which never bulk-approves). Labelling that `Trust {name}` — identical to the
 * person screen's button, which only sets the flag — meant the same words cleared a
 * queue in one place and did not in the other.
 */
export const trustAndApproveLabel = (name: string, count: number): string =>
  count > 0 ? `Trust ${name} and approve ${count === 1 ? 'this' : `these ${count}`}` : `Trust ${name}`;

export const trustAndApproveBody = (name: string, count: number): string =>
  `${trustMeans(name)}${count > 0 ? ` The ${count === 1 ? 'entry' : `${count} entries`} waiting here will be accepted now.` : ''}`;
