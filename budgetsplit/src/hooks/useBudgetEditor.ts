import { useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useScreenData } from './useScreenData';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { settings } from '../lib/settings';
import { getCategoriesByFrequency, insertCategory, type Category } from '../db/queries/categories';
import { seedGlobalCategories } from '../db/seedCategories';
import {
  getCategoryBudgetRows, setCategoryBudgets, setMyGlobalBudget,
  type BudgetCadence, type BudgetLevel,
} from '../db/queries/categoryBudgets';
import { getGroupContext, getPersonalGroup } from '../db/queries/groups';
import { getGroupMembers, getMe } from '../db/queries/persons';
import { canEditGroupBudget } from '../lib/permissions';
import { categoryVisual } from '../constants/categories';
import { haptic } from '../lib/haptics';
import { parseToPaise, paiseToInput } from '../lib/money';
import { rollUpBudgets } from '../lib/budget';
import {
  budgetEditorCopy, budgetEntriesToSave, budgetFormDirty, budgetLevelControlVisible,
  budgetSections, collapsedSectionsFor, outsideBudgetLines, seedBudgetForms, sectionResolver,
  type BudgetForm, type BudgetScope,
} from '../lib/budgetEditor';

/**
 * State and writes for the budget editor, shared by `/budget` (My Budget) and
 * `/group/[id]/budget` (a group's).
 *
 * `pendingLevel` is the level waiting for consent — named for what it holds, unlike
 * the `confirmOwn` boolean it replaces, which nothing ever read: switching to "Mine"
 * set it and returned without switching, so the tap was a permanent no-op and no
 * dialog existed to unblock it.
 */
export function useBudgetEditor(opts: { scope: BudgetScope; groupId?: string; focusCategory?: string }) {
  const { scope, focusCategory } = opts;
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();

  const [level, setLevel] = useState<BudgetLevel>('group');
  const [pendingLevel, setPendingLevel] = useState<BudgetLevel | null>(null);
  const [ownConsented, setOwnConsented] = useState(false);
  const [forms, setForms] = useState<Record<BudgetLevel, BudgetForm>>({
    group: { amounts: {}, cadences: {} },
    personal: { amounts: {}, cadences: {} },
  });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [cadenceSheetFor, setCadenceSheetFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // `refetchOnDataChange` off: a mid-edit reseed would wipe unsaved amounts.
  const { data, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const me = await getMe(db);
    const meId = me?.id ?? '';
    const group = scope === 'global' ? await getPersonalGroup(db) : null;
    const groupId = scope === 'global' ? group?.id : opts.groupId;
    if (!groupId) {
      return {
        groupId: null, groupName: '', cats: [] as Category[], rows: [],
        defaultCadence: 'monthly' as BudgetCadence, meId, ctx: null, memberCount: 0, budgetTarget: 0,
      };
    }
    let [cats, rows, dc, ctx, members, target] = await Promise.all([
      getCategoriesByFrequency(db, groupId),
      // Both levels, unresolved: this is the one screen that needs the default and
      // the override side by side rather than the winner.
      getCategoryBudgetRows(db, groupId),
      settings.defaultCadence(),
      getGroupContext(db, groupId, meId),
      getGroupMembers(db, groupId),
      settings.budgetTarget(),
    ]);
    if (cats.length === 0) {
      await seedGlobalCategories(db);
      cats = await getCategoriesByFrequency(db, groupId);
    }
    return {
      groupId, groupName: group?.name ?? '', cats, rows, meId, ctx,
      defaultCadence: dc ? (dc as BudgetCadence) : 'monthly',
      memberCount: members.length,
      budgetTarget: target ?? 0,
    };
  }, [scope, opts.groupId], { refetchOnDataChange: false });

  const cats = data?.cats ?? [];
  const rows = data?.rows ?? [];
  const meId = data?.meId ?? '';
  const groupId = data?.groupId ?? null;
  const defaultCadence = data?.defaultCadence ?? 'monthly';
  const ctx = data?.ctx ?? null;
  const canEditGroupDefault = ctx ? canEditGroupBudget(ctx) : false;
  const overrideCount = rows.filter(r => r.person_id === meId && r.amount > 0).length;
  const catalogNames = useMemo(() => new Set(cats.map(c => c.name)), [cats]);
  const sectionOf = useMemo(() => sectionResolver(cats), [cats]);

  // My Budget has no levels; a member's only editable level is their own.
  useEffect(() => {
    if (scope === 'global') setLevel('group');
    else if (ctx && !canEditGroupDefault) setLevel('personal');
  }, [scope, ctx, canEditGroupDefault]);

  const { forms: seeded, inherited } = useMemo(
    () => seedBudgetForms(rows, meId, catalogNames),
    [rows, meId, catalogNames],
  );

  // Seeded once per data arrival, not per level — the old effect had `level` in its
  // deps, so a working level switch would have wiped amounts typed on the other tab.
  useEffect(() => {
    if (!data) return;
    setForms(seeded);
    setCollapsed(collapsedSectionsFor(cats, seeded[level].amounts, sectionOf, focusCategory));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const form = forms[level];
  const dirty = budgetFormDirty(form, rows, level, meId, defaultCadence);
  const copy = budgetEditorCopy(scope, level, { groupName: data?.groupName, overrideCount });
  const levelControlVisible = budgetLevelControlVisible(scope, canEditGroupDefault, data?.memberCount ?? 0);

  const cadenceOf = (cat: string): BudgetCadence => form.cadences[cat] ?? defaultCadence;
  const linesFor = (list: Category[]) => list
    .map(c => ({ cadence: cadenceOf(c.name), amount: parseToPaise(form.amounts[c.name] ?? '') }))
    .filter(l => l.amount > 0);

  const today = new Date();
  const rollup = rollUpBudgets(linesFor(cats), 'monthly', today);
  const budgetedCount = Object.values(form.amounts).filter(a => parseToPaise(a) > 0).length;
  const sections = useMemo(() => budgetSections(cats, sectionOf), [cats, sectionOf]);
  const outside = outsideBudgetLines(rows, catalogNames, level, meId);

  function updateForm(next: (f: BudgetForm) => BudgetForm) {
    setForms(prev => ({ ...prev, [level]: next(prev[level]) }));
  }
  function setAmount(category: string, amount: string) {
    updateForm(f => ({ ...f, amounts: { ...f.amounts, [category]: amount } }));
  }
  function setCadence(category: string, cadence: BudgetCadence) {
    haptic.selection();
    updateForm(f => ({ ...f, cadences: { ...f.cadences, [category]: cadence } }));
  }
  /** Take an inherited line as your own, so its cadence becomes editable. */
  function promoteInherited(category: string) {
    const line = inherited[category];
    if (!line) return;
    updateForm(f => ({
      amounts: { ...f.amounts, [category]: paiseToInput(line.amount) },
      cadences: { ...f.cadences, [category]: line.cadence },
    }));
  }
  function toggleSection(title: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  }

  /** Switching to your own budget is an opt-in, so the first time it asks. */
  function requestLevel(next: BudgetLevel) {
    if (next === level) return;
    if (next === 'personal' && overrideCount === 0 && !ownConsented) { setPendingLevel(next); return; }
    haptic.selection();
    setLevel(next);
  }
  function confirmPendingLevel() {
    if (!pendingLevel) return;
    haptic.selection();
    setOwnConsented(true);
    setLevel(pendingLevel);
    setPendingLevel(null);
  }

  async function adoptCategory(name: string) {
    const vis = categoryVisual(name);
    await insertCategory(db, name, vis.icon, vis.color, 'expense', 'Other');
    haptic.success();
    // Its budget row is untouched — adopting is a catalog change, not a money one.
    await reload();
  }

  async function save(): Promise<boolean> {
    if (!groupId) return false;
    setSaving(true);
    try {
      const entries = budgetEntriesToSave(form, defaultCadence);
      if (scope === 'global') await setMyGlobalBudget(db, entries, { actorId: meId });
      else await setCategoryBudgets(db, groupId, entries, { level, actorId: meId });
      refresh();
      haptic.success();
      return true;
    } catch {
      haptic.error();
      return false;
    } finally {
      setSaving(false);
    }
  }

  return {
    loading: !data, error, refreshing, onRefresh, reload,
    groupId, cats, sections, outside, inherited, collapsed, toggleSection,
    level, requestLevel, pendingLevel, setPendingLevel, confirmPendingLevel,
    levelControlVisible, overrideCount, copy, dirty, saving,
    form, setAmount, cadenceOf, setCadence, promoteInherited,
    cadenceSheetFor, setCadenceSheetFor,
    rollup, budgetedCount, adoptCategory, save,
    groupName: data?.groupName ?? '',
    budgetTarget: data?.budgetTarget ?? 0,
  };
}
