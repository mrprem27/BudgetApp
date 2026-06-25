import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow } from '../../tokens';
import { categoryVisual } from '../../../constants/categories';
import { formatCompact } from '../../../lib/money';
import { MemberAvatar } from '../MemberAvatar';
import { EmptyState } from '../../ui/EmptyState';
import type { BudgetAnalytics } from '../../../lib/analytics';
import type { Person } from '../../../db/queries/persons';

type Contributions = {
  total: number;
  rows: Array<{ member: Person; paid: number; frac: number }>;
};
type TopCategory = { cat: string; amt: number; frac: number };

/**
 * Group Insights tab — per-member spend bars, top categories, and the best
 * analytics recommendation. Read-only/presentational; the parent computes the
 * data. Extracted from app/group/[id].tsx.
 */
export function InsightsTab({
  contributions,
  topCategories,
  analytics,
}: {
  contributions: Contributions;
  topCategories: TopCategory[];
  analytics: BudgetAnalytics | null;
}) {
  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      {contributions.total > 0 ? (
        <>
          {/* SPENDING THIS MONTH — member bars */}
          <Text style={styles.insightSectionLabel}>SPENDING THIS MONTH</Text>
          <View style={styles.insightCard}>
            {contributions.rows.map((r, i) => (
              <View key={r.member.id} style={[styles.insightMemberRow, i < contributions.rows.length - 1 && { marginBottom: 10 }]}>
                <MemberAvatar name={r.member.name} color={r.member.avatar_color} size={28} imageUri={r.member.image_uri} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.insightBarTrack}>
                    <View style={[styles.insightBarFill, { width: `${Math.round(r.frac * 100)}%` as any, backgroundColor: r.member.avatar_color }]} />
                  </View>
                  <Text style={styles.insightMemberAmt}>
                    {formatCompact(r.paid)}{r.member.is_me ? ' · you' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* TOP CATEGORIES */}
          {topCategories.length > 0 && (
            <>
              <Text style={styles.insightSectionLabel}>TOP CATEGORIES</Text>
              <View style={[styles.insightCard, { paddingHorizontal: 0 }]}>
                {topCategories.map((c, i) => {
                  const vis = categoryVisual(c.cat);
                  const barColors = ['#FF6F61', '#20C4B8', '#F5B301'];
                  return (
                    <View key={c.cat} style={[styles.catTopRow, i < topCategories.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: (vis?.color ?? colors.accent) + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Feather name={vis?.icon ?? 'tag'} size={16} color={vis?.color ?? colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.catTopName}>{c.cat}</Text>
                        <View style={styles.insightBarTrack}>
                          <View style={[styles.insightBarFill, { width: `${Math.round(c.frac * 100)}%` as any, height: 3, backgroundColor: barColors[i] ?? colors.accent }]} />
                        </View>
                      </View>
                      <Text style={styles.catTopAmt}>{formatCompact(c.amt)}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Trend callout — best analytics recommendation */}
          {analytics && analytics.recommendations.length > 0 && (
            <View style={styles.trendCallout}>
              <View style={styles.trendDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.trendTitle}>{analytics.recommendations[0].text}</Text>
                <Text style={styles.trendSub}>Based on your group spending patterns this month.</Text>
              </View>
            </View>
          )}
        </>
      ) : (
        <EmptyState icon="bar-chart-2" title="No insights yet" body="Add expenses to see analytics and spending patterns." tint={colors.textSecondary} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: layout.screenPaddingH, paddingBottom: 120 },
  insightSectionLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  insightCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: 10, ...shadow.sm },
  insightMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  insightBarTrack: { height: 8, backgroundColor: colors.bgMuted, borderRadius: 4, marginBottom: 3 },
  insightBarFill: { height: 8, borderRadius: 4 },
  insightMemberAmt: { fontSize: 10, color: colors.textMuted },
  catTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.md, paddingVertical: 12 },
  catTopName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, marginBottom: 3 },
  catTopAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textPrimary, flexShrink: 0 },
  trendCallout: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#081F16', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#0C3D22', marginBottom: space.md },
  trendDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.income, flexShrink: 0, marginTop: 3 },
  trendTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.income, marginBottom: 3 },
  trendSub: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
});
