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
