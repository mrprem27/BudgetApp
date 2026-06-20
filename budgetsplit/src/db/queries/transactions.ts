import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { materializeInstances, nextOccurrenceOnOrAfter, occurrenceDatesUpTo } from '../../lib/recurrence';
import { logAudit } from './audit';
import { formatRupees } from '../../lib/money';

export type Txn = {
  id: string;
  group_id: string;
  kind: 'income' | 'expense' | 'settlement';
  entry_mode: 'quick' | 'itemized';
  date: number;
  category: string;
  note: string | null;
  attachment_uri: string | null;
  tags: string | null;
  adjustments: string | null;
  recur_freq: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
  recur_interval: number | null;
  recur_end: number | null;
  recur_override_date: number | null;
  parent_recur_id: string | null;
  recur_state: 'active' | 'paused' | 'ended';
  tz: string | null;
  lat: number | null;
  lng: number | null;
  place_label: string | null;
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
};

export type TxnWithSplits = Txn & {
  payments: Array<{ personId: string; amount: number }>;
  shares:   Array<{ personId: string; amount: number }>;
};

export async function getTransactionsForGroup(
  db: SQLite.SQLiteDatabase,
  groupId: string,
): Promise<TxnWithSplits[]> {
  const now = Date.now();

  const nonRecurringTxns = await db.getAllAsync<Txn>(
    `SELECT * FROM txn WHERE group_id = ? AND is_deleted = 0 AND recur_freq IS NULL ORDER BY date DESC, created_at DESC`,
    [groupId],
  );
  const nonRecurring = await Promise.all(nonRecurringTxns.map(t => loadSplits(db, t)));

  const recurTxns = await db.getAllAsync<Txn>(
    `SELECT * FROM txn WHERE group_id = ? AND is_deleted = 0 AND recur_freq IS NOT NULL`,
    [groupId],
  );
  const ids = recurTxns.map(t => t.id);
  const [skipMap, claimedMap] = await Promise.all([getSkipsMap(db, ids), getClaimedOccurrences(db, ids)]);
  const instances: TxnWithSplits[] = [];
  for (const rt of recurTxns) {
    const rw = await loadSplits(db, rt);
    instances.push(...materializeInstances(rw, rt.date, now, mergedOmit(skipMap.get(rt.id), claimedMap.get(rt.id))));
  }

  return [...nonRecurring, ...instances].sort((a, b) => b.date - a.date || b.created_at - a.created_at);
}

export async function getTransactionsInRange(
  db: SQLite.SQLiteDatabase,
  groupId: string | null,
  fromMs: number,
  toMs: number,
): Promise<TxnWithSplits[]> {
  // Non-recurring txns in range
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
  const nonRecurring = await Promise.all(txns.map(t => loadSplits(db, t)));

  // Recurring parent txns that could have instances in the range
  const recurArgs: (string | number)[] = [fromMs];
  let recurWhere = 'WHERE t.recur_freq IS NOT NULL AND t.is_deleted = 0 AND (t.recur_end IS NULL OR t.recur_end >= ?)';
  if (groupId) {
    recurWhere += ' AND t.group_id = ?';
    recurArgs.push(groupId);
  }
  const recurTxns = await db.getAllAsync<Txn>(
    `SELECT t.* FROM txn t ${recurWhere}`,
    recurArgs,
  );
  const ids = recurTxns.map(t => t.id);
  const [skipMap, claimedMap] = await Promise.all([getSkipsMap(db, ids), getClaimedOccurrences(db, ids)]);
  const instances: TxnWithSplits[] = [];
  for (const rt of recurTxns) {
    const rw = await loadSplits(db, rt);
    instances.push(...materializeInstances(rw, fromMs, toMs, mergedOmit(skipMap.get(rt.id), claimedMap.get(rt.id))));
  }

  return [...nonRecurring, ...instances].sort((a, b) => b.date - a.date);
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

export type InsertTxnInput = {
  groupId: string;
  kind: 'income' | 'expense' | 'settlement';
  entryMode: 'quick' | 'itemized';
  date: number;
  category: string;
  note?: string;
  attachmentUri?: string;
  tags?: string[];
  recurFreq?: 'daily' | 'weekly' | 'monthly' | 'custom';
  recurInterval?: number;
  recurEnd?: number;
  lat?: number;
  lng?: number;
  placeLabel?: string;
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
    await db.runAsync(
      `INSERT INTO txn
         (id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,
          recur_freq,recur_interval,recur_end,tz,lat,lng,place_label,currency,is_deleted,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id, input.groupId, input.kind, input.entryMode, input.date,
        input.category, input.note ?? null, input.attachmentUri ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.recurFreq ?? null, input.recurInterval ?? null, input.recurEnd ?? null,
        localTz(), input.lat ?? null, input.lng ?? null, input.placeLabel ?? null,
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
  });

  return id;
}

export type ItemizedAdjustment = { label: string; type: 'tax' | 'tip' | 'discount'; mode: 'flat' | 'percent'; value: string };

export type InsertItemizedTxnInput = InsertTxnInput & {
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    assignedTo: string[];
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
          recur_freq,recur_interval,recur_end,is_deleted,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id, input.groupId, input.kind, 'itemized', input.date,
        input.category, input.note ?? null, input.attachmentUri ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.adjustments && input.adjustments.length ? JSON.stringify(input.adjustments) : null,
        null, null, null, now, now,
      ],
    );
    for (const item of input.items) {
      await db.runAsync(
        'INSERT INTO line_item (id, txn_id, name, qty, unit_price, assigned_to) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), id, item.name, item.qty, item.unitPrice, JSON.stringify(item.assignedTo)],
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
        'INSERT INTO line_item (id, txn_id, name, qty, unit_price, assigned_to) VALUES (?, ?, ?, ?, ?, ?)',
        [uuid(), id, item.name, item.qty, item.unitPrice, JSON.stringify(item.assignedTo)],
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
  return Promise.all(rows.map(t => loadSplits(db, t)));
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
  const [skipMap, claimedMap] = await Promise.all([getSkipsMap(db, ids), getClaimedOccurrences(db, ids)]);
  let created = 0;

  for (const t of templates) {
    const rw = await loadSplits(db, t);
    const dates = occurrenceDatesUpTo(t.date, t.recur_freq!, t.recur_interval ?? 1, now, t.recur_end);
    const skips = skipMap.get(t.id);
    const claimed = claimedMap.get(t.id);
    for (const occ of dates) {
      // Older occurrences stay virtual (still shown/counted) to avoid a huge
      // first-run back-fill; only recent due ones become real editable rows.
      if (occ < horizonStart) continue;
      if (skips?.has(occ) || claimed?.has(occ)) continue;
      const newId = uuid();
      await db.withTransactionAsync(async () => {
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
      });
      created++;
    }
  }
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
  // New rule starts at the split date and inherits the original end.
  const forward: InsertTxnInput = { ...newRule, date: splitDate, recurEnd: old.recur_end ?? undefined };

  // insertTxn opens its own transaction, so it runs first (atomic on its own);
  // then cap/supersede the old rule + audit in a second transaction.
  const newId = await insertTxn(db, forward);
  await db.withTransactionAsync(async () => {
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
      `UPDATE txn SET kind=?, date=?, category=?, note=?, updated_at=? WHERE id=?`,
      [input.kind, input.date, input.category, input.note ?? null, now, input.id],
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
