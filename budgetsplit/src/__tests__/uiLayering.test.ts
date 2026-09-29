import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Screens and components render; they do not read or write the database.
 *
 * `app/` and `src/components/` reached into `src/db` from 32 files, so the same
 * computation grew in a screen, again in a hook, and again in the next screen —
 * and three of the bugs in `docs/SPEC-BUGSCAN.md` were one of those copies
 * drifting (a photo change that forgot to unlink the old file, a Groups list that
 * offered "restore" for a group that cannot come back).
 *
 * The seam is `src/lib/*Data.ts` (loaders), `src/lib/*Writes.ts` (writes) and
 * `src/hooks` (behaviour). A TYPE import from `db/` is fine — a type is not access.
 */
const ROOT = join(__dirname, '..', '..');

const EXEMPT: Record<string, string> = {
  'app/_layout.tsx':
    'The composition root: it opens the database, runs the schema and seed, and starts maintenance. Nothing else may.',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src', 'components'))]
  .map(f => ({ abs: f, rel: relative(ROOT, f) }))
  .filter(f => !(f.rel in EXEMPT));

const IMPORT = /import\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
const isDb = (spec: string) => /(^|\/)db(\/|$)/.test(spec);
/** `{ type A, type B }` and `import type` carry no runtime access. */
const valueSpecifiers = (clause: string) =>
  clause.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(s => s && !s.startsWith('type '));

describe('screens and components stay off the database', () => {
  it('import nothing but types from src/db', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f.abs, 'utf8');
      for (const m of src.matchAll(IMPORT)) {
        const spec = m[3] ?? m[4];
        if (!spec || !isDb(spec)) continue;
        if (m[1]) continue; // `import type`
        if (m[2] !== undefined && valueSpecifiers(m[2]).length === 0) continue;
        offenders.push(`${f.rel} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('write no SQL', () => {
    const offenders = FILES
      .filter(f => /\b(runAsync|getAllAsync|getFirstAsync|execAsync|withTransactionAsync)\s*\(/.test(readFileSync(f.abs, 'utf8')))
      .map(f => f.rel);
    expect(offenders).toEqual([]);
  });

  it('only exempts files that exist and still need it', () => {
    for (const rel of Object.keys(EXEMPT)) {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect({ rel, touchesDb: [...src.matchAll(IMPORT)].some(m => isDb(m[3] ?? m[4] ?? '') && !m[1]) })
        .toEqual({ rel, touchesDb: true });
    }
  });
});
