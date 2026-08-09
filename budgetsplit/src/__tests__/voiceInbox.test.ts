import {
  VoiceDestination,
  GROUP_HINTS,
  isGroupish,
  captureTimeFromName,
  routeVoiceDraft,
  reviewReason,
  sortCaptureNames,
} from '../lib/voiceInbox';
import { parseVoice, type VoiceDraft } from '../lib/voiceParse';

const CATS = [
  { name: 'Groceries' }, { name: 'Food' }, { name: 'Transport' },
  { name: 'Entertainment' }, { name: 'Shopping' }, { name: 'Other' },
];

// Fixed reference point so nothing here rides on the wall clock.
const NOW = new Date(2026, 7, 12, 15, 30, 0, 0).getTime(); // Wed 12 Aug 2026
const parse = (t: string) => parseVoice(t, { categories: CATS, nowMs: NOW });

/** A draft with only the fields the router looks at. */
const draft = (over: Partial<VoiceDraft> = {}): VoiceDraft => ({
  transcript: '', amountPaise: 45000, category: 'Groceries', dateMs: null, note: '', ...over,
});

describe('isGroupish', () => {
  it('spots the words a person says when a cost is shared', () => {
    expect(isGroupish('1200 dinner split with flatmates')).toBe(true);
    expect(isGroupish('two thousand group Goa')).toBe(true);
    expect(isGroupish('500 shared cab')).toBe(true);
    expect(isGroupish('Rohan owes me 300')).toBe(true);
  });

  it('leaves an ordinary personal phrase alone', () => {
    expect(isGroupish('four fifty groceries')).toBe(false);
    expect(isGroupish('twelve hundred rent yesterday')).toBe(false);
    expect(isGroupish('chai dus rupaye')).toBe(false);
  });

  it('matches whole words only', () => {
    // "within" must not read as "with", or half the language becomes a split.
    expect(isGroupish('450 groceries within budget')).toBe(false);
    expect(isGroupish('300 groupon deal')).toBe(false);
    // …but a plural or inflected form still counts.
    expect(isGroupish('2000 dinner groups')).toBe(false);   // 'groups' is not in the list
    expect(isGroupish('2000 splitting the bill')).toBe(true);
  });

  it('is case- and punctuation-insensitive', () => {
    expect(isGroupish('1200 dinner, SPLIT with Rohan!')).toBe(true);
  });

  it('survives empty and junk input', () => {
    for (const junk of ['', '   ', '!!!', '12345']) expect(isGroupish(junk)).toBe(false);
  });

  it('keeps the hint list in sync with what it matches', () => {
    // The Shortcut matches on this same list, so every entry must actually be detectable.
    for (const hint of GROUP_HINTS) expect(isGroupish(`450 food ${hint}`)).toBe(true);
  });
});

describe('captureTimeFromName — anchoring the parse to when you spoke', () => {
  it('reads a millisecond epoch out of the filename', () => {
    expect(captureTimeFromName(`${NOW}.txt`, 0)).toBe(NOW);
    expect(captureTimeFromName(String(NOW), 0)).toBe(NOW);
  });

  it('reads a second-precision epoch too', () => {
    const secs = Math.floor(NOW / 1000);
    expect(captureTimeFromName(`${secs}.txt`, 0)).toBe(secs * 1000);
  });

  it('falls back rather than throwing on a name it does not understand', () => {
    for (const name of ['', 'voice.txt', 'note-1.txt', 'abc123.txt', '.txt', '12.txt']) {
      expect(captureTimeFromName(name, NOW)).toBe(NOW);
    }
  });

  it('refuses an implausible timestamp', () => {
    expect(captureTimeFromName('0000000000000.txt', NOW)).toBe(NOW);
    expect(captureTimeFromName('99999999999999999.txt', NOW)).toBe(NOW);
  });

  it('is the reason a late-night "yesterday" survives a morning drain', () => {
    // Spoken 23:30 on the 11th; drained 09:00 on the 12th.
    const spokeAt = new Date(2026, 7, 11, 23, 30).getTime();
    const drainAt = new Date(2026, 7, 12, 9, 0).getTime();

    const anchored = parseVoice('450 groceries yesterday', {
      categories: CATS, nowMs: captureTimeFromName(`${spokeAt}.txt`, drainAt),
    });
    // Yesterday relative to the 11th is the 10th.
    expect(new Date(anchored.dateMs!).getDate()).toBe(10);

    // What it would have been if we had anchored on the drain instead — a day out.
    const naive = parseVoice('450 groceries yesterday', { categories: CATS, nowMs: drainAt });
    expect(new Date(naive.dateMs!).getDate()).toBe(11);
  });
});

describe('routeVoiceDraft — what is allowed to post itself', () => {
  it('posts a confident personal spend', () => {
    expect(routeVoiceDraft(parse('four fifty groceries'), 'four fifty groceries'))
      .toBe(VoiceDestination.Ledger);
  });

  it('holds back a phrase with no amount', () => {
    expect(routeVoiceDraft(parse('groceries'), 'groceries')).toBe(VoiceDestination.Review);
    expect(routeVoiceDraft(draft({ amountPaise: 0 }), 'x')).toBe(VoiceDestination.Review);
    expect(routeVoiceDraft(draft({ amountPaise: -1 }), 'x')).toBe(VoiceDestination.Review);
  });

  it('holds back a phrase whose category did not match', () => {
    // Filing this under a fallback heading would skew reports with nothing ever prompting
    // a correction — the whole reason this bar exists.
    expect(routeVoiceDraft(draft({ category: null }), 'four fifty blorptastic'))
      .toBe(VoiceDestination.Review);
  });

  it('holds back a group-ish phrase EVEN when the parse is perfect', () => {
    const d = draft({ amountPaise: 120000, category: 'Food' });
    expect(routeVoiceDraft(d, 'twelve hundred dinner split with Rohan')).toBe(VoiceDestination.Review);
    // The missing piece is a decision, not confidence.
    expect(d.amountPaise).toBeGreaterThan(0);
    expect(d.category).not.toBeNull();
  });

  it('means a Shortcut that missed the keyword still lands somewhere correct', () => {
    // "Goa trip" names a group but contains no hint word, so the Shortcut wrote a file
    // instead of opening the app. It must not silently post to Personal — but it does have
    // a home: an unmatched category sends it to Review anyway.
    const phrase = 'two thousand Goa trip';
    expect(isGroupish(phrase)).toBe(false);
    expect(routeVoiceDraft(parse(phrase), phrase)).toBe(VoiceDestination.Review);
  });

  it('routes every draft to exactly one of the two destinations', () => {
    const phrases = ['four fifty groceries', 'groceries', '450 split with Sam', '', 'chai dus rupaye', '19.99 shopping'];
    for (const p of phrases) {
      expect([VoiceDestination.Ledger, VoiceDestination.Review]).toContain(routeVoiceDraft(parse(p), p));
    }
  });
});

describe('reviewReason', () => {
  it('explains each way a capture can end up waiting', () => {
    expect(reviewReason(draft({ amountPaise: 0 }), 'groceries')).toMatch(/amount/i);
    expect(reviewReason(draft(), '1200 dinner split with Sam')).toMatch(/split/i);
    expect(reviewReason(draft({ category: null }), '450 blorptastic')).toMatch(/categor/i);
  });

  it('says nothing about a capture that posted itself', () => {
    expect(reviewReason(draft(), 'four fifty groceries')).toBeNull();
  });

  it('agrees with the router — a reason exists exactly when the row waits', () => {
    const cases: [VoiceDraft, string][] = [
      [draft(), 'four fifty groceries'],
      [draft({ amountPaise: 0 }), 'groceries'],
      [draft({ category: null }), '450 nonsense'],
      [draft(), '1200 split with Sam'],
    ];
    for (const [d, p] of cases) {
      const waits = routeVoiceDraft(d, p) === VoiceDestination.Review;
      expect(reviewReason(d, p) !== null).toBe(waits);
    }
  });
});

describe('sortCaptureNames', () => {
  it('orders captures oldest-first', () => {
    expect(sortCaptureNames(['1754870400000.txt', '1754870000000.txt', '1754870900000.txt']))
      .toEqual(['1754870000000.txt', '1754870400000.txt', '1754870900000.txt']);
  });

  it('compares seconds- and millisecond-precision names on one scale', () => {
    // A hand-built Shortcut can plausibly emit either. 1754870400s is one minute BEFORE
    // 1754870460000ms, so real-time order must win over precision.
    expect(sortCaptureNames(['1754870460000.txt', '1754870400.txt']))
      .toEqual(['1754870400.txt', '1754870460000.txt']);
  });

  it('puts names it cannot read last, keeping the good ones in order', () => {
    const out = sortCaptureNames(['junk.txt', '1754870400000.txt', 'other.txt', '1754870000000.txt']);
    expect(out.slice(0, 2)).toEqual(['1754870000000.txt', '1754870400000.txt']);
    expect(out.slice(2).sort()).toEqual(['junk.txt', 'other.txt']);
  });

  it('does not mutate its input', () => {
    const input = ['b.txt', 'a.txt'];
    sortCaptureNames(input);
    expect(input).toEqual(['b.txt', 'a.txt']);
  });

  it('handles empty input', () => {
    expect(sortCaptureNames([])).toEqual([]);
  });
});
