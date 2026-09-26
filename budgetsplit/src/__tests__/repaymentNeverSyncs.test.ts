import fs from 'fs';
import path from 'path';

/**
 * §4 E2: the repayment-likelihood model is "never synced, and never shown as
 * a score" — a rating of a person must never reach them. `repaymentModel`
 * (`lib/engine/behaviour.ts`, `EN5`) is pure and reads only from an in-memory
 * `FinanceSnapshot`; nothing writes it anywhere, so there is no sync path
 * today. This guard is what keeps that true on purpose rather than by luck:
 * it fails the moment anything under `db/queries/` (a write path), `lib/sync/`
 * (the sync engine) or `server/api` (the account/sync server) references the
 * model at all.
 */

const REPO_ROOT = path.join(__dirname, '../../..');
const FORBIDDEN = ['repaymentModel', 'RepaymentModel'];

const SCAN_DIRS = [
  path.join(__dirname, '../db/queries'),
  path.join(__dirname, '../lib/sync'),
  path.join(REPO_ROOT, 'server/api'),
];

function tsFilesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...tsFilesUnder(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

it('the repayment model is never referenced by a write path, the sync engine, or the sync server', () => {
  const files = [...SCAN_DIRS.flatMap(tsFilesUnder)];
  expect(files.length).toBeGreaterThan(10); // the scan actually found real files

  const offenders = files
    .map(f => ({ f, src: fs.readFileSync(f, 'utf8') }))
    .filter(({ src }) => FORBIDDEN.some(name => src.includes(name)))
    .map(({ f }) => path.relative(REPO_ROOT, f));

  expect(offenders).toEqual([]);
});

it('the guard actually catches a real reference — proven by planting one and removing it again', () => {
  const plantedFile = path.join(__dirname, '../lib/sync/__repaymentGuardCanary.ts');
  fs.writeFileSync(plantedFile, "export const canary = 'repaymentModel';\n");
  try {
    const files = [...SCAN_DIRS.flatMap(tsFilesUnder)];
    const offenders = files
      .map(f => ({ f, src: fs.readFileSync(f, 'utf8') }))
      .filter(({ src }) => FORBIDDEN.some(name => src.includes(name)))
      .map(({ f }) => path.relative(REPO_ROOT, f));
    expect(offenders.some(f => f.endsWith('__repaymentGuardCanary.ts'))).toBe(true);
  } finally {
    fs.unlinkSync(plantedFile);
  }
});
