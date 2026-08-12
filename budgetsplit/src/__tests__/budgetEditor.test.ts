import {
  budgetEditorCopy, budgetEntriesToSave, budgetFormDirty, budgetLevelControlVisible,
  outsideBudgetLines, seedBudgetForms,
} from '../lib/budgetEditor';
import type { CategoryBudget } from '../db/queries/categoryBudgets';
import {
  createTestDb, addPerson, addGroup, addMember, addCategory, asDb, budgetVia, type TestDb,
} from './helpers/testDb';
import { getCategoryBudgetRows, getCategoryBudgets } from '../db/queries/categoryBudgets';

const row = (o: Partial<CategoryBudget> & { category: string; amount: number }): CategoryBudget => ({
  id: `b-${o.category}-${o.person_id ?? 'default'}`,
  group_id: 'g',
  cadence: 'monthly',
  person_id: null,
  ...o,
});
const catalog = new Set(['Groceries', 'Rent', 'Fuel']);

/**
 * "Mine" holds only your own lines.
 *
 * It used to be pre-filled from the group default, so one tap on Mine followed by
 * Save wrote an override for every previously-defaulted category — detaching you
 * from the group in categories you never looked at. Per-category overlap is the
 * behaviour, and this is where it is pinned.
 */
describe('what the Mine tab holds and what a Save writes', () => {
  const rows = [
    row({ category: 'Groceries', amount: 600000 }),
    row({ category: 'Rent', amount: 1_500_000 }),
    row({ category: 'Fuel', amount: 300000 }),
    row({ category: 'Groceries', amount: 200000, person_id: 'me' }),
  ];

  it('seeds Mine from my rows only, with the default kept as inherited', () => {
    const { forms, inherited } = seedBudgetForms(rows, 'me', catalog);
    expect(forms.personal.amounts).toEqual({ Groceries: '2000' });
    expect(Object.keys(inherited).sort()).toEqual(['Fuel', 'Groceries', 'Rent']);
    expect(inherited.Rent).toEqual({ amount: 1_500_000, cadence: 'monthly' });
  });

  it('seeds the group tab from the default', () => {
    const { forms } = seedBudgetForms(rows, 'me', catalog);
    expect(forms.group.amounts).toEqual({ Groceries: '6000', Rent: '15000', Fuel: '3000' });
  });

  it("ignores another person's override entirely", () => {
    const withTheirs = [...rows, row({ category: 'Fuel', amount: 999900, person_id: 'alex' })];
    const { forms } = seedBudgetForms(withTheirs, 'me', catalog);
    expect(forms.personal.amounts).toEqual({ Groceries: '2000' });
  });

  it('writes one entry for the one category I filled in, not the whole set', () => {
    const { forms } = seedBudgetForms(rows, 'me', catalog);
    expect(budgetEntriesToSave(forms.personal, 'monthly')).toEqual([
      { category: 'Groceries', cadence: 'monthly', amount: 200000 },
    ]);
  });

  it('writes nothing at all from an untouched Mine tab', () => {
    const defaultsOnly = rows.filter(r => r.person_id === null);
    const { forms } = seedBudgetForms(defaultsOnly, 'me', catalog);
    expect(budgetEntriesToSave(forms.personal, 'monthly')).toEqual([]);
  });

  it('drops a cleared amount, which is how a row goes back to following the group', () => {
    const { forms } = seedBudgetForms(rows, 'me', catalog);
    const cleared = { ...forms.personal, amounts: { ...forms.personal.amounts, Groceries: '' } };
    expect(budgetEntriesToSave(cleared, 'monthly')).toEqual([]);
  });

  it('leaves a line for a category I do not have out of the form', () => {
    const withOutside = [...rows, row({ category: 'Gym', amount: 100000 })];
    const { forms } = seedBudgetForms(withOutside, 'me', catalog);
    expect(forms.group.amounts.Gym).toBeUndefined();
    expect(outsideBudgetLines(withOutside, catalog, 'group', 'me').map(r => r.category)).toEqual(['Gym']);
  });
});

describe('Save is only live once something changed', () => {
  const rows = [row({ category: 'Groceries', amount: 600000 })];

  it('is not dirty on a fresh load, at either level', () => {
    const { forms } = seedBudgetForms(rows, 'me', catalog);
    expect(budgetFormDirty(forms.group, rows, 'group', 'me', 'monthly')).toBe(false);
    expect(budgetFormDirty(forms.personal, rows, 'personal', 'me', 'monthly')).toBe(false);
  });

  it('is dirty once an amount changes', () => {
    const { forms } = seedBudgetForms(rows, 'me', catalog);
    const edited = { ...forms.group, amounts: { Groceries: '7000' } };
    expect(budgetFormDirty(edited, rows, 'group', 'me', 'monthly')).toBe(true);
  });

  it('is dirty once a cadence changes, at the same amount', () => {
    const { forms } = seedBudgetForms(rows, 'me', catalog);
    const edited = { ...forms.group, cadences: { Groceries: 'yearly' as const } };
    expect(budgetFormDirty(edited, rows, 'group', 'me', 'monthly')).toBe(true);
  });

  it('is dirty when a line is cleared', () => {
    const { forms } = seedBudgetForms(rows, 'me', catalog);
    const cleared = { ...forms.group, amounts: { Groceries: '' } };
    expect(budgetFormDirty(cleared, rows, 'group', 'me', 'monthly')).toBe(true);
  });
});

/** "Save Budget" read the same whether you rewrote four flatmates' allowances or
 *  your own. Only the blast radius makes the label honest. */
describe('the CTA names its blast radius', () => {
  it('differs across all three scope/level combinations', () => {
    const labels = [
      budgetEditorCopy('global', 'group').cta,
      budgetEditorCopy('group', 'group', { groupName: 'Flat' }).cta,
      budgetEditorCopy('group', 'personal', { groupName: 'Flat' }).cta,
    ];
    expect(new Set(labels).size).toBe(3);
    expect(labels[1]).toBe('Save for everyone');
  });

  it('titles My Budget as itself, and a group by name', () => {
    expect(budgetEditorCopy('global', 'group').title).toBe('My Budget');
    expect(budgetEditorCopy('group', 'group', { groupName: 'Flat' }).title).toBe('Flat budget');
  });
});

describe('the level control appears only when it is a real choice', () => {
  it('is hidden for My Budget, which has no levels', () => {
    expect(budgetLevelControlVisible('global', true, 4)).toBe(false);
  });

  it('is hidden for a member, whose only editable level is their own', () => {
    expect(budgetLevelControlVisible('group', false, 4)).toBe(false);
  });

  it('is hidden in a one-member group, where both levels are the same person', () => {
    expect(budgetLevelControlVisible('group', true, 1)).toBe(false);
  });

  it('is shown to an admin of a group with other members', () => {
    expect(budgetLevelControlVisible('group', true, 2)).toBe(true);
  });
});

/**
 * End-to-end through the real writer: what the editor submits, submitted, does what
 * the pure functions above claim.
 */
describe('a Mine save through the real writer', () => {
  async function seeded() {
    const db = createTestDb();
    const me = addPerson(db, 'Me', true);
    const alex = addPerson(db, 'Alex', false);
    const flat = addGroup(db, 'Flat', false);
    addMember(db, flat, me);
    addMember(db, flat, alex);
    ['Groceries', 'Rent', 'Fuel'].forEach(c => addCategory(db, c));
    await budgetVia(db, flat, [
      { category: 'Groceries', cadence: 'monthly', amount: 600000 },
      { category: 'Rent', cadence: 'monthly', amount: 1_500_000 },
      { category: 'Fuel', cadence: 'monthly', amount: 300000 },
    ], { level: 'group', actorId: me });
    return { db, me, flat };
  }

  it('creates exactly one override and leaves the rest following the group', async () => {
    const { db, me, flat } = await seeded();
    const rows = await getCategoryBudgetRows(asDb(db), flat);
    const { forms } = seedBudgetForms(rows, me, new Set(['Groceries', 'Rent', 'Fuel']));
    const edited = { ...forms.personal, amounts: { Groceries: '2000' } };

    await budgetVia(db, flat, budgetEntriesToSave(edited, 'monthly'), { level: 'personal', actorId: me });

    const mine = db.raw.prepare('SELECT category FROM category_budget WHERE person_id = ?').all(me) as { category: string }[];
    expect(mine.map(r => r.category)).toEqual(['Groceries']);

    const resolved = await getCategoryBudgets(asDb(db), flat, me);
    expect(resolved.find(r => r.category === 'Groceries')!.amount).toBe(200000);
    expect(resolved.find(r => r.category === 'Rent')!.amount).toBe(1_500_000);
    expect(resolved.find(r => r.category === 'Fuel')!.amount).toBe(300000);
  });

  it('goes back to following the group when the amount is cleared', async () => {
    const { db, me, flat } = await seeded();
    await budgetVia(db, flat, [{ category: 'Groceries', cadence: 'monthly', amount: 200000 }], { level: 'personal', actorId: me });
    // Cleared → not submitted → the override row is deleted by the scoped replace.
    await budgetVia(db, flat, [], { level: 'personal', actorId: me });

    expect(db.raw.prepare('SELECT count(*) c FROM category_budget WHERE person_id = ?').get(me)).toEqual({ c: 0 });
    const resolved = await getCategoryBudgets(asDb(db), flat, me);
    expect(resolved.find(r => r.category === 'Groceries')!.amount).toBe(600000);
  });
});
