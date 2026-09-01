import { readFileSync } from 'fs';
import { join } from 'path';
import {
  perPersonMeans, overrideMeans, overrideIsReversible, overrideIsPrivate,
  budgetEmptyBody, budgetEmptyCta, budgetCaption, budgetEditorHint,
  overrideConfirmBody, PERIOD_RESETS,
} from '../lib/budgetCopy';

/**
 * A group budget has two counter-intuitive properties, and the app was explaining
 * them in four different sets of words: the Budget tab's empty state, its overview
 * caption, the editor's per-level hint, and the consent sheet.
 *
 * The same failure mode `trustCopy.test.ts` guards — and the same mechanism, since
 * the point is not that today's four sites agree but that a fifth cannot quietly
 * write its own.
 */
const SRC = join(__dirname, '..');

describe('the two facts are always stated in full', () => {
  it('"per person" always says what it is NOT', () => {
    // "per person" alone is what made a four-person grocery budget look four
    // times too big — the reader supplies "so divide it by four".
    expect(perPersonMeans).toMatch(/not a pot/i);
  });

  it('an override always says it is per category', () => {
    // Without "only for the categories you fill in", an override reads as
    // all-or-nothing: set one amount, lose the group's other twelve.
    const s = overrideMeans('Goa Trip');
    expect(s).toMatch(/categories you fill in/i);
    expect(s).toMatch(/leave blank keep following/i);
  });

  it('every surface that offers an override says how to undo it', () => {
    // §13's rule for trust applies here too: a setting you cannot get out of is
    // a one-way door, and the way out has to be stated where the door is.
    expect(overrideIsReversible).toMatch(/clear an amount/i);
    for (const para of overrideConfirmBody('Goa Trip')) expect(para).toBeTruthy();
    expect(overrideConfirmBody('Goa Trip').join(' ')).toContain(overrideIsReversible);
    expect(budgetEditorHint({ scope: 'group', level: 'personal', groupName: 'Flat', overrideCount: 0 }))
      .toContain(overrideIsReversible);
  });

  it('the member empty state promises privacy AND explains the mechanics', () => {
    const body = budgetEmptyBody(false, 'Flat');
    expect(body).toContain(overrideMeans('Flat'));
    expect(body).toContain(overrideIsPrivate);
  });

  it('the admin empty state states the per-person rule and the reset', () => {
    const body = budgetEmptyBody(true, 'Flat');
    expect(body).toContain(perPersonMeans);
    expect(body).toContain(PERIOD_RESETS);
  });
});

describe('the copy changes with the role and with the state', () => {
  it('the CTA says whose budget you are about to set', () => {
    // An admin sets what everyone inherits; a member can only set their own.
    // One label for both is the difference between an invitation and a dead end.
    expect(budgetEmptyCta(true)).toMatch(/group/i);
    expect(budgetEmptyCta(false)).toMatch(/my/i);
  });

  it('the caption stops claiming "per person" once you have your own', () => {
    expect(budgetCaption({ scope: 'group', allocated: '₹10k', overrideCount: 0 })).toMatch(/per person/);
    const own = budgetCaption({ scope: 'group', allocated: '₹10k', overrideCount: 2 });
    expect(own).not.toMatch(/per person/);
    expect(own).toMatch(/your own in 2 categories/);
  });

  it('singularises one category', () => {
    expect(budgetCaption({ scope: 'group', allocated: '₹10k', overrideCount: 1 }))
      .toMatch(/your own in 1 category(?!\w)/);
  });

  it('My Budget never talks about a group default', () => {
    // There is no "everyone" to inherit it — a level control there would be a
    // choice between one person and the same person.
    const hint = budgetEditorHint({ scope: 'global', level: 'group', groupName: '', overrideCount: 0 });
    expect(hint).not.toMatch(/every member|per person|group's/i);
    expect(hint).toMatch(/personal spending and your share/i);
  });
});

describe('no screen hand-writes its own version', () => {
  /** Source with comments stripped — prose about the old copy is not the copy. */
  const code = (rel: string) =>
    readFileSync(join(SRC, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  const SITES = [
    'components/finance/group/BudgetTab.tsx',
    'components/finance/budget/BudgetEditor.tsx',
    'components/finance/budget/OwnBudgetSheet.tsx',
    'lib/budgetEditor.ts',
  ];

  it.each(SITES)('%s reads from budgetCopy', (rel) => {
    expect(code(rel)).toMatch(/budgetCopy/);
  });

  it.each(SITES)('%s does not re-word the policy inline', (rel) => {
    const src = code(rel);
    // The phrases that were duplicated. Any of them appearing as a literal here
    // means a fifth wording has been written by hand.
    for (const phrase of [
      'every member starts from',
      'keep following the group',
      'per person this month',
      'only you see them',
    ]) {
      expect({ rel, phrase, present: src.includes(phrase) })
        .toEqual({ rel, phrase, present: false });
    }
  });
});
