import {
  VoiceDestination,
  GROUP_HINTS,
  isGroupish,
  mentionsGroupName,
  captureTimeFromName,
  routeVoiceDraft,
  reviewReason,
  sortCaptures,
  resolveCaptureTime,
  voiceFields,
  resolveVoiceCategory,
  kindFromCaptureName,
  CAPTURE_PREFIX,
  VOICE_TITLE_MAX_WORDS,
  VOICE_TITLE_MAX_CHARS,
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

  it('reads the yyyyMMddHHmmss form Shortcuts can actually produce', () => {
    // Shortcuts' Format Date has NO Unix-timestamp option — only a Custom pattern — so this
    // is the shape a hand-built shortcut emits. Parsed as local time, matching how Shortcuts
    // formats it.
    expect(captureTimeFromName('20260812153000.txt', 0)).toBe(NOW);
    // Minute and day precision too.
    expect(captureTimeFromName('202608121530.txt', 0)).toBe(NOW);
    expect(captureTimeFromName('20260812.txt', 0)).toBe(new Date(2026, 7, 12).getTime());
  });

  it('does not confuse a calendar stamp with an epoch', () => {
    // 14 digits as an epoch would be the year 2286+; 12 would be 2001. Neither is a capture,
    // so length alone separates them with no overlap.
    expect(captureTimeFromName('20260812153000.txt', 0)).toBe(NOW);
    expect(captureTimeFromName(`${NOW}.txt`, 0)).toBe(NOW);   // 13-digit ms still works
  });

  it('rejects a calendar stamp that is not a real date', () => {
    for (const bad of [
      '20260230120000',   // 30 February
      '20261332120000',   // month 13, day 32
      '20260812250000',   // hour 25
      '20260812156100',   // minute 61
      '19990101120000',   // before the app could plausibly exist
      '21010101120000',   // after
    ]) {
      expect(captureTimeFromName(`${bad}.txt`, NOW)).toBe(NOW);
    }
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

    // And the same guarantee via the calendar filename, which is what the shortcut writes.
    const viaCalendar = parseVoice('450 groceries yesterday', {
      categories: CATS, nowMs: captureTimeFromName('20260811233000.txt', drainAt),
    });
    expect(new Date(viaCalendar.dateMs!).getDate()).toBe(10);
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

  it('POSTS a phrase whose category did not match — voice is not stricter than typing', () => {
    // Type "blorptastic" into Add and smart-category falls back to Other; it does not refuse
    // the expense. Dictating the same words gets the same treatment, and the words survive in
    // the title, so an unmatched category is visible and correctable rather than a blocker.
    expect(routeVoiceDraft(draft({ category: null }), 'four fifty blorptastic'))
      .toBe(VoiceDestination.Ledger);
  });

  it('holds back a group-ish phrase EVEN when the parse is perfect', () => {
    const d = draft({ amountPaise: 120000, category: 'Food' });
    expect(routeVoiceDraft(d, 'twelve hundred dinner split with Rohan')).toBe(VoiceDestination.Review);
    // The missing piece is a decision, not confidence.
    expect(d.amountPaise).toBeGreaterThan(0);
    expect(d.category).not.toBeNull();
  });

  it('holds back a phrase that names a real group, keyword or not', () => {
    // "Goa trip" names a shared group but contains no hint word, so the Shortcut wrote a file
    // rather than opening the app. Posting it to Personal would be silently wrong, so the
    // group names are what catch it.
    const phrase = 'two thousand Goa trip';
    expect(isGroupish(phrase)).toBe(false);
    expect(routeVoiceDraft(parse(phrase), phrase, ['Goa trip'])).toBe(VoiceDestination.Review);
    // Without that group it is an ordinary personal spend and should not be held back.
    expect(routeVoiceDraft(parse(phrase), phrase, ['Flatmates'])).toBe(VoiceDestination.Ledger);
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
    expect(reviewReason(draft(), '2000 Goa trip', ['Goa trip'])).toMatch(/group/i);
  });

  it('says nothing about a capture that posted itself', () => {
    expect(reviewReason(draft(), 'four fifty groceries')).toBeNull();
  });

  it('agrees with the router — a reason exists exactly when the row waits', () => {
    const GROUPS = ['Goa trip'];
    const cases: [VoiceDraft, string][] = [
      [draft(), 'four fifty groceries'],
      [draft({ amountPaise: 0 }), 'groceries'],
      [draft({ category: null }), '450 nonsense'],
      [draft(), '1200 split with Sam'],
      [draft(), '2000 Goa trip'],
    ];
    for (const [d, p] of cases) {
      const waits = routeVoiceDraft(d, p, GROUPS) === VoiceDestination.Review;
      expect(reviewReason(d, p, GROUPS) !== null).toBe(waits);
    }
  });
});

describe('resolveCaptureTime — the Shortcut needs no date actions', () => {
  const CREATED = new Date(2026, 7, 12, 9, 15).getTime();
  const DRAINED = new Date(2026, 7, 13, 8, 0).getTime();

  it('uses the filesystem creation time when the name says nothing', () => {
    // This is what makes a two-action shortcut possible: iOS records when the file was
    // written, which IS when the dictation finished.
    expect(resolveCaptureTime('Dictated Text.txt', CREATED, DRAINED)).toBe(CREATED);
  });

  it('prefers a timestamped name when there is one', () => {
    // An explicit statement of intent, and it survives a file being copied.
    expect(resolveCaptureTime('20260811233000.txt', CREATED, DRAINED))
      .toBe(new Date(2026, 7, 11, 23, 30).getTime());
  });

  it('falls back to the drain time when neither source is usable', () => {
    for (const ct of [null, undefined, 0, -1, NaN, 999, 99_999_999_999_999]) {
      expect(resolveCaptureTime('Dictated Text.txt', ct as number | null, DRAINED)).toBe(DRAINED);
    }
  });
});

describe('sortCaptures — oldest first, by resolved time', () => {
  const at = (name: string, capturedAt: number) => ({ name, capturedAt });

  it('orders by time, not by name', () => {
    // Shortcuts' own naming sorts lexicographically, which puts 10 before 2.
    const out = sortCaptures([
      at('Dictated Text 10.txt', 300),
      at('Dictated Text 2.txt', 200),
      at('Dictated Text.txt', 100),
    ]);
    expect(out.map(o => o.capturedAt)).toEqual([100, 200, 300]);
  });

  it('breaks an exact tie by name, so the order is never arbitrary', () => {
    const out = sortCaptures([at('b.txt', 100), at('a.txt', 100)]);
    expect(out.map(o => o.name)).toEqual(['a.txt', 'b.txt']);
  });

  it('does not mutate its input', () => {
    const input = [at('b.txt', 200), at('a.txt', 100)];
    sortCaptures(input);
    expect(input.map(i => i.name)).toEqual(['b.txt', 'a.txt']);
  });

  it('handles an empty list', () => {
    expect(sortCaptures([])).toEqual([]);
  });
});

describe('mentionsGroupName', () => {
  it('matches a group whose every word is present', () => {
    expect(mentionsGroupName('two thousand Goa trip', ['Goa trip'])).toBe(true);
    expect(mentionsGroupName('1200 dinner flatmates', ['Flatmates'])).toBe(true);
  });

  it('needs ALL of a multi-word name, not just one word', () => {
    // Otherwise a group called "Trip to Goa" diverts every phrase containing "trip".
    expect(mentionsGroupName('450 trip snacks', ['Goa trip'])).toBe(false);
    expect(mentionsGroupName('450 goa snacks', ['Goa trip'])).toBe(false);
  });

  it('is case- and punctuation-insensitive', () => {
    expect(mentionsGroupName('2000 GOA-TRIP dinner', ['Goa trip'])).toBe(true);
  });

  it('ignores one-character name fragments', () => {
    // A group literally called "A" must not divert every phrase containing that word.
    expect(mentionsGroupName('450 a coffee', ['A'])).toBe(false);
  });

  it('handles no groups and empty phrases', () => {
    expect(mentionsGroupName('450 groceries', [])).toBe(false);
    expect(mentionsGroupName('', ['Goa trip'])).toBe(false);
    expect(mentionsGroupName('   ', ['Goa trip'])).toBe(false);
  });
});

describe('voiceFields — where the words go', () => {
  it('stores nothing extra when the phrase was only an amount and a category', () => {
    // "450 groceries" → the leftover IS the category, so repeating it as a title would read
    // "Groceries · groceries".
    expect(voiceFields(parse('four fifty groceries'))).toEqual({ title: '', note: '' });
  });

  it('makes the descriptive words the title', () => {
    const d = parse('450 zomato biryani');
    const { title, note } = voiceFields(d);
    expect(title).toBe('zomato biryani');
    expect(note).toBe('');
  });

  it('spills a long phrase into the note, losing nothing', () => {
    const phrase = '450 dinner at that new place near the office with extra dessert afterwards';
    const { title, note } = voiceFields(parse(phrase));
    expect(title.split(/\s+/).length).toBeLessThanOrEqual(VOICE_TITLE_MAX_WORDS);
    expect(title.length).toBeLessThanOrEqual(VOICE_TITLE_MAX_CHARS + 1);
    expect(note.length).toBeGreaterThan(0);
    // Every leftover word survives across the two fields.
    const rejoined = `${title} ${note}`.trim().split(/\s+/);
    expect(rejoined).toEqual(parse(phrase).note.split(/\s+/));
  });

  it('always titles with at least one word, however long that word is', () => {
    const d = { ...draft({ category: null }), note: 'supercalifragilisticexpialidociousreceipt' };
    const { title } = voiceFields(d);
    expect(title.length).toBeGreaterThan(0);
  });

  it('survives an empty leftover', () => {
    expect(voiceFields(draft({ note: '' }))).toEqual({ title: '', note: '' });
    expect(voiceFields(draft({ note: '   ' }))).toEqual({ title: '', note: '' });
  });
});

describe('resolveVoiceCategory — always a category that exists', () => {
  it('keeps the inferred category when it is real', () => {
    expect(resolveVoiceCategory(draft({ category: 'Groceries' }), CATS)).toBe('Groceries');
  });

  it('falls back to Other, the same floor a typed title gets', () => {
    expect(resolveVoiceCategory(draft({ category: null }), CATS)).toBe('Other');
  });

  it('never returns a category the catalog does not have', () => {
    // A stale `learned` entry could name a category the user has since deleted.
    expect(resolveVoiceCategory(draft({ category: 'Deleted Category' }), CATS)).toBe('Other');
    const noOther = [{ name: 'Food' }];
    expect(resolveVoiceCategory(draft({ category: null }), noOther)).toBe('Food');
  });

  it('ignores the inference when smart-category is switched off', () => {
    expect(resolveVoiceCategory(draft({ category: 'Groceries' }), CATS, false)).toBe('Other');
  });

  it('returns null only when there are no categories at all', () => {
    expect(resolveVoiceCategory(draft(), [])).toBeNull();
  });
});


/**
 * The capture pipeline, kind by kind. Every row of the routing matrix in the plan has a case
 * here, because "silent" only earns trust if the thing it does silently is right.
 */
describe('kindFromCaptureName — which command wrote this file', () => {
  it('reads the prefix each command writes', () => {
    expect(kindFromCaptureName('expense-421887.txt')).toBe('expense');
    expect(kindFromCaptureName('income-90210.txt')).toBe('income');
    expect(kindFromCaptureName('settle-30514.txt')).toBe('settlement');
  });

  it('treats an unprefixed capture as an expense', () => {
    // The shortcut that shipped before prefixes existed writes bare filenames. Dropping those
    // would silently lose captures already sitting on someone's phone.
    expect(kindFromCaptureName('421887.txt')).toBe('expense');
    expect(kindFromCaptureName('Dictated Text.txt')).toBe('expense');
    expect(kindFromCaptureName('20260809153000.txt')).toBe('expense');
  });

  it('requires the delimiter, so a lookalike name cannot claim a kind', () => {
    expect(kindFromCaptureName('incomes-1.txt')).toBe('expense');
    expect(kindFromCaptureName('expenses-1.txt')).toBe('expense');
    expect(kindFromCaptureName('settled.txt')).toBe('expense');
  });

  it('is case-insensitive and survives a missing extension', () => {
    expect(kindFromCaptureName('INCOME-5.TXT')).toBe('income');
    expect(kindFromCaptureName('settle-5')).toBe('settlement');
  });

  it('round-trips every prefix the generator writes', () => {
    for (const [kind, prefix] of Object.entries(CAPTURE_PREFIX)) {
      expect(kindFromCaptureName(`${prefix}-1.txt`)).toBe(kind);
    }
  });
});

describe('routeVoiceDraft — per kind', () => {
  const clean = parse('four fifty groceries');
  const salary = parse('fifty thousand salary');

  it('posts a clean personal expense', () => {
    expect(routeVoiceDraft(clean, 'four fifty groceries', [], [], 'expense'))
      .toBe(VoiceDestination.Ledger);
  });

  it('posts a clean income', () => {
    // Income has no shares to apportion and is always personal, so there is no decision to
    // ask about — it earns the same silent path an expense gets.
    expect(routeVoiceDraft(salary, 'fifty thousand salary', [], [], 'income'))
      .toBe(VoiceDestination.Ledger);
  });

  it('holds income that named a group or a person', () => {
    // Income is personal-only, so a named party means it was misheard rather than that it
    // needs splitting.
    expect(routeVoiceDraft(salary, 'fifty thousand salary with Riya', [], [], 'income'))
      .toBe(VoiceDestination.Review);
    expect(routeVoiceDraft(salary, 'fifty thousand salary Goa', ['Goa'], [], 'income'))
      .toBe(VoiceDestination.Review);
  });

  it('never posts a settlement, however clean the parse', () => {
    // Direction is not recoverable from the words, and a settlement pointed the wrong way
    // moves a real balance twice — once in each direction.
    const settle = parse('paid Riya five hundred');
    expect(settle.amountPaise).toBeGreaterThan(0);
    expect(routeVoiceDraft(settle, 'paid Riya five hundred', [], ['Riya'], 'settlement'))
      .toBe(VoiceDestination.Review);
  });

  it('holds anything with no amount, whatever the kind', () => {
    for (const kind of ['expense', 'income', 'settlement'] as const) {
      expect(routeVoiceDraft(draft({ amountPaise: 0 }), 'x', [], [], kind))
        .toBe(VoiceDestination.Review);
    }
  });

  it('defaults to expense rules when no kind is given', () => {
    // Older callers and unprefixed captures both land here.
    expect(routeVoiceDraft(clean, 'four fifty groceries')).toBe(VoiceDestination.Ledger);
  });
});

describe('reviewReason — per kind', () => {
  it('distinguishes a settlement that knows the person from one that does not', () => {
    // They need different next actions: one is something to confirm, the other something to
    // supply, so collapsing them into one line would misdirect half the rows.
    const known = { ...parse('paid Riya five hundred'), personId: 'r' };
    const unknown = { ...parse('paid five hundred'), personId: null };
    expect(reviewReason(known, 'paid Riya five hundred', [], [], 'settlement'))
      .toMatch(/direction/i);
    expect(reviewReason(unknown, 'paid five hundred', [], [], 'settlement'))
      .toMatch(/who/i);
  });

  it('says nothing for an income that posted itself', () => {
    expect(reviewReason(parse('fifty thousand salary'), 'fifty thousand salary', [], [], 'income'))
      .toBeNull();
  });

  it('explains a held income in terms of income, not splitting', () => {
    const r = reviewReason(parse('fifty thousand salary'), 'salary split with Riya', [], [], 'income');
    expect(r).toMatch(/personal/i);
    expect(r).not.toMatch(/who shares/i);
  });

  it('still reports a missing amount first, for every kind', () => {
    for (const kind of ['expense', 'income', 'settlement'] as const) {
      expect(reviewReason(draft({ amountPaise: 0 }), 'x', [], [], kind)).toBe('No amount heard');
    }
  });
});
