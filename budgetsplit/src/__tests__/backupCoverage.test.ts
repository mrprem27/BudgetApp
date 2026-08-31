import { SCHEMA } from '../db/schema';
import { BACKUP_TABLES, NEVER_BACKED_UP } from '../lib/backup';

/**
 * Every table is either backed up, or documented as deliberately not.
 *
 * This exists because `person_group_trust` and `txn_dispute` were added on the
 * same day and ended up in NEITHER list. The consequence was silent in both
 * directions: they were lost on a new phone, because a backup never carried them;
 * and after a restore they were left pointing at `person`, `budget_group` and
 * `txn` rows that had just been deleted, because `restoreAllTables` only clears
 * what it is about to re-insert.
 *
 * Nothing failed. Nothing warned. `sync_outbox` had the identical bug a week
 * earlier and was fixed by hand — which is exactly the signal that a hand fix was
 * the wrong shape of answer. This is the right one.
 */
describe('backup coverage', () => {
  const tables = [...SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]);

  it('finds the schema, so an empty match cannot pass this vacuously', () => {
    expect(tables.length).toBeGreaterThan(15);
    expect(tables).toContain('txn');
  });

  it('accounts for every table', () => {
    const accounted = new Set<string>([...BACKUP_TABLES, ...Object.keys(NEVER_BACKED_UP)]);
    const orphans = tables.filter(t => !accounted.has(t));
    // A new table is a DECISION: carry it, or say why not. Never neither.
    expect(orphans).toEqual([]);
  });

  it('never lists a table as both carried and excluded', () => {
    const carried = new Set<string>(BACKUP_TABLES);
    expect(Object.keys(NEVER_BACKED_UP).filter(t => carried.has(t))).toEqual([]);
  });

  it('every exclusion gives a real reason', () => {
    // "Excluded" with no explanation is how a mistake gets laundered into a rule.
    for (const [table, why] of Object.entries(NEVER_BACKED_UP)) {
      expect(why.length).toBeGreaterThan(40);
      expect(tables).toContain(table);   // and it must still exist
    }
  });

  /**
   * Restore is DELETE-then-INSERT over `BACKUP_TABLES` in reverse, so a child
   * listed before its parent is deleted after it — a foreign-key violation on the
   * one operation with no undo.
   */
  it('lists parents before children', () => {
    const position = new Map(BACKUP_TABLES.map((t, i) => [t as string, i]));
    const deps: Array<[string, string]> = [];

    for (const m of SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)([\s\S]*?)\n\);/g)) {
      const [, table, body] = m;
      for (const ref of body.matchAll(/REFERENCES\s+(\w+)/g)) {
        if (ref[1] !== table) deps.push([table, ref[1]]);
      }
    }
    expect(deps.length).toBeGreaterThan(5);   // the parse really found FKs

    for (const [child, parent] of deps) {
      if (!position.has(child) || !position.has(parent)) continue;
      expect(position.get(parent)!).toBeLessThan(position.get(child)!);
    }
  });
});
