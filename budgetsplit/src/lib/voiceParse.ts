import { parseToPaise } from './money';
import { matchCategory } from './smartCategory';
import { learnedMatch, type LearnedMap } from './smartCategoryLearn';

/**
 * Turn a dictated phrase into a draft transaction.
 *
 * Rule-based on purpose — no model, no network, nothing to bill. The recognizer already did
 * the hard part (speech → text) on the device; this only has to read the text, and a phrase
 * like "four fifty groceries" has far too little structure to need anything cleverer.
 *
 * **It never returns a transaction, only a draft.** Every field is a suggestion the user
 * confirms on the normal Add form. Misheard money is the worst possible silent failure, so
 * being wrong here must always be one visible correction away.
 *
 * `nowMs` is injected rather than read from the clock, so relative dates are testable and
 * `FAKE_TODAY` in `npm run test:calendar` reaches them.
 */

export type VoiceDraft = {
  /** What the recognizer heard, verbatim — always shown, so a bad parse is explainable. */
  transcript: string;
  /** Integer paise. 0 when no amount was found; the UI must not save that. */
  amountPaise: number;
  /** Matched against the caller's real catalog, so it's always a category that exists. */
  category: string | null;
  /** Resolved date, or null to leave the form's default (today) alone. */
  dateMs: number | null;
  /** What's left after the amount and date words are removed — the title/note. */
  note: string;
  /**
   * A person from the caller's own list, when the phrase named one. Null when nobody was named
   * or when the name was **ambiguous** — two people called Riya must not silently become one
   * of them, and a settlement pointed at the wrong person is worse than one that asks.
   *
   * Only the Add screen acts on this. The background drain never does: a phrase naming a
   * person needs a decision, and `voiceInbox.routeVoiceDraft` sends those to Review.
   */
  personId: string | null;
};

/**
 * Spoken number words. English covers what a recognizer returns for dictated digits, plus
 * the Indian scale words that actually get used in speech (`lakh`, `crore`).
 *
 * The Hindi entries are here because `en-IN` recognition frequently returns Hindi numerals
 * *transliterated* when someone code-mixes ("dus rupaye chai"). They are a best-effort
 * courtesy, **not** Hindi language support: a genuine Hindi phrase needs the `hi-IN` model.
 * Homophone risk is real and accepted — "do" (2) is also the English verb, so it is only
 * read as a number when a money word or another numeral sits beside it (see `wordsToNumber`).
 */
const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  // Hindi, transliterated as en-IN tends to return it.
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, cheh: 6, chhe: 6,
  saat: 7, aath: 8, nau: 9, das: 10, dus: 10, gyarah: 11, barah: 12, pandrah: 15,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  bees: 20, tees: 30, chalis: 40, pachas: 50, pachaas: 50, saath: 60, sattar: 70,
  assi: 80, nabbe: 90,
};

/** Multipliers, smallest first — order matters when folding a phrase. */
const SCALES: Record<string, number> = {
  hundred: 100, sau: 100,
  thousand: 1000, hazaar: 1000, hazar: 1000,
  lakh: 100000, lac: 100000, lakhs: 100000,
  crore: 10000000, crores: 10000000,
};

/** Words that mark the surrounding numerals as money rather than a count. */
const MONEY_WORDS = new Set([
  'rupees', 'rupee', 'rupaye', 'rupaiya', 'rs', 'inr', 'bucks', 'paisa', 'paise',
]);

const FILLER = new Set(['and', 'aur', 'for', 'ka', 'ki', 'ke', 'on', 'at', 'to', 'of', 'a', 'an', 'the']);

/**
 * Is this token read as part of a number?
 *
 * Exported because it is the boundary another vocabulary must not cross: `smartCategory`'s
 * keywords are matched against the same words, and a keyword that is also a numeral would
 * silently change parsed amounts — "sau" as a Shopping keyword would make "sau rupaye" both a
 * category hit and 100. `smartCategory.test.ts` uses this to assert the two never overlap.
 */
export function isNumberWord(token: string): boolean {
  const t = token.toLowerCase();
  return t in UNITS || t in TENS || t in SCALES || MONEY_WORDS.has(t);
}

/**
 * Speech noise that must never become a transaction's title.
 *
 * People do not dictate in headlines. They say *"umm four fifty for groceries"*, *"ok so I paid
 * like twelve hundred for dinner"* — and every one of those words was landing in the title,
 * because the parser only ever removed what it had consumed as an amount or a date. The ledger
 * ended up full of rows called "ok so i paid like dinner".
 *
 * Kept **separate from {@link FILLER}**, which participates in number parsing: `numericRunLength`
 * treats filler as continuing a numeric run, so adding "paid" there would let the run swallow
 * words either side of it and change which digits are read as the amount. This set is applied
 * only when building the leftover text, where it cannot affect any number.
 *
 * Two deliberate limits:
 *  - **Disfluencies and framing verbs only.** No ordinary adjectives or nouns — a brand really
 *    can be called "Just Herbs", and stripping words that carry meaning is worse than leaving a
 *    stray "so".
 *  - **Never empties the title.** See `denoise`.
 */
const NOISE = new Set([
  // Disfluencies and discourse markers.
  'um', 'umm', 'uh', 'uhh', 'err', 'erm', 'hmm', 'ah', 'oh', 'ok', 'okay', 'so', 'well',
  'like', 'actually', 'basically', 'yeah', 'yep', 'please', 'thanks', 'thank',
  // Hedges — "about 450", "roughly two fifty".
  'about', 'around', 'roughly', 'approx', 'approximately', 'nearly', 'almost',
  // Framing the sentence rather than naming the spend.
  'i', 'im', 'ive', 'id', 'me', 'my', 'we', 'it', 'that', 'this', 'there', 'here',
  'was', 'were', 'is', 'am', 'be', 'been', 'did', 'do', 'done', 'have', 'has', 'had',
  // Verbs that say an amount moved, which the kind already records.
  'spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'got', 'get', 'gave', 'give',
  'sent', 'send', 'add', 'added', 'log', 'logged', 'record', 'put', 'made', 'make',
  'received', 'receive', 'earned', 'earn', 'credited', 'deposited',
  // Hinglish. Postpositions and the verbs that only say money moved — "mummy ko do hazaar
  // diye" is about mummy, not about "diye". `ko`/`se`/`mein` are the Hindi equivalents of the
  // `for`/`on`/`to` already in FILLER.
  'diye', 'diya', 'liye', 'liya', 'kiye', 'kiya', 'kharch', 'kharche', 'hua', 'hue', 'huye',
  'mein', 'ko', 'se', 'ka', 'ki', 'ke', 'wala', 'wale', 'wali', 'bhi', 'aur', 'tha', 'thi',
]);

/**
 * Drop speech noise, but never everything.
 *
 * A phrase that is *only* noise ("umm, I paid") would otherwise produce an empty title and a
 * row that cannot say what it was — strictly worse than an untidy one. In that case the
 * original words are kept, and the row still shows what was heard.
 */
export function denoise(tokens: string[]): string[] {
  const kept = tokens.filter(t => !NOISE.has(t));
  return kept.length > 0 ? kept : tokens;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Fold a run of number words into one value.
 *
 * Handles the two shapes people actually speak:
 *  - **additive** — "twenty five" → 25, "four fifty" → 450 (a unit followed by a tens word
 *    is read as hundreds-plus-tens, which is how prices are said aloud);
 *  - **scaled** — "twelve hundred" → 1200, "two lakh fifty thousand" → 250000.
 *
 * Returns null when the run holds no numeral, so a caller can tell "no amount" from zero.
 */
export function wordsToNumber(tokens: string[]): number | null {
  let total = 0;      // completed scaled groups
  let current = 0;    // the group being built
  let seen = false;
  let lastWasUnit = false;

  for (const tok of tokens) {
    if (FILLER.has(tok)) continue;

    if (/^\d+(\.\d+)?$/.test(tok)) {
      // A literal numeral inside a word run ("2 thousand").
      current += parseFloat(tok);
      seen = true; lastWasUnit = false;
      continue;
    }

    if (tok in UNITS) {
      current += UNITS[tok];
      seen = true; lastWasUnit = true;
      continue;
    }

    if (tok in TENS) {
      // "four fifty" = 450: a bare unit before a tens word is spoken hundreds.
      if (lastWasUnit && current >= 1 && current <= 9) current = current * 100;
      current += TENS[tok];
      seen = true; lastWasUnit = false;
      continue;
    }

    if (tok in SCALES) {
      const scale = SCALES[tok];
      // "hundred" with nothing before it means one hundred.
      current = (current === 0 ? 1 : current) * scale;
      // A big scale closes the group so "two lakh fifty thousand" accumulates correctly.
      if (scale >= 1000) { total += current; current = 0; }
      seen = true; lastWasUnit = false;
      continue;
    }

    // Any other word ends the numeric run.
    break;
  }

  if (!seen) return null;
  return total + current;
}

/** Where the leading number-run ends, so the rest can become the note. */
function numericRunLength(tokens: string[]): number {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (FILLER.has(t) || t in UNITS || t in TENS || t in SCALES || /^\d+(\.\d+)?$/.test(t) || MONEY_WORDS.has(t)) i++;
    else break;
  }
  return i;
}

/**
 * Pull an amount out of the phrase.
 *
 * Prefers an explicit digit string ("450 groceries", and recognizers usually return digits
 * for dictated numbers), then a leading word-run, then a word-run adjacent to a money word
 * anywhere in the phrase ("chai dus rupaye").
 */
function extractAmount(tokens: string[]): { paise: number; consumed: Set<number> } {
  const consumed = new Set<number>();

  // 1. A bare digit string anywhere.
  const digitIdx = tokens.findIndex(t => /^\d+(\.\d+)?$/.test(t));
  if (digitIdx >= 0) {
    consumed.add(digitIdx);
    // Absorb a trailing money word so it doesn't land in the note.
    if (MONEY_WORDS.has(tokens[digitIdx + 1] ?? '')) consumed.add(digitIdx + 1);
    // "12 hundred" / "2 lakh"
    const next = tokens[digitIdx + 1];
    if (next && next in SCALES) {
      consumed.add(digitIdx + 1);
      return { paise: parseToPaise(String(parseFloat(tokens[digitIdx]) * SCALES[next])), consumed };
    }
    return { paise: parseToPaise(tokens[digitIdx]), consumed };
  }

  // 2. A word-run at the start.
  const runLen = numericRunLength(tokens);
  if (runLen > 0) {
    const n = wordsToNumber(tokens.slice(0, runLen));
    if (n !== null && n > 0) {
      for (let i = 0; i < runLen; i++) consumed.add(i);
      return { paise: parseToPaise(String(n)), consumed };
    }
  }

  // 3. A word-run ending at a money word ("chai dus rupaye").
  const moneyIdx = tokens.findIndex(t => MONEY_WORDS.has(t));
  if (moneyIdx > 0) {
    let start = moneyIdx - 1;
    while (start > 0 && (tokens[start - 1] in UNITS || tokens[start - 1] in TENS || tokens[start - 1] in SCALES)) start--;
    const n = wordsToNumber(tokens.slice(start, moneyIdx));
    if (n !== null && n > 0) {
      for (let i = start; i <= moneyIdx; i++) consumed.add(i);
      return { paise: parseToPaise(String(n)), consumed };
    }
  }

  // 4. A numeral run anywhere in the phrase — "paid Riya five hundred", which is how a
  //    transfer is actually spoken: the person comes before the amount and there is no money
  //    word. Strategies 2 and 3 both miss it, so this phrasing parsed to nothing at all.
  const run = bestMidPhraseRun(tokens);
  if (run) {
    const n = wordsToNumber(tokens.slice(run.start, run.end));
    if (n !== null && n > 0) {
      for (let i = run.start; i < run.end; i++) consumed.add(i);
      return { paise: parseToPaise(String(n)), consumed };
    }
  }

  return { paise: 0, consumed };
}

const isNumeral = (t: string) =>
  t in UNITS || t in TENS || t in SCALES || /^\d+(\.\d+)?$/.test(t);

/**
 * The longest run of numeral words anywhere in the phrase — but only if it is unambiguous.
 *
 * Scanning mid-phrase is what makes "paid Riya five hundred" work, and it is also where
 * homophones bite: `UNITS` carries transliterated Hindi, so a bare "do" (2) would turn "do you
 * have" into ₹2, and "one more coffee" into ₹1. Strategies 2 and 3 were safe from that only
 * because they required a leading position or an adjacent money word.
 *
 * So a mid-phrase run must earn it, by being either:
 *  - **scaled** — contains hundred / thousand / lakh / crore (or `sau` / `hazaar`), which no
 *    ordinary sentence says by accident; or
 *  - **multi-token** — "four fifty", "twenty five", where two numerals in a row are already a
 *    strong signal that a number is being spoken.
 *
 * A single bare numeral mid-phrase is rejected. It is the one shape that is far more often a
 * word than a price, and getting money wrong silently is worse than not filling it in.
 */
function bestMidPhraseRun(tokens: string[]): { start: number; end: number } | null {
  let best: { start: number; end: number; score: number } | null = null;

  let i = 0;
  while (i < tokens.length) {
    if (!isNumeral(tokens[i])) { i++; continue; }

    // Extend over numerals, allowing filler ("one thousand and fifty") inside the run.
    let end = i;
    let count = 0;
    let scaled = false;
    let j = i;
    while (j < tokens.length && (isNumeral(tokens[j]) || FILLER.has(tokens[j]))) {
      if (isNumeral(tokens[j])) {
        count++;
        if (tokens[j] in SCALES) scaled = true;
        end = j + 1;   // trailing filler is not part of the run
      }
      j++;
    }

    if (scaled || count >= 2) {
      const score = count + (scaled ? 10 : 0);
      if (!best || score > best.score) best = { start: i, end, score };
    }
    i = j;
  }

  return best ? { start: best.start, end: best.end } : null;
}

/**
 * Resolve a relative date phrase. Only relative words — an absolute spoken date
 * ("March the fourth") is ambiguous often enough that the date picker is the honest answer.
 */
function extractDate(tokens: string[], nowMs: number): { dateMs: number | null; consumed: Set<number> } {
  const consumed = new Set<number>();
  const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const keepTime = (ms: number) => {
    // Preserve the current time-of-day on a shifted date, matching how the Add form treats
    // a date change.
    const now = new Date(nowMs); const d = new Date(ms);
    d.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return d.getTime();
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t === 'today' || t === 'aaj') { consumed.add(i); return { dateMs: nowMs, consumed }; }

    // "parso" is both the day before yesterday and the day after tomorrow. A spend is in the
    // past, so it reads as the past — the same call `kal` already makes.
    if (t === 'parso' || t === 'parson') {
      consumed.add(i);
      return { dateMs: keepTime(nowMs - 2 * DAY_MS), consumed };
    }

    if (t === 'yesterday' || t === 'kal') {
      // "kal" is both yesterday and tomorrow in Hindi; a *spend* is in the past, so past.
      consumed.add(i);
      return { dateMs: keepTime(nowMs - DAY_MS), consumed };
    }

    // "2 days ago" / "two days ago"
    if (t === 'ago' && i >= 2 && (tokens[i - 1] === 'days' || tokens[i - 1] === 'day')) {
      const n = wordsToNumber([tokens[i - 2]]);
      if (n !== null && n > 0 && n < 400) {
        consumed.add(i - 2); consumed.add(i - 1); consumed.add(i);
        return { dateMs: keepTime(nowMs - n * DAY_MS), consumed };
      }
    }

    const wd = WEEKDAYS.indexOf(t);
    if (wd >= 0) {
      // The most recent occurrence of that weekday, today excluded — "on Friday" said today
      // means the Friday just gone, not today.
      const now = new Date(nowMs);
      let back = (now.getDay() - wd + 7) % 7;
      if (back === 0) back = 7;
      consumed.add(i);
      if (tokens[i - 1] === 'last') consumed.add(i - 1);
      return { dateMs: keepTime(startOfDay(nowMs) - back * DAY_MS + (nowMs - startOfDay(nowMs))), consumed };
    }
  }

  return { dateMs: null, consumed };
}

/**
 * Parse a dictated phrase into a draft.
 *
 * `categories` must be the caller's real catalog, so a returned category always exists;
 * `learned` is the same merchant→category memory the Add screen's smart-category uses, so
 * voice inherits every correction the user has already made.
 */
export function parseVoice(
  transcript: string,
  opts: {
    categories: { name: string }[];
    learned?: LearnedMap;
    nowMs: number;
    /** The caller's real people, so a matched person always exists. Transfers use this. */
    people?: { id: string; name: string }[];
  },
): VoiceDraft {
  const tokens = tokenize(transcript);

  const { paise, consumed: amtIdx } = extractAmount(tokens);
  const { dateMs, consumed: dateIdx } = extractDate(tokens, opts.nowMs);

  // Whatever wasn't an amount or a date is what the transaction is *about* — once the words
  // that were only holding the sentence together are gone.
  const note = denoise(
    tokens
      .filter((_, i) => !amtIdx.has(i) && !dateIdx.has(i))
      .filter(t => !FILLER.has(t)),
  ).join(' ').trim();

  // Same two-step the Add screen uses: what the user taught us first, then the rules.
  const category = note
    ? (opts.learned ? learnedMatch(note, opts.learned, opts.categories) : null)
      ?? matchCategory(note, opts.categories)
    : null;

  // Matched against the FULL token list, not the leftover note: "paid Riya five hundred"
  // puts the name where the amount extractor may already have consumed neighbouring tokens.
  const personId = opts.people ? matchPerson(tokens, opts.people) : null;

  return { transcript: transcript.trim(), amountPaise: paise, category, dateMs, note, personId };
}

/**
 * Find which of the caller's people the phrase named.
 *
 * Matches a **first name**, whole-word — that is what people actually say, and matching any
 * part of a full name would let "Kumar" claim three different contacts. Case-insensitive.
 *
 * Ambiguity returns null on purpose. Two people whose first names collide are exactly when a
 * guess is most likely to be wrong and least likely to be noticed, and the cost of null is one
 * tap on a form the user is already looking at.
 */
function matchPerson(tokens: string[], people: { id: string; name: string }[]): string | null {
  const words = new Set(tokens);
  const hits = people.filter(p => {
    const first = p.name.trim().toLowerCase().split(/\s+/)[0];
    // One-letter names would match a stray article; a name that IS a number word would fight
    // the amount parser.
    if (!first || first.length < 2 || first in UNITS || first in TENS || first in SCALES) return false;
    return words.has(first);
  });

  if (hits.length !== 1) return null;
  return hits[0].id;
}
