import { foldUncategorized, matchesCategory, OTHERS_LABEL } from '../lib/categoryFold';

describe('foldUncategorized', () => {
  const known = new Set(['Groceries', 'Rent', 'Fuel']);

  it('keeps known categories untouched', () => {
    expect(foldUncategorized({ Groceries: 500, Rent: 2000 }, known)).toEqual({
      Groceries: 500,
      Rent: 2000,
    });
  });

  it('folds unknown names into one Others bucket, summing them', () => {
    const out = foldUncategorized({ Groceries: 500, PetCare: 300, Hobbies: 200 }, known);
    expect(out).toEqual({ Groceries: 500, [OTHERS_LABEL]: 500 });
  });

  it('merges an existing Others with folded unknowns', () => {
    const out = foldUncategorized({ Others: 100, PetCare: 50 }, known);
    expect(out).toEqual({ [OTHERS_LABEL]: 150 });
  });

  it('handles an empty map', () => {
    expect(foldUncategorized({}, known)).toEqual({});
  });

  it('folds everything when nothing is known', () => {
    expect(foldUncategorized({ A: 1, B: 2 }, new Set())).toEqual({ [OTHERS_LABEL]: 3 });
  });
});

/**
 * "Others" on a chart is a BUCKET, not a category — the total of every name the
 * catalog does not contain. A category screen naturally filters on the literal
 * string, which showed an Others slice worth thousands and then an empty list
 * when it was tapped. A co-member's entry is the ordinary way a name you have
 * never adopted enters your ledger, so this is not a corner case.
 */
describe('matchesCategory — the inverse of the fold', () => {
  const known = new Set(['Groceries', 'Rent']);

  it('matches a known category exactly', () => {
    expect(matchesCategory('Groceries', 'Groceries', known)).toBe(true);
    expect(matchesCategory('Rent', 'Groceries', known)).toBe(false);
  });

  it('matches every unadopted name under Others', () => {
    expect(matchesCategory('PetCare', OTHERS_LABEL, known)).toBe(true);
    expect(matchesCategory('Hobbies', OTHERS_LABEL, known)).toBe(true);
    // ...and nothing that IS in the catalog.
    expect(matchesCategory('Groceries', OTHERS_LABEL, known)).toBe(false);
  });

  it('matches a row literally categorised Others, which the fold also puts there', () => {
    expect(matchesCategory(OTHERS_LABEL, OTHERS_LABEL, known)).toBe(true);
  });

  it('treats Others as an ordinary category once the user has created one', () => {
    const withOthers = new Set([...known, OTHERS_LABEL]);
    expect(matchesCategory(OTHERS_LABEL, OTHERS_LABEL, withOthers)).toBe(true);
    // No longer the bucket: an unadopted name stops matching it.
    expect(matchesCategory('PetCare', OTHERS_LABEL, withOthers)).toBe(false);
  });

  // The property that ties the two together: what the donut folded into a slice
  // is exactly what tapping that slice lists.
  it('agrees with foldUncategorized on every name', () => {
    const spend = { Groceries: 500, PetCare: 300, Hobbies: 200, Rent: 2000 };
    const folded = foldUncategorized(spend, known);
    for (const label of Object.keys(folded)) {
      const summed = Object.entries(spend)
        .filter(([name]) => matchesCategory(name, label, known))
        .reduce((s, [, v]) => s + v, 0);
      expect(summed).toBe(folded[label]);
    }
  });
});
