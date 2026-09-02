import { callSitesFor, doc } from './helpers/systemDoc';

/**
 * The ceiling that makes §10's `OV-08` actionable rather than an observation.
 * `/add/quick` is the highest-fan-in screen in the app — every settle-up, every
 * "log it", the daily-log notification and the Siri shortcut all land on it.
 *
 * Same mechanism as `sourceCounts.test.ts`' line ceiling on `review.tsx`, which has
 * already forced three real decompositions. Lower it when you consolidate an entry
 * point; never raise it.
 */
const ADD_QUICK_CEILING = 24;

describe('/add/quick entry points', () => {
  it(`stay at or under ${ADD_QUICK_CEILING}`, () => {
    expect(callSitesFor('/add/quick')).toBeLessThanOrEqual(ADD_QUICK_CEILING);
  });

  it('match the count stated in the SYSTEM.md §8 flow header', () => {
    const m = doc.match(/^### FL-04 · Add an expense — (\d+) entry points/m);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(callSitesFor('/add/quick'));
  });
});
