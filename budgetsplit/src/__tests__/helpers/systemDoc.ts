import fs from 'fs';
import path from 'path';

/**
 * Shared reading for the `docs/SYSTEM.md` guards.
 *
 * The guards live in one file per concern, matching every other invariant test in
 * this folder (`txnInvariant`, `approvalInvariant`, `memberInvariant`, `docCoverage`,
 * `sourceCounts`). They were briefly one combined `systemDoc.test.ts`, which meant
 * SYSTEM.md named six test files that did not exist — the exact drift the document
 * is written to prevent, committed inside the mechanism meant to prevent it.
 * `docIdGraph.test.ts` now asserts that every test file a live doc names is real.
 */

export const ROOT = path.resolve(__dirname, '../../..');
export const APP = path.join(ROOT, 'app');
export const DOC = path.join(ROOT, 'docs/SYSTEM.md');
export const doc = fs.readFileSync(DOC, 'utf8');

/**
 * The register and the evidence behind it, split because they answer different
 * questions and get read at different moments. `TRACKER.md` is one row per item —
 * what it is and where it stands. `FINDINGS.md` is why: the count, the cost, the
 * blast radius, the argument behind each verdict.
 *
 * Exported separately rather than concatenated, and separately from `doc`, because
 * a guard almost always means exactly one of the three: SYSTEM.md is what the app
 * IS, TRACKER.md is what is left, FINDINGS.md is why.
 */
export const TRACKER_DOC = path.join(ROOT, 'docs/TRACKER.md');
export const tracker = fs.readFileSync(TRACKER_DOC, 'utf8');
export const FINDINGS_DOC = path.join(ROOT, 'docs/FINDINGS.md');
export const findings = fs.readFileSync(FINDINGS_DOC, 'utf8');

export function walk(dir: string, keep: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}

/** `app/group/[id]/budget.tsx` → `/group/[id]/budget`; `app/(tabs)/index.tsx` → `/`. */
export function routePath(absFile: string): string {
  const rel = path.relative(APP, absFile).replace(/\.tsx$/, '');
  const segments = rel.split(path.sep).filter(s => !/^\(.*\)$/.test(s));
  if (segments[segments.length - 1] === 'index') segments.pop();
  return '/' + segments.join('/');
}

export const ROUTES = walk(APP, f => f.endsWith('.tsx') && path.basename(f) !== '_layout.tsx')
  .map(routePath);

/** One section's text, so a table in §12 is never mistaken for a table in §7. */
export function section(n: number): string {
  const m = doc.match(new RegExp(`^## §${n} · [\\s\\S]*?(?=^## §|(?![\\s\\S]))`, 'm'));
  return m ? m[0] : '';
}

/** Every navigation target written in the app, in all four call forms. */
const STR = String.raw`(?:\`((?:[^\\\`]|\\.)*)\`|'((?:[^\\']|\\.)*)'|"((?:[^\\"]|\\.)*)")`;
export const NAV_CALL = () => new RegExp(
  String.raw`\brouter\s*\.\s*(?:push|replace|navigate|dismissTo|prefetch)\s*\(\s*(?:\{\s*pathname\s*:\s*)?` + STR,
  'g',
);
export const HREF_CONST = () => /(['"])(\/[^'"]*)\1\s+as\s+Href\b/g;

export function sourceFiles(): string[] {
  return [
    ...walk(APP, f => /\.tsx?$/.test(f)),
    ...walk(path.join(ROOT, 'src'), f => /\.tsx?$/.test(f) && !f.includes('__tests__')),
  ];
}

/** How many times the app navigates to one exact route path. */
export function callSitesFor(route: string): number {
  let n = 0;
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    const push = (t: string | undefined) => {
      if ((t ?? '').split(/[?#]/)[0] === route) n++;
    };
    for (const m of text.matchAll(NAV_CALL())) push(m[1] ?? m[2] ?? m[3]);
    for (const m of text.matchAll(HREF_CONST())) push(m[2]);
  }
  return n;
}

export function testFileNames(): Set<string> {
  return new Set(
    fs.readdirSync(path.join(ROOT, 'src/__tests__'))
      .filter(f => f.endsWith('.test.ts'))
      .map(f => f.replace(/\.test\.ts$/, '')),
  );
}
