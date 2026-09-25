import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createD1, MIGRATIONS_DIR } from './helpers/d1';
import {
  APPROVAL_STATE, ASSET_BUCKET, AUDIT_ACTION, AUDIT_ENTITY_TYPE, BUDGET_CADENCE, CATEGORY_KIND,
  ENTRY_MODE, GROUP_ROLE, PAY_METHOD, PRIORITY, RECEIVABLE_STATE, RECUR_FREQ, RECUR_MODE,
  RECUR_STATE, SAVINGS_FREQUENCY, SAVINGS_TXN_KIND, SPLIT_MODE, TRUST_STATE, TXN_KIND, TXN_SOURCE,
} from '../../constants/enums';
import { ASSET_KIND } from '../../constants/assets';

/**
 * Guards over the server schema (SPEC-SERVER.md §2), which lives as ONE file,
 * `0001_schema.sql` — a development-phase choice. No real account has ever
 * signed in, so there is nothing an incremental migration protects; eleven files
 * that each existed only to be safe against data that doesn't exist is pure
 * overhead. When the schema changes, this file is edited directly.
 *
 * Two copies of an enum — the app's `constants/enums.ts` and a server CHECK — are
 * two things that will drift. The moment the app gains a value the server does
 * not know, every row carrying it is refused on upload, silently, for everyone.
 * These tests make that drift a red build instead.
 */

const SCHEMA = '0001_schema.sql';
const db = createD1();
const tableSql = (t: string): string =>
  (db.raw.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t) as { sql: string }).sql;

/** The values in `CHECK (… col IN ('a','b') …)` for one column of one table. */
function checkValues(table: string, column: string): string[] {
  const m = new RegExp(`\\b${column}\\s+IN\\s*\\(([^)]*)\\)`).exec(tableSql(table));
  if (!m) throw new Error(`${table}.${column} has no CHECK … IN (…)`);
  return [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]).sort();
}

describe('server enums match constants/enums.ts', () => {
  const pairs: Array<[string, string, readonly string[]]> = [
    ['groups', 'default_split', SPLIT_MODE],
    ['group_members', 'role', GROUP_ROLE],
    ['friends', 'receivable_status', RECEIVABLE_STATE],
    ['categories', 'kind', CATEGORY_KIND],
    ['budgets', 'cadence', BUDGET_CADENCE],
    ['transactions', 'kind', TXN_KIND],
    ['transactions', 'entry_mode', ENTRY_MODE],
    ['transactions', 'pay_method', PAY_METHOD],
    ['transactions', 'source', TXN_SOURCE],
    ['recurring_rules', 'frequency', RECUR_FREQ],
    ['recurring_rules', 'status', RECUR_STATE],
    ['recurring_rules', 'mode', RECUR_MODE],
    ['transaction_items', 'split_mode', SPLIT_MODE],
    ['approvals', 'status', APPROVAL_STATE],
    ['approvals', 'landed_pay_method', PAY_METHOD],
    ['trust_settings', 'level', TRUST_STATE],
    ['assets', 'kind', ASSET_KIND],
    ['savings_goals', 'priority', PRIORITY],
    ['savings_goals', 'frequency', SAVINGS_FREQUENCY],
    ['savings_transactions', 'kind', SAVINGS_TXN_KIND],
    ['savings_transactions', 'source_bucket', ASSET_BUCKET],
    ['imported_transactions', 'kind', TXN_KIND],
    ['imported_transactions', 'pay_method', PAY_METHOD],
    ['activity_log', 'action', AUDIT_ACTION],
    ['activity_log', 'entity', AUDIT_ENTITY_TYPE],
  ];
  it.each(pairs)('%s.%s', (table, column, values) => {
    expect(checkValues(table, column)).toEqual([...values].sort());
  });
});

describe('every table is classified, and every sync one follows its convention', () => {
  const created = [...readFileSync(join(MIGRATIONS_DIR, SCHEMA), 'utf8').matchAll(/CREATE TABLE (\w+)/g)].map(m => m[1]);

  /** §1 — accounts and linking. The v1 sync and backup tables went in S22. */
  const V1 = [
    'users', 'magic_links', 'sessions', 'invites', 'links', 'friend_request', 'friend_block',
  ];
  /** Pulled to the phone: carries every §2.3 column and a (scope_id, seq) index. */
  const SYNCED = [
    'profiles', 'friends', 'groups', 'group_members', 'group_preferences', 'categories', 'budgets',
    'assets', 'savings_goals', 'savings_transactions', 'money_profiles', 'user_preferences',
    'imported_transactions', 'transactions', 'approvals', 'trust_settings', 'disputes',
  ];
  /** Written and read only with their parent transaction, in the same batch. */
  const BUNDLE_CHILD = [
    'recurring_rules', 'recurring_skips', 'transaction_payers', 'transaction_splits',
    'transaction_items', 'transaction_tags',
  ];
  /** Pulled, append-only, written by the Worker alone. */
  const FEED = ['activity_log'];
  /** Server-side only; never pulled as a table. */
  const BOOKKEEPING = ['sync_scopes', 'devices', 'sync_rejections', 'write_guard', 'people', 'transaction_history'];

  const columns = (t: string) =>
    (db.raw.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map(c => c.name);
  const indexes = (t: string) =>
    (db.raw.prepare(`PRAGMA index_list(${t})`).all() as Array<{ name: string }>)
      .map(i => (db.raw.prepare(`PRAGMA index_info(${i.name})`).all() as Array<{ name: string }>).map(c => c.name).join(','));

  it('classifies every table in the schema, exactly once', () => {
    const classified = [...V1, ...SYNCED, ...BUNDLE_CHILD, ...FEED, ...BOOKKEEPING];
    expect([...classified].sort()).toEqual([...created].sort());
    expect(new Set(classified).size).toBe(classified.length);
  });

  it.each(SYNCED)('%s carries the synced-table columns and a pull index', t => {
    expect(columns(t)).toEqual(expect.arrayContaining([
      'id', 'scope_id', 'version', 'seq', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at',
    ]));
    expect(indexes(t)).toContain('scope_id,seq');
  });

  it.each(FEED)('%s is pullable (scope_id, seq, index) and append-only (no version)', t => {
    expect(columns(t)).toEqual(expect.arrayContaining(['id', 'scope_id', 'seq']));
    expect(columns(t)).not.toContain('version');
    expect(indexes(t)).toContain('scope_id,seq');
  });

  it.each(BUNDLE_CHILD)('%s hangs off a transaction and carries no scope of its own', t => {
    expect(columns(t)).not.toContain('scope_id');
    const fks = (db.raw.prepare(`PRAGMA foreign_key_list(${t})`).all() as Array<{ table: string }>).map(f => f.table);
    expect(fks.some(f => f === 'transactions' || f === 'recurring_rules')).toBe(true);
  });
});

describe('the schema is one file, hand-written in its final shape', () => {
  it('never patches a table with ALTER — a column belongs in its CREATE TABLE', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, SCHEMA), 'utf8').replace(/--[^\n]*/g, '');
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b/i);
  });
});
