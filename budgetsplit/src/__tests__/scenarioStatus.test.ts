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

  it('give every task the two fields a person walking the app needs', () => {
    /* `Numbers.` is what a person should see change, and by how much — the
       product layer the document lacked entirely until the walkthrough needed
       it. `State.` says which base state the task can be walked in. Both are
       the first things that would rot without a check. */
    const tasks = doc.split(/^### (?=FL-\d)/m).slice(1);
    expect(tasks.length).toBe(54);
    const missing = tasks
      .map(b => ({ id: 'FL-' + b.slice(0, 2), b }))
      .filter(({ b }) => !/^State\./m.test(b) || !/^Numbers\./m.test(b))
      .map(({ id, b }) =>
        `${id} lacks ${!/^State\./m.test(b) ? 'State.' : ''}${!/^Numbers\./m.test(b) ? ' Numbers.' : ''}`);
    expect(missing).toEqual([]);
  });

  it('never cite a test file that does not exist', () => {
    const named = [...doc.matchAll(/`✅ ([A-Za-z][\w.]*?)(?:\.test\.ts)?`/g)].map(m => m[1]);
    const have = testFileNames();
    expect([...new Set(named)].filter(n => !have.has(n))).toEqual([]);
  });
});
