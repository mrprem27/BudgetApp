import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, findNodeHandle,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useScreenData } from '../../../src/hooks/useScreenData';
import { settings } from '../../../src/lib/settings';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, layout, shadow } from '../../../src/constants/layout';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { useDataRefresh } from '../../../src/components/system/DataRefreshProvider';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { getCategoriesByFrequency } from '../../../src/db/queries/categories';
import { seedGlobalCategories } from '../../../src/db/seedCategories';
import { getCategoryBudgets, setCategoryBudgets } from '../../../src/db/queries/categoryBudgets';
import type { BudgetCadence } from '../../../src/db/queries/categoryBudgets';
import { categoryVisual, categorySection, SECTION_ORDER } from '../../../src/constants/categories';
import { parseToPaise, formatRupees, formatCompact } from '../../../src/lib/money';
import { rollUpBudgets } from '../../../src/lib/budget';
import { haptic } from '../../../src/lib/haptics';
import type { Category } from '../../../src/db/queries/categories';
import type { FeatherName } from '../../../src/constants/palette';
import { AppRefreshControl } from '../../../src/components/ui/AppRefreshControl';
import { SectionCard } from '../../../src/components/ui/SectionCard';
import { Card } from '../../../src/components/ui/Card';
import { Divider } from '../../../src/components/ui/Divider';
import { IconCircle } from '../../../src/components/ui/IconCircle';
import { ListRow } from '../../../src/components/ui/ListRow';
import { useContentInset } from '../../../src/hooks/useContentInset';

const CADENCES: { key: BudgetCadence; label: string }[] = [
  { key: 'once', label: 'One-time' },
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

/** Representative icon per parent section (all valid Feather names). */
const SECTION_ICON: Record<string, FeatherName> = {
  'Home & Living': 'home',
  Food: 'coffee',
  Transport: 'navigation',
  'Bills & Utilities': 'zap',
  Lifestyle: 'shopping-bag',
  Health: 'heart',
  'Money & Growth': 'trending-up',
  Other: 'grid',
};

type SectionGroup = { title: string; icon: FeatherName; cats: Category[] };

export default function BudgetEditorScreen() {
  const { id, category: focusCategoryRaw } = useLocalSearchParams<{ id: string; category?: string }>();
  // Deep-linked from a category's "Set budget" CTA → jump straight to its field.
  const focusCategory = focusCategoryRaw ? decodeURIComponent(focusCategoryRaw) : undefined;
  const db = useSQLiteContext();
  const router = useRouter();
  const { refresh } = useDataRefresh();
  const insets = useSafeAreaInsets();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [cadences, setCadences] = useState<Record<string, BudgetCadence>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [cadenceSheetFor, setCadenceSheetFor] = useState<string | null>(null);
  // Measured, not guessed: the footer is a fixed CTA over a scroll view, and the spacer it
  // replaced was a literal 100pt.
  const [footerH, setFooterH] = useState(0);
  const listPad = useContentInset({ footer: footerH });
  const scrollRef = useRef<ScrollView>(null);
  const focusRowRef = useRef<View>(null);
  const scrolledToFocus = useRef(false);

  // Initial DATA load (existing categories + saved budgets + the user's default
  // cadence). Form state below (amounts/cadences/collapsed) is *seeded* from this
  // once it arrives — those stay editable local state. `refetchOnDataChange` is off
  // to match the prior behavior (this editor only reloaded on focus, and a mid-edit
  // reseed would wipe unsaved amounts).
  const { data, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    if (!id) return { cats: [] as Category[], budgets: [], defaultCadence: 'monthly' as BudgetCadence };
    let [cats, budgets, dc] = await Promise.all([
      getCategoriesByFrequency(db, id),
      getCategoryBudgets(db, id),
      settings.defaultCadence(),
    ]);
    // Self-heal: the expense catalog should never be empty. Reseed if it is.
    if (cats.length === 0) {
      await seedGlobalCategories(db);
      cats = await getCategoriesByFrequency(db, id);
    }
    return { cats, budgets, defaultCadence: dc ? (dc as BudgetCadence) : 'monthly' };
  }, [id], { refetchOnDataChange: false });

  const allCategories = data?.cats ?? [];
  const defaultCadence = data?.defaultCadence ?? 'monthly';

  // Seed editable form state (amounts/cadences/collapsed) from the loaded data
  // whenever it (re)arrives — mirrors what the old `load()` did inline.
  useEffect(() => {
    if (!data) return;
    const { cats, budgets } = data;
    const amt: Record<string, string> = {};
    const cad: Record<string, BudgetCadence> = {};
    for (const b of budgets) {
      if (b.amount > 0) {
        amt[b.category] = (b.amount / 100).toString();
        cad[b.category] = b.cadence;
      }
    }
    setAmounts(amt);
    setCadences(cad);
    // Collapse sections that have no budget set yet; keep the ones in use open.
    // Group by each row's own DB section (kind-correct), not the name-only map.
    const secMap = new Map(cats.map(c => [c.name, c.section]));
    const secOf = (name: string): string => secMap.get(name) ?? categorySection(name);
    const budgetedSections = new Set(Object.keys(amt).map(secOf));
    const allSections = new Set(cats.map(c => secOf(c.name)));
    if (focusCategory) {
      // Deep-linked to one category: collapse every other section so its field
      // is right at the top, ready to type into.
      const target = secOf(focusCategory);
      setCollapsed(new Set([...allSections].filter(s => s !== target)));
    } else {
      setCollapsed(new Set([...allSections].filter(s => !budgetedSections.has(s))));
    }
  }, [data, focusCategory]);

  // Deep-linked from a category: once its row is laid out, center it in the
  // visible area above the keyboard (the field would otherwise sit under it).
  useEffect(() => {
    if (scrolledToFocus.current || !focusCategory || allCategories.length === 0) return;
    scrolledToFocus.current = true;
    const t = setTimeout(() => {
      const node = scrollRef.current ? findNodeHandle(scrollRef.current) : null;
      if (focusRowRef.current && node != null) {
        focusRowRef.current.measureLayout(
          node,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 110), animated: true }),
          () => {},
        );
      }
    }, 450);
    return () => clearTimeout(t);
  }, [focusCategory, allCategories.length]);

  // Section for a category — prefer its authoritative per-kind DB `section`
  // column (so a name shared across kinds like 'Rent' groups correctly), falling
  // back to the name-only lookup for custom/unbackfilled ones.
  const sectionByName = new Map(allCategories.map(c => [c.name, c.section]));
  const sectionOf = (name: string): string => sectionByName.get(name) ?? categorySection(name);

  const cadenceOf = (cat: string): BudgetCadence => cadences[cat] ?? defaultCadence;
  // Yearly/once lines are pools, not rates, so they are NOT in `monthly` — see
  // `rollUpBudgets`. The subtitle below names them rather than dropping them.
  const today = new Date();
  const linesFor = (cats: Category[]) => cats.map(c => ({
    cadence: cadenceOf(c.name), amount: parseToPaise(amounts[c.name] ?? ''),
  })).filter(l => l.amount > 0);
  const rollup = rollUpBudgets(linesFor(allCategories), 'monthly', today);
  const budgetedCount = Object.values(amounts).filter(a => parseToPaise(a) > 0).length;

  // Group categories into ordered parent sections.
  const sections: SectionGroup[] = (() => {
    const byTitle = new Map<string, Category[]>();
    for (const c of allCategories) {
      const t = sectionOf(c.name);
      const arr = byTitle.get(t) ?? [];
      arr.push(c);
      byTitle.set(t, arr);
    }
    const ordered = [...SECTION_ORDER, ...[...byTitle.keys()].filter(t => !SECTION_ORDER.includes(t))];
    return ordered
      .filter(t => byTitle.has(t))
      .map(t => ({ title: t, icon: SECTION_ICON[t] ?? 'grid', cats: byTitle.get(t)! }));
  })();

  function setAmount(category: string, amount: string) {
    setAmounts(prev => ({ ...prev, [category]: amount }));
  }
  function setCadence(category: string, cadence: BudgetCadence) {
    haptic.selection();
    setCadences(prev => ({ ...prev, [category]: cadence }));
  }
  // No LayoutAnimation call: `SectionCard` animates its own body via `Collapse`, so the
  // motion is scoped to the card instead of every layout change in the same commit.
  function toggleSection(title: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const entries = allCategories
        .map(c => ({ category: c.name, cadence: cadenceOf(c.name), amount: parseToPaise(amounts[c.name] ?? '') }))
        .filter(e => e.amount > 0);
      await setCategoryBudgets(db, id, entries);
      refresh(); // tell Home / group detail their budget data changed
      haptic.success();
      router.back();
    } catch {
      haptic.error();
      Alert.alert("Couldn't save", 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Set Budget" onBack={() => router.back()} />
      {error ? (
        <ErrorState onRetry={() => { void reload(); }} />
      ) : (
      <>
        {/* No KeyboardAvoidingView. It padded the whole stack, so the footer rode the keyboard
            up on every field focus — on a screen with 40-odd inputs that is 40-odd jumps of a
            button nobody is trying to reach mid-typing. The ScrollView insets itself instead,
            which keeps the focused row visible and leaves the CTA where it was put. */}
        <ScrollView
          ref={scrollRef}
          // The KeyboardAvoidingView this replaced was the thing bounding the list against the
          // footer; without a flex here the content grows unbounded and pushes the CTA off.
          style={styles.list}
          contentContainerStyle={[styles.scroll, { paddingBottom: listPad }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>≈ Monthly, per person</Text>
            <Text style={styles.totalAmount}>{formatRupees(rollup.amount)}</Text>
            <Text style={styles.totalSub}>
              {budgetedCount} {budgetedCount === 1 ? 'category' : 'categories'} budgeted
              {/* Pools are excluded from the figure above on purpose (a ₹24k/yr trip
                  budget is not ₹2k/mo), so they have to be named here — otherwise
                  they simply vanish from a total presented as complete. */}
              {rollup.pooledCount > 0
                ? ` · plus ${formatCompact(rollup.pooled)} in ${rollup.pooledCount} yearly/one-time`
                : ' · one-time not counted'}
            </Text>
          </View>

          {/* One line. The full explanation lives in the tab's empty state, which is
              where someone with no budget actually reads it. */}
          <Text style={styles.explain}>
            Amounts are per person, not the group total. Each period starts fresh —
            limits reset and unused amounts don't carry over.
          </Text>

          {sections.length > 0 ? sections.map(sec => {
            const isCollapsed = collapsed.has(sec.title);
            const secRoll = rollUpBudgets(linesFor(sec.cats), 'monthly', today);
            const secCount = sec.cats.filter(c => parseToPaise(amounts[c.name] ?? '') > 0).length;
            const secLabel = [
              secRoll.amount > 0 ? `${formatCompact(secRoll.amount)}/mo` : null,
              secRoll.pooledCount > 0 ? `${formatCompact(secRoll.pooled)} pooled` : null,
            ].filter(Boolean).join(' + ');
            return (
              <SectionCard
                key={sec.title}
                title={sec.title}
                subtitle={secCount > 0 ? `${secCount} set · ${secLabel}` : `${sec.cats.length} categories`}
                icon={sec.icon}
                expanded={!isCollapsed}
                onToggle={() => toggleSection(sec.title)}
              >
                {sec.cats.map((c, i) => {
                  const vis = categoryVisual(c.name);
                  const amt = amounts[c.name] ?? '';
                  const hasAmt = parseToPaise(amt) > 0;
                  return (
                    <View key={c.name} ref={c.name === focusCategory ? focusRowRef : undefined}>
                      <Divider indent="text" />
                      <View style={styles.rowItem}>
                        <IconCircle icon={vis.icon} size={layout.iconCircle} color={vis.color} />
                        <View style={styles.rowMid}>
                          <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                          {hasAmt && (
                            <TouchableOpacity
                              style={styles.cadenceSelect}
                              onPress={() => setCadenceSheetFor(c.name)}
                              accessibilityRole="button"
                              accessibilityLabel={`Cadence: ${CADENCES.find(x => x.key === cadenceOf(c.name))?.label}`}
                            >
                              <Feather name="repeat" size={11} color={colors.textSecondary} />
                              <Text style={styles.cadenceSelectText}>{CADENCES.find(x => x.key === cadenceOf(c.name))?.label ?? 'Monthly'}</Text>
                              <Feather name="chevron-down" size={12} color={colors.textMuted} />
                            </TouchableOpacity>
                          )}
                        </View>
                        {/* No border of its own: AGENTS §4 — an inline field inside a card
                            row is right-aligned, never a second box. */}
                        <View style={styles.amountWrap}>
                          <Text style={[styles.rupee, hasAmt && { color: colors.textSecondary }]}>₹</Text>
                          <TextInput
                            style={[styles.amountInput, hasAmt && styles.amountInputSet]}
                            value={amt}
                            onChangeText={v => setAmount(c.name, v)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            accessibilityLabel={`${c.name} budget`}
                            autoFocus={c.name === focusCategory}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </SectionCard>
            );
          }) : (
            <EmptyState icon="target" title="No categories yet" body="Add categories from Settings, then set their budgets here." />
          )}

        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        >
          <PrimaryButton label="Save Budget" onPress={handleSave} loading={saving} />
        </View>
      </>
      )}

      <SheetModal visible={!!cadenceSheetFor} onClose={() => setCadenceSheetFor(null)} title="How often?" scroll={false}>
        {/* `ListRow` like every other picker sheet — this was a fifth selection idiom
            (accentMuted fill + accent text) reachable from the same flow. */}
        <Card clip>
          {CADENCES.map((c, i) => {
            const active = cadenceSheetFor ? cadenceOf(cadenceSheetFor) === c.key : false;
            return (
              <View key={c.key}>
                {i > 0 && <Divider indent="none" />}
                <ListRow
                  title={c.label}
                  value={active ? <Feather name="check" size={18} color={colors.accent} /> : undefined}
                  chevron={false}
                  selected={active}
                  onPress={() => { if (cadenceSheetFor) setCadence(cadenceSheetFor, c.key); setCadenceSheetFor(null); }}
                />
              </View>
            );
          })}
        </Card>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
  totalCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, alignItems: 'center', gap: space.xs, ...shadow.md },
  totalLabel: { ...type.label, color: colors.textSecondary },
  totalAmount: { ...type.amountXL, color: colors.accent },
  totalSub: { ...type.caption, color: colors.textMuted },
  explain: { ...type.caption, color: colors.textMuted, lineHeight: 16 },


  rowItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: layout.rowMinHeight },
  rowMid: { flex: 1, gap: space.xs },
  rowName: { ...type.body, color: colors.textPrimary },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 88 },
  rupee: { ...type.body, color: colors.textMuted },
  amountInput: { ...type.amountMD, color: colors.textMuted, flex: 1, textAlign: 'right', paddingVertical: space.sm },
  amountInputSet: { color: colors.textPrimary },
  cadenceSelect: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  cadenceSelectText: { ...type.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  footer: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
