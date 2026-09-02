import { doc, testFileNames } from './helpers/systemDoc';

/**
 * A scenario row without a status marker is an assertion nobody has checked, dressed
 * as one somebody has. The marker set is closed: verified by a test, checked by hand
 * on a date, unverified, or known broken and linked.
 */

describe('SYSTEM.md §9 scenario rows', () => {
  const MARKER = /`(?:✅[^`]*|🔍[^`]*|❓|❌[^`]*)`/;

  it('carry a status on every adversarial and pathological row', () => {
    const rows = doc.split('\n').filter(l => /^\| \.T[34][a-z] \|/.test(l));
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.filter(l => !MARKER.test(l))).toEqual([]);
  });

  it('never cite a test file that does not exist', () => {
    const named = [...doc.matchAll(/`✅ ([A-Za-z][\w.]*?)(?:\.test\.ts)?`/g)].map(m => m[1]);
    const have = testFileNames();
    expect([...new Set(named)].filter(n => !have.has(n))).toEqual([]);
  });
});
