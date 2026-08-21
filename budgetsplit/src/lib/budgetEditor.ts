import type { BudgetCadence, BudgetLevel, CategoryBudget } from '../db/queries/categoryBudgets';
import type { Category } from '../db/queries/categories';
import { categorySection, SECTION_ORDER } from '../constants/categories';
import { OTHERS_LABEL } from './categoryFold';
import { parseToPaise, paiseToInput } from './money';

/**
 * Pure logic for the budget editor. Lives here rather than in the screen because
 * the suite never renders a component, so anything that must be *tested* — what a
 * Save writes above all — has to be reachable without React.
 */

/** Which budget the editor is pointed at: My Budget, or one group's. */
export type BudgetScope = 'global' | 'group';

export type BudgetForm = {
  amounts: Record<string, string>;
  cadences: Record<string, BudgetCadence>;
};

/** A group default a blank "Mine" row is still following. */
export type InheritedLine = { amount: number; cadence: BudgetCadence };

const emptyForm = (): BudgetForm => ({ amounts: {}, cadences: {} });

/**
 * Seed one form per level from the raw rows.
 *
 * **"Mine" holds only your own lines.** It used to be pre-filled from the group
 * default, so pressing Save on that tab without typing anything materialised an
 * override for every previously-defaulted category — detaching you from the group
 * in categories you never looked at. The default now lands in `inherited` and is
 * rendered as a placeholder, so a blank row keeps following the group.
 *
 * Only catalog categories are seeded. A budget line naming a category you do not
 * have cannot be rendered as a row, and leaving it out of the form is what keeps
 * `setCategoryBudgets` from treating it as cleared (see `outsideBudgetLines`).
 */
export function seedBudgetForms(
  rows: CategoryBudget[],
  meId: string,
  catalogNames: ReadonlySet<string>,
): { forms: Record<BudgetLevel, BudgetForm>; inherited: Record<string, InheritedLine> } {
  const forms: Record<BudgetLevel, BudgetForm> = { group: emptyForm(), personal: emptyForm() };
  const inherited: Record<string, InheritedLine> = {};

  for (const r of rows) {
    if (r.amount <= 0 || !catalogNames.has(r.category)) continue;
    const form = r.person_id === null ? forms.group : r.person_id === meId ? forms.personal : null;
    if (!form) continue;
    form.amounts[r.category] = paiseToInput(r.amount);
    form.cadences[r.category] = r.cadence;
    if (r.person_id === null) inherited[r.category] = { amount: r.amount, cadence: r.cadence };
  }
  return { forms, inherited };
}

/** What a Save submits: the categories with a value, at their chosen cadence. */
export function budgetEntriesToSave(
  form: BudgetForm,
  defaultCadence: BudgetCadence,
): Array<{ category: string; cadence: BudgetCadence; amount: number }> {
  return Object.keys(form.amounts)
    .map(category => ({
      category,
      cadence: form.cadences[category] ?? defaultCadence,
      amount: parseToPaise(form.amounts[category] ?? ''),
    }))
    .filter(e => e.amount > 0);
}

/**
 * Has anything actually changed at this level? Save is disabled until it has —
 * an untouched Save that still writes rows is how a full set of overrides used to
 * appear from one tap.
 */
export function budgetFormDirty(
  form: BudgetForm,
  rows: CategoryBudget[],
  level: BudgetLevel,
  meId: string,
  defaultCadence: BudgetCadence,
): boolean {
  const stored = new Map(
    rows
      .filter(r => (level === 'group' ? r.person_id === null : r.person_id === meId))
      .filter(r => r.amount > 0)
      .map(r => [r.category, r]),
  );
  const submitted = budgetEntriesToSave(form, defaultCadence);
  if (submitted.length !== stored.size) return true;
  return submitted.some(e => {
    const was = stored.get(e.category);
    return !was || was.amount !== e.amount || was.cadence !== e.cadence;
  });
}

/**
 * Budget lines naming a category your catalog does not have.
 *
 * `category_budget.category` is a name, not a foreign key, so an admin's default
 * can name something you deleted. Read-only views merge these into `Others`; the
 * editor lists them individually because this is the one screen that can adopt them.
 */
export function outsideBudgetLines(
  rows: CategoryBudget[],
  catalogNames: ReadonlySet<string>,
  level: BudgetLevel,
  meId: string,
): CategoryBudget[] {
  return rows
    .filter(r => !catalogNames.has(r.category) && r.category !== OTHERS_LABEL)
    .filter(r => (level === 'group' ? r.person_id === null : r.person_id === meId || r.person_id === null))
    .filter((r, i, all) => all.findIndex(o => o.category === r.category) === i);
}

export type BudgetSection = { title: string; cats: Category[] };

/** Categories grouped into ordered parent sections. */
export function budgetSections(
  cats: Category[],
  sectionOf: (name: string) => string,
): BudgetSection[] {
  const byTitle = new Map<string, Category[]>();
  for (const c of cats) {
    const t = sectionOf(c.name);
    byTitle.set(t, [...(byTitle.get(t) ?? []), c]);
  }
  const extras = [...byTitle.keys()].filter(t => !SECTION_ORDER.includes(t));
  return [...SECTION_ORDER, ...extras]
    .filter(t => byTitle.has(t))
    .map(t => ({ title: t, cats: byTitle.get(t)! }));
}

/** Collapse sections with nothing set; on a deep link, everything but the target. */
export function collapsedSectionsFor(
  cats: Category[],
  amounts: Record<string, string>,
  sectionOf: (name: string) => string,
  focusCategory?: string,
): Set<string> {
  const all = new Set(cats.map(c => sectionOf(c.name)));
  if (focusCategory) {
    const target = sectionOf(focusCategory);
    return new Set([...all].filter(s => s !== target));
  }
  const inUse = new Set(Object.keys(amounts).filter(n => parseToPaise(amounts[n]) > 0).map(sectionOf));
  return new Set([...all].filter(s => !inUse.has(s)));
}

/**
 * The level control is a real choice only when there is more than one thing you
 * could edit: My Budget has no levels, a member cannot touch the default, and in a
 * one-member group "what everyone starts from" and "mine" are the same person.
 */
export function budgetLevelControlVisible(
  scope: BudgetScope,
  canEditGroupDefault: boolean,
  memberCount: number,
): boolean {
  return scope === 'group' && canEditGroupDefault && memberCount > 1;
}

export type BudgetEditorCopy = {
  title: string;
  heroLabel: string;
  hint: string;
  cta: string;
};

/**
 * Copy per scope and level. `Save Budget` read the same whether you were rewriting
 * four flatmates' allowances or your own; only the blast radius makes it honest.
 *
 * `hint` is deliberately one short line. It sits directly under the level pills and
 * explains what they select, so it is a label for a control — not an explainer. The
 * editor used to stack it with two more paragraphs of muted 11px copy before you
 * reached anything you could touch.
 */
export function budgetEditorCopy(
  scope: BudgetScope,
  level: BudgetLevel,
  opts: { groupName?: string; overrideCount?: number } = {},
): BudgetEditorCopy {
  if (scope === 'global') {
    return {
      title: 'My Budget',
      heroLabel: '≈ Monthly, yours',
      hint: 'Across personal and every group.',
      cta: 'Save my budget',
    };
  }
  const groupName = opts.groupName ?? 'this group';
  if (level === 'personal') {
    return {
      title: `${groupName} budget`,
      heroLabel: '≈ Monthly, yours',
      hint: 'Yours only — blank rows keep following the group.',
      cta: 'Save mine for this group',
    };
  }
  return {
    title: `${groupName} budget`,
    heroLabel: '≈ Monthly, per person',
    hint: (opts.overrideCount ?? 0) > 0
      ? 'What every member starts from. You have your own in some.'
      : 'What every member starts from, including you.',
    cta: 'Save for everyone',
  };
}

/** Section for a category: its own DB `section` when it has one, else by name. */
export function sectionResolver(cats: Category[]): (name: string) => string {
  const byName = new Map(cats.map(c => [c.name, c.section]));
  return (name: string) => byName.get(name) ?? categorySection(name);
}
