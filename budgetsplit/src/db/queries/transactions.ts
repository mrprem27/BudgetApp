import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';

import { logAudit } from './audit';
import { formatRupees } from '../../lib/money';
import { rankTagsByFrequency, serializeTags } from '../../lib/tags';
import type { EntryMode, RecurFreq, RecurState, PayMethod, TxnKind, TxnSource } from '../../constants/enums';

export type Txn = {
  id: string;
  group_id: string;
  kind: TxnKind;
  entry_mode: EntryMode;
  date: number;
  category: string;
  note: string | null;
  attachment_uri: string | null;
  tags: string | null;
  adjustments: string | null;
  recur_freq: RecurFreq | null;
  recur_interval: number | null;
  recur_end: number | null;
  recur_override_date: number | null;
  parent_recur_id: string | null;
  recur_state: RecurState;
  /** When the rule was paused — lets resume skip the dormant gap instead of back-posting it. */
  recur_paused_at: number | null;
  tz: string | null;
  lat: number | null;
  lng: number | null;
  place_label: string | null;
  pay_method: PayMethod | null;
  source: TxnSource | null;
  currency: string | null;
  is_deleted: number;
  created_at: number;
  updated_at: number;
};

export type TxnPayment = { txn_id: string; person_id: string; amount: number };
export type TxnShare  = { txn_id: string; person_id: string; amount: number };

export type LineItem = {
  id: string;
  txn_id: string;
  name: string;
  qty: number;
  unit_price: number;
  assigned_to: string;
  split_mode: string | null;
  split_values: string | null; // JSON
};

export type TxnWithSplits = Txn & {
  payments: Array<{ personId: string; amount: number }>;
  shares:   Array<{ personId: string; amount: number }>;
};

export async function getTransactionsForGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<TxnWithSplits[]> {
  // Only real rows: one-time entries + materialized recurring occurrences.
  // Future occurrences are never pre-calculated — they appear only after midnight
  // when materializeDueOccurrences() runs on app open.
  const rows = await db.getAllAsync<Txn>(
    `SELECT * FROM txn WHERE group_id = ? AND is_deleted = 0 AND recur_freq IS NULL ORDER BY date DESC, created_at DESC`,
    [groupId],
  );
  return loadSplitsMany(db, rows);
}

export async function getTransactionsInRange(
  db: SQLite.SQLiteDatabase,
  groupId: string | null,
  fromMs: number,
  toMs: number,
): Promise<TxnWithSplits[]> {
  // Only real rows in range — one-time entries + materialized recurring occurrences.
  const args: (string | number)[] = [fromMs, toMs];
  let where = 'WHERE t.date >= ? AND t.date <= ? AND t.is_deleted = 0 AND t.recur_freq IS NULL';
  if (groupId) {
    where += ' AND t.group_id = ?';
    args.push(groupId);
  }
  const txns = await db.getAllAsync<Txn>(
    `SELECT t.* FROM txn t ${where} ORDER BY t.date DESC`,
    args,
  );
  return loadSplitsMany(db, txns);
}

export type MyActivityItem = TxnWithSplits & { groupName: string; isPersonal: boolean };

/**
 * Every transaction **involving me**, across all groups — the data behind the
 * unified Personal view. Includes personal-group entries plus any shared-group
 * txn where I have a share or payment (my expenses/income, my share of a group
 * expense, settlements to/from me). One row per source txn (never duplicated);
 * each carries its group name so the UI can label it and link back to the source.
 */
export async function getMyActivity(db: SQLite.SQLiteDatabase, meId: string): Promise<MyActivityItem[]> {
  const rows = await db.getAllAsync<Txn & { group_name: string; grp_personal: number }>(
    `SELECT t.*, bg.name AS group_name, bg.is_personal AS grp_personal
       FROM txn t
       JOIN budget_group bg ON bg.id = t.group_id
      WHERE t.is_deleted = 0 AND t.recur_freq IS NULL
        AND (
          bg.is_personal = 1
          OR EXISTS (SELECT 1 FROM txn_share sh   WHERE sh.txn_id = t.id AND sh.person_id = ?)
          OR EXISTS (SELECT 1 FROM txn_payment pp WHERE pp.txn_id = t.id AND pp.person_id = ?)
        )
      ORDER BY t.date DESC`,
    [meId, meId],
  );
  const meta = new Map(rows.map(r => [r.id, { groupName: r.group_name, isPersonal: r.grp_personal === 1 }]));
  const withSplits = await loadSplitsMany(db, rows);
  return withSplits.map(t => ({ ...t, groupName: meta.get(t.id)!.groupName, isPersonal: meta.get(t.id)!.isPersonal }));
}

/** @internal shared with queries/recurring.ts */
export async function loadSplits(db: SQLite.SQLiteDatabase, txn: Txn): Promise<TxnWithSplits> {
  const payments = await db.getAllAsync<TxnPayment>(
    'SELECT * FROM txn_payment WHERE txn_id = ?', [txn.id],
  );
  const shares = await db.getAllAsync<TxnShare>(
    'SELECT * FROM txn_share WHERE txn_id = ?', [txn.id],
  );
  return {
    ...txn,
    payments: payments.map(p => ({ personId: p.person_id, amount: p.amount })),
    shares:   shares.map(s => ({ personId: s.person_id, amount: s.amount })),
  };
}

/**
 * Attach payments + shares to a list of transactions in **two** queries total
 * (one per side), instead of two per row. Replaces the old `Promise.all(rows.map
 * (loadSplits))` N+1 pattern on every list/range loader. Ids are chunked to stay
 * under SQLite's bound-parameter limit (~999) for very large groups.
 */
const SPLIT_IN_CHUNK = 400;

/** @internal shared with queries/recurring.ts */
export async function loadSplitsMany(db: SQLite.SQLiteDatabase, txns: Txn[]): Promise<TxnWithSplits[]> {
  if (txns.length === 0) return [];
  const ids = txns.map(t => t.id);
  const payByTxn = new Map<string, Array<{ personId: string; amount: number }>>();
  const shareByTxn = new Map<string, Array<{ personId: string; amount: number }>>();

  for (let i = 0; i < ids.length; i += SPLIT_IN_CHUNK) {
    const chunk = ids.slice(i, i + SPLIT_IN_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const [payments, shares] = await Promise.all([
      db.getAllAsync<TxnPayment>(`SELECT * FROM txn_payment WHERE txn_id IN (${placeholders})`, chunk),
      db.getAllAsync<TxnShare>(`SELECT * FROM txn_share WHERE txn_id IN (${placeholders})`, chunk),
    ]);
    for (const p of payments) {
      let arr = payByTxn.get(p.txn_id);
      if (!arr) { arr = []; payByTxn.set(p.txn_id, arr); }
      arr.push({ personId: p.person_id, amount: p.amount });
    }
    for (const s of shares) {
      let arr = shareByTxn.get(s.txn_id);
      if (!arr) { arr = []; shareByTxn.set(s.txn_id, arr); }
      arr.push({ personId: s.person_id, amount: s.amount });
    }
  }

  return txns.map(t => ({
    ...t,
    payments: payByTxn.get(t.id) ?? [],
    shares:   shareByTxn.get(t.id) ?? [],
  }));
}

export type InsertTxnInput = {
  groupId: string;
  kind: TxnKind;
  entryMode: EntryMode;
  date: number;
  category: string;
  note?: string;
  attachmentUri?: string;
  tags?: string[];
  recurFreq?: RecurFreq;
  recurInterval?: number;
  recurEnd?: number;
  lat?: number;
  lng?: number;
  placeLabel?: string;
  payMethod?: PayMethod;
  currency?: string;
  /** Where this came from. Omit for hand-typed — null is what every pre-existing row is. */
  source?: TxnSource;
  payments: Array<{ personId: string; amount: number }>;
  shares:   Array<{ personId: string; amount: number }>;
};

function localTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; }
}

/**
 * Every tag in use, most-used first — the vocabulary for the tag picker.
 *
 * No `tag` table on purpose: tags are derived from the rows that use them, so there is
 * nothing to keep in sync, no orphan cleanup, and renaming is just editing the rows.
 * Mirrors `getCategoriesByFrequency`.
 *
 * The counting happens in JS because `tags` is a JSON array inside one TEXT column and
 * SQLite can't split it without `json_each`; the SELECT is narrowed to non-null values so
 * only rows that actually carry tags are read.
 */
export async function getTagsByFrequency(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ tags: string | null }>(
    `SELECT tags FROM txn WHERE tags IS NOT NULL AND is_deleted = 0`,
  );
  return rankTagsByFrequency(rows.map(r => r.tags));
}

export async function insertTxn(
  db: SQLite.SQLiteDatabase,
  input: InsertTxnInput,
): Promise<string> {
  const id = uuid();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await insertTxnRows(db, input, id, now);
  });
  return id;
}

/**
 * Write a txn row + its payments/shares + audit entries. Does NOT open its own
 * transaction — call it inside an existing `withTransactionAsync` (expo-sqlite
 * can't nest). `insertTxn` wraps it; `splitRecurringSeries` reuses it so the new
 * rule + the old-rule cap commit atomically.
 */
/** @internal shared with queries/recurring.ts */
export async function insertTxnRows(
  db: SQLite.SQLiteDatabase,
  input: InsertTxnInput,
  id: string,
  now: number,
): Promise<void> {
    await db.runAsync(
      `INSERT INTO txn
         (id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,
          recur_freq,recur_interval,recur_end,tz,lat,lng,place_label,pay_method,currency,source,is_deleted,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id, input.groupId, input.kind, input.entryMode, input.date,
        input.category, input.note ?? null, input.attachmentUri ?? null,
        serializeTags(input.tags ?? []),
        input.recurFreq ?? null, input.recurInterval ?? null, input.recurEnd ?? null,
        localTz(), input.lat ?? null, input.lng ?? null, input.placeLabel ?? null,
        input.payMethod ?? null,
        input.currency ?? null,
        input.source ?? null,
        now, now,
      ],
    );
    for (const p of input.payments) {
      await db.runAsync(
        'INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, p.personId, p.amount],
      );
    }
    for (const s of input.shares) {
      await db.runAsync(
        'INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, s.personId, s.amount],
      );
    }

    const totalPaid = input.payments.reduce((a, p) => a + p.amount, 0);
    if (input.kind === 'settlement') {
      // A personal transfer records only the side that moved, so money arriving
      // has no payment row — read the amount off the shares instead of logging ₹0.
      const moved = totalPaid || input.shares.reduce((a, s) => a + s.amount, 0);
      await logAudit(db, {
        entityType: 'settlement', entityId: id, groupId: input.groupId,
        action: 'settled', amount: moved,
        summary: `Settled ${formatRupees(moved)}`,
      });
    } else {
      const label = input.kind === 'income' ? 'income' : 'expense';
      await logAudit(db, {
        entityType: 'txn', entityId: id, groupId: input.groupId,
        action: 'created', amount: totalPaid,
        summary: `Added ${label} ${formatRupees(totalPaid)} · ${input.category}`,
      });
      if (input.recurFreq) {
        await logAudit(db, {
          entityType: 'recurring', entityId: id, groupId: input.groupId,
          action: 'created', amount: totalPaid,
          summary: `New recurring ${input.recurFreq} ${label} · ${input.category}`,
        });
      }
    }
}

/** One person paying another, recorded as a settlement. The single canonical
 *  way to record money moving between people — used by the global Settle screen
 *  and the Quick-Add Transfer pill, so the settlement txn shape lives in one
 *  place (was hand-built identically in both). */
export type SettlementInput = {
  groupId: string;
  fromId: string;
  toId: string;
  amount: number;
  date?: number;
  note?: string;
  payMethod?: PayMethod;
  /** Transfer reason — now a real 'transfer' category. Defaults to 'Settlement'. */
  category?: string;
};

export async function recordSettlement(db: SQLite.SQLiteDatabase, s: SettlementInput): Promise<string> {
  return insertTxn(db, {
    groupId: s.groupId, kind: 'settlement', entryMode: 'quick', date: s.date ?? Date.now(),
    category: s.category ?? 'Settlement', note: s.note, payMethod: s.payMethod,
    payments: [{ personId: s.fromId, amount: s.amount }],
    shares: [{ personId: s.toId, amount: s.amount }],
  });
}

/** The four adjustment buttons the Itemized screen offers. `service` was missing
 * here while the UI offered it — papered over by a cast in useItemizedForm. */
export type ItemizedAdjustmentType = 'tax' | 'tip' | 'discount' | 'service';
export type ItemizedAdjustment = { label: string; type: ItemizedAdjustmentType; mode: 'flat' | 'percent'; value: string };

export type InsertItemizedTxnInput = InsertTxnInput & {
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    assignedTo: string[];
    /** Per-item split mode + raw per-member inputs, persisted so splits round-trip on edit. */
    splitMode?: string;
    splitValues?: Record<string, string>;
  }>;
  /** Persisted so an itemized bill round-trips on edit (tax/tip/discount). */
  adjustments?: ItemizedAdjustment[];
};

export async function insertItemizedTxn(
  db: SQLite.SQLiteDatabase,
  input: InsertItemizedTxnInput,
): Promise<string> {
  const id = uuid();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO txn
         (id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,adjustments,
          recur_freq,recur_interval,recur_end,tz,lat,lng,place_label,pay_method,is_deleted,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id, input.groupId, input.kind, 'itemized', input.date,
        input.category, input.note ?? null, input.attachmentUri ?? null,
        serializeTags(input.tags ?? []),
        input.adjustments && input.adjustments.length ? JSON.stringify(input.adjustments) : null,
        null, null, null, localTz(), input.lat ?? null, input.lng ?? null, input.placeLabel ?? null,
        input.payMethod ?? null, now, now,
      ],
    );
    for (const item of input.items) {
      await db.runAsync(
        'INSERT INTO line_item (id, txn_id, name, qty, unit_price, assigned_to, split_mode, split_values) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), id, item.name, item.qty, item.unitPrice, JSON.stringify(item.assignedTo), item.splitMode ?? null, item.splitValues ? JSON.stringify(item.splitValues) : null],
      );
    }
    for (const p of input.payments) {
      await db.runAsync(
        'INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, p.personId, p.amount],
      );
    }
    for (const s of input.shares) {
      await db.runAsync(
        'INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [id, s.personId, s.amount],
      );
    }

    const totalPaid = input.payments.reduce((a, p) => a + p.amount, 0);
    await logAudit(db, {
      entityType: 'txn', entityId: id, groupId: input.groupId,
      action: 'created', amount: totalPaid,
      summary: `Added itemized bill ${formatRupees(totalPaid)} · ${input.category}`,
    });
  });

  return id;
}

/** Edit an itemized bill in place: rewrite the txn row + its line items, payments
 *  and shares atomically (delete-then-reinsert, so no orphaned line_item rows). */
export async function updateItemizedTxn(
  db: SQLite.SQLiteDatabase,
  id: string,
  input: InsertItemizedTxnInput,
): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE txn SET category=?, note=?, attachment_uri=?, tags=?, adjustments=?, date=?, pay_method=?, updated_at=? WHERE id=?`,
      [
        input.category, input.note ?? null, input.attachmentUri ?? null,
        serializeTags(input.tags ?? []),
        input.adjustments && input.adjustments.length ? JSON.stringify(input.adjustments) : null,
        input.date, input.payMethod ?? null, now, id,
      ],
    );
    await db.runAsync('DELETE FROM line_item WHERE txn_id=?', [id]);
    await db.runAsync('DELETE FROM txn_payment WHERE txn_id=?', [id]);
    await db.runAsync('DELETE FROM txn_share WHERE txn_id=?', [id]);
    for (const item of input.items) {
      await db.runAsync(
        'INSERT INTO line_item (id, txn_id, name, qty, unit_price, assigned_to, split_mode, split_values) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid(), id, item.name, item.qty, item.unitPrice, JSON.stringify(item.assignedTo), item.splitMode ?? null, item.splitValues ? JSON.stringify(item.splitValues) : null],
      );
    }
    for (const p of input.payments) {
      await db.runAsync('INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)', [id, p.personId, p.amount]);
    }
    for (const s of input.shares) {
      await db.runAsync('INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)', [id, s.personId, s.amount]);
    }
    const totalPaid = input.payments.reduce((a, p) => a + p.amount, 0);
    await logAudit(db, {
      entityType: 'txn', entityId: id, groupId: input.groupId,
      action: 'updated', amount: totalPaid,
      summary: `Edited itemized bill ${formatRupees(totalPaid)} · ${input.category}`,
    });
  });
}

/** Restore a soft-deleted transaction (the Undo of softDeleteTxn). Pass
 *  `cascadeOccurrences` to also restore a rule's materialized occurrences —
 *  only when the matching delete cascaded. */
export async function restoreTxn(
  db: SQLite.SQLiteDatabase,
  txnId: string,
  cascadeOccurrences = false,
): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE txn SET is_deleted=0, updated_at=? WHERE id=?', [now, txnId]);
    if (cascadeOccurrences) {
      await db.runAsync('UPDATE txn SET is_deleted=0, updated_at=? WHERE parent_recur_id=?', [now, txnId]);
    }
  });
}

/**
 * Soft-delete a transaction. For a recurring **template**, the already-logged
 * occurrences are kept by default (they're real transactions) — pass
 * `cascadeOccurrences` only when the user explicitly confirms deleting all
 * occurrences too.
 */
export async function softDeleteTxn(
  db: SQLite.SQLiteDatabase,
  txnId: string,
  cascadeOccurrences = false,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<Txn>('SELECT * FROM txn WHERE id=?', [txnId]);
    await db.runAsync('UPDATE txn SET is_deleted=1, updated_at=? WHERE id=?', [Date.now(), txnId]);
    if (cascadeOccurrences && row?.recur_freq) {
      await db.runAsync('UPDATE txn SET is_deleted=1, updated_at=? WHERE parent_recur_id=?', [Date.now(), txnId]);
    }
    if (row) {
      const paid = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount),0) as total FROM txn_payment WHERE txn_id=?', [txnId],
      );
      await logAudit(db, {
        entityType: 'txn', entityId: txnId, groupId: row.group_id,
        action: 'deleted', amount: paid?.total ?? null,
        summary: `Deleted ${row.kind} · ${row.category}`,
      });
    }
  });
}

/**
 * Unlink receipt files belonging to transactions soft-deleted more than
 * `maxAgeMs` ago. There's no "recently deleted" browsing screen — the only
 * way back is the ~5s Undo toast (`UndoToast.tsx`'s `UNDO_MS`) right after
 * delete — so a row still `is_deleted=1` well past that is not coming back,
 * and its photo would otherwise sit on disk forever (softDeleteTxn never
 * touches `attachment_uri`). This module has no native file IO (AGENTS.md's
 * layering rule), so — same split `deleteGroup` uses for its own orphaned
 * attachments — this only reads and nulls the DB column; the caller deletes
 * the actual files.
 */
export async function reapDeletedAttachments(
  db: SQLite.SQLiteDatabase,
  maxAgeMs: number,
): Promise<string[]> {
  const cutoff = Date.now() - maxAgeMs;
  const rows = await db.getAllAsync<{ id: string; attachment_uri: string }>(
    `SELECT id, attachment_uri FROM txn
     WHERE is_deleted = 1 AND attachment_uri IS NOT NULL AND updated_at < ?`,
    [cutoff],
  );
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  await db.runAsync(
    `UPDATE txn SET attachment_uri = NULL WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  return rows.map(r => r.attachment_uri);
}

/* ---- Recurring lifecycle (the parent txn row IS the recurring rule) ---- */

export async function findRecentDuplicate(
  db: SQLite.SQLiteDatabase,
  groupId: string,
  category: string,
  amountPaise: number,
  dateMs: number,
): Promise<boolean> {
  const window = 24 * 60 * 60 * 1000;
  const rows = await db.getAllAsync<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount),0) as total
       FROM txn t LEFT JOIN txn_payment p ON p.txn_id = t.id
      WHERE t.group_id=? AND t.category=? AND t.is_deleted=0 AND t.recur_freq IS NULL
        AND t.date BETWEEN ? AND ?
      GROUP BY t.id`,
    [groupId, category, dateMs - window, dateMs + window],
  );
  return rows.some(r => r.total === amountPaise);
}

/**
 * Which of these candidates already look like something logged in the last ±24 h.
 *
 * Quick Add has warned about duplicates since it shipped; the Review commit path never did, even
 * though it is the one that bulk-inserts rows parsed out of a statement — the place a duplicate is
 * *most* likely, because re-importing an overlapping export is a normal thing to do (`V2-20`).
 *
 * Returns the indices that matched, so the caller can name a count instead of interrogating the
 * user row by row. Expenses only, matching Quick Add: an income or a settlement repeating at the
 * same amount is ordinary, and warning about it would train people to dismiss the warning.
 */
export async function findDuplicatesAmong(
  db: SQLite.SQLiteDatabase,
  candidates: { groupId: string; kind: TxnKind; category: string; total: number; dateMs: number }[],
): Promise<number[]> {
  const hits: number[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.kind !== 'expense') continue;
    if (await findRecentDuplicate(db, c.groupId, c.category, c.total, c.dateMs)) hits.push(i);
  }
  return hits;
}

/** Null out every transaction's attachment reference (used by "clear all attachments"). */
export async function clearAllAttachmentRefs(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync('UPDATE txn SET attachment_uri=NULL WHERE attachment_uri IS NOT NULL');
}

/** Set (or clear, with null) the receipt attachment on a single transaction. */
export async function setTxnAttachment(
  db: SQLite.SQLiteDatabase,
  txnId: string,
  uri: string | null,
): Promise<void> {
  await db.runAsync('UPDATE txn SET attachment_uri=?, updated_at=? WHERE id=?', [uri, Date.now(), txnId]);
}

/** Active recurring rules across all groups, with their splits — for reminders. */
export async function getActiveRecurringRules(db: SQLite.SQLiteDatabase): Promise<TxnWithSplits[]> {
  const rows = await db.getAllAsync<Txn>(
    `SELECT * FROM txn WHERE recur_freq IS NOT NULL AND is_deleted = 0 AND recur_state = 'active'`,
  );
  return loadSplitsMany(db, rows);
}

export async function getLineItems(db: SQLite.SQLiteDatabase, txnId: string): Promise<LineItem[]> {
  return db.getAllAsync<LineItem>('SELECT * FROM line_item WHERE txn_id = ?', [txnId]);
}

export async function getTxnById(
  db: SQLite.SQLiteDatabase,
  txnId: string,
): Promise<TxnWithSplits | null> {
  const row = await db.getFirstAsync<Txn>('SELECT * FROM txn WHERE id = ?', [txnId]);
  if (!row) return null;
  return loadSplits(db, row);
}

export type UpdateTxnInput = {
  id: string;
  groupId: string;
  kind: TxnKind;
  date: number;
  category: string;
  note?: string;
  payMethod?: PayMethod;
  /** Full replacement set — omit to clear. Normalized by `serializeTags`. */
  tags?: string[];
  payments: Array<{ personId: string; amount: number }>;
  shares:   Array<{ personId: string; amount: number }>;
};

/** Edit an existing transaction: rewrite the row + its payments/shares. */
export async function updateTxn(
  db: SQLite.SQLiteDatabase,
  input: UpdateTxnInput,
): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE txn SET kind=?, date=?, category=?, note=?, pay_method=?, tags=?, updated_at=? WHERE id=?`,
      [input.kind, input.date, input.category, input.note ?? null, input.payMethod ?? null, serializeTags(input.tags ?? []), now, input.id],
    );
    await db.runAsync('DELETE FROM txn_payment WHERE txn_id=?', [input.id]);
    await db.runAsync('DELETE FROM txn_share WHERE txn_id=?', [input.id]);
    for (const p of input.payments) {
      await db.runAsync(
        'INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [input.id, p.personId, p.amount],
      );
    }
    for (const s of input.shares) {
      await db.runAsync(
        'INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)',
        [input.id, s.personId, s.amount],
      );
    }
    const total = input.payments.reduce((a, p) => a + p.amount, 0);
    await logAudit(db, {
      entityType: 'txn', entityId: input.id, groupId: input.groupId,
      action: 'updated', amount: total,
      summary: `Edited ${input.kind} ${formatRupees(total)} · ${input.category}`,
    });
  });
}

export type LedgerStats = {
  /** Epoch ms of the earliest real ledger row (null on an empty ledger). */
  firstTxnMs: number | null;
  /** Real ledger rows (rule templates excluded). */
  txnCount: number;
  /** Any income ever logged, as a row or a recurring rule. */
  hasIncome: boolean;
};

/** Ledger footprint for the health score's minimum-data gate. */
export async function getLedgerStats(db: SQLite.SQLiteDatabase): Promise<LedgerStats> {
  const row = await db.getFirstAsync<{ first: number | null; n: number; incomes: number }>(
    `SELECT MIN(CASE WHEN recur_freq IS NULL THEN date END) AS first,
            SUM(CASE WHEN recur_freq IS NULL THEN 1 ELSE 0 END) AS n,
            SUM(CASE WHEN kind = 'income' THEN 1 ELSE 0 END) AS incomes
       FROM txn
      WHERE is_deleted = 0`,
  );
  return {
    firstTxnMs: row?.first ?? null,
    txnCount: row?.n ?? 0,
    hasIncome: (row?.incomes ?? 0) > 0,
  };
}
