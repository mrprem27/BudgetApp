import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, LayoutAnimation, UIManager, Keyboard, findNodeHandle,
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
import { haptic } from '../../../src/lib/haptics';
import type { Category } from '../../../src/db/queries/categories';
import type { FeatherName } from '../../../src/constants/palette';

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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Approximate monthly cost of a line, for a single comparable headline number.
function monthlyEquivalent(cadence: BudgetCadence, paise: number): number {
  switch (cadence) {
    case 'daily':   return paise * 30;
    case 'monthly': return paise;
    case 'yearly':  return Math.round(paise / 12);
    case 'once':    return 0; // not periodic
  }
}

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
  const [kbVisible, setKbVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const focusRowRef = useRef<View>(null);
  const scrolledToFocus = useRef(false);

  // Initial DATA load (existing categories + saved budgets + the user's default
  // cadence). Form state below (amounts/cadences/collapsed) is *seeded* from this
  // once it arrives — those stay editable local state. `refetchOnDataChange` is off
  // to match the prior behavior (this editor only reloaded on focus, and a mid-edit
  // reseed would wipe unsaved amounts).
  const { data, error, reload } = useScreenData(async (db) => {
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

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKbVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

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
  const monthlyApprox = allCategories.reduce(
    (s, c) => s + monthlyEquivalent(cadenceOf(c.name), parseToPaise(amounts[c.name] ?? '')), 0,
  );
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
  function toggleSection(title: string) {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>≈ Monthly commitment</Text>
            <Text style={styles.totalAmount}>{formatRupees(monthlyApprox)}</Text>
            <Text style={styles.totalSub}>
              {budgetedCount} {budgetedCount === 1 ? 'category' : 'categories'} budgeted · one-time not counted
            </Text>
          </View>

          <Text style={styles.explain}>
            Open a group and type a limit on any category. Daily, monthly and yearly budgets repeat each period — the limit resets and unused amount doesn't carry over; one-time doesn't repeat.
          </Text>

          {sections.length > 0 ? sections.map(sec => {
            const isCollapsed = collapsed.has(sec.title);
            const secMonthly = sec.cats.reduce((s, c) => s + monthlyEquivalent(cadenceOf(c.name), parseToPaise(amounts[c.name] ?? '')), 0);
            const secCount = sec.cats.filter(c => parseToPaise(amounts[c.name] ?? '') > 0).length;
            return (
              <View key={sec.title} style={styles.sectionCard}>
                <TouchableOpacity
                  style={styles.sectionHeader}
                  onPress={() => toggleSection(sec.title)}
                  accessibilityRole="button"
                  accessibilityLabel={`${sec.title} section, ${isCollapsed ? 'collapsed' : 'expanded'}`}
                >
                  <View style={[styles.sectionIcon, { backgroundColor: colors.accentMuted }]}>
                    <Feather name={sec.icon} size={16} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{sec.title}</Text>
                    <Text style={styles.sectionSub}>
                      {secCount > 0 ? `${secCount} set · ${formatCompact(secMonthly)}/mo` : `${sec.cats.length} categories`}
                    </Text>
                  </View>
                  <Feather name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={18} color={colors.textMuted} />
                </TouchableOpacity>

                {!isCollapsed && sec.cats.map((c, i) => {
                  const vis = categoryVisual(c.name);
                  const amt = amounts[c.name] ?? '';
                  const hasAmt = parseToPaise(amt) > 0;
                  return (
                    <View key={c.name} ref={c.name === focusCategory ? focusRowRef : undefined}>
                      <View style={styles.divider} />
                      <View style={styles.rowItem}>
                        <View style={[styles.iconDot, { backgroundColor: vis.color + '22' }]}>
                          <Feather name={vis.icon} size={15} color={vis.color} />
                        </View>
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
                        <View style={[styles.amountWrap, hasAmt && styles.amountWrapActive]}>
                          <Text style={[styles.rupee, hasAmt && { color: colors.textSecondary }]}>₹</Text>
                          <TextInput
                            style={styles.amountInput}
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
              </View>
            );
          }) : (
            <EmptyState icon="target" title="No categories yet" body="Add categories from Settings, then set their budgets here." />
          )}

          <View style={{ height: kbVisible ? space.lg : 100 }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: (kbVisible ? space.sm : insets.bottom) + space.md }]}>
          <PrimaryButton label="Save Budget" onPress={handleSave} loading={saving} />
        </View>
      </KeyboardAvoidingView>
      )}

      <SheetModal visible={!!cadenceSheetFor} onClose={() => setCadenceSheetFor(null)} title="How often?" scroll={false}>
        {CADENCES.map(c => {
          const active = cadenceSheetFor ? cadenceOf(cadenceSheetFor) === c.key : false;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.cadOption, active && styles.cadOptionActive]}
              onPress={() => { if (cadenceSheetFor) setCadence(cadenceSheetFor, c.key); setCadenceSheetFor(null); }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.cadOptionText, active && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{c.label}</Text>
              {active && <Feather name="check" size={18} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
  totalCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, alignItems: 'center', gap: space.xs, ...shadow.md },
  totalLabel: { ...type.label, color: colors.textSecondary },
  totalAmount: { ...type.amountXL, color: colors.accent },
  totalSub: { ...type.caption, color: colors.textMuted },
  explain: { ...type.caption, color: colors.textMuted, lineHeight: 16 },

  sectionCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 56 },
  sectionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  sectionSub: { ...type.caption, color: colors.textMuted, marginTop: 1 },

  divider: { height: 1, backgroundColor: colors.border, marginLeft: space.md + 34 + space.md },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 52 },
  iconDot: { width: 32, height: 32, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  rowMid: { flex: 1, gap: space.xs },
  rowName: { ...type.body, color: colors.textPrimary },
  amountWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgInput, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, minWidth: 96 },
  amountWrapActive: { borderColor: colors.accent },
  rupee: { ...type.body, color: colors.textMuted },
  amountInput: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: 'right', paddingVertical: space.sm, paddingLeft: 2 },
  cadenceSelect: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  cadenceSelectText: { ...type.caption, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  cadOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  cadOptionActive: { backgroundColor: colors.accentMuted },
  cadOptionText: { ...type.body, color: colors.textPrimary },
  footer: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
});
