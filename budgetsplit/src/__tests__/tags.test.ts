import {
  cleanTag, tagKey, normalizeTags, parseTags, serializeTags, rankTagsByFrequency,
  TAG_MAX_LENGTH, TAG_MAX_COUNT,
} from '../lib/tags';

describe('cleanTag', () => {
  it('trims and collapses inner whitespace', () => {
    expect(cleanTag('  goa   trip  ')).toBe('goa trip');
  });

  it('caps length', () => {
    expect(cleanTag('x'.repeat(100))).toHaveLength(TAG_MAX_LENGTH);
  });

  it('preserves case — the user typed it that way', () => {
    expect(cleanTag('Goa Trip')).toBe('Goa Trip');
  });
});

describe('normalizeTags', () => {
  it('de-duplicates case-insensitively, keeping the first spelling', () => {
    expect(normalizeTags(['Goa', 'goa', 'GOA'])).toEqual(['Goa']);
  });

  it('drops blanks and whitespace-only entries', () => {
    expect(normalizeTags(['needs', '', '   ', 'wants'])).toEqual(['needs', 'wants']);
  });

  it('caps the count', () => {
    const many = Array.from({ length: 50 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(TAG_MAX_COUNT);
  });

  it('treats differing whitespace as the same tag', () => {
    expect(normalizeTags(['goa trip', 'goa  trip'])).toEqual(['goa trip']);
  });
});

describe('parseTags — must be total, a bad row cannot break a list', () => {
  it('reads a normal JSON array', () => {
    expect(parseTags('["needs","goa"]')).toEqual(['needs', 'goa']);
  });

  it('returns [] for null, undefined and empty string', () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });

  it('returns [] for malformed JSON rather than throwing', () => {
    expect(parseTags('{not json')).toEqual([]);
    expect(parseTags('["unclosed"')).toEqual([]);
  });

  it('returns [] for valid JSON that is not an array', () => {
    expect(parseTags('"needs"')).toEqual([]);
    expect(parseTags('42')).toEqual([]);
    expect(parseTags('{"a":1}')).toEqual([]);
    expect(parseTags('null')).toEqual([]);
  });

  it('drops non-string members instead of coercing them', () => {
    // String({}) would put "[object Object]" on screen as though it were typed.
    expect(parseTags('["needs",42,null,{"a":1},"goa"]')).toEqual(['needs', 'goa']);
  });

  it('normalizes what it reads, so a hand-edited row still behaves', () => {
    expect(parseTags('["  Goa  ","goa","",  "needs"]')).toEqual(['Goa', 'needs']);
  });
});

describe('serializeTags', () => {
  it('round-trips through parseTags', () => {
    const tags = ['needs', 'Goa Trip'];
    expect(parseTags(serializeTags(tags))).toEqual(tags);
  });

  it('returns null for an empty list, not "[]"', () => {
    // Keeps "no tags" indistinguishable from every pre-tags row already stored, so
    // nothing needs migrating and `tags IS NOT NULL` stays meaningful.
    expect(serializeTags([])).toBeNull();
    expect(serializeTags(['', '  '])).toBeNull();
  });

  it('normalizes before writing', () => {
    expect(serializeTags(['Goa', 'goa'])).toBe('["Goa"]');
  });
});

describe('rankTagsByFrequency', () => {
  it('orders by count, most used first', () => {
    const rows = ['["a"]', '["a","b"]', '["a","b","c"]'];
    expect(rankTagsByFrequency(rows)).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties alphabetically so the picker order is stable', () => {
    const rows = ['["zebra","apple"]'];
    expect(rankTagsByFrequency(rows)).toEqual(['apple', 'zebra']);
  });

  it('counts case variants as one tag and shows the first spelling seen', () => {
    const rows = ['["Goa"]', '["goa"]', '["GOA"]'];
    expect(rankTagsByFrequency(rows)).toEqual(['Goa']);
  });

  it('ignores null and malformed rows', () => {
    expect(rankTagsByFrequency([null, 'garbage', '["real"]'])).toEqual(['real']);
  });

  it('returns [] for no rows at all — the state every database is in today', () => {
    expect(rankTagsByFrequency([])).toEqual([]);
    expect(rankTagsByFrequency([null, null])).toEqual([]);
  });
});
