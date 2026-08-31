import * as SQLite from 'expo-sqlite';
import { queueEntry } from './syncOutbox';
import { NOT_AWAITING_APPROVAL, AWAITING_APPROVAL_COL } from './approvalSql';
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
    // The group's recurring list is a LEDGER view — it shows a peer's rule while I
    // am deciding, marked, the same way the group ledger shows their one-off.
    `SELECT t.*, ${AWAITING_APPROVAL_COL} FROM txn t
     WHERE t.group_id = ? AND t.is_deleted = 0 AND t.recur_freq IS NOT NULL
     ORDER BY t.recur_state ASC, t.date DESC`,
    [groupId],
  );
  return loadSplitsMany(db, rows);
}

export async function pauseRecurring(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<Txn>('SELECT * FROM txn WHERE id=?', [txnId]);
    // Pause = stop generating new instances from now; past instances remain.
    // `recur_end` is deliberately untouched: it is the *user's* end date and there
    // is no second copy of it, so writing `now` here destroyed it — and resume,
    // having nothing to restore, set it to NULL and made the rule immortal.
    // `materializeDueOccurrences` filters on `recur_state = 'active'`, so state
    // alone is a sufficient gate. `recur_paused_at` is what resume needs.
    await db.runAsync(
      'UPDATE txn SET recur_state=?, recur_paused_at=?, updated_at=? WHERE id=?',
      ['paused', now, now, txnId],
    );
    if (row) {
      await queueEntry(db, txnId, row.group_id);
      await logAudit(db, {
        entityType: 'recurring', entityId: txnId, groupId: row.group_id,
        action: 'paused', summary: `Paused recurring · ${row.category}`,
      });
    }
  });
}

/**
 * Resume a paused rule from *now*, not from where it was paused.
 *
 * Nothing is claimed while a rule is paused, so the next foreground would
 * materialize the entire gap in one go — pausing a daily ₹300 rule for 60 days
 * and resuming posted 60 rows and ₹18,000 the user never spent. The dormant
 * window is written into the existing skip ledger (`recur_skip`, which
 * materialization already consults), so the gap is recorded as deliberately
 * missed rather than silently back-posted. `recur_end` is left exactly as the
 * user set it.
 */
export async function resumeRecurring(db: SQLite.SQLiteDatabase, txnId: string): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<Txn>('SELECT * FROM txn WHERE id=?', [txnId]);
    if (row?.recur_freq && row.recur_paused_at != null) {
      const gap = occurrenceDatesUpTo(
        row.date, row.recur_freq, row.recur_interval ?? 1, now, row.recur_end,
      ).filter(d => d >= row.recur_paused_at! && d <= now);
      for (const occ of gap) {
        // INSERT OR IGNORE: an occurrence the user had already skipped by hand
        // is in here too, and its row must not be duplicated (PK is the pair).
        await db.runAsync(
          'INSERT OR IGNORE INTO recur_skip (series_id, occurrence_date, created_at) VALUES (?,?,?)',
          [txnId, occ, now],
        );
      }
    }
    await db.runAsync(
      'UPDATE txn SET recur_state=?, recur_paused_at=NULL, updated_at=? WHERE id=?',
      ['active', now, txnId],
    );
    if (row) {
      await queueEntry(db, txnId, row.group_id);
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
      await queueEntry(db, txnId, row.group_id);
      await logAudit(db, {
        entityType: 'recurring', entityId: txnId, groupId: row.group_id,
        action: 'ended', summary: `Ended recurring · ${row.category}`,
      });
    }
  });
}

/**
 * Turn an already-committed transaction into a recurring rule's anchor row.
 *
 * An UPDATE, not a new insert, so the rule keeps the id everything already
 * points at. But a rule is a TEMPLATE: `recur_freq IS NULL` excludes it from
 * every ledger and every aggregate. So the moment this UPDATE lands, the ₹2,000
 * the user actually spent stops existing in any total — and it only came back
 * because the next materialize run happened to recreate it at the same date.
 *
 * That is a coincidence with a hole in it. `MATERIALIZE_HORIZON_MS` skips
 * anything older than ~3 months, so converting an older transaction — exactly
 * what the Review "looks recurring?" suggestion offers on an imported statement —
 * deleted it from the ledger permanently, with no row, no audit line and no
 * symptom beyond a total that quietly shrank.
 *
 * So the occurrence is written here, explicitly, in the same transaction: the
 * spend that already happened stays a real entry, and the rule governs what comes
 * next. Materialization then finds it claimed and leaves that date alone.
 */
export async function convertToRecurring(
  db: SQLite.SQLiteDatabase,
  txnId: string,
  freq: RecurFreq,
  interval: number,
): Promise<void> {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<Txn>('SELECT * FROM txn WHERE id=?', [txnId]);
    if (!row) return;
    const splits = await loadSplits(db, row);

    await db.runAsync(
      'UPDATE txn SET recur_freq=?, recur_interval=?, recur_state=?, recur_end=NULL, updated_at=? WHERE id=?',
      [freq, interval, 'active', now, txnId],
    );
    // The rule itself changed shape and must reach the group: a peer holding the
    // old plain expense would otherwise keep it as a one-off while this device
    // treats it as a rule.
    await queueEntry(db, txnId, row.group_id);

    // Hand the original spend back to the ledger as this rule's first occurrence.
    await insertOccurrence(db, row, splits, row.date, now);

    await logAudit(db, {
      entityType: 'recurring', entityId: txnId, groupId: row.group_id,
      action: 'created', summary: `Made recurring from a suggestion · ${row.category}`,
    });
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

/**
 * Turn one due date of a rule into a real, editable transaction.
 *
 * Extracted so `convertToRecurring` writes an occurrence the same way
 * materialization does. It used to rely on the next materialize run to produce
 * the anchor's own occurrence, which quietly failed for anything older than
 * `MATERIALIZE_HORIZON_MS`: the row became a rule (and rules are excluded from
 * every ledger read), the back-fill skipped it as too old, and the money was
 * simply gone.
 *
 * Every descriptive column the template carries must come across. `pay_method` is
 * the one that cost money: it is the axis `cash.ts` and `CASH_TOTALS_SQL` split
 * on, so a recurring CARD bill materializing as NULL was booked as cash out
 * instead of debt — understating available cash and `creditUsed` by the same
 * amount every month, compounding. The SQL/TS parity test could not see it,
 * because both sides read the same corrupted row.
 *
 * `recur_*` are deliberately NULL: an occurrence is a real transaction, not a
 * rule. Caller must already hold a transaction — this opens none.
 */
async function insertOccurrence(
  db: SQLite.SQLiteDatabase,
  template: Txn,
  splits: { payments: { personId: string; amount: number }[]; shares: { personId: string; amount: number }[] },
  occ: number,
  now: number,
): Promise<string> {
  const newId = uuid();
  await db.runAsync(
    `INSERT INTO txn
       (id,group_id,kind,entry_mode,date,category,note,attachment_uri,tags,adjustments,
        pay_method,currency,source,tz,lat,lng,place_label,
        recur_freq,recur_interval,recur_end,recur_override_date,parent_recur_id,is_deleted,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,0,?,?)`,
    [
      newId, template.group_id, template.kind, template.entry_mode, occ, template.category, template.note,
      template.attachment_uri, template.tags, template.adjustments,
      template.pay_method, template.currency, template.source, template.tz,
      template.lat, template.lng, template.place_label,
      occ, template.id, now, now,
    ],
  );
  // A fourth INSERT INTO txn, distinct from the three in transactions.ts.
  // Occurrences are real entries a peer must see, and the caller makes N of them
  // per run — so it queues per occurrence, not per call.
  await queueEntry(db, newId, template.group_id);
  for (const p of splits.payments) {
    await db.runAsync('INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)', [newId, p.personId, p.amount]);
  }
  for (const s of splits.shares) {
    await db.runAsync('INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)', [newId, s.personId, s.amount]);
  }
  return newId;
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
    // `recur_mode = 'auto'` — a 'remind' rule posts nothing by itself. It surfaces
    // as due and waits to be logged, which is the only honest treatment for money
    // that may not have arrived: a salary silently posted on the 1st corrupts
    // every figure downstream and does it quietly.
    //
    // A rule still waiting on me spawns NOTHING. Approving a peer's rule is
    // approving indefinite future spending, so until I have, it must not quietly
    // start posting occurrences — which would be the loudest possible version of
    // the thing this model exists to stop.
    // `author_person_id IS NULL` — only rules I WROTE post from this device.
    //
    // A rule travels to every member of a shared group, and materialization runs
    // on every device that opens the app. Both phones therefore woke up on the
    // 1st, each minted its own uuid for the same occurrence, each queued it, and
    // each received the other's — because `getClaimedOccurrences` dedupes on
    // `(parent_recur_id, recur_override_date)` LOCALLY, and neither of those
    // columns is on `EntryDoc`, so an incoming occurrence arrives as an ordinary
    // expense claiming nothing. A ₹30,000 shared rent rule posted ₹60,000 every
    // month, forever, with nothing on either screen to explain it.
    //
    // One author, one poster. The other members still SEE the rule and its
    // upcoming occurrences (those are generated virtually for display), and the
    // real entry reaches them the ordinary way — over sync, from the person whose
    // rule it is. The cost is that a rule stops posting while its author does not
    // open the app, which is visibly nothing rather than invisibly double.
    `SELECT t.* FROM txn t
      WHERE t.recur_freq IS NOT NULL AND t.is_deleted = 0 AND t.recur_state = 'active'
        AND t.recur_mode = 'auto'
        AND t.author_person_id IS NULL
        AND ${NOT_AWAITING_APPROVAL}`,
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
        await insertOccurrence(db, t, rw, occ, now);
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
