import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, findNodeHandle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow } from '../../tokens';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { SheetModal } from '../../ui/SheetModal';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { SectionCard } from '../../ui/SectionCard';
import { TabPills } from '../../ui/TabPills';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { useContentInset } from '../../../hooks/useContentInset';
import { useBudgetEditor } from '../../../hooks/useBudgetEditor';
import { rollUpBudgets } from '../../../lib/budget';
import { formatRupees, formatCompact, parseToPaise } from '../../../lib/money';
import { categoryVisual } from '../../../constants/categories';
import type { FeatherName } from '../../../constants/palette';
import type { BudgetCadence, BudgetLevel } from '../../../db/queries/categoryBudgets';
import type { BudgetScope } from '../../../lib/budgetEditor';
import { BudgetAmountRow, CADENCE_LABEL } from './BudgetAmountRow';
import { OwnBudgetSheet } from './OwnBudgetSheet';

const CADENCES: BudgetCadence[] = ['once', 'daily', 'monthly', 'yearly'];

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

/**
 * The budget editor, for both My Budget (`/budget`) and one group's
 * (`/group/[id]/budget`). One composition so the two cannot drift; everything that
 * differs comes from `budgetEditorCopy` and `budgetLevelControlVisible`.
 */
export function BudgetEditor({ scope, groupId, focusCategory }: {
  scope: BudgetScope;
  groupId?: string;
  focusCategory?: string;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const e = useBudgetEditor({ scope, groupId, focusCategory });

  const [footerH, setFooterH] = React.useState(0);
  const listPad = useContentInset({ footer: footerH });
  const scrollRef = useRef<ScrollView>(null);
  const focusRowRef = useRef<View>(null);
  const scrolledToFocus = useRef(false);

  // Deep-linked to one category: centre its row above the keyboard once laid out.
  useEffect(() => {
    if (scrolledToFocus.current || !focusCategory || e.cats.length === 0) return;
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
  }, [focusCategory, e.cats.length]);

  async function handleSave() {
    if (await e.save()) router.back();
    else Alert.alert("Couldn't save", 'Please try again.');
  }

  if (!e.error && scope === 'global' && !e.loading && !e.groupId) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={e.copy.title} onBack={() => router.back()} />
        <EmptyState
          icon="alert-circle"
          title="No personal space yet"
          body="My Budget lives in your personal space, which this device doesn't have. Restart the app to rebuild it."
        />
      </View>
    );
  }

  const today = new Date();
  const inherited = e.level === 'personal' ? e.inherited : {};

  return (
    <View style={styles.container}>
      <ScreenHeader title={e.copy.title} onBack={() => router.back()} />
      {e.error ? (
        <ErrorState onRetry={() => { void e.reload(); }} />
      ) : (
      <>
        {/* No KeyboardAvoidingView: it padded the whole stack, so the footer rode the
            keyboard up on every one of 40-odd field focuses. The ScrollView insets
            itself instead, keeping the focused row visible and the CTA in place. */}
        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={[styles.scroll, { paddingBottom: listPad }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          refreshControl={<AppRefreshControl refreshing={e.refreshing} onRefresh={e.onRefresh} />}
        >
          {/* Segmented, not chips: this is "pick exactly one", and the two are
              alternatives rather than toggles. */}
          {e.levelControlVisible && (
            <View style={styles.levelWrap}>
              <TabPills
                tabs={[
                  { key: 'group', label: 'Group default' },
                  { key: 'personal', label: 'Mine', badge: e.overrideCount > 0 ? e.overrideCount : undefined },
                ]}
                active={e.level}
                onChange={(k) => e.requestLevel(k as BudgetLevel)}
              />
              <Text style={styles.hint}>{e.copy.hint}</Text>
            </View>
          )}
          {!e.levelControlVisible && <Text style={styles.hint}>{e.copy.hint}</Text>}

          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>{e.copy.heroLabel}</Text>
            <Text style={styles.totalAmount}>{formatRupees(e.rollup.amount)}</Text>
            <Text style={styles.totalSub}>
              {e.budgetedCount} {e.budgetedCount === 1 ? 'category' : 'categories'} budgeted
              {/* Pools are excluded from the figure above on purpose (₹24k/yr is not
                  ₹2k/mo), so they are named here rather than vanishing from it. */}
              {e.rollup.pooledCount > 0
                ? ` · plus ${formatCompact(e.rollup.pooled)} in ${e.rollup.pooledCount} yearly/one-time`
                : ' · one-time not counted'}
            </Text>
          </View>

          {scope === 'global' && e.budgetTarget > 0 && e.rollup.amount === 0 && (
            <Text style={styles.explain}>
              At setup you said about {formatCompact(e.budgetTarget)} a month. Set the
              categories that add up to it.
            </Text>
          )}

          <Text style={styles.explain}>
            {scope === 'group' ? 'Amounts are per person, not the group total. ' : ''}
            Each period starts fresh — limits reset and unused amounts don't carry over.
          </Text>

          {e.outside.length > 0 && (
            <SectionCard
              title="Not in your categories"
              subtitle={`${e.outside.length} budgeted here but missing from your list`}
              icon="help-circle"
              expanded
              onToggle={() => {}}
            >
              {e.outside.map((r, i) => (
                <View key={`${r.category}-${r.cadence}`}>
                  {i > 0 && <Divider indent="text" />}
                  <ListRow
                    icon={categoryVisual(r.category).icon as FeatherName}
                    iconColor={categoryVisual(r.category).color}
                    title={r.category}
                    subtitle="Tap to add to your categories"
                    value={`${formatCompact(r.amount)} · ${r.cadence}`}
                    onPress={() => e.adoptCategory(r.category)}
                  />
                </View>
              ))}
              <Text style={styles.explain}>
                These have a budget here but are not in your category list, so they show as
                “Others” elsewhere. Tap one to add it — the amount does not change.
              </Text>
            </SectionCard>
          )}

          {e.sections.length > 0 ? e.sections.map(sec => {
            const lines = sec.cats
              .map(c => ({ cadence: e.cadenceOf(c.name), amount: parseToPaise(e.form.amounts[c.name] ?? '') }))
              .filter(l => l.amount > 0);
            const secRoll = rollUpBudgets(lines, 'monthly', today);
            const secLabel = [
              secRoll.amount > 0 ? `${formatCompact(secRoll.amount)}/mo` : null,
              secRoll.pooledCount > 0 ? `${formatCompact(secRoll.pooled)} pooled` : null,
            ].filter(Boolean).join(' + ');
            return (
              <SectionCard
                key={sec.title}
                title={sec.title}
                subtitle={lines.length > 0 ? `${lines.length} set · ${secLabel}` : `${sec.cats.length} categories`}
                icon={SECTION_ICON[sec.title] ?? 'grid'}
                expanded={!e.collapsed.has(sec.title)}
                onToggle={() => e.toggleSection(sec.title)}
              >
                {sec.cats.map(c => (
                  <View key={c.name} ref={c.name === focusCategory ? focusRowRef : undefined}>
                    <Divider indent="text" />
                    <BudgetAmountRow
                      category={c.name}
                      value={e.form.amounts[c.name] ?? ''}
                      cadence={e.cadenceOf(c.name)}
                      inherited={inherited[c.name]}
                      autoFocus={c.name === focusCategory}
                      onChange={v => e.setAmount(c.name, v)}
                      onPressCadence={() => e.setCadenceSheetFor(c.name)}
                      onPromote={() => e.promoteInherited(c.name)}
                    />
                  </View>
                ))}
              </SectionCard>
            );
          }) : (
            <EmptyState icon="target" title="No categories yet" body="Add categories from Settings, then set their budgets here." />
          )}
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}
          onLayout={(ev) => setFooterH(ev.nativeEvent.layout.height)}
        >
          <PrimaryButton label={e.copy.cta} onPress={handleSave} loading={e.saving} disabled={!e.dirty} />
        </View>
      </>
      )}

      <OwnBudgetSheet
        visible={e.pendingLevel === 'personal'}
        groupName={e.groupName || 'this group'}
        onCancel={() => e.setPendingLevel(null)}
        onConfirm={e.confirmPendingLevel}
      />

      <SheetModal visible={!!e.cadenceSheetFor} onClose={() => e.setCadenceSheetFor(null)} title="How often?" scroll={false}>
        <Card clip>
          {CADENCES.map((c, i) => {
            const active = e.cadenceSheetFor ? e.cadenceOf(e.cadenceSheetFor) === c : false;
            return (
              <View key={c}>
                {i > 0 && <Divider indent="none" />}
                <ListRow
                  title={CADENCE_LABEL[c]}
                  value={active ? <Feather name="check" size={18} color={colors.accent} /> : undefined}
                  chevron={false}
                  selected={active}
                  onPress={() => {
                    if (e.cadenceSheetFor) e.setCadence(e.cadenceSheetFor, c);
                    e.setCadenceSheetFor(null);
                  }}
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
  levelWrap: { gap: space.sm },
  hint: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  totalCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: space.lg, alignItems: 'center', gap: space.xs, ...shadow.md,
  },
  totalLabel: { ...type.label, color: colors.textSecondary },
  totalAmount: { ...type.amountXL, color: colors.accent },
  totalSub: { ...type.caption, color: colors.textMuted },
  explain: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  footer: {
    paddingHorizontal: layout.screenPaddingH, paddingTop: space.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
  },
});
