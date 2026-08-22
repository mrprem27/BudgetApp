import fs from 'fs';
import path from 'path';
import { SCHEMA, COLUMN_MIGRATIONS } from '../db/schema';

/**
 * `restorePending` is the inverse of every destructive action in Review — Undo
 * after a confirm, after a discard, after a bulk delete. A column missing from it
 * is not a cosmetic gap: it is data the user destroys by pressing **Undo**, and
 * once they re-confirm the row it is gone for good.
 *
 * It had drifted twice. `lat`/`lng`/`place_label` were absent, so undoing a
 * Scan & Pay commit threw away the location captured at the shop; then
 * `author_person_id`/`payer_person_id` were added to the table and not to it.
 * Neither had any test at all — `restorePending` was completely uncovered.
 *
 * So this does not test a column list against another column list. It reads the
 * REAL schema and fails when the table grows a column the restore does not carry.
 */

const PENDING_SRC = path.resolve(__dirname, '../db/queries/pending.ts');

/** Every column `pending_txn` actually has, from the DDL plus its migrations. */
function schemaColumns(): string[] {
  const ddl = SCHEMA.slice(SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS pending_txn'));
  const body = ddl.slice(ddl.indexOf('(') + 1, ddl.indexOf('\n);'));
  const fromDdl = body
    .split('\n')
    .map(l => l.replace(/--.*$/, '').trim())
    .filter(Boolean)
    .map(l => l.split(/\s+/)[0].replace(/,$/, ''))
    .filter(c => /^[a-z_]+$/.test(c));

  const fromMigrations = COLUMN_MIGRATIONS
    .map(m => /ALTER TABLE pending_txn ADD COLUMN (\w+)/.exec(m)?.[1])
    .filter((c): c is string => !!c);

  return Array.from(new Set([...fromDdl, ...fromMigrations]));
}

/** The column list inside `restorePending`'s INSERT. */
function restoreColumns(): string[] {
  const src = fs.readFileSync(PENDING_SRC, 'utf8');
  const fn = src.slice(src.indexOf('export async function restorePending'));
  const cols = /INSERT OR REPLACE INTO pending_txn\s*\n?\s*\(([\s\S]*?)\)\s*\n?\s*VALUES/.exec(fn);
  if (!cols) throw new Error('could not find restorePending column list');
  return cols[1].split(',').map(c => c.trim()).filter(Boolean);
}

describe('Undo restores a pending row whole', () => {
  it('finds both column lists', () => {
    expect(schemaColumns().length).toBeGreaterThan(10);
    expect(restoreColumns().length).toBeGreaterThan(10);
  });

  it('carries every column the table has', () => {
    const missing = schemaColumns().filter(c => !restoreColumns().includes(c));
    // A name here is a field Undo silently drops. Add it to `restorePending`.
    expect(missing).toEqual([]);
  });

  it('names no column the table does not have', () => {
    // The other direction: a typo'd or removed column makes every Undo throw at
    // runtime, which no type check would catch inside a SQL string.
    const unknown = restoreColumns().filter(c => !schemaColumns().includes(c));
    expect(unknown).toEqual([]);
  });

  it('binds exactly one placeholder per column', () => {
    const src = fs.readFileSync(PENDING_SRC, 'utf8');
    const fn = src.slice(src.indexOf('export async function restorePending'));
    const values = /VALUES \(([^)]*)\)/.exec(fn);
    expect(values).not.toBeNull();
    const placeholders = values![1].split(',').filter(p => p.trim() === '?').length;
    expect(placeholders).toBe(restoreColumns().length);
  });
});
