import { foldUncategorized, OTHERS_LABEL } from '../lib/categoryFold';

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
