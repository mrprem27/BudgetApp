import fs from 'fs';
import path from 'path';

/**
 * Guards the most dangerous implicit invariant in the codebase.
 *
 * `txn` holds three things: real transactions, materialized recurring
 * occurrences, and recurring *rule templates*. A rule row is not a spend — it is
 * the instruction to create one — and it is distinguished only by
 * `recur_freq IS NOT NULL`. Every query that treats `txn` rows as spend must
 * therefore filter `recur_freq IS NULL`, or it double-counts money.
 *
 * Nothing enforced this. It was held by convention and index design, and it had
 * already been broken twice in `categories.ts` (uncategorized-name counts and
 * category-frequency ordering both counted rule templates) — found by writing
 * this test.
 *
 * A schema CHECK would be stronger, but adding one to `txn` means rebuilding the
 * app's central table, which is the riskiest migration available here. This
 * reads the real SQL instead and fails when a new query forgets, at zero runtime
 * cost. Same approach as the feature-flag invariant in featureFlags.test.ts.
 */

const QUERY_DIR = path.resolve(__dirname, '../db/queries');

/**
 * Statements that legitimately see rule rows. Each needs a reason — if you add
 * one, say why the query WANTS templates, not merely that it currently fails.
 */
const ALLOWLIST: { file: string; contains: string; why: string }[] = [
  {
    // (An entry for `groups.ts` collecting `attachment_uri` lived here.
    // `deleteGroup` is a tombstone now — it deletes no transactions, so no receipt
    // is orphaned and the query is gone. Removed rather than left as a dead
    // exemption, which the last test in this file exists to catch.)
    file: 'transactions.ts',
    contains: 'attachment_uri IS NOT NULL AND updated_at <',
    why: 'reapDeletedAttachments — soft-deleted rows whose receipt files can now be unlinked. Must see every deleted row, including a rule template that owned one.',
  },
  {
    file: 'backup.ts',
    contains: 'SELECT attachment_uri AS uri FROM txn',
    why: 'reapUnreferencedPhotos — decides which FILES on disk still have a row pointing at them. A recurring RULE can carry an attachment exactly as an occurrence can, and excluding rules here would delete a receipt that is still referenced. Reads paths, never money.',
  },
  {
    file: 'categories.ts',
    contains: 'INSERT OR REPLACE INTO sync_outbox',
    why: 'Queues shared entries for sync after a category rename. Recurring RULES are included deliberately: a rule carries a category too, and a peer left holding the old name would post a bill under a category that no longer exists on their device. This counts rows to deliver, not money.',
  },
  {
    file: 'transactions.ts',
    contains: 'SELECT tags FROM txn',
    why: 'Building the tag vocabulary (getTagsByFrequency). A tag applied to a recurring RULE is a tag genuinely in use, so it belongs in the picker — excluding templates would hide a tag the user typed and then never offer it back. This counts tag names, not money or dates, so the usual reason to exclude rules (double-counting a template as a transaction) does not apply.',
  },
  {
    file: 'transactions.ts',
    contains: 'attachment_uri IS NOT NULL AND updated_at',
    why: 'reapDeletedAttachments — a recurring RULE\'s own template row can hold an attachment too, and a deleted one must still be reaped.',
  },
  {
    file: 'persons.ts',
    contains: '(SELECT COUNT(*) FROM txn WHERE author_person_id = ?)',
    why: "deletePerson's reference count. It asks whether removing this row would orphan anything, so it must see EVERY row that names them — a rule template is still a reference, and this is a hard delete. It reads no amount and derives no figure; it only counts.",
  },
];

/** SQL string literals (template or single-quoted) that select FROM txn. */
function sqlLiteralsWithTxn(source: string): string[] {
  const literals = [
    ...(source.match(/`(?:[^`\\]|\\[\s\S])*`/g) ?? []),
    ...(source.match(/'(?:[^'\\\n]|\\.)*'/g) ?? []),
  ];
  // \b stops `txn_payment` / `txn_share` / `txn_id` matching.
  return literals.filter(l => /\bFROM\s+txn\b/i.test(l));
}

type Verdict = { ok: true } | { ok: false; sql: string };

function classify(file: string, sql: string): Verdict {
  const flat = sql.replace(/\s+/g, ' ');

  // Reads spend: correctly excludes rule templates.
  if (/recur_freq\s+IS\s+NULL/i.test(flat)) return { ok: true };
  // Reads rules on purpose (the recurring screens and the materializer).
  if (/recur_freq\s+IS\s+NOT\s+NULL/i.test(flat)) return { ok: true };
  // Walks materialized occurrences back to their series.
  if (/parent_recur_id/i.test(flat)) return { ok: true };
  // Fetches one known row by id — the caller already knows what it asked for.
  if (/WHERE\s+(?:\w+\.)?id\s*=\s*\?/i.test(flat)) return { ok: true };
  // Cascading deletes must remove rules along with everything else.
  if (/DELETE\s+FROM/i.test(flat)) return { ok: true };
  // Dynamic WHERE built in code — the filter lives in the fragment, and the
  // fragment itself is checked separately below.
  if (/\$\{where\}/.test(flat)) return { ok: true };

  if (ALLOWLIST.some(a => a.file === file && flat.includes(a.contains))) return { ok: true };

  return { ok: false, sql: flat.trim() };
}

describe('txn `recur_freq IS NULL` invariant', () => {
  const files = fs.readdirSync(QUERY_DIR).filter(f => f.endsWith('.ts'));

  it('finds query modules to check', () => {
    expect(files.length).toBeGreaterThan(0);
    const withTxn = files.filter(f => /\bFROM\s+txn\b/i.test(fs.readFileSync(path.join(QUERY_DIR, f), 'utf8')));
    expect(withTxn.length).toBeGreaterThan(0);
  });

  it('every statement selecting FROM txn either excludes rule rows or says why not', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(path.join(QUERY_DIR, file), 'utf8');
      for (const sql of sqlLiteralsWithTxn(source)) {
        const verdict = classify(file, sql);
        if (!verdict.ok) offenders.push(`${file}: ${verdict.sql.slice(0, 140)}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('dynamic WHERE fragments over txn carry the filter too', () => {
    // getTransactionsInRange builds its WHERE in code, so the literal above
    // can't be inspected — check the fragment itself.
    const source = fs.readFileSync(path.join(QUERY_DIR, 'transactions.ts'), 'utf8');
    const fragments = source.match(/let where = '[^']*'/g) ?? [];
    expect(fragments.length).toBeGreaterThan(0);
    for (const f of fragments) {
      expect(f).toMatch(/recur_freq IS NULL/);
    }
  });

  it('every allowlist entry still matches something, and explains itself', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.why.length).toBeGreaterThan(30);
      const source = fs.readFileSync(path.join(QUERY_DIR, entry.file), 'utf8');
      const hit = sqlLiteralsWithTxn(source).some(l => l.replace(/\s+/g, ' ').includes(entry.contains));
      expect(hit).toBe(true); // stale exemption → delete it
    }
  });
});
