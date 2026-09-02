import { ROUTES, doc, section } from './helpers/systemDoc';

/**
 * Route ↔ screen id is a bijection. Scoped to §7 because §12 lists the three new
 * ids in a table of the same shape, and counting both makes each look duplicated.
 */

const SCREEN_ROWS = [...section(7).matchAll(/^\| `(SC-\d+[a-z]?)` \| `([^`]+)` \|/gm)]
  .map(m => ({ id: m[1], target: m[2] }));

/** SC-01 and SC-02 are the root and tab layouts — structure, not screens. */
const LAYOUT_IDS = new Set(['SC-01', 'SC-02']);

describe('SYSTEM.md §7 maps every route to exactly one screen id', () => {
  it('finds screen rows at all', () => {
    expect(SCREEN_ROWS.length).toBeGreaterThan(40);
    expect(doc).toContain('## §7 ·');
  });

  it('documents every route', () => {
    const documented = new Set(SCREEN_ROWS.map(r => r.target));
    expect(ROUTES.filter(r => !documented.has(r))).toEqual([]);
  });

  it('never names a route that does not exist', () => {
    const real = new Set(ROUTES);
    expect(SCREEN_ROWS.filter(r => !LAYOUT_IDS.has(r.id) && !real.has(r.target))
      .map(r => `${r.id} → ${r.target}`)).toEqual([]);
  });

  it('gives each route one id, and each id one route', () => {
    const byTarget = new Map<string, string[]>();
    const byId = new Map<string, string[]>();
    for (const r of SCREEN_ROWS) {
      if (LAYOUT_IDS.has(r.id)) continue;
      byTarget.set(r.target, [...(byTarget.get(r.target) ?? []), r.id]);
      byId.set(r.id, [...(byId.get(r.id) ?? []), r.target]);
    }
    expect([...byTarget].filter(([, ids]) => ids.length > 1)).toEqual([]);
    expect([...byId].filter(([, ts]) => ts.length > 1)).toEqual([]);
  });
});
