import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, findNodeHandle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { SheetModal } from '../../ui/SheetModal';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { SectionCard } from '../../ui/SectionCard';
import { Banner } from '../../ui/Banner';
import { OverviewCard } from '../../ui/OverviewCard';
import { TabPills } from '../../ui/TabPills';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { useContentInset } from '../../../hooks/useContentInset';
import { useBudgetEditor } from '../../../hooks/useBudgetEditor';
import { rollUpBudgets } from '../../../lib/budget';
import { formatCompact, parseToPaise } from '../../../lib/money';
import { categoryVisual } from '../../../constants/categories';
import type { FeatherName } from '../../../constants/palette';
import type { BudgetCadence, BudgetLevel } from '../../../db/queries/categoryBudgets';
import type { BudgetScope } from '../../../lib/budgetEditor';
import { BudgetAmountRow, CADENCE_LABEL } from './BudgetAmountRow';
import { OwnBudgetSheet } from './OwnBudgetSheet';

const CADENCES: BudgetCadence[] = ['daily', 'monthly', 'yearly'];

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

  /**
   * The hero's second quantity.
   *
   * My Budget has a real target — the monthly figure you gave at setup — so the bar
   * measures allocation against it and the tint answers "am I over?". A group has no
   * such target, and inventing one would be a lie, so there the honest second number
   * is coverage: how many of your categories have a line at all. This used to be a
   * sentence ("At setup you said about ₹40,000 a month…") that only appeared while
   * the total was exactly zero, which is the one moment it couldn't tell you anything.
   */
  const hasTarget = scope === 'global' && e.budgetTarget > 0;
  const overTarget = hasTarget && e.rollup.amount > e.budgetTarget;
  const targetPct = hasTarget && e.budgetTarget > 0
    ? `${Math.round((e.rollup.amount / e.budgetTarget) * 100)}%`
    : undefined;
  const barProgress = hasTarget
    ? e.rollup.amount / e.budgetTarget
    : e.cats.length > 0 ? e.budgetedCount / e.cats.length : 0;
  const heroSupporting = hasTarget
    ? `of ${formatCompact(e.budgetTarget)} you set at setup · ${e.budgetedCount} of ${e.cats.length} categories set`
    : `${e.budgetedCount} of ${e.cats.length} ${e.cats.length === 1 ? 'category' : 'categories'} set`;

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
          {/* The hero, then the control that qualifies it. The level pills used to
              come first, so the screen opened with a switch before you knew what it
              switched — and the figure below it is exactly what it switches. Every
              other screen in the app goes summary-then-TabPills. */}
          <OverviewCard
            size="xl"
            style={styles.hero}
            eyebrow={e.copy.heroLabel}
            amount={e.rollup.amount}
            /* Not `colors.accent`: §10 reserves it for tappable/active/selected, and a
               36px teal figure directly above a teal Save button read as two CTAs.
               Colour now means something — amber only when you're past the target you
               set for yourself. */
            amountColor={overTarget ? colors.healthAmber : colors.textPrimary}
            trailing={targetPct}
            trailingColor={overTarget ? colors.healthAmber : colors.textSecondary}
            supporting={heroSupporting}
            /* Pools are excluded from the figure above on purpose (₹24k/yr is not
               ₹2k/mo), so they are named here rather than vanishing from it. Nothing
               is said when there are none: the old copy read " · one-time not counted"
               on every budget that had no pools, naming an exclusion that wasn't
               happening. */
            supportingSecondary={e.rollup.pooledCount > 0
              ? `plus ${formatCompact(e.rollup.pooled)} in ${e.rollup.pooledCount} yearly`
              : undefined}
            /* Progress toward a real target where one exists; otherwise coverage of
               your categories. Never an invented target — a group has none. */
            bar={{
              progress: barProgress,
              color: overTarget ? colors.healthAmber : colors.accent,
              accessibilityLabel: heroSupporting,
            }}
          />

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

          {/* How periods work is a product rule, not a status — shown forever it was
              wallpaper. It appears only while nothing is budgeted yet, which is the
              one moment it's news, and self-dismisses as soon as you set a line. */}
          {e.budgetedCount === 0 && (
            <Banner
              icon="info"
              text={scope === 'group'
                ? 'Per person, not the group total. Each period resets.'
                : 'Each period starts fresh — nothing carries over.'}
              inset={false}
            />
          )}

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
              {/* Padded: as a bare child of the card body this sat flush against the
                  card's edge while every row above it was inset by `space.md`. */}
              <Text style={styles.cardNote}>
                These show as “Others” elsewhere. Tap one to add it — the amount doesn't change.
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
                {/* `i > 0`, not unconditional: a divider as the *first* child welded
                    the header to the body and made the disclosure chevron look like it
                    belonged to row 1. The "Not in your categories" card above already
                    had this right. */}
                {sec.cats.map((c, i) => (
                  <View key={c.name} ref={c.name === focusCategory ? focusRowRef : undefined}>
                    {i > 0 && <Divider indent="text" />}
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
  // No `gap`: it stacked with `SectionCard`'s own `marginBottom: space.md`, putting
  // 32px between every section (AGENTS §3). Blocks that need space say so themselves.
  scroll: { padding: layout.screenPaddingH },
  hero: { marginBottom: space.md },
  levelWrap: { gap: space.sm, marginBottom: space.md },
  hint: { ...type.caption, color: colors.textMuted, lineHeight: 16 },
  cardNote: { ...type.caption, color: colors.textMuted, lineHeight: 16, paddingHorizontal: space.md, paddingBottom: space.md },
  footer: {
    paddingHorizontal: layout.screenPaddingH, paddingTop: space.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
  },
});
