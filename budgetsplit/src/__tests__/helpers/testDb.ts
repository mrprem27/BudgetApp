import { DatabaseSync } from 'node:sqlite';
import { SCHEMA, COLUMN_MIGRATIONS } from '../../db/schema';

/**
 * An in-process database that presents the expo-sqlite async surface over
 * `node:sqlite`.
 *
 * The two existing DB tests (`cashSql`, `schemaFixes`) drive raw SQL
 * synchronously, which cannot reach anything `async` — so the screen-data
 * assemblers, which are plain async functions taking a `db`, had no way to be
 * tested at all. This adapter closes that gap: pass it anywhere the app passes a
 * real `SQLiteDatabase` and the whole query stack runs for real, against the
 * real schema.
 *
 * Only the methods the app actually calls are implemented. Add more as needed —
 * deliberately not a full shim, so an unimplemented method fails loudly rather
 * than silently returning nothing.
 */
export type TestDb = {
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
  runAsync(sql: string, params?: unknown[]): Promise<void>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
  /** Escape hatch for fixture setup. */
  raw: DatabaseSync;
};

/** node:sqlite rejects `undefined`; the app's optional fields arrive that way. */
const clean = (params: unknown[] = []) => params.map(p => (p === undefined ? null : p));

export function createTestDb(): TestDb {
  const db = new DatabaseSync(':memory:');
  // WAL is meaningless in :memory: and node:sqlite rejects the pragma form used
  // for a file DB, so drop it. Everything else is the app's own schema.
  db.exec(SCHEMA.replace(/PRAGMA journal_mode=WAL;/, ''));

  // The base SCHEMA is NOT the current schema — columns added later live in
  // COLUMN_MIGRATIONS (e.g. category_budget.cadence). Apply them exactly as
  // openDB does, ignoring duplicate-column errors, or queries fail on columns
  // the app has had for months.
  for (const sql of COLUMN_MIGRATIONS) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  return {
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...clean(params)) as T[];
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      return (db.prepare(sql).get(...clean(params)) as T) ?? null;
    },
    async runAsync(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...clean(params));
    },
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    raw: db,
  };
}

// --- Fixture helpers -------------------------------------------------------

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

export function addPerson(db: TestDb, name: string, isMe = false): string {
  const pid = id('person');
  db.raw.prepare('INSERT INTO person (id, name, avatar_color, is_me) VALUES (?, ?, ?, ?)')
    .run(pid, name, '#20C4B8', isMe ? 1 : 0);
  return pid;
}

export function addGroup(db: TestDb, name: string, isPersonal = false): string {
  const gid = id('group');
  db.raw.prepare(
    `INSERT INTO budget_group (id, name, icon, color, carry_over, is_shared, is_archived, is_personal, simplify_debt, default_split, created_at)
     VALUES (?, ?, 'home', '#20C4B8', 0, 0, 0, ?, 1, 'equal', ?)`,
  ).run(gid, name, isPersonal ? 1 : 0, Date.now());
  return gid;
}

export function addMember(db: TestDb, groupId: string, personId: string): void {
  db.raw.prepare('INSERT INTO group_member (group_id, person_id) VALUES (?, ?)').run(groupId, personId);
}

/**
 * One transaction with its payments and shares. `recurFreq` makes it a recurring
 * RULE template rather than a spend — the distinction the whole ledger rests on.
 */
export function addTxn(db: TestDb, t: {
  groupId: string;
  kind: 'expense' | 'income' | 'settlement';
  date: number;
  category: string;
  payments?: { personId: string; amount: number }[];
  shares?: { personId: string; amount: number }[];
  recurFreq?: string | null;
  isDeleted?: boolean;
}): string {
  const tid = id('txn');
  db.raw.prepare(
    `INSERT INTO txn (id, group_id, kind, entry_mode, date, category, recur_freq, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, 'quick', ?, ?, ?, ?, ?, ?)`,
  ).run(tid, t.groupId, t.kind, t.date, t.category, t.recurFreq ?? null, t.isDeleted ? 1 : 0, t.date, t.date);

  for (const p of t.payments ?? []) {
    db.raw.prepare('INSERT INTO txn_payment (txn_id, person_id, amount) VALUES (?, ?, ?)')
      .run(tid, p.personId, p.amount);
  }
  for (const s of t.shares ?? []) {
    db.raw.prepare('INSERT INTO txn_share (txn_id, person_id, amount) VALUES (?, ?, ?)')
      .run(tid, s.personId, s.amount);
  }
  return tid;
}

/** A simple expense paid and consumed entirely by one person. */
export function addSimpleExpense(
  db: TestDb,
  opts: { groupId: string; personId: string; amount: number; date: number; category?: string; recurFreq?: string },
): string {
  return addTxn(db, {
    groupId: opts.groupId,
    kind: 'expense',
    date: opts.date,
    category: opts.category ?? 'Food',
    payments: [{ personId: opts.personId, amount: opts.amount }],
    shares: [{ personId: opts.personId, amount: opts.amount }],
    recurFreq: opts.recurFreq ?? null,
  });
}

/**
 * Add a category to the global catalog. Needed more often than it looks: names
 * absent from the catalog are "uncategorized" and get folded into "Others" by
 * `foldUncategorized`, so a fixture without this sees one Others row.
 */
export function addCategory(db: TestDb, name: string, kind: 'expense' | 'income' | 'transfer' = 'expense'): void {
  db.raw.prepare('INSERT INTO category (id, group_id, name, icon, color, kind) VALUES (?, NULL, ?, ?, ?, ?)')
    .run(id('cat'), name, 'circle', '#20C4B8', kind);
}

export function setCategoryBudget(
  db: TestDb,
  opts: { groupId: string; category: string; amount: number; cadence?: string },
): void {
  db.raw.prepare(
    `INSERT INTO category_budget (id, group_id, category, period, amount) VALUES (?, ?, ?, ?, ?)`,
  ).run(id('cb'), opts.groupId, opts.category, opts.cadence ?? 'monthly', opts.amount);
}
