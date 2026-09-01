import fs from 'fs';
import path from 'path';
import { NOT_AWAITING_APPROVAL } from '../db/queries/approvalSql';

/**
 * The second implicit invariant over `txn`, and the one this feature is made of.
 *
 * An entry someone else wrote and I have not approved is a real row in `txn` —
 * so the group agrees on what happened — but it must move **none of my numbers**
 * until I accept it. That is held by a predicate on a handful of statements, and
 * a statement that forgets it does not fail loudly: it quietly lets a stranger's
 * entry into one figure while the rest of the app disagrees. A budget that moved
 * but a balance that did not is worse than either moving alone.
 *
 * `AGENTS.md` §13 explains why the pending row lives in `txn` at all, and the
 * argument rests entirely on this list being short and complete. This test is
 * what keeps it complete. Modelled on `txnInvariant.test.ts`, which guards
 * `recur_freq IS NULL` the same way and found two live bugs when it was written.
 */

const QUERY_DIR = path.resolve(__dirname, '../db/queries');

/**
 * Statements that legitimately see entries awaiting my approval.
 *
 * Two kinds only: **ledgers**, which must show a pending entry so I can act on
 * it, and reads that are not about money at all. If you add one, say why the
 * query WANTS pending rows — not merely that it currently fails.
 */
const ALLOWLIST: { file: string; contains: string; why: string }[] = [
  {
    file: 'assets.ts',
    contains: 'SELECT COUNT(*) AS n FROM txn WHERE asset_id = ?',
    why: 'deleteAsset\u2019s reference count. It must see EVERY row that names the asset — '
      + 'soft-deleted ones included (Undo can bring one back) and rule templates included — '
      + 'because the question is "does anything point at this", not "does anything spend".',
  },
  {
    file: 'transactions.ts',
    contains: 'ORDER BY t.date DESC, t.created_at DESC',
    why: 'getTransactionsForGroup — the group ledger. The whole design is that the group agrees on what happened while my own numbers ignore it, so this is the one place a pending entry MUST appear. AGENTS §13.',
  },
  {
    file: 'transactions.ts',
    contains: 'bg.is_personal AS grp_personal',
    why: 'getMyActivity — the Personal ledger. It is literally "every transaction involving me", and an entry naming me is the single thing I most need to see. Verified to derive no totals: personal.tsx takes its summary from getMyExposure and its budget from getTransactionsInRange, both filtered.',
  },
  {
    file: 'transactions.ts',
    contains: 'bg.is_personal = 0',
    why: 'getSharedActivityWith — the one-person ledger behind the person screen. Same reasoning as getMyActivity: this is where you judge what someone has been adding, so hiding it defeats the screen. Its derived figures come from getFriendBalances, which is filtered.',
  },
  {
    file: 'backup.ts',
    contains: 'SELECT attachment_uri AS uri FROM txn',
    why: 'reapUnreferencedPhotos — decides which FILES on disk still have a row pointing at them. It must see every row without exception, including pending ones: excluding a pending entry would make its receipt look unreferenced and delete a photo that is about to be needed the moment the entry is approved. No money is read, only paths.',
  },
  {
    file: 'categories.ts',
    contains: 'FROM txn t',
    why: 'Counts how often a category is USED, to rank the category picker. No money and no window — the same reasoning as the getTagsByFrequency exemption in txnInvariant.test.ts.',
  },
  {
    file: 'categories.ts',
    contains: 'FROM txn',
    why: 'The uncategorized-name count, for the same picker. Counts names, not money.',
  },
  {
    file: 'groups.ts',
    contains: 'MAX(date) AS last_used',
    why: 'getGroupsByRecentUse orders a group picker by recency. Not money, and a peer entry genuinely is recent activity in that group.',
  },
  {
    file: 'transactions.ts',
    contains: 'SELECT tags FROM txn',
    why: 'The tag vocabulary. Counts tag names for a picker, never money.',
  },
  {
    file: 'transactions.ts',
    contains: 'attachment_uri IS NOT NULL AND updated_at',
    why: 'reapDeletedAttachments — file hygiene must see every row, including one whose approval is still pending, or the receipt leaks.',
  },
  {
    file: 'recurring.ts',
    contains: 'ORDER BY t.recur_state ASC',
    why: 'getRecurringForGroup — the group\'s recurring LIST, a ledger view. It shows a peer\'s rule while I am deciding on it, marked pending, exactly as the group ledger shows their one-off. Nothing spends from it; materializeDueOccurrences is the query that spawns money, and that one filters.',
  },
  {
    file: 'persons.ts',
    contains: '(SELECT COUNT(*) FROM txn WHERE author_person_id = ?)',
    why: "deletePerson's reference count. It asks whether removing this row would orphan anything, so it must see EVERY row that names them — a pending entry is still a reference, and this is a hard delete. It reads no amount and derives no figure; it only counts.",
  },
  // (An entry for `groups.ts` collecting `attachment_uri IS NOT NULL` lived here.
  // `deleteGroup` is a tombstone now — it deletes no transactions, so no receipt
  // is orphaned and the query is gone. Removed rather than left as a dead
  // exemption, which is exactly what the last test in this file guards against.)
];

/** SQL string literals (template or single-quoted) that select FROM txn. */
function sqlLiteralsWithTxn(source: string): string[] {
  const literals = [
    ...(source.match(/`(?:[^`\\]|\\[\s\S])*`/g) ?? []),
    ...(source.match(/'(?:[^'\\\n]|\\.)*'/g) ?? []),
  ];
  // \b stops `txn_payment` / `txn_share` / `txn_approval` / `txn_id` matching.
  return literals.filter(l => /\bFROM\s+txn\b/i.test(l));
}

type Verdict = { ok: true } | { ok: false; sql: string };

function classify(file: string, sql: string): Verdict {
  const flat = sql.replace(/\s+/g, ' ');

  // Carries the filter, either inlined or by interpolating the shared constant.
  if (flat.includes(NOT_AWAITING_APPROVAL)) return { ok: true };
  if (/\$\{NOT_AWAITING_APPROVAL\}/.test(flat)) return { ok: true };
  // Fetches one known row by id — you asked for that row; the UI decides how to
  // present it (txn/[id].tsx shows a pending banner rather than the figures).
  if (/WHERE\s+(?:\w+\.)?id\s*=\s*\?/i.test(flat)) return { ok: true };
  // Cascading deletes must remove pending rows along with everything else.
  if (/DELETE\s+FROM/i.test(flat)) return { ok: true };
  // Walks materialized occurrences back to the rule that spawned them. An
  // occurrence only exists because its rule was already approved.
  if (/parent_recur_id/i.test(flat)) return { ok: true };
  // NOTE: `recur_freq IS NOT NULL` is deliberately NOT a free pass. It was, while
  // a peer entry could never be a rule — that stopped being true when peers gained
  // the ability to send one, and a blanket exemption here would have let a rule I
  // never accepted spawn real spend every month. Each recurring query now either
  // carries the filter or earns an allowlist entry.
  // Dynamic WHERE built in code; the fragment is checked separately below.
  if (/\$\{where\}/.test(flat)) return { ok: true };

  if (ALLOWLIST.some(a => a.file === file && flat.includes(a.contains))) return { ok: true };

  return { ok: false, sql: flat.trim() };
}

describe('pending-approval invariant', () => {
  const files = fs.readdirSync(QUERY_DIR).filter(f => f.endsWith('.ts'));

  it('finds query modules to check', () => {
    const withTxn = files.filter(f => /\bFROM\s+txn\b/i.test(fs.readFileSync(path.join(QUERY_DIR, f), 'utf8')));
    expect(withTxn.length).toBeGreaterThan(0);
  });

  it('every statement selecting FROM txn either excludes pending entries or says why not', () => {
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
    // cannot be inspected — check the fragment itself.
    const source = fs.readFileSync(path.join(QUERY_DIR, 'transactions.ts'), 'utf8');
    const fragments = source.match(/let where = '[^']*'[\s\S]{0,120}?;/g) ?? [];
    expect(fragments.length).toBeGreaterThan(0);
    for (const f of fragments) {
      expect(f).toMatch(/NOT_AWAITING_APPROVAL/);
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

  /**
   * The predicate names a table that must exist, and hardcodes the `t` alias the
   * way `BALANCE_TXN_FILTER` does. If either drifts, every site silently stops
   * filtering — SQLite would raise "no such table", but only on a device.
   */
  it('the shared predicate is the shape every call site assumes', () => {
    expect(NOT_AWAITING_APPROVAL).toContain('txn_approval');
    expect(NOT_AWAITING_APPROVAL).toContain('a.txn_id = t.id');
    expect(NOT_AWAITING_APPROVAL).toContain("a.state = 'pending'");
  });
});
