import fs from 'fs';
import path from 'path';

/**
 * The fourth implicit invariant, and the one with the widest blast radius:
 * **a read of `group_member` that means "who is in this group now" must exclude
 * people who have left.**
 *
 * Membership became soft so that removal could travel — the schema said why when
 * the column was added and nothing used it: *"a hard delete cannot propagate —
 * the other device keeps the row and pushes it back."* But a soft delete is only
 * safe if every reader knows about it, and there is no compiler for that: a
 * missed clause puts a removed member back into a split, or drops a present one.
 * Both are silently wrong money, and both persist into months already closed.
 *
 * Modelled on `approvalInvariant.test.ts`, `txnInvariant.test.ts` and
 * `outboxAuthorInvariant.test.ts`, which guard their own predicates the same way.
 * That mechanism has now caught four classes of bug, which is the argument for a
 * fourth instance rather than a fourth round of hand-checking.
 */

const QUERY_DIR = path.resolve(__dirname, '../db/queries');

/**
 * Reads that legitimately see people who have left.
 *
 * If you add one, say why the query WANTS them — not merely that it currently
 * fails.
 */
const ALLOWLIST: { file: string; contains: string; why: string }[] = [
  {
    file: 'syncDoc.ts',
    contains: 'm.deleted_at AS removedAt',
    why: 'readRosterDoc — the roster is how removal TRAVELS, so it must publish the people who left along with when. Omitting them is what made removal undetectable on the receiving device in the first place: absence from a roster is indistinguishable from a roster that is merely stale.',
  },
  {
    file: 'persons.ts',
    contains: '(SELECT COUNT(*) FROM group_member WHERE person_id = ?)',
    why: 'deletePerson\'s reference count. It is asking "does removing this row orphan anything", so it must see EVERY reference including memberships of groups the person has already left — a departed membership is still a row pointing at them, and this is a hard delete.',
  },
  {
    file: 'persons.ts',
    contains: 'SELECT group_id, ?, joined_at, role FROM group_member WHERE person_id = ?',
    why: 'mergePerson — folds one person row into another and must move EVERY membership, including memberships of groups they had already left. Leaving those behind would orphan them on a person row that is about to be deleted.',
  },
];

/** SQL string literals (template or single-quoted) that read from group_member. */
function memberReads(source: string): string[] {
  const literals = [
    ...(source.match(/`(?:[^`\\]|\\[\s\S])*`/g) ?? []),
    ...(source.match(/'(?:[^'\\\n]|\\.)*'/g) ?? []),
  ];
  return literals.filter(l => /\b(?:FROM|JOIN)\s+group_member\b/i.test(l));
}

type Verdict = { ok: true } | { ok: false; sql: string };

function classify(file: string, sql: string): Verdict {
  // Strip the surrounding quote/backtick so the leading-keyword test below sees
  // the SQL rather than the delimiter.
  const flat = sql.replace(/\s+/g, ' ').replace(/^[`'"]\s*|\s*[`'"]$/g, '');

  // The definition itself, not a query.
  if (file === 'memberSql.ts') return { ok: true };

  // Carries the predicate, inlined or through the shared helper.
  if (/deleted_at\s+IS\s+NULL/i.test(flat)) return { ok: true };
  if (/\$\{memberActive\(|\$\{MEMBER_ACTIVE\}/.test(flat)) return { ok: true };

  // A write is explicit about what it touches; this invariant is about READS
  // silently including somebody who is gone.
  if (/^(INSERT|UPDATE|DELETE)\b/i.test(flat)) return { ok: true };

  if (ALLOWLIST.some(a => a.file === file && flat.includes(a.contains))) return { ok: true };

  return { ok: false, sql: flat.trim() };
}

describe('group membership invariant', () => {
  const files = fs.readdirSync(QUERY_DIR).filter(f => f.endsWith('.ts'));

  it('finds query modules that read membership', () => {
    // If this reaches zero the test below is vacuous — which is how a guard rots
    // without anyone noticing.
    const readers = files.filter(f => memberReads(fs.readFileSync(path.join(QUERY_DIR, f), 'utf8')).length > 0);
    expect(readers.length).toBeGreaterThan(0);
  });

  it('every read of group_member excludes people who have left, or says why not', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(path.join(QUERY_DIR, file), 'utf8');
      for (const sql of memberReads(source)) {
        const verdict = classify(file, sql);
        if (!verdict.ok) offenders.push(`${file}: ${verdict.sql.slice(0, 160)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every allowlist entry states a reason and still matches something', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.why.length).toBeGreaterThan(60);
      const source = fs.readFileSync(path.join(QUERY_DIR, entry.file), 'utf8');
      expect(source.replace(/\s+/g, ' ')).toContain(entry.contains);
    }
  });
});
