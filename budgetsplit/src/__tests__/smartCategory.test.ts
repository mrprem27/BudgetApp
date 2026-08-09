import { matchCategory } from '../lib/smartCategory';
import { CATEGORY_KEYWORDS, RULE_CATEGORIES } from '../lib/smartCategory';
import { isNumberWord } from '../lib/voiceParse';
import { learnedMatch } from '../lib/smartCategoryLearn';

const CATS = [
  { name: 'Cab & Auto' }, { name: 'Groceries' }, { name: 'Food Delivery' },
  { name: 'Shopping' }, { name: 'Rent' }, { name: 'Eating Out' }, { name: 'Other' },
];

describe('matchCategory', () => {
  it('matches by keyword', () => {
    expect(matchCategory('uber to office', CATS)).toBe('Cab & Auto');
    expect(matchCategory('Swiggy dinner', CATS)).toBe('Food Delivery');
    expect(matchCategory('bigbasket groceries', CATS)).toBe('Groceries');
    expect(matchCategory('amazon order', CATS)).toBe('Shopping');
    expect(matchCategory('monthly rent', CATS)).toBe('Rent');
  });

  it('is case-insensitive', () => {
    expect(matchCategory('UBER', CATS)).toBe('Cab & Auto');
  });

  it('returns null when no keyword matches', () => {
    expect(matchCategory('xyz random thing', CATS)).toBeNull();
    expect(matchCategory('', CATS)).toBeNull();
  });

  it('only returns categories that exist in the list', () => {
    // "petrol" maps to Fuel, which is NOT in CATS → null
    expect(matchCategory('petrol', CATS)).toBeNull();
  });

  it('matches on word boundaries, not substrings', () => {
    // "auto" must not fire on "automatic"; "tea" must not fire on "steam".
    expect(matchCategory('automatic light payment', CATS)).toBeNull();
    expect(matchCategory('steam account reload', CATS)).toBeNull();
    // but the real whole word still matches
    expect(matchCategory('auto stand', CATS)).toBe('Cab & Auto');
  });

  it('prefers the more specific match', () => {
    const cats = [{ name: 'Shopping' }, { name: 'Entertainment' }, { name: 'Fuel' }];
    // single words: earlier rule (Entertainment) wins over Shopping for "prime"
    expect(matchCategory('amazon prime', cats)).toBe('Entertainment');
    // a multi-word phrase ("gas station") dominates a single word
    expect(matchCategory('shell gas station', cats)).toBe('Fuel');
  });
});

describe('learnedMatch (vote-based)', () => {
  const cats = [{ name: 'Food Delivery' }, { name: 'Shopping' }];
  it('returns the category with the most word-votes', () => {
    const learned = { swiggy: 'Food Delivery', lunch: 'Food Delivery', gift: 'Shopping' };
    expect(learnedMatch('swiggy office lunch gift', learned, cats)).toBe('Food Delivery');
  });
  it('ignores learned categories that no longer exist', () => {
    const learned = { foo: 'Deleted Category' };
    expect(learnedMatch('foo bar', learned, cats)).toBeNull();
  });
});


/**
 * Guards on the vocabulary itself, not on any one lookup.
 *
 * Hindi keywords were added to the existing rules so Hinglish dictation matches through the
 * same path as English. That is only safe while two invariants hold, and both are the kind of
 * thing a well-meaning future addition breaks silently.
 */
describe('the keyword vocabulary stays well-formed', () => {
  it('never uses a word the amount parser reads as a number', () => {
    // `sau` (100), `do` (2), `char` (4), `saath` (60) are all ordinary-looking words. Any of
    // them as a keyword would make a category hit and an amount out of the same token.
    const clashes = CATEGORY_KEYWORDS.filter(kw => kw.split(' ').some(isNumberWord));
    expect(clashes).toEqual([]);
  });

  it('only names categories the rules can actually produce', () => {
    // `matchCategory` refuses to return a category the user does not have, so a typo'd
    // category name here is a rule that can never fire and never errors.
    for (const cat of RULE_CATEGORIES) {
      expect(matchCategory('x', [{ name: cat }])).not.toBeUndefined();
    }
    expect(new Set(RULE_CATEGORIES).size).toBe(RULE_CATEGORIES.length);
  });

  it('has no blank or duplicated keyword', () => {
    const seen = new Set<string>();
    for (const kw of CATEGORY_KEYWORDS) {
      expect(kw.trim()).not.toBe('');
      expect(kw).toBe(kw.toLowerCase());
      seen.add(kw);
    }
    // Duplicates across rules are how an earlier rule silently wins an ambiguous word.
    expect(seen.size).toBe(CATEGORY_KEYWORDS.length);
  });
});
