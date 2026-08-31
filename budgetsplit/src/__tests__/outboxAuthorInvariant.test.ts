import fs from 'fs';
import path from 'path';
import { AUTHORED_BY_ME } from '../db/queries/syncOutbox';

/**
 * The third implicit invariant over `txn`: **I only ever broadcast my own rows.**
 *
 * `sync_outbox` is a set of entry ids whose *current local state* the drain will
 * push under my account. Putting somebody else's entry in it therefore publishes
 * my opinion of their row as its authoritative state — and the drain re-reads the
 * row at send time, so whatever I did to it locally is what everyone gets.
 *
 * The live case was not hypothetical. Rejecting a **trusted** peer's entry
 * soft-deletes it locally, and the soft delete queued it, so the tombstone went
 * up and their expense vanished from every phone in the group. It slipped past
 * `NOT_AWAITING_APPROVAL` for a precise reason: an entry from a trusted author
 * applies on arrival and so never gets a `txn_approval` row at all, leaving
 * nothing for that predicate to exclude. `approval.ts` states the rule it broke —
 * rejecting "does NOT edit their copy, and must not". An objection is a dispute,
 * not a deletion.
 *
 * Modelled on `approvalInvariant.test.ts` and `txnInvariant.test.ts`, which guard
 * their own predicates the same way. That mechanism has now caught this shape of
 * bug three times, which is the argument for a third instance rather than a third
 * hand-fix.
 */

const QUERY_DIR = path.resolve(__dirname, '../db/queries');

/**
 * Writes to `sync_outbox` that legitimately do not filter by author.
 *
 * If you add one, say why the statement CANNOT put a peer's entry in the queue —
 * not merely that it currently fails.
 */
const ALLOWLIST: { file: string; contains: string; why: string }[] = [];

/** SQL string literals (template or single-quoted) that write to the outbox. */
function outboxWrites(source: string): string[] {
  const literals = [
    ...(source.match(/`(?:[^`\\]|\\[\s\S])*`/g) ?? []),
    ...(source.match(/'(?:[^'\\\n]|\\.)*'/g) ?? []),
  ];
  return literals.filter(l => /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+sync_outbox\b/i.test(l));
}

type Verdict = { ok: true } | { ok: false; sql: string };

function classify(file: string, sql: string): Verdict {
  const flat = sql.replace(/\s+/g, ' ');

  // Carries the guard, either inlined or by interpolating the shared constant.
  if (flat.includes(AUTHORED_BY_ME)) return { ok: true };
  if (/\$\{AUTHORED_BY_ME\}/.test(flat)) return { ok: true };

  if (ALLOWLIST.some(a => a.file === file && flat.includes(a.contains))) return { ok: true };

  return { ok: false, sql: flat.trim() };
}

describe('outbox author invariant', () => {
  const files = fs.readdirSync(QUERY_DIR).filter(f => f.endsWith('.ts'));

  it('finds query modules that write to the outbox', () => {
    // If this ever reaches zero the test above is vacuous — which is exactly how
    // a guard rots without anyone noticing.
    const writers = files.filter(f => outboxWrites(fs.readFileSync(path.join(QUERY_DIR, f), 'utf8')).length > 0);
    expect(writers.length).toBeGreaterThan(0);
  });

  it('every write to sync_outbox excludes entries I did not author, or says why not', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(path.join(QUERY_DIR, file), 'utf8');
      for (const sql of outboxWrites(source)) {
        const verdict = classify(file, sql);
        if (!verdict.ok) offenders.push(`${file}: ${verdict.sql.slice(0, 140)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every allowlist entry states a reason and still matches something', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.why.length).toBeGreaterThan(40);
      const source = fs.readFileSync(path.join(QUERY_DIR, entry.file), 'utf8');
      expect(source.replace(/\s+/g, ' ')).toContain(entry.contains);
    }
  });
});
