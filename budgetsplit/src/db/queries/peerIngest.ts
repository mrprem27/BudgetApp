import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';
import { formatRupees } from '../../lib/money';
import { validateShares } from '../../lib/splitMath';
import { requiresMyApproval } from '../../lib/trust';
import { getGroupTrust } from './persons';
import type { Person } from './persons';
import { localTz } from './transactions';

/**
 * One entry, as another person's device asserted it.
 *
 * Deliberately NOT `InsertTxnInput`: this is untrusted input arriving from
 * outside, and it carries the *author's* account id rather than a local person
 * id. Sharing the Add screen's type would invite passing one where the other is
 * expected, which is how an unvalidated payload reaches the ledger.
 */
export type PeerEnvelope = {
  /** The author's server account id, matched against `person.remote_uid`. */
  authorUid: string;
  /** Group id — shared by construction, since sharing is adoption of one id. */
  groupId: string;
  /** The entry's id, minted by the author's device so both sides agree on it. */
  entryId?: string;
  /**
   * Which version of this entry this is. 1 is a create; anything higher replaces
   * exactly its predecessor.
   *
   * Without it every edit a peer makes would arrive as a `duplicate` and be
   * dropped — the entry would land once and then be frozen forever, which reads
   * as "sync works" right up until someone corrects an amount.
   */
  version: number;
  /**
   * The author deleted it. A tombstone rather than a removal: the entry has to
   * keep existing so the deletion itself can carry a version and cannot be
   * undone by a stale copy arriving afterwards.
   */
  isDeleted?: boolean;
  kind: 'expense' | 'settlement';
  date: number;
  /**
   * Set to make this a recurring RULE rather than a one-off. Approving the rule
   * approves its occurrences too — see `materializeDueOccurrences`, which refuses
   * to spawn anything from a rule still waiting on me.
   */
  recurFreq?: string | null;
  recurInterval?: number | null;
  recurEnd?: number | null;
  category: string;
  note?: string | null;
  payMethod?: string | null;
  /** Paise. Must sum to the same total as `shares`. */
  payments: Array<{ personId: string; amount: number }>;
  shares: Array<{ personId: string; amount: number }>;
};

export type IngestResult =
  | { ok: true; txnId: string; applied: boolean }
  | { ok: false; reason: IngestRefusal };

/**
 * Why an envelope was refused. Every one is a *silent drop* at the transport, not
 * a user-facing error: a peer that sends something inadmissible does not get to
 * put a dialog on my screen.
 */
export type IngestRefusal =
  | 'unknown-author'      // no local person carries that remote_uid
  | 'author-is-me'        // my own entries never arrive this way
  | 'ambiguous-me'        // two is_me rows — see F5; trust cannot be evaluated
  | 'not-a-member'        // author or I am not in that group
  | 'personal-group'      // only shared-group data ever syncs
  | 'unbalanced'          // shares do not sum to payments
  | 'stale';              // I already hold this version, or a newer one

/**
 * Accept an entry another person wrote.
 *
 * **This is the seam.** Nothing in the app calls it — there is no transport yet.
 * Sync will call it once per envelope; the tests call it now, which is what makes
 * the whole trust model exercisable before a peer write path exists.
 *
 * The order of the guards matters: identity first (who is this, and can I even
 * evaluate trust), then authority (are they entitled to write here), then shape
 * (does the money add up). Only then does anything touch the ledger.
 *
 * On success the entry is a real `txn` — visible in the group ledger immediately,
 * because the group agrees on what happened. Whether it counts as *my* money is
 * decided by `appliesImmediately`, and recorded in `txn_approval`. Sync never
 * decides what counts; trust does.
 */
export async function ingestPeerTxn(
  db: SQLite.SQLiteDatabase,
  env: PeerEnvelope,
): Promise<IngestResult> {
  // F5 guard. `seed.ts` mints `is_me` with a fresh uuid per install, so one
  // account can end up with two "me" rows — and then both "who wrote this" and
  // "are they trusted" read the wrong one. Refuse rather than guess: a wrong
  // answer here silently applies a stranger's entry.
  const meRows = await db.getAllAsync<Person>('SELECT * FROM person WHERE is_me = 1');
  if (meRows.length !== 1) return { ok: false, reason: 'ambiguous-me' };
  const me = meRows[0];

  const author = await db.getFirstAsync<Person>(
    'SELECT * FROM person WHERE remote_uid = ?', [env.authorUid],
  );
  // Deliberately does NOT create the person. Auto-adding would let anyone who
  // knows a group id insert themselves into your contacts.
  if (!author) return { ok: false, reason: 'unknown-author' };
  if (author.id === me.id) return { ok: false, reason: 'author-is-me' };

  const group = await db.getFirstAsync<{ id: string; is_personal: number }>(
    'SELECT id, is_personal FROM budget_group WHERE id = ?', [env.groupId],
  );
  if (!group) return { ok: false, reason: 'not-a-member' };
  // Decision 2: only shared-group data ever syncs. A personal group has one
  // member and is the half of the app that must never leave the device.
  if (group.is_personal === 1) return { ok: false, reason: 'personal-group' };

  const members = await db.getAllAsync<{ person_id: string }>(
    'SELECT person_id FROM group_member WHERE group_id = ?', [env.groupId],
  );
  const ids = new Set(members.map(m => m.person_id));
  // Both ends: they must be entitled to write here, and it must concern me.
  if (!ids.has(author.id) || !ids.has(me.id)) return { ok: false, reason: 'not-a-member' };


  const total = env.payments.reduce((a, p) => a + p.amount, 0);
  const check = validateShares(total, env.shares);
  if (!check.ok) return { ok: false, reason: 'unbalanced' };
  // Every named person must actually be in the group — otherwise a share could be
  // parked on someone who cannot see or dispute it.
  for (const row of [...env.payments, ...env.shares]) {
    if (!ids.has(row.personId)) return { ok: false, reason: 'not-a-member' };
  }

  const id = env.entryId ?? uuid();
  const existing = await db.getFirstAsync<{ id: string; sync_version: number }>(
    'SELECT id, sync_version FROM txn WHERE id = ?', [id],
  );

  /*
   * Re-delivery is normal for an at-least-once transport, and so is an EDIT —
   * which is why this compares versions rather than refusing anything it has
   * seen before.
   *
   * `<=` and not `<`: an equal version is the re-delivery case, and re-applying
   * it would reset an approval I have already decided. A LOWER version is a stale
   * copy overtaking a newer one on the wire, and applying that would roll a
   * corrected figure back to the value the group already fixed.
   */
  if (existing && env.version <= existing.sync_version) return { ok: false, reason: 'stale' };

  // Does this need my say-so? A transfer always does, however much I trust them —
  // see `requiresMyApproval` for why trust is the wrong test for money arriving.
  const touchesMe = [...env.payments, ...env.shares].some(r => r.personId === me.id);

  /*
   * A decision I have already made cannot be edited away.
   *
   * Without this, rejecting an entry ("this did not happen") and then receiving a
   * v2 of it from a TRUSTED author would apply it silently — my rejection erased
   * by someone else's edit, and no way for me to know. Trust means "their entries
   * may count", never "their edits may overrule me".
   *
   * The entry is not discarded either: they may genuinely have corrected it. It
   * comes back as pending, which is the one outcome that respects both sides.
   */
  const wasRejected = !!existing && !!(await db.getFirstAsync<{ state: string }>(
    "SELECT state FROM txn_approval WHERE txn_id = ? AND state = 'rejected'", [id],
  ));
  // My answer about this person IN THIS GROUP, when I have set one. Read here
  // rather than inside `requiresMyApproval` so that function stays pure and
  // db-free, which is what makes the whole trust model testable without a schema.
  const groupTrust = await getGroupTrust(db, author.id, env.groupId);
  const applied = !wasRejected && !requiresMyApproval(author, { kind: env.kind, touchesMe }, groupTrust);
  const now = Date.now();
  const deleted = env.isDeleted ? 1 : 0;

  await db.withTransactionAsync(async () => {
    if (existing) {
      /*
       * An edit. The row is UPDATEd rather than deleted and re-inserted so that
       * everything hanging off this id — the audit trail, an attachment, the
       * recurring children — stays attached to it.
       *
       * `author_person_id` is rewritten too: whoever made this version is its
       * author, and the ledger is read as "who put this number here".
       */
      await db.runAsync(
        `UPDATE txn SET kind=?, date=?, category=?, note=?, pay_method=?,
                        recur_freq=?, recur_interval=?, recur_end=?,
                        author_person_id=?, sync_version=?, is_deleted=?, updated_at=?
          WHERE id = ?`,
        [
          env.kind, env.date, env.category, env.note ?? null, env.payMethod ?? null,
          env.recurFreq ?? null, env.recurInterval ?? null, env.recurEnd ?? null,
          author.id, env.version, deleted, now, id,
        ],
      );
      // Wholesale replace, matching how the app's own edit path writes these.
      // Safe precisely because approval does NOT live on these tables — it is in
      // `txn_approval`, keyed on txn_id, for this reason.
      await db.runAsync('DELETE FROM txn_payment WHERE txn_id = ?', [id]);
      await db.runAsync('DELETE FROM txn_share WHERE txn_id = ?', [id]);
    } else {
      await db.runAsync(
        `INSERT INTO txn
           (id,group_id,kind,entry_mode,date,category,note,tags,tz,pay_method,source,
            recur_freq,recur_interval,recur_end,author_person_id,sync_version,is_deleted,created_at,updated_at)
         VALUES (?,?,?,'quick',?,?,?,'',?,?,'peer',?,?,?,?,?,?,?,?)`,
        [
          id, env.groupId, env.kind, env.date, env.category, env.note ?? null,
          localTz(), env.payMethod ?? null,
          env.recurFreq ?? null, env.recurInterval ?? null, env.recurEnd ?? null,
          author.id, env.version, deleted, now, now,
        ],
      );
    }
    for (const p of env.payments) {
      await db.runAsync(
        'INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, p.personId, p.amount],
      );
    }
    for (const s of env.shares) {
      await db.runAsync(
        'INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, s.personId, s.amount],
      );
    }
    /*
     * The approval is re-decided for THIS version, and an edit can only ever
     * re-open it.
     *
     * `INSERT OR REPLACE` rather than an insert-if-absent: an entry I accepted at
     * v1 and that arrives changed at v2 must wait again. Otherwise someone edits
     * ₹200 into ₹20,000 after I have accepted the ₹200, and the new figure lands
     * in my ledger on the strength of a decision I made about a different number.
     *
     * The reverse — clearing a pending approval when the new version no longer
     * needs one — is deliberate too: nothing is waiting on me any more, so
     * leaving it pending would strand the entry with no way to resolve it.
     */
    if (!applied) {
      await db.runAsync(
        `INSERT OR REPLACE INTO txn_approval (txn_id, state, created_at, decided_at)
         VALUES (?, 'pending', ?, NULL)`,
        [id, now],
      );
    } else if (existing) {
      await db.runAsync('DELETE FROM txn_approval WHERE txn_id = ?', [id]);
    }
    // Named, not anonymous. Reusing `insertTxnRows` would log "Added expense ₹X"
    // as though I had added it, in the one log a dispute would be settled from.
    // An edit and a deletion are not "created". The log is the one place a
    // dispute gets settled from, so it has to say which of the three happened.
    const verb = env.isDeleted ? 'deleted' : existing ? 'changed' : 'added';
    await logAudit(db, {
      entityType: env.kind === 'settlement' ? 'settlement' : 'txn',
      entityId: id,
      groupId: env.groupId,
      action: env.isDeleted ? 'deleted' : existing ? 'updated' : 'created',
      amount: total,
      summary: `${author.name} ${verb} ${formatRupees(total)} · ${env.category}`
        + (applied ? '' : ' — waiting for you'),
    });
  });

  return { ok: true, txnId: id, applied };
}
