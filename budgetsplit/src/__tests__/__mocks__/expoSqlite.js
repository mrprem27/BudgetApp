/**
 * A REAL in-memory `expo-sqlite`, backed by `node:sqlite`.
 *
 * This replaced an empty stub, and the empty stub is why nine wrong-money bugs shipped with
 * a green suite: mapping `expo-sqlite` to a no-op makes every module in `src/db/queries/`
 * *unexecutable* by construction. Nothing in `balances.ts`, `recurring.ts` or
 * `moneyProfile.ts` had ever run in a test — so the tests could not have failed, whatever
 * the SQL said.
 *
 * The precedent was already in `jest.config.js`, one line below: AsyncStorage is a real
 * in-memory implementation "not an empty stub, so the ... stores can be tested". That
 * instinct simply never reached the database.
 *
 * Only the methods the app actually calls are implemented — `runAsync`, `execAsync`,
 * `getAllAsync`, `getFirstAsync`, `withTransactionAsync`, `withExclusiveTransactionAsync`.
 * Anything else should throw loudly rather than return undefined and be mistaken for a
 * passing assertion.
 */
const { DatabaseSync } = require('node:sqlite');

/** `undefined` is not a bindable value in node:sqlite; expo tolerates it, so normalise. */
function bind(params) {
  const list = params === undefined ? [] : Array.isArray(params) ? params : [params];
  return list.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

const n = v => (typeof v === 'bigint' ? Number(v) : v);

function wrap(raw) {
  const db = {
    _raw: raw,

    async execAsync(sql) {
      raw.exec(sql);
    },

    async runAsync(sql, params) {
      const r = raw.prepare(sql).run(...bind(params));
      return { lastInsertRowId: n(r.lastInsertRowid), changes: n(r.changes) };
    },

    async getAllAsync(sql, params) {
      return raw.prepare(sql).all(...bind(params));
    },

    async getFirstAsync(sql, params) {
      // expo returns null for "no row"; node:sqlite returns undefined.
      return raw.prepare(sql).get(...bind(params)) ?? null;
    },

    /**
     * Real BEGIN/COMMIT, with ROLLBACK on throw — the app relies on this for every
     * multi-table write, so a fake that just ran the callback would let a half-written
     * split pass a test that exists to prove it cannot happen.
     */
    async withTransactionAsync(fn) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },

    /**
     * The exclusive variant, which is what a table rebuild and a restore use —
     * both replace tables wholesale, and both need the rollback to be real. Expo
     * hands the callback its own `txn` handle (a `Transaction extends
     * SQLiteDatabase`), so this passes the same wrapped db back rather than
     * nothing: a callback that used the handle would otherwise pass here and
     * throw on a device.
     */
    async withExclusiveTransactionAsync(fn) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        await fn(db);
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },

    async closeAsync() {
      raw.close();
    },
  };
  return db;
}

async function openDatabaseAsync() {
  return wrap(new DatabaseSync(':memory:'));
}

function openDatabaseSync() {
  return wrap(new DatabaseSync(':memory:'));
}

module.exports = {
  openDatabaseAsync,
  openDatabaseSync,
  deleteDatabaseAsync: async () => {},
  // Components only; never rendered by these tests.
  SQLiteProvider: () => null,
  useSQLiteContext: () => {
    throw new Error('useSQLiteContext is not available in node tests — pass a db explicitly.');
  },
};
