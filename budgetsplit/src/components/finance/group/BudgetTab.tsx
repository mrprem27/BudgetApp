import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, shadow, layout } from '../../tokens';
import { healthColor, recBg, recColor } from './helpers';
import { budgetHealth, utilLabel } from '../../../lib/budget';
import type { CategoryBudgetStatus } from '../../../lib/budget';
import type { BudgetAnalytics } from '../../../lib/analytics';
import type { Contributions } from '../../../lib/groupDetail';
import { formatCompact } from '../../../lib/money';
import { categoryVisual, categorySection, SECTION_ORDER } from '../../../constants/categories';
import { BudgetBar } from '../BudgetBar';
import { MemberAvatar } from '../MemberAvatar';
import { FilterBar } from '../../ui/FilterBar';
import { EmptyState } from '../../ui/EmptyState';

type Props = {
  analytics: BudgetAnalytics | null;
  catStatus: CategoryBudgetStatus[];
  contributions: Contributions;
  isPersonal: boolean;
  onEditBudget: () => void;
  onCreateBudget: () => void;
};

/** Group Budget tab: overview + recommendations + driving-overspend + who-paid-what
 *  + per-category sectioned list. Owns its own status filter (tab-local). */
export function BudgetTab({ analytics, catStatus, contributions, isPersonal, onEditBudget, onCreateBudget }: Props) {
  const [budgetFilter, setBudgetFilter] = useState('all');

  if (catStatus.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.listContent}>
        <EmptyState
          icon="target"
          title="No budget yet"
          body="Give a category a limit — one-time, daily, monthly or yearly — and track it live. Each period starts fresh: the limit resets and unused amount doesn't carry over."
          actionLabel="Create budget"
          onAction={onCreateBudget}
        />
      </ScrollView>
    );
  }

  const matches = (c: CategoryBudgetStatus) =>
    budgetFilter === 'all' ? true
    : budgetFilter === 'over' ? c.health === 'red'
    : budgetFilter === 'near' ? c.health === 'amber'
    : c.health === 'green';
  const visible = catStatus.filter(matches);

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      <View style={styles.budgetHeadingRow}>
        <Text style={styles.budgetHeading}>Budget</Text>
        <TouchableOpacity style={styles.editPill} onPress={onEditBudget} accessibilityRole="button" accessibilityLabel="Edit budget">
          <Feather name="edit-2" size={13} color={colors.accent} />
          <Text style={styles.editPillText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {analytics && analytics.totalAllocated > 0 && (
        <View style={styles.ovCard}>
          <View style={styles.ovTopRow}>
            <View>
              <Text style={styles.ovLabel}>Budget used</Text>
              <Text style={[styles.ovSpent, { color: healthColor(budgetHealth(analytics.utilizationPct)) }]}>{formatCompact(analytics.totalSpent)}</Text>
              <Text style={styles.ovOf}>of {formatCompact(analytics.totalAllocated)}</Text>
            </View>
            <Text style={[styles.ovPct, { color: healthColor(budgetHealth(analytics.utilizationPct)) }]}>{utilLabel(analytics.utilizationPct ?? 0)}</Text>
          </View>
          <View style={{ marginTop: space.md }}>
            <BudgetBar pct={analytics.utilizationPct} health={budgetHealth(analytics.utilizationPct)} height={10} />
          </View>
          <View style={styles.ovStatsRow}>
            <View style={styles.ovStat}>
              <Text style={[styles.ovStatVal, { color: colors.expense }]}>{analytics.overBudget.length}</Text>
              <Text style={styles.ovStatLabel}>over</Text>
            </View>
            <View style={styles.ovStatDivider} />
            <View style={styles.ovStat}>
              <Text style={[styles.ovStatVal, { color: colors.healthAmber }]}>{analytics.nearLimit.length}</Text>
              <Text style={styles.ovStatLabel}>near limit</Text>
            </View>
            <View style={styles.ovStatDivider} />
            <View style={styles.ovStat}>
              <Text style={[styles.ovStatVal, { color: colors.income }]}>{analytics.onTrackCount}</Text>
              <Text style={styles.ovStatLabel}>on track</Text>
            </View>
          </View>
        </View>
      )}

      {analytics && analytics.recommendations.length > 0 && (
        <View style={styles.recList}>
          {analytics.recommendations.map(r => (
            <View key={r.id} style={[styles.recPill, { backgroundColor: recBg(r.severity) }]}>
              <Feather name={r.icon} size={15} color={recColor(r.severity)} />
              <Text style={[styles.recText, { color: recColor(r.severity) }]}>{r.text}</Text>
            </View>
          ))}
        </View>
      )}

      {analytics && analytics.totalAllocated > 0 && (
        analytics.overBudget.length > 0 ? (
          <View style={styles.drivingCard}>
            <Text style={styles.drivingTitle}>Driving overspend</Text>
            {analytics.overBudget.slice(0, 4).map(t => {
              const vis = categoryVisual(t.category);
              const over = t.spent - t.allocated;
              return (
                <View key={t.category} style={styles.drivingRow}>
                  <View style={[styles.catIcon, { backgroundColor: vis.color + '22' }]}>
                    <Feather name={vis.icon} size={14} color={vis.color} />
                  </View>
                  <Text style={styles.drivingName} numberOfLines={1}>{t.category}</Text>
                  <Text style={styles.drivingOver}>{formatCompact(over)} over</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.allClearCard}>
            <Feather name="check-circle" size={16} color={colors.income} />
            <Text style={styles.allClearText}>Every category within budget</Text>
          </View>
        )
      )}

      {!isPersonal && contributions.total > 0 && (
        <View style={styles.contribCard}>
          <Text style={styles.contribTitle}>Who paid what</Text>
          {contributions.rows.map((r, i) => (
            <View key={r.member.id} style={[styles.contribRow, i < contributions.rows.length - 1 && styles.contribRowGap]}>
              <View style={styles.contribHead}>
                <MemberAvatar name={r.member.name} color={r.member.avatar_color} size={28} imageUri={r.member.image_uri} />
                <Text style={styles.contribName} numberOfLines={1}>{r.member.name}{r.member.is_me ? ' (me)' : ''}</Text>
                <Text style={styles.contribPaid}>{formatCompact(r.paid)}</Text>
                <Text style={[styles.contribDelta, { color: r.net > 0 ? colors.income : r.net < 0 ? colors.expense : colors.textMuted }]}>
                  {r.net > 0 ? `+${formatCompact(r.net)}` : r.net < 0 ? `−${formatCompact(-r.net)}` : '—'}
                </Text>
              </View>
              <View style={styles.contribTrack}>
                <View style={[styles.contribFill, { width: `${Math.round(r.frac * 100)}%`, backgroundColor: r.member.avatar_color }]} />
              </View>
            </View>
          ))}
          <Text style={styles.contribFoot}>Fair share is {formatCompact(contributions.fairShare)} each · + ahead, − owes the group</Text>
        </View>
      )}

      <View>
        <FilterBar
          selected={{ status: budgetFilter }}
          onSelect={(_, v) => setBudgetFilter(v)}
          groups={[{ key: 'status', options: [
            { label: 'All', value: 'all' },
            { label: 'Over', value: 'over' },
            { label: 'Near limit', value: 'near' },
            { label: 'On track', value: 'ontrack' },
          ] }]}
        />
      </View>

      {visible.length === 0 ? (
        <EmptyState icon="filter" title="Nothing here" body="No categories match this filter." tint={colors.textSecondary} />
      ) : (
        SECTION_ORDER.map(section => {
          const lines = visible.filter(c => categorySection(c.category) === section);
          if (lines.length === 0) return null;
          return (
            <View key={section} style={{ marginBottom: space.md }}>
              <Text style={styles.cadenceLabel}>{section}</Text>
              <View style={styles.catCard}>
                {lines.map((c, i) => {
                  const vis = categoryVisual(c.category);
                  return (
                    <View key={c.category} style={[styles.catRow, i < lines.length - 1 && styles.catRowBorder]}>
                      <View style={styles.catTop}>
                        <View style={[styles.catIcon, { backgroundColor: vis.color + '22' }]}>
                          <Feather name={vis.icon} size={14} color={vis.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.catName} numberOfLines={1}>{c.category}</Text>
                          <Text style={styles.catCadenceTag}>{c.cadence === 'once' ? 'one-time' : c.cadence}</Text>
                        </View>
                        <Text style={styles.catAmt}><Text style={{ color: healthColor(c.health) }}>{formatCompact(c.spent)}</Text> / {formatCompact(c.allocated)}</Text>
                      </View>
                      <BudgetBar pct={c.pct} health={c.health} height={6} />
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: layout.screenPaddingH, paddingBottom: 100, gap: space.sm },
  budgetHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xs, marginBottom: space.sm },
  budgetHeading: { ...type.subheading, color: colors.textPrimary },
  editPill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  editPillText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  ovCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md, ...shadow.md },
  ovTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ovLabel: { ...type.label, color: colors.textSecondary },
  ovSpent: { ...type.amountLG, color: colors.textPrimary, marginTop: 2 },
  ovOf: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  ovPct: { ...type.amountLG },
  ovStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  ovStat: { flex: 1, alignItems: 'center', gap: 2 },
  ovStatDivider: { width: 1, height: 28, backgroundColor: colors.border },
  ovStatVal: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  ovStatLabel: { ...type.caption, color: colors.textMuted },
  recList: { gap: space.sm, marginBottom: space.md },
  recPill: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md },
  recText: { ...type.label, flex: 1, lineHeight: 18 },
  drivingCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.md, gap: space.sm, ...shadow.sm },
  drivingTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: 2 },
  drivingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  drivingName: { ...type.body, color: colors.textPrimary, flex: 1 },
  drivingOver: { ...type.label, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
  allClearCard: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.md, ...shadow.sm },
  allClearText: { ...type.body, color: colors.income, fontFamily: 'Inter_600SemiBold' },
  contribCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.md, ...shadow.sm },
  contribTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.md },
  contribRow: { gap: space.xs },
  contribRowGap: { marginBottom: space.md },
  contribHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  contribName: { ...type.body, color: colors.textPrimary, flex: 1 },
  contribPaid: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textPrimary },
  contribDelta: { ...type.caption, fontFamily: 'Inter_600SemiBold', minWidth: 52, textAlign: 'right' },
  contribTrack: { height: 6, borderRadius: 3, backgroundColor: colors.bgMuted, overflow: 'hidden' },
  contribFill: { height: 6, borderRadius: 3 },
  contribFoot: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  cadenceLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.xs },
  catCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  catRow: { paddingVertical: space.md, gap: space.sm },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  catIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catName: { ...type.body, color: colors.textPrimary },
  catCadenceTag: { ...type.caption, color: colors.textMuted, marginTop: 1, textTransform: 'capitalize' },
  catAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
});
