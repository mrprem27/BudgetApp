import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { nextOccurrenceOnOrAfter, occurrenceDatesUpTo } from '../../lib/recurrence';
import { logAudit } from './audit';
import { formatRupees } from '../../lib/money';
import type { EntryMode, RecurFreq, RecurState, PayMethod } from '../../constants/enums';

export type Txn = {
  id: string;
  group_id: string;
  kind: 'income' | 'expense' | 'settlement';
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
  tz: string | null;
  lat: number | null;
  lng: number | null;
  place_label: string | null;
  pay_method: PayMethod | null;
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

async function loadSplits(db: SQLite.SQLiteDatabase, txn: Txn): Promise<TxnWithSplits> {
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

async function loadSplitsMany(db: SQLite.SQLiteDatabase, txns: Txn[]): Promise<TxnWithSplits[]> {
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
  kind: 'income' | 'expense' | 'settlement';
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
  payments: Array<{ personId: string; amount: number }>;
  shares:   Array<{ personId: string; amount: number }>;
};

function localTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; }
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
async function insertTxnRows(
  db: SQLite.SQLiteDatabase,
  input: InsertTxnInput,
  id: string,
  now: number,
): Promise<void> {
    await db.runAsync(
      `INSERT INTO txn
         (id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,
          recur_freq,recur_interval,recur_end,tz,lat,lng,place_label,pay_method,currency,is_deleted,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id, input.groupId, input.kind, input.entryMode, input.date,
        input.category, input.note ?? null, input.attachmentUri ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.recurFreq ?? null, input.recurInterval ?? null, input.recurEnd ?? null,
        localTz(), input.lat ?? null, input.lng ?? null, input.placeLabel ?? null,
        input.payMethod ?? null,
        input.currency ?? null,
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
      await logAudit(db, {
        entityType: 'settlement', entityId: id, groupId: input.groupId,
        action: 'settled', amount: totalPaid,
        summary: `Settled ${formatRupees(totalPaid)}`,
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

export type ItemizedAdjustment = { label: string; type: 'tax' | 'tip' | 'discount'; mode: 'flat' | 'percent'; value: string };

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
          recur_freq,recur_interval,recur_end,tz,lat,lng,place_label,is_deleted,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id, input.groupId, input.kind, 'itemized', input.date,
        input.category, input.note ?? null, input.attachmentUri ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.adjustments && input.adjustments.length ? JSON.stringify(input.adjustments) : null,
        null, null, null, localTz(), input.lat ?? null, input.lng ?? null, input.placeLabel ?? null, now, now,
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
      `UPDATE txn SET category=?, note=?, attachment_uri=?, tags=?, adjustments=?, date=?, updated_at=? WHERE id=?`,
      [
        input.category, input.note ?? null, input.attachmentUri ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.adjustments && input.adjustments.length ? JSON.stringify(input.adjustments) : null,
        input.date, now, id,
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

/* ---- Recurring lifecycle (the parent txn row IS the recurring rule) ---- */

export async function getRecurringForGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<TxnWithSplits[]> {
  const rows = await db.getAllAsync<Txn>(
    `SELECT * FROM txn
     WHERE group_id = ? AND is_deleted = 0 AND recur_freq IS NOT NULL
     ORDER BY recur_state ASC, date DESC`,
    [groupId],
  );
  return loadSplitsMany(db, rows);
}

export async function pauseRecurring(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<Txn>('SELECT * FROM txn WHERE id=?', [txnId]);
    // Pause = stop generating new instances from now; past instances remain.
    await db.runAsync(
      'UPDATE txn SET recur_state=?, recur_end=?, updated_at=? WHERE id=?',
      ['paused', now, now, txnId],
    );
    if (row) {
      await logAudit(db, {
        entityType: 'recurring', entityId: txnId, groupId: row.group_id,
        action: 'paused', summary: `Paused recurring · ${row.category}`,
      });
    }
  });
}

export async function resumeRecurring(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<Txn>('SELECT * FROM txn WHERE id=?', [txnId]);
    await db.runAsync(
      'UPDATE txn SET recur_state=?, recur_end=NULL, updated_at=? WHERE id=?',
      ['active', now, txnId],
    );
    if (row) {
      await logAudit(db, {
        entityType: 'recurring', entityId: txnId, groupId: row.group_id,
        action: 'resumed', summary: `Resumed recurring · ${row.category}`,
      });
    }
  });
}

export async function endRecurring(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<Txn>('SELECT * FROM txn WHERE id=?', [txnId]);
    await db.runAsync(
      'UPDATE txn SET recur_state=?, recur_end=?, updated_at=? WHERE id=?',
      ['ended', now, now, txnId],
    );
    if (row) {
      await logAudit(db, {
        entityType: 'recurring', entityId: txnId, groupId: row.group_id,
        action: 'ended', summary: `Ended recurring · ${row.category}`,
      });
    }
  });
}

// --- Recurring exceptions (skip-one) & series-split ----------------------

/** Batch-load skipped occurrence dates for the given series, as series_id → Set<ms>. */
export async function getSkipsMap(
  db: SQLite.SQLiteDatabase,
  seriesIds: string[],
): Promise<Map<string, Set<number>>> {
  const map = new Map<string, Set<number>>();
  if (seriesIds.length === 0) return map;
  const placeholders = seriesIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ series_id: string; occurrence_date: number }>(
    `SELECT series_id, occurrence_date FROM recur_skip WHERE series_id IN (${placeholders})`,
    seriesIds,
  );
  for (const r of rows) {
    let set = map.get(r.series_id);
    if (!set) { set = new Set(); map.set(r.series_id, set); }
    set.add(r.occurrence_date);
  }
  return map;
}

/**
 * Occurrence dates (ms) that already have a **real** materialized row for each
 * series — counted regardless of is_deleted, so a deleted occurrence never
 * regenerates as a virtual instance. The virtual generator treats these like
 * skips to avoid double-counting against the real rows.
 */
export async function getClaimedOccurrences(
  db: SQLite.SQLiteDatabase,
  seriesIds: string[],
): Promise<Map<string, Set<number>>> {
  const map = new Map<string, Set<number>>();
  if (seriesIds.length === 0) return map;
  const placeholders = seriesIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ parent_recur_id: string; recur_override_date: number }>(
    `SELECT parent_recur_id, recur_override_date FROM txn
       WHERE parent_recur_id IN (${placeholders}) AND recur_override_date IS NOT NULL`,
    seriesIds,
  );
  for (const r of rows) {
    let set = map.get(r.parent_recur_id);
    if (!set) { set = new Set(); map.set(r.parent_recur_id, set); }
    set.add(r.recur_override_date);
  }
  return map;
}

/** Merge skip + claimed-occurrence sets for one series into a single omit-set. */
function mergedOmit(skips?: Set<number>, claimed?: Set<number>): Set<number> | undefined {
  if (!skips && !claimed) return undefined;
  const out = new Set<number>(skips);
  if (claimed) for (const c of claimed) out.add(c);
  return out;
}

/**
 * Turn every **due** recurring occurrence (date ≤ now) into a real, editable
 * transaction linked to its rule via `parent_recur_id` + `recur_override_date`.
 * Idempotent — skips occurrences already claimed (real row exists) or skipped.
 * Run once on app open. Future occurrences stay virtual until they come due.
 */
const MATERIALIZE_HORIZON_MS = 92 * 24 * 60 * 60 * 1000; // back-fill at most ~3 months

export async function materializeDueOccurrences(db: SQLite.SQLiteDatabase): Promise<number> {
  const now = Date.now();
  const horizonStart = now - MATERIALIZE_HORIZON_MS;
  const templates = await db.getAllAsync<Txn>(
    `SELECT * FROM txn WHERE recur_freq IS NOT NULL AND is_deleted = 0 AND recur_state = 'active'`,
  );
  if (templates.length === 0) return 0;

  const ids = templates.map(t => t.id);
  // Batch-load splits + skips + claims once (was an N+1 loadSplits per template).
  const [withSplits, skipMap, claimedMap] = await Promise.all([
    loadSplitsMany(db, templates),
    getSkipsMap(db, ids),
    getClaimedOccurrences(db, ids),
  ]);
  const splitsById = new Map(withSplits.map(t => [t.id, t]));
  let created = 0;

  // One transaction for the whole run (was one per occurrence → ~90 fsync'd
  // transactions on a daily rule's first back-fill). Materialization is
  // idempotent — a failure rolls back and retries on the next open.
  await db.withTransactionAsync(async () => {
    for (const t of templates) {
      const rw = splitsById.get(t.id);
      if (!rw) continue;
      const dates = occurrenceDatesUpTo(t.date, t.recur_freq!, t.recur_interval ?? 1, now, t.recur_end);
      const skips = skipMap.get(t.id);
      const claimed = claimedMap.get(t.id);
      for (const occ of dates) {
        // Older occurrences stay virtual (still shown/counted) to avoid a huge
        // first-run back-fill; only recent due ones become real editable rows.
        if (occ < horizonStart) continue;
        if (skips?.has(occ) || claimed?.has(occ)) continue;
        const newId = uuid();
        await db.runAsync(
          `INSERT INTO txn
             (id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,adjustments,
              recur_freq,recur_interval,recur_end,recur_override_date,parent_recur_id,is_deleted,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,0,?,?)`,
          [
            newId, t.group_id, t.kind, t.entry_mode, occ, t.category, t.note,
            t.attachment_uri, t.tags, t.adjustments, occ, t.id, now, now,
          ],
        );
        for (const p of rw.payments) {
          await db.runAsync('INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)', [newId, p.personId, p.amount]);
        }
        for (const s of rw.shares) {
          await db.runAsync('INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)', [newId, s.personId, s.amount]);
        }
        created++;
      }
    }
  });
  return created;
}

/** All skipped occurrence dates (ms) for one series. */
export async function getSkips(db: SQLite.SQLiteDatabase, seriesId: string): Promise<number[]> {
  const rows = await db.getAllAsync<{ occurrence_date: number }>(
    'SELECT occurrence_date FROM recur_skip WHERE series_id = ? ORDER BY occurrence_date ASC',
    [seriesId],
  );
  return rows.map(r => r.occurrence_date);
}

/**
 * Skip a single upcoming occurrence: the next one on/after now that isn't
 * already skipped. Persists a skip row so materialization omits that date.
 * Returns the skipped occurrence date (ms), or null if there's no future one.
 */
export async function skipNextOccurrence(db: SQLite.SQLiteDatabase, seriesId: string): Promise<number | null> {
  const series = await getTxnById(db, seriesId);
  if (!series || !series.recur_freq) return null;
  const skipped = new Set(await getSkips(db, seriesId));

  // Walk forward from now until we find an occurrence that isn't already skipped.
  let from = Date.now();
  let date = nextOccurrenceOnOrAfter(series, from);
  let guard = 0;
  while (date !== null && skipped.has(date) && guard < 1000) {
    from = date + 1;
    date = nextOccurrenceOnOrAfter(series, from);
    guard++;
  }
  if (date === null) return null;

  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT OR IGNORE INTO recur_skip (series_id, occurrence_date, created_at) VALUES (?, ?, ?)',
      [seriesId, date as number, now],
    );
    await logAudit(db, {
      entityType: 'recurring', entityId: seriesId, groupId: series.group_id,
      action: 'updated', summary: `Skipped one occurrence · ${series.category}`,
    });
  });
  return date;
}

/**
 * Undo the next upcoming skip for a series (the earliest skipped date ≥ now).
 * Returns the un-skipped occurrence date (ms), or null if no upcoming skip found.
 */
export async function undoNextSkip(db: SQLite.SQLiteDatabase, seriesId: string): Promise<number | null> {
  const now = Date.now();
  const row = await db.getFirstAsync<{ occurrence_date: number }>(
    'SELECT occurrence_date FROM recur_skip WHERE series_id = ? AND occurrence_date >= ? ORDER BY occurrence_date ASC LIMIT 1',
    [seriesId, now],
  );
  if (!row) return null;
  await db.runAsync(
    'DELETE FROM recur_skip WHERE series_id = ? AND occurrence_date = ?',
    [seriesId, row.occurrence_date],
  );
  return row.occurrence_date;
}

/**
 * Apply a "this and future" edit by splitting the series at its next occurrence:
 * the old rule is capped just before the split (history preserved), and a new
 * rule carries the edited values forward. Never rewrites past occurrences.
 * Returns the new series id (or the old id if nothing needed splitting).
 */
export async function splitRecurringSeries(
  db: SQLite.SQLiteDatabase,
  seriesId: string,
  newRule: InsertTxnInput,
): Promise<string | null> {
  const old = await getTxnById(db, seriesId);
  if (!old || !old.recur_freq) return null;

  const splitDate = nextOccurrenceOnOrAfter(old, Date.now());
  if (splitDate === null) return null; // series already finished — nothing future to edit

  const now = Date.now();
  const newId = uuid();
  // New rule starts at the split date and inherits the original end.
  const forward: InsertTxnInput = { ...newRule, date: splitDate, recurEnd: old.recur_end ?? undefined };

  // Insert the new rule AND cap/supersede the old one in a single transaction —
  // if the cap failed after a committed insert we'd have two overlapping active
  // rules and double-counted occurrences.
  await db.withTransactionAsync(async () => {
    await insertTxnRows(db, forward, newId, now);
    if (splitDate <= old.date) {
      // The old rule never produced a past occurrence — fully superseded.
      await db.runAsync('UPDATE txn SET is_deleted=1, updated_at=? WHERE id=?', [now, seriesId]);
    } else {
      // Cap the old rule just before the split; its past occurrences remain.
      await db.runAsync(
        'UPDATE txn SET recur_end=?, recur_state=?, updated_at=? WHERE id=?',
        [splitDate - 1, 'ended', now, seriesId],
      );
    }
    await logAudit(db, {
      entityType: 'recurring', entityId: seriesId, groupId: old.group_id,
      action: 'updated', summary: `Edited recurring (this & future) · ${newRule.category}`,
    });
  });
  return newId;
}

/**
 * True if a non-recurring transaction with the same category + total amount
 * already exists in the group within ±24h — used to warn about accidental
 * double entries before saving.
 */
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

/**
 * Tracking streak: how many consecutive days (ending today, or yesterday if
 * nothing logged today yet) have at least one real entry. `loggedToday` lets
 * the UI nudge gently without breaking the streak prematurely. Read-only and
 * tolerant — used for an encouraging dashboard chip, not for any money math.
 */
export async function getTrackingStreak(
  db: SQLite.SQLiteDatabase,
): Promise<{ count: number; loggedToday: boolean }> {
  const rows = await db.getAllAsync<{ date: number }>(
    'SELECT date FROM txn WHERE is_deleted = 0 AND recur_freq IS NULL ORDER BY date DESC',
  );
  const dayKey = (ms: number) => { const d = new Date(ms); return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate(); };
  const days = new Set<number>();
  for (const r of rows) days.add(dayKey(r.date));
  if (days.size === 0) return { count: 0, loggedToday: false };

  const today = new Date();
  const todayKey = dayKey(today.getTime());
  const loggedToday = days.has(todayKey);

  // Walk back a day at a time from the anchor (today if logged, else yesterday).
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!loggedToday) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(cursor.getFullYear() * 10000 + cursor.getMonth() * 100 + cursor.getDate())) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { count, loggedToday };
}

export type UpdateTxnInput = {
  id: string;
  groupId: string;
  kind: 'income' | 'expense' | 'settlement';
  date: number;
  category: string;
  note?: string;
  payMethod?: PayMethod;
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
      `UPDATE txn SET kind=?, date=?, category=?, note=?, pay_method=?, updated_at=? WHERE id=?`,
      [input.kind, input.date, input.category, input.note ?? null, input.payMethod ?? null, now, input.id],
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
