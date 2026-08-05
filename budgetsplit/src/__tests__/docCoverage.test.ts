import fs from 'fs';
import path from 'path';

/**
 * The reason FEATURES_AND_FLOWS.md drifted badly enough to need a rewrite is that
 * nothing failed when a screen shipped undocumented — `/review`, `/settings/backup`
 * and `/report-transactions` all did. This closes that hole: a new route has to be
 * mentioned in the behaviour doc or the suite goes red.
 *
 * It checks *mention*, not quality. A route named only in the §3 index passes, which
 * is deliberate — the point is to make the omission impossible to miss, not to grade
 * the prose. Follows the precedent set by featureFlags.test.ts, which scans source to
 * keep the flag table honest.
 */

const ROOT = path.resolve(__dirname, '../..');
const APP = path.join(ROOT, 'app');
const DOC = path.join(ROOT, 'docs/FEATURES_AND_FLOWS.md');

/** Layout/group files are structure, not screens — documented as the nav shell instead. */
const NOT_A_SCREEN = /^_layout\.tsx$/;

/** Turn `app/group/[id]/budget.tsx` into the route path `/group/[id]/budget`. */
function routePath(absFile: string): string {
  const rel = path.relative(APP, absFile).replace(/\.tsx$/, '');
  const segments = rel
    .split(path.sep)
    // `(tabs)` is a route group: it contributes nothing to the URL.
    .filter(s => !/^\(.*\)$/.test(s));
  const last = segments[segments.length - 1];
  if (last === 'index') segments.pop();
  return '/' + segments.join('/');
}

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...routeFiles(full));
    } else if (/\.tsx$/.test(entry.name) && !NOT_A_SCREEN.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const doc = fs.readFileSync(DOC, 'utf8');
const files = routeFiles(APP);

/**
 * A route counts as documented if the doc names either its route path or its file
 * path. Dynamic segments are matched loosely: `/group/[id]/budget` also accepts the
 * `/group/{id}/budget` form the doc uses in prose, and `/category/[name]` accepts
 * `/category/{name}`.
 */
function mentioned(route: string, file: string): boolean {
  const relFile = path.relative(ROOT, file); // e.g. app/review.tsx
  if (doc.includes(relFile)) return true;
  if (doc.includes(relFile.replace(/^app\//, ''))) return true; // e.g. group/[id]/budget.tsx

  const asBrace = route.replace(/\[(\w+)\]/g, '{$1}');
  // `{personal}` / `{id}` / `{name}` are all used for the same dynamic slot in prose.
  const asAnyBrace = new RegExp(
    route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\[\w+\\\]/g, '\\{[^}/]+\\}'),
  );
  return doc.includes(route) || doc.includes(asBrace) || asAnyBrace.test(doc);
}

describe('FEATURES_AND_FLOWS.md covers every screen', () => {
  it('finds the route files at all (guards against a bad path)', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some(f => f.endsWith(path.join('app', 'review.tsx')))).toBe(true);
  });

  it.each(files.map(f => [routePath(f), f]))('documents %s', (route, file) => {
    expect(mentioned(route as string, file as string)).toBe(true);
  });

  it('documents every route (aggregate, for a readable failure list)', () => {
    const missing = files.filter(f => !mentioned(routePath(f), f)).map(f => routePath(f));
    expect(missing).toEqual([]);
  });
});
