import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * **A list of recurring rules navigates to a rule, never to another list.**
 *
 * Recurring rules were listed four times — `plan/recurring` (all groups, by kind),
 * Personal's Recurring tab (all groups, by group), and the group's Recurring tab
 * (one group) — and *every one of them* pushed `/group/[id]/recurring?focus={id}`,
 * a fifth list that re-rendered the same group's rules as 184pt cards and was the
 * only place carrying Edit/Skip/Pause/Stop.
 *
 * So tapping a rule showed you a list of rules. The tapped one got a 2.6s
 * highlight and nothing scrolled to it, which on a twelve-rule group meant it was
 * usually off-screen. The renewal notification landed in the same place, via a
 * `?focus=` param that `plan/recurring.tsx` has never read.
 *
 * This is a shape that regrows the moment someone adds a fifth surface, so it is
 * asserted against the real source rather than left to review — the same mechanism
 * as `screenLoading` and `touchTargets`.
 */
const APP = join(__dirname, '..', '..', 'app');
const LIB = join(__dirname, '..', 'lib');

/** Source with `/* *\/` and `//` comments removed, so prose can't satisfy — or
 *  break — an assertion about code. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = tsxFiles(APP).map(p => ({ path: p, src: readFileSync(p, 'utf8') }));

describe('the recurring flow has two lists and one rule screen', () => {
  it('the rule screen exists', () => {
    expect(existsSync(join(APP, 'recurring', '[id].tsx'))).toBe(true);
  });

  it('the duplicate per-group list screen is gone', () => {
    // The group's Recurring *tab* is the per-group list. A pushed screen showing
    // the same rules again is the duplication this whole change removes.
    expect(existsSync(join(APP, 'group', '[id]', 'recurring.tsx'))).toBe(false);
  });

  it('nothing links to the deleted screen', () => {
    const offenders = files
      .filter(f => /\/group\/\$\{[^}]+\}\/recurring/.test(f.src))
      .map(f => f.path.slice(APP.length + 1));
    expect(offenders).toEqual([]);
  });

  it('every recurring row taps through to the rule itself', () => {
    // Each of these renders a list of rules and must open one.
    for (const rel of ['plan/recurring.tsx', 'group/[id].tsx', 'category/[name].tsx', 'txn/[id].tsx']) {
      const src = readFileSync(join(APP, rel), 'utf8');
      expect({ rel, links: /\/recurring\/\$\{/.test(src) }).toEqual({ rel, links: true });
    }
  });

  it('a renewal reminder opens the rule, not a list', () => {
    // `?focus=` was read by nobody — the nudge said "Netflix renews in 3 days" and
    // opened every rule in every group, unscrolled.
    //
    // Comments stripped first: the docblock explaining this change quotes the old
    // destination, and a check that cannot tell code from prose about the code
    // fails the moment someone documents what they fixed.
    const src = code(readFileSync(join(LIB, 'notificationRoutes.ts'), 'utf8'));
    expect(src).toContain('/recurring/${encodeURIComponent(renew[1])}');
    expect(src).not.toMatch(/\/plan\/recurring\?focus=/);
  });

  it('Personal no longer carries a second copy of the global list', () => {
    // Its Recurring tab listed every rule in every SHARED group, so it was neither
    // personal nor different from `/plan/recurring`.
    const src = readFileSync(join(APP, 'personal.tsx'), 'utf8');
    expect(src).not.toContain("label: 'Recurring'");
  });
});

describe('the rule screen shows the same figures as every other surface', () => {
  const src = readFileSync(join(APP, 'recurring', '[id].tsx'), 'utf8');

  it('shows my share, not the whole bill', () => {
    // The deleted screen summed ALL payments, so a ₹9,000 rent split three ways
    // read ₹9,000 there and ₹3,000 on Plan.
    expect(src).toContain('myShareOrTotal(rule, meId)');
    expect(src).not.toMatch(/payments\.reduce/);
  });

  it('titles the rule the way every list does', () => {
    // It titled rows `category`, so "Netflix" appeared as "Entertainment".
    expect(src).toContain("rule.note?.trim() || rule.category");
  });

  it('uses the shared occurrence walker, not a local copy', () => {
    // DEBT-05: the deleted screen hand-rolled `nextOccurrence` with its own guard
    // and skip handling, so a fix in lib/recurrence silently missed it.
    expect(src).toContain('nextUnskippedOccurrence');
    expect(src).not.toContain('nextOccurrenceOnOrAfter');
  });

  it('counts only UPCOMING skips', () => {
    // `resumeRecurring` writes a skip row for every occurrence in the paused gap,
    // all in the past — so an unfiltered count read "30 occurrences skipped".
    expect(src).toContain('filter(d => d >= Date.now())');
  });
});
