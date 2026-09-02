import fs from 'fs';
import path from 'path';
import { ROOT, APP, walk } from './helpers/systemDoc';

/**
 * `AGENTS.md` §11: *"A primitive with no callers gets deleted, not kept for later."*
 * `StepTransition` and `AnimatedNumber` both shipped unused for months and were both
 * eventually spotted by eye — which is not a mechanism.
 *
 * This is the mechanism. It walks the import graph out from every route file and
 * fails on any component it cannot reach. It found `Stagger` and `ContextPill`, the
 * second of which `AGENTS.md` §9 was still describing as a live design decision.
 *
 * Reaching a component is not the same as *using* it well — this cannot see a
 * component rendered behind a flag that is never on. It only closes the crudest
 * case, which is the one that kept happening.
 */

const COMP_DIR = path.join(ROOT, 'src/components');

const compFiles = walk(COMP_DIR, f => f.endsWith('.tsx'));
const compName = (f: string) => path.basename(f, '.tsx');
const byName = new Map(compFiles.map(f => [compName(f), f]));

/** Component names this file imports, resolved against the component tree. */
function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const out = new Set<string>();
  for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const name = path.basename(spec).replace(/\.tsx?$/, '');
    if (byName.has(name)) out.add(name);
  }
  // Named imports off a folder path, in case a barrel is ever added.
  for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'[^']*components?\/[^']*'/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (byName.has(name)) out.add(name);
    }
  }
  return [...out];
}

const cache = new Map<string, string[]>();
const imports = (f: string) => {
  if (!cache.has(f)) cache.set(f, importsOf(f));
  return cache.get(f)!;
};

function reachedFromRoutes(): Set<string> {
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const route of walk(APP, f => f.endsWith('.tsx'))) stack.push(...imports(route));
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    const f = byName.get(n);
    if (f) stack.push(...imports(f));
  }
  return seen;
}

describe('every component is reachable from a screen', () => {
  it('finds the components and the routes at all', () => {
    expect(compFiles.length).toBeGreaterThan(100);
    expect(walk(APP, f => f.endsWith('.tsx')).length).toBeGreaterThan(40);
  });

  it('has no component nothing imports', () => {
    const reached = reachedFromRoutes();
    const dead = compFiles
      .map(compName)
      .filter(n => !reached.has(n))
      .map(n => `${path.relative(ROOT, byName.get(n)!)} — nothing imports it`)
      .sort();
    expect(dead).toEqual([]);
  });
});
