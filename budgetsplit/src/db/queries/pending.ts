import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import type { TxnKind, TxnSource, PayMethod } from '../../constants/enums';
import type { ParsedDirection } from '../../lib/importParse';

/** A parsed-but-unconfirmed transaction shown in the Review inbox. */
export type PendingTxn = {
  id: string;
  date: number;
  amount: number;          // paise (positive)
  description: string;
  kind: TxnKind;
  category: string | null;
  direction: ParsedDirection;
  raw: string | null;
  created_at: number;
  /** Review draft: target group id, or null = Personal. */
  dest_group_id: string | null;
  /** Review draft: JSON {included, mode, values} for a group split, or null. */
  split_draft: string | null;
  /** Review draft: the other person on a group transfer (null = none picked).
   *  Set only for a settlement destined for a shared group. */
  counterparty_id: string | null;
  /** Where this row was ingested from — drives the sectioned Review inbox. */
  source: TxnSource;
  /** Detected/edited payment method carried through ingest → Review → txn. */
  pay_method: PayMethod | null;
  /**
   * Where the payment happened, when the import knows it first-hand.
   *
   * Only Scan & Pay does: it is the one ingest route that runs *while* the user is at the
   * merchant, so the device's own position is the real thing rather than a guess. Parsed
   * email and statement imports arrive days later and must leave these null — a location
   * captured at import time would be the user's sofa, recorded as though it were the shop.
   */
  lat: number | null;
  lng: number | null;
  /** Reverse-geocoded place name, e.g. "Cyber Hub, Gurgaon". Null if geocoding failed. */
  place_label: string | null;
  /**
   * Sync groundwork — who wrote this and who it says paid. Nothing produces them
   * yet (there is no peer write path), but they are real columns, so Undo has to
   * carry them or a future peer row would come back stripped of its provenance.
   */
  author_person_id: string | null;
  payer_person_id: string | null;
};

// Ingest never knows about app people or groups — those are Review-only drafts.
// Location is optional rather than omitted: most importers genuinely have none, and
// forcing every one of them to write `lat: null` would be noise around the single
// route that does.
export type NewPending =
  Omit<PendingTxn, 'id' | 'created_at' | 'dest_group_id' | 'split_draft' | 'counterparty_id' | 'lat' | 'lng' | 'place_label' | 'author_person_id' | 'payer_person_id'>
  // `counterparty_id` is settable at ingest, not only in Review: a voice settlement already
  // knows who was named, and re-asking for it would be asking twice.
  & Partial<Pick<PendingTxn, 'lat' | 'lng' | 'place_label' | 'counterparty_id'>>;

/** The subset of a pending row the Review screen auto-saves as you edit it. */
export type PendingDraft = Partial<Pick<PendingTxn, 'kind' | 'category' | 'amount' | 'dest_group_id' | 'split_draft' | 'pay_method' | 'counterparty_id' | 'direction'>>;

export async function insertPending(db: SQLite.SQLiteDatabase, rows: NewPending[]): Promise<void> {
  if (rows.length === 0) return;
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO pending_txn (id, date, amount, description, kind, category, direction, raw, created_at, source, pay_method, lat, lng, place_label, counterparty_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), r.date, r.amount, r.description, r.kind, r.category ?? null, r.direction, r.raw ?? null, now, r.source ?? 'manual', r.pay_method ?? null,
          r.lat ?? null, r.lng ?? null, r.place_label ?? null, r.counterparty_id ?? null],
      );
    }
  });
}

export async function getPending(db: SQLite.SQLiteDatabase): Promise<PendingTxn[]> {
  return db.getAllAsync<PendingTxn>('SELECT * FROM pending_txn ORDER BY date DESC, created_at DESC');
}

/** Auto-save a Review row's in-progress edits. Only the provided fields change. */
export async function updatePendingDraft(
  db: SQLite.SQLiteDatabase,
  id: string,
  d: PendingDraft,
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (d.kind !== undefined) { sets.push('kind=?'); args.push(d.kind); }
  if (d.category !== undefined) { sets.push('category=?'); args.push(d.category); }
  if (d.amount !== undefined) { sets.push('amount=?'); args.push(d.amount); }
  if (d.dest_group_id !== undefined) { sets.push('dest_group_id=?'); args.push(d.dest_group_id); }
  if (d.split_draft !== undefined) { sets.push('split_draft=?'); args.push(d.split_draft); }
  if (d.pay_method !== undefined) { sets.push('pay_method=?'); args.push(d.pay_method); }
  if (d.counterparty_id !== undefined) { sets.push('counterparty_id=?'); args.push(d.counterparty_id); }
  // Editable in Review. Most statements sign their amounts, but not all: Paytm
  // prints a self-transfer unsigned, and the generic CSV parser has to guess
  // when there's no debit/credit marker at all.
  if (d.direction !== undefined) { sets.push('direction=?'); args.push(d.direction); }
  if (sets.length === 0) return;
  args.push(id);
  await db.runAsync(`UPDATE pending_txn SET ${sets.join(', ')} WHERE id=?`, args);
}

/** Re-insert a pending row verbatim (its id + drafts) — the Undo of a delete or
 *  a commit in Review. */
export async function restorePending(db: SQLite.SQLiteDatabase, row: PendingTxn): Promise<void> {
  await db.runAsync(
    // EVERY column, deliberately. This is the inverse of every destructive action
    // in Review, so a column missing here is data the user loses by pressing Undo
    // — silently, and permanently once they re-confirm. `lat`/`lng`/`place_label`
    // were missing, which threw away the location Scan & Pay had captured, and
    // `author_person_id`/`payer_person_id` went the same way.
    // `pendingRoundTrip.test.ts` reads `schema.ts` and fails if this list ever
    // falls behind the table again.
    `INSERT OR REPLACE INTO pending_txn
       (id, date, amount, description, kind, category, direction, raw, created_at,
        dest_group_id, split_draft, source, pay_method, counterparty_id,
        lat, lng, place_label, author_person_id, payer_person_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id, row.date, row.amount, row.description, row.kind, row.category ?? null,
      row.direction, row.raw ?? null, row.created_at, row.dest_group_id ?? null, row.split_draft ?? null,
      row.source ?? 'manual', row.pay_method ?? null, row.counterparty_id ?? null,
      row.lat ?? null, row.lng ?? null, row.place_label ?? null,
      row.author_person_id ?? null, row.payer_person_id ?? null,
    ],
  );
}

export async function getPendingCount(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM pending_txn');
  return row?.n ?? 0;
}

export async function deletePending(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM pending_txn WHERE id = ?', [id]);
}

export async function clearPending(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM pending_txn');
}
