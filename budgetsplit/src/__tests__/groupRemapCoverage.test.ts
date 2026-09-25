import fs from 'fs';
import path from 'path';
import { GROUP_REMAP_COLUMNS } from '../db/queries/mergeLedger';

/**
 * Every column that names a `budget_group` has to be handled somewhere when
 * Merge folds one group into another (`mergeLedger.ts` task `M3`) — either
 * blanket-remapped (`GROUP_REMAP_COLUMNS`) or special-cased in
 * `foldPersonalGroup` because a blanket remap risks a uniqueness collision
 * (`category_budget`) or names no useful data for a Personal group
 * (`group_member`, `person_group_trust`, dropped rather than remapped).
 *
 * Asserted against the schema, not just the current column list, so a new
 * `group_id`-shaped column added later fails this test instead of silently
 * being left behind mid-merge — the same reasoning `personRemap.ts`'s
 * `REMAP_COLUMNS` comment gives for person columns.
 */

/** Handled by `foldPersonalGroup` itself, not by the blanket remap list. */
const SPECIAL_CASED: ReadonlyArray<readonly [string, string]> = [
  ['group_member', 'group_id'],       // dropped — only member is "me", already on the account's group
  ['person_group_trust', 'group_id'], // dropped — trust for a Personal group is meaningless
  ['category_budget', 'group_id'],    // remapped, but only after a uniqueness check
  // Always NULL: categories are a single global catalog (schema.ts's own comment
  // above the table), so there is never a group id in this column to remap.
  ['category', 'group_id'],
];

function liveTableColumns(schemaSrc: string): Array<{ table: string; column: string }> {
  const out: Array<{ table: string; column: string }> = [];
  const tableRe = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g;
  for (const m of schemaSrc.matchAll(tableRe)) {
    const [, table, body] = m;
    for (const line of body.split('\n')) {
      const col = /^\s*(\w*group_id)\s+TEXT\b/.exec(line);
      if (col) out.push({ table, column: col[1] });
    }
  }
  return out;
}

it('every group_id-shaped column is either remapped or special-cased when Merge folds two groups', () => {
  const schemaSrc = fs.readFileSync(path.join(__dirname, '../db/schema.ts'), 'utf8');
  const columns = liveTableColumns(schemaSrc);
  expect(columns.length).toBeGreaterThan(3); // the scan actually found the live tables

  const covered = new Set([...GROUP_REMAP_COLUMNS, ...SPECIAL_CASED].map(([t, c]) => `${t}.${c}`));
  const uncovered = columns.filter(({ table, column }) => !covered.has(`${table}.${column}`));
  expect(uncovered).toEqual([]);
});

it('keeps no stale entry — every remapped or special-cased column still exists in the schema', () => {
  const schemaSrc = fs.readFileSync(path.join(__dirname, '../db/schema.ts'), 'utf8');
  const live = new Set(liveTableColumns(schemaSrc).map(({ table, column }) => `${table}.${column}`));
  const stale = [...GROUP_REMAP_COLUMNS, ...SPECIAL_CASED]
    .map(([t, c]) => `${t}.${c}`)
    .filter(key => !live.has(key));
  expect(stale).toEqual([]);
});
