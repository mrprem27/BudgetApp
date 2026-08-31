import type { TxnDispute } from '../db/queries/syncDoc';
import type { TxnWithSplits, LineItem } from '../db/queries/transactions';
import type { Person } from '../db/queries/persons';
import type { AuditLog } from '../db/queries/audit';

/** Everything the transaction-detail screen loads in one pass. */
export type TxnDetailData = {
  txn: TxnWithSplits | null;
  members: Person[];
  me: Person | null;
  groupName: string;
  isPersonal: boolean;
  history: AuditLog[];
  items: LineItem[];
  parentRule: TxnWithSplits | null;
  /**
   * Who wrote this entry, or null when I did.
   *
   * `txn.author_person_id IS NULL` is the app's canonical "authored by me"
   * (`AUTHORED_BY_ME`), so this is loaded only for a peer entry. Resolved from
   * `person` directly rather than from `members`, because the author may have
   * since been removed from the group — and "Added by someone who has left" is
   * still a truer answer than a blank.
   */
  author: Person | null;
  /** Live objections from other members against MY entry — see F10. */
  disputes: TxnDispute[];
};

/**
 * The "Added by" line.
 *
 * This screen said "Added by you" on EVERY entry, including one a co-member
 * wrote — on the screen where you decide whether to trust that person's entries,
 * which is the one place the answer has to be right. `author` is null for my own
 * entries (`author_person_id IS NULL`), so the two cases are distinguished by
 * the column, never guessed from the payer or the split.
 */
export function authorLabel(author: Person | null, me: Person | null): string {
  if (author) return author.name;
  return me?.name ? `${me.name} (you)` : 'You';
}
