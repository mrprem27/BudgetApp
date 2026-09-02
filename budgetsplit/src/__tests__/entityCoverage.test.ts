import fs from 'fs';
import path from 'path';
import { ROOT, doc } from './helpers/systemDoc';

/**
 * Every table in the schema has an entity in `SYSTEM.md` §2, and every table-backed
 * entity names a table that exists. A new table shipping undocumented is how the
 * asset register ended up with no behaviour section anywhere — it passed
 * `docCoverage.test.ts` only because that test matches file paths loosely.
 */

const schema = fs.readFileSync(path.join(ROOT, 'src/db/schema.ts'), 'utf8');
/** Real tables only — `IF NOT EXISTS` excludes the rebuild scratch tables. */
const TABLES = [...schema.matchAll(/^\s*CREATE TABLE IF NOT EXISTS (\w+)/gm)].map(m => m[1]);

/** `### E-04 · txn — a money event, and also a recurring rule` */
const ENTITIES = [...doc.matchAll(/^### (E-(\d+)[a-z]?) · (\S+)/gm)]
  .map(m => ({ id: m[1], num: Number(m[2]), name: m[3] }));

/**
 * The walkthrough tells you to open "Goa Trip" and check "Weekend Getaway". Those
 * are rows in `seedDemo.ts`, which is edited independently — rename one there and
 * the walkthrough sends you looking for a screen that is not in the app. There is
 * precedent: the CSV export already filters demo rows by hardcoded signatures that
 * can fall out of step with the same file.
 */
const demo = fs.readFileSync(path.join(ROOT, 'src/db/seedDemo.ts'), 'utf8');
/** Names the seeder actually creates, with any parenthetical stripped. */
const DEMO_NAMES = [
  ...demo.matchAll(/insert(?:Group|Person)\(db, '([^']+)'/g),
  ...demo.matchAll(/insertGoal\(db, \{ name: '([^']+)'/g),
].map(m => m[1].replace(/\s*\([^)]*\)\s*$/, '').trim());

describe('SYSTEM.md names the demo data that actually exists', () => {
  it('found the seeder at all', () => {
    expect(DEMO_NAMES.length).toBeGreaterThan(15);
    expect(DEMO_NAMES).toContain('Goa Trip');
  });

  it('mentions every demo group, person and goal', () => {
    expect([...new Set(DEMO_NAMES)].filter(n => !doc.includes(n))).toEqual([]);
  });
});

describe('SYSTEM.md §2 covers every table', () => {
  it('finds tables and entities at all', () => {
    expect(TABLES.length).toBeGreaterThan(15);
    expect(ENTITIES.length).toBeGreaterThan(40);
  });

  it('documents every CREATE TABLE', () => {
    const named = new Set(ENTITIES.map(e => e.name));
    expect(TABLES.filter(t => !named.has(t))).toEqual([]);
  });

  it('never claims a table-backed entity (E-01…E-49) that does not exist', () => {
    const tables = new Set(TABLES);
    expect(ENTITIES.filter(e => e.num < 50 && !tables.has(e.name))
      .map(e => `${e.id} names \`${e.name}\`, which is not a table`)).toEqual([]);
  });

  it('gives every entity an "Is not" field — the anti-conflation field', () => {
    const blocks = doc.split(/^### E-/m).slice(1);
    expect(blocks.filter(b => !/^\s*Is not\./m.test(b))
      .map(b => 'E-' + b.slice(0, 20).split('\n')[0])).toEqual([]);
  });
});
