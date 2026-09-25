import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * "One add/remove path for a friend" (`SPEC-2026-09-FEEDBACK.md` §5, T15). Adding a friend
 * already had one implementation before this task — `PersonNameSheet` — used
 * by Friends and group Members; T14 gave New Group and Edit Group the same
 * sheet rather than a fourth hand-rolled input. This guard is what stops a
 * fifth one appearing: every file that creates a person (`insertPerson`)
 * must also render `PersonNameSheet`, not its own `Input` + button.
 *
 * Removal is NOT unified to one confirm, deliberately — `friends.tsx`'s
 * delete is `deletePerson` (gone from the roster everywhere); group
 * Members' remove is `removeMemberFromGroup` (leaves this one group only,
 * the person and their history elsewhere are untouched). Different actions,
 * different consequences, so different copy is correct — unifying the
 * wording would misstate one of them. What IS checked: every removal still
 * goes through a destructive confirm, none silently fires on tap.
 */
const ROOT = join(__dirname, '..', '..');

function walk(dir: string, keep: (f: string) => boolean, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, keep, out);
    } else if (keep(full)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_FILES = [
  ...walk(join(ROOT, 'app'), f => f.endsWith('.tsx')),
  ...walk(join(ROOT, 'src', 'components'), f => f.endsWith('.tsx')),
];

it('finds source files to scan', () => {
  expect(SOURCE_FILES.length).toBeGreaterThan(50);
});

describe('every place that creates a person renders PersonNameSheet', () => {
  it('no file calls insertPerson without also rendering PersonNameSheet', () => {
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      const src = readFileSync(f, 'utf8');
      if (/\binsertPerson\(/.test(src) && !/<PersonNameSheet/.test(src)) {
        offenders.push(f.replace(ROOT + '/', ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is exactly the four known call sites — a fifth needs a look, not a silent pass', () => {
    const callers = SOURCE_FILES
      .filter(f => /\binsertPerson\(/.test(readFileSync(f, 'utf8')))
      .map(f => f.replace(ROOT + '/', ''))
      .sort();
    expect(callers).toEqual([
      'app/(tabs)/groups.tsx',
      'app/friends.tsx',
      'app/group/[id]/edit.tsx',
      'app/group/[id]/members.tsx',
    ]);
  });
});

describe('every removal is a destructive confirm, never silent', () => {
  it('deletePerson (friends.tsx) and removeMemberFromGroup (members.tsx) both confirm destructively', () => {
    const friends = readFileSync(join(ROOT, 'app', 'friends.tsx'), 'utf8');
    const members = readFileSync(join(ROOT, 'app', 'group', '[id]', 'members.tsx'), 'utf8');
    expect(friends).toMatch(/style: 'destructive'/);
    expect(members).toMatch(/style: 'destructive'/);
    // Deliberately NOT asserted: that the two confirms share wording. They
    // are different actions (delete a person vs. leave one group) with
    // different consequences — see the file header.
  });
});
