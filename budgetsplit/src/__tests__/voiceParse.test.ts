import { parseVoice, wordsToNumber } from '../lib/voiceParse';

const CATS = [
  { name: 'Groceries' }, { name: 'Food' }, { name: 'Transport' },
  { name: 'Entertainment' }, { name: 'Shopping' }, { name: 'Other' },
];

// A fixed reference point so relative dates assert against known values rather than
// the wall clock (and so `FAKE_TODAY` can't shift them).
const NOW = new Date(2026, 7, 12, 15, 30, 0, 0).getTime(); // Wed 12 Aug 2026, 15:30
const parse = (t: string) => parseVoice(t, { categories: CATS, nowMs: NOW });
const R = (rupees: number) => rupees * 100;

describe('wordsToNumber', () => {
  it('reads plain units and teens', () => {
    expect(wordsToNumber(['seven'])).toBe(7);
    expect(wordsToNumber(['fifteen'])).toBe(15);
  });

  it('reads additive tens', () => {
    expect(wordsToNumber(['twenty', 'five'])).toBe(25);
    expect(wordsToNumber(['ninety', 'nine'])).toBe(99);
  });

  it('reads "four fifty" as 450 — how a price is actually spoken', () => {
    expect(wordsToNumber(['four', 'fifty'])).toBe(450);
    expect(wordsToNumber(['two', 'twenty'])).toBe(220);
  });

  it('reads scaled numbers', () => {
    expect(wordsToNumber(['twelve', 'hundred'])).toBe(1200);
    expect(wordsToNumber(['hundred'])).toBe(100);
    expect(wordsToNumber(['five', 'thousand'])).toBe(5000);
    expect(wordsToNumber(['two', 'lakh'])).toBe(200000);
  });

  it('accumulates across scale groups', () => {
    expect(wordsToNumber(['two', 'lakh', 'fifty', 'thousand'])).toBe(250000);
    expect(wordsToNumber(['one', 'thousand', 'five', 'hundred'])).toBe(1500);
  });

  it('reads transliterated Hindi numerals', () => {
    expect(wordsToNumber(['dus'])).toBe(10);
    expect(wordsToNumber(['paanch', 'sau'])).toBe(500);
  });

  it('returns null when there is no numeral at all', () => {
    expect(wordsToNumber(['groceries'])).toBeNull();
    expect(wordsToNumber([])).toBeNull();
  });

  it('ignores filler between numerals', () => {
    expect(wordsToNumber(['one', 'thousand', 'and', 'fifty'])).toBe(1050);
  });
});

describe('parseVoice — amounts', () => {
  it('reads a digit amount and keeps money integral', () => {
    const d = parse('450 groceries');
    expect(d.amountPaise).toBe(R(450));
    expect(Number.isInteger(d.amountPaise)).toBe(true);
  });

  it('reads a spoken amount', () => {
    expect(parse('four fifty groceries').amountPaise).toBe(R(450));
    expect(parse('twelve hundred rent').amountPaise).toBe(R(1200));
  });

  it('reads a digit amount with a scale word', () => {
    expect(parse('2 lakh car').amountPaise).toBe(R(200000));
    expect(parse('12 hundred rent').amountPaise).toBe(R(1200));
  });

  it('reads paise after a decimal point', () => {
    expect(parse('19.99 shopping').amountPaise).toBe(1999);
  });

  it('finds an amount that trails the subject, via the money word', () => {
    // The code-mixed shape that motivated en-IN in the first place.
    const d = parse('chai dus rupaye');
    expect(d.amountPaise).toBe(R(10));
    expect(d.note).toBe('chai');
  });

  it('strips the money word from the note', () => {
    expect(parse('500 rupees groceries').note).toBe('groceries');
  });

  it('returns 0 when there is no amount — the UI must refuse to save that', () => {
    const d = parse('groceries');
    expect(d.amountPaise).toBe(0);
    expect(d.note).toBe('groceries');
  });

  it('never returns a negative or fractional paise value', () => {
    for (const phrase of ['450 food', 'four fifty food', 'chai dus rupaye', 'nothing here', '0 food']) {
      const d = parse(phrase);
      expect(d.amountPaise).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(d.amountPaise)).toBe(true);
    }
  });
});

describe('parseVoice — categories', () => {
  it('matches a category from the caller\'s real catalog', () => {
    expect(parse('450 groceries').category).toBe('Groceries');
  });

  it('returns a category that exists, or null — never an invented one', () => {
    const d = parse('450 blorptastic nonsense');
    expect(d.category === null || CATS.some(c => c.name === d.category)).toBe(true);
  });

  it('is null when there is nothing to match on', () => {
    expect(parse('450').category).toBeNull();
  });

  it('prefers what the user taught us over the built-in rules', () => {
    const learned = { zomato: 'Transport' }; // deliberately odd, to prove precedence
    const d = parseVoice('300 zomato', { categories: CATS, learned, nowMs: NOW });
    expect(d.category).toBe('Transport');
  });
});

describe('parseVoice — relative dates', () => {
  it('leaves the date alone when nothing was said', () => {
    expect(parse('450 groceries').dateMs).toBeNull();
  });

  it('reads "today"', () => {
    expect(parse('450 groceries today').dateMs).toBe(NOW);
  });

  it('reads "yesterday" and keeps the time of day', () => {
    const d = parse('450 groceries yesterday');
    const got = new Date(d.dateMs!);
    expect(got.getDate()).toBe(11);
    expect(got.getHours()).toBe(15);
    expect(got.getMinutes()).toBe(30);
  });

  it('reads "kal" as yesterday — a spend is in the past', () => {
    // "kal" is both yesterday and tomorrow in Hindi; only one reading makes sense here.
    const d = parse('dus rupaye chai kal');
    expect(new Date(d.dateMs!).getDate()).toBe(11);
  });

  it('reads "N days ago", in digits and in words', () => {
    expect(new Date(parse('450 food 3 days ago').dateMs!).getDate()).toBe(9);
    expect(new Date(parse('450 food three days ago').dateMs!).getDate()).toBe(9);
  });

  it('reads a weekday as the most recent past one, never today', () => {
    // NOW is a Wednesday. "monday" → 10 Aug; "wednesday" → the previous one, 5 Aug.
    expect(new Date(parse('450 food monday').dateMs!).getDate()).toBe(10);
    expect(new Date(parse('450 food wednesday').dateMs!).getDate()).toBe(5);
  });

  it('reads "last friday"', () => {
    expect(new Date(parse('450 food last friday').dateMs!).getDate()).toBe(7);
  });

  it('removes the date words from the note', () => {
    expect(parse('450 groceries yesterday').note).toBe('groceries');
    expect(parse('450 food 3 days ago').note).toBe('food');
    expect(parse('450 food last friday').note).toBe('food');
  });
});

describe('parseVoice — it is a draft, never a transaction', () => {
  it('always echoes the transcript so a bad parse is explainable', () => {
    expect(parse('  450 groceries  ').transcript).toBe('450 groceries');
  });

  it('survives empty and junk input without throwing', () => {
    for (const junk of ['', '   ', '!!!', '...', 'ааа']) {
      const d = parse(junk);
      expect(d.amountPaise).toBe(0);
      expect(d.category).toBeNull();
      expect(d.dateMs).toBeNull();
    }
  });

  it('handles a realistic full phrase end to end', () => {
    const d = parse('four fifty groceries yesterday');
    expect(d.amountPaise).toBe(R(450));
    expect(d.category).toBe('Groceries');
    expect(new Date(d.dateMs!).getDate()).toBe(11);
    expect(d.note).toBe('groceries');
  });
});

describe('parseVoice — naming a person (transfers)', () => {
  const PEOPLE = [
    { id: 'p1', name: 'Riya Sharma' },
    { id: 'p2', name: 'Sam Mehta' },
    { id: 'p3', name: 'Prem Bhati' },
  ];
  const p = (t: string, people = PEOPLE) =>
    parseVoice(t, { categories: CATS, nowMs: NOW, people });

  it('matches a first name', () => {
    expect(p('paid Riya five hundred').personId).toBe('p1');
    expect(p('two thousand to Sam yesterday').personId).toBe('p2');
  });

  it('is case-insensitive and survives punctuation', () => {
    expect(p('PAID RIYA 500!').personId).toBe('p1');
  });

  it('matches only whole words, and only the first name', () => {
    // "Sharma" is a surname — matching any part of a full name would let one word claim
    // several contacts.
    expect(p('500 sharma').personId).toBeNull();
    // A first name embedded in another word is not a mention.
    expect(p('500 riyaz music').personId).toBeNull();
  });

  it('returns null when the name is ambiguous, rather than guessing', () => {
    // The case where a guess is most likely wrong and least likely to be noticed. Cost of
    // null is one tap on a form already on screen; cost of a guess is paying the wrong person.
    const twoRiyas = [{ id: 'a', name: 'Riya Sharma' }, { id: 'b', name: 'Riya Kapoor' }];
    expect(p('paid Riya five hundred', twoRiyas).personId).toBeNull();
  });

  it('ignores a name that would fight the amount parser', () => {
    // Someone called "Do" (2 in Hindi) or "Ek" must not be matched out of a numeral.
    const odd = [{ id: 'x', name: 'Do Kumar' }, { id: 'y', name: 'Char Singh' }];
    expect(p('do sau chai', odd).personId).toBeNull();
    // …and the amount still parses.
    expect(p('do sau chai', odd).amountPaise).toBe(R(200));
  });

  it('ignores single-letter names', () => {
    expect(p('500 a coffee', [{ id: 'z', name: 'A' }]).personId).toBeNull();
  });

  it('is null when no people are supplied at all', () => {
    // Expense and income never pass `people`; the field must simply be absent, not throw.
    expect(parseVoice('paid Riya 500', { categories: CATS, nowMs: NOW }).personId).toBeNull();
  });

  it('finds the person even when the amount sits between the words', () => {
    expect(p('Riya 500 dinner').personId).toBe('p1');
  });

  it('still parses everything else alongside the person', () => {
    const d = p('paid Riya five hundred yesterday');
    expect(d.amountPaise).toBe(R(500));
    expect(d.personId).toBe('p1');
    expect(new Date(d.dateMs!).getDate()).toBe(11);
  });
});

describe('parseVoice — an amount in the middle of the phrase', () => {
  it('reads a scaled amount after the subject', () => {
    // How a transfer is actually spoken: person first, amount last, no money word. Strategies
    // 1-3 all miss this shape, so it used to parse to nothing.
    expect(parse('paid Riya five hundred').amountPaise).toBe(R(500));
    expect(parse('settled dus hazaar').amountPaise).toBe(R(10000));
    expect(parse('dinner for two hundred').amountPaise).toBe(R(200));
  });

  it('reads a multi-token amount after the subject', () => {
    expect(parse('lunch four fifty').amountPaise).toBe(R(450));
    expect(parse('cab twenty five').amountPaise).toBe(R(25));
  });

  it('REFUSES a single bare numeral mid-phrase', () => {
    // The homophone trap: UNITS carries transliterated Hindi, so "do" is 2 and "char" is 4.
    // A lone numeral mid-sentence is far more often a word than a price, and a wrong amount
    // filled in silently is worse than an empty field.
    expect(parse('paid Riya three').amountPaise).toBe(0);
    expect(parse('coffee with do people').amountPaise).toBe(0);
    expect(parse('lunch one more').amountPaise).toBe(0);
  });

  it('does NOT extend that protection to a phrase that STARTS with a numeral', () => {
    // Documenting a real limit rather than asserting it away. A leading numeral has always been
    // read as the amount (that is the whole point of "450 groceries"), so "do you have change"
    // becomes ₹2. Accepted: nobody dictates that sentence into an amount field, and tightening
    // the leading rule would break the most common phrasing there is.
    expect(parse('do you have change').amountPaise).toBe(R(2));
    expect(parse('one more coffee').amountPaise).toBe(R(1));
  });

  it('still prefers a digit, and a leading run, over a mid-phrase one', () => {
    // Order matters: an explicit digit is the most reliable signal available.
    expect(parse('450 dinner two hundred people').amountPaise).toBe(R(450));
    expect(parse('four fifty groceries').amountPaise).toBe(R(450));
  });

  it('takes the strongest run when there is more than one', () => {
    // "two hundred" is scaled, "twenty five" is not — the scaled one wins regardless of order.
    expect(parse('table twenty five bill two hundred').amountPaise).toBe(R(200));
  });

  it('keeps the amount words out of the note', () => {
    expect(parse('paid Riya five hundred').note).toBe('paid riya');
  });
});
