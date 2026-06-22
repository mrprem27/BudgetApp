import { wordsOf, learnedMatch } from '../lib/smartCategoryLearn';

const CATS = [{ name: 'Transport' }, { name: 'Groceries' }, { name: 'Other' }];

describe('wordsOf', () => {
  it('keeps distinctive words, drops stopwords and short tokens', () => {
    expect(wordsOf('Uber to the office')).toEqual(['uber', 'office']);
    expect(wordsOf('paid for milk')).toEqual(['milk']);
  });
});

describe('learnedMatch', () => {
  it('matches a learned word to its category', () => {
    const learned = { rapido: 'Transport' };
    expect(learnedMatch('Rapido home', learned, CATS)).toBe('Transport');
  });

  it('returns null when no learned word matches', () => {
    expect(learnedMatch('random thing', { rapido: 'Transport' }, CATS)).toBeNull();
  });

  it('ignores a learned category that no longer exists', () => {
    expect(learnedMatch('rapido', { rapido: 'Cabs' }, CATS)).toBeNull();
  });
});
