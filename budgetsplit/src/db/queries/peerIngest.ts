import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { logAudit } from './audit';
import { formatRupees } from '../../lib/money';
import { validateShares } from '../../lib/splitMath';
import { appliesImmediately } from '../../lib/trust';
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
  kind: 'expense' | 'settlement';
  date: number;
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
  | 'recurring'           // a peer entry is never a recurring RULE
  | 'unbalanced'          // shares do not sum to payments
  | 'duplicate';          // already have this entry

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

  // A recurring RULE is a `txn` row that spawns more rows. Accepting one from a
  // peer would let them schedule indefinite future spending against me. Refusing
  // at the seam is also what keeps `upcoming.ts` and the six recurring queries out
  // of the enforcement list entirely — they can never see a pending entry.
  if (env.kind !== 'expense' && env.kind !== 'settlement') {
    return { ok: false, reason: 'recurring' };
  }

  const total = env.payments.reduce((a, p) => a + p.amount, 0);
  const check = validateShares(total, env.shares);
  if (!check.ok) return { ok: false, reason: 'unbalanced' };
  // Every named person must actually be in the group — otherwise a share could be
  // parked on someone who cannot see or dispute it.
  for (const row of [...env.payments, ...env.shares]) {
    if (!ids.has(row.personId)) return { ok: false, reason: 'not-a-member' };
  }

  const id = env.entryId ?? uuid();
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM txn WHERE id = ?', [id]);
  // Re-delivery is normal for an at-least-once transport. It must not create a
  // second copy, and it must not resurrect a decision I already made.
  if (existing) return { ok: false, reason: 'duplicate' };

  const applied = appliesImmediately(author);
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO txn
         (id,group_id,kind,entry_mode,date,category,note,tags,tz,pay_method,source,
          author_person_id,is_deleted,created_at,updated_at)
       VALUES (?,?,?,'quick',?,?,?,'',?,?,'peer',?,0,?,?)`,
      [
        id, env.groupId, env.kind, env.date, env.category, env.note ?? null,
        localTz(), env.payMethod ?? null, author.id, now, now,
      ],
    );
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
    if (!applied) {
      await db.runAsync(
        `INSERT INTO txn_approval (txn_id, state, created_at, decided_at)
         VALUES (?, 'pending', ?, NULL)`,
        [id, now],
      );
    }
    // Named, not anonymous. Reusing `insertTxnRows` would log "Added expense ₹X"
    // as though I had added it, in the one log a dispute would be settled from.
    await logAudit(db, {
      entityType: env.kind === 'settlement' ? 'settlement' : 'txn',
      entityId: id,
      groupId: env.groupId,
      action: 'created',
      amount: total,
      summary: applied
        ? `${author.name} added ${formatRupees(total)} · ${env.category}`
        : `${author.name} added ${formatRupees(total)} · ${env.category} — waiting for you`,
    });
  });

  return { ok: true, txnId: id, applied };
}
