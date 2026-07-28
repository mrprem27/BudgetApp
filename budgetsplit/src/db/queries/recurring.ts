import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { nextOccurrenceOnOrAfter, occurrenceDatesUpTo } from '../../lib/recurrence';
import { logAudit } from './audit';
import type { RecurFreq } from '../../constants/enums';
import {
  loadSplits, loadSplitsMany, getTxnById, insertTxn, insertTxnRows,
  type Txn, type TxnWithSplits, type InsertTxnInput,
} from './transactions';

/**
 * Recurring-series queries — the rule lifecycle (pause / resume / end), the
 * per-series skip ledger, occurrence materialisation and series splitting.
 *
 * Extracted from `queries/transactions.ts`, which had grown to 888 lines by
 * carrying this alongside ordinary transaction CRUD. Both halves share
 * `loadSplits` and the `Txn` types, which still live in transactions.ts.
 */

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
async function getClaimedOccurrences(
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
async function getSkips(db: SQLite.SQLiteDatabase, seriesId: string): Promise<number[]> {
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
