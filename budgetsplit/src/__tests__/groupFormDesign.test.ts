import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * "Improve the Group Creation flow/UI" (`SPEC-2026-09-FEEDBACK.md` §5, T13/T14). Three fixes to
 * `GroupForm.tsx`, the editor shared by New Group and Edit Group:
 *
 * 1. Type was a `Chip` row showing text only, even though every `GROUP_TYPES`
 *    entry already carries its own icon and colour — unused. Now a row of
 *    coloured `IconCircle` tiles.
 * 2. Default split was a `Chip` row for a SINGLE choice, which reads as
 *    multi-select (`AGENTS.md` §9: "segmented choice → `TabPills`, not a chip
 *    row"). Now `TabPills`.
 * 3. The member row could only pick from `allPersons` — no way to add someone
 *    new without leaving the sheet. Now a `+` tile opens the same
 *    `PersonNameSheet` Friends and group Members already use.
 *
 * Source-scanned, the same shape as `payMethod.test.ts` — there is no render
 * test to catch any of these three sliding back to a hand-rolled `Chip` row.
 */
const ROOT = join(__dirname, '..', '..');
const GROUP_FORM = join(ROOT, 'src', 'components', 'finance', 'GroupForm.tsx');
const src = readFileSync(GROUP_FORM, 'utf8');

it('finds GroupForm to scan', () => {
  // A guard that silently scans nothing passes forever. This is the canary.
  expect(src.length).toBeGreaterThan(0);
});

describe('Type is a row of coloured icon tiles, not text chips', () => {
  it('renders an IconCircle per GROUP_TYPES entry, not a Chip', () => {
    const typeBlock = src.slice(src.indexOf('>Type<'), src.indexOf('>Members<'));
    expect(typeBlock).toMatch(/<IconCircle/);
    expect(typeBlock).not.toMatch(/<Chip\b/);
  });

  it('fills the tile with the type\'s own colour', () => {
    const typeBlock = src.slice(src.indexOf('>Type<'), src.indexOf('>Members<'));
    expect(typeBlock).toMatch(/bg=\{t\.color\}/);
  });
});

describe('Default split is TabPills, a single choice, not a Chip row', () => {
  it('renders TabPills, not a Chip row, for defaultSplit', () => {
    const splitBlock = src.slice(src.indexOf('>Default split<'));
    expect(splitBlock).toMatch(/<TabPills/);
    expect(splitBlock).not.toMatch(/<Chip\b/);
  });
});

describe('a new friend can be added without leaving the sheet', () => {
  it('exposes onRequestNewPerson and renders a tile that calls it', () => {
    expect(src).toMatch(/onRequestNewPerson\?:/);
    expect(src).toMatch(/onPress=\{onRequestNewPerson\}/);
  });

  it('both New Group and Edit Group wire it to a PersonNameSheet', () => {
    for (const f of [
      join(ROOT, 'app', '(tabs)', 'groups.tsx'),
      join(ROOT, 'app', 'group', '[id]', 'edit.tsx'),
    ]) {
      const callerSrc = readFileSync(f, 'utf8');
      expect(callerSrc).toMatch(/onRequestNewPerson=\{/);
      expect(callerSrc).toMatch(/<PersonNameSheet/);
    }
  });
});
