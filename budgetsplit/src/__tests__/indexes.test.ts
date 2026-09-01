import { DatabaseSync } from 'node:sqlite';
import { SCHEMA, COLUMN_MIGRATIONS, INDEXES } from '../db/schema';

/**
 * Every index in `INDEXES` must actually be creatable.
 *
 * `openDB` runs these one statement at a time and swallows failures, so that one
 * bad index cannot cost the other twenty-six — which means a broken one is
 * INVISIBLE at runtime. The screen is just slower, forever. This is the only
 * thing that can notice.
 *
 * It has already earned itself: splitting the script on `;` without stripping
 * comments first cut two `--` lines mid-sentence (they contain a semicolon), and
 * SQLite got the remainder as SQL. Two indexes silently never existed.
 */
function schemaDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA.replace(/PRAGMA journal_mode=WAL;/, ''));
  // Columns added after v1 — several indexes are over them.
  for (const sql of COLUMN_MIGRATIONS) {
    try { db.exec(sql); } catch { /* already present in SCHEMA */ }
  }
  return db;
}

/** The same split `openDB` uses, comments stripped first. */
const statements = (script: string) =>
  script.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);

describe('every index is creatable against the real schema', () => {
  it('finds statements, so an empty split cannot pass vacuously', () => {
    expect(statements(INDEXES).length).toBeGreaterThan(20);
  });

  it('creates every one, with no statement failing', () => {
    const db = schemaDb();
    const failures: string[] = [];
    for (const sql of statements(INDEXES)) {
      try {
        db.exec(`${sql};`);
      } catch (e) {
        failures.push(`${sql.slice(0, 70)} -> ${e instanceof Error ? e.message : e}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('leaves every index it names present, and every one it drops gone', () => {
    const db = schemaDb();
    for (const sql of statements(INDEXES)) { try { db.exec(`${sql};`); } catch { /* counted above */ } }

    const present = new Set((db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index'",
    ).all() as { name: string }[]).map(r => r.name));

    // Names, not a count — SCHEMA defines indexes of its own, so counting rows
    // measures the wrong thing (which is what the first version of this did).
    const named = (re: RegExp) => statements(INDEXES)
      .map(s => re.exec(s)?.[1]).filter((n): n is string => !!n);

    const created = named(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
    const dropped = named(/^DROP\s+INDEX\s+(?:IF EXISTS\s+)?(\w+)/i);

    expect(created.length).toBeGreaterThan(20);
    expect(created.filter(n => !present.has(n))).toEqual([]);
    // A DROP here supersedes an index SCHEMA no longer defines; it must be gone.
    expect(dropped.filter(n => present.has(n))).toEqual([]);
  });

  it('is idempotent — a second pass adds nothing and throws nothing', () => {
    const db = schemaDb();
    const run = () => statements(INDEXES).forEach(sql => db.exec(`${sql};`));
    run();
    const after = () => (db.prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
    ).get() as { c: number }).c;
    const first = after();
    expect(run).not.toThrow();
    expect(after()).toBe(first);
  });
});
