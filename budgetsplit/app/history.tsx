import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenData } from '../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay, isYesterday, startOfDay, startOfMonth, subDays } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { getAuditLog } from '../src/db/queries/audit';
import { formatCompact } from '../src/lib/money';
import type { AuditLog, AuditAction } from '../src/db/queries/audit';

const PAGE_SIZE = 30;

const DOT_COLOR: Record<AuditAction, string> = {
  created: colors.accent,
  updated: colors.healthAmber,
  deleted: colors.expense,
  settled: colors.settle,
  paused:  colors.healthAmber,
  resumed: colors.income,
  ended:   colors.textMuted,
};

const ACTION_LABEL: Record<AuditAction, string> = {
  created: 'Expense added',
  updated: 'Expense edited',
  deleted: 'Expense deleted',
  settled: 'Settlement recorded',
  paused:  'Recurring paused',
  resumed: 'Recurring resumed',
  ended:   'Recurring ended',
};

const BADGE_LABEL: Record<string, string> = {
  updated: 'EDIT',
  deleted: 'DEL',
};

function dateLabel(d: Date): string {
  const now = new Date();
  if (isSameDay(d, now)) return 'TODAY';
  if (isYesterday(d)) return 'YESTERDAY';
  return format(d, 'dd MMM yyyy').toUpperCase();
}

function rangeStart(range: string): number | undefined {
  const now = new Date();
  switch (range) {
    case 'today': return startOfDay(now).getTime();
    case 'week':  return subDays(startOfDay(now), 7).getTime();
    case 'month': return startOfMonth(now).getTime();
    default: return undefined;
  }
}

type Section = { title: string; data: AuditLog[] };

/** One date-grouped card. Memoized so off-screen sections don't re-render (and the
 *  per-entry date formatting only runs when the section is actually rendered). */
const SectionCard = React.memo(function SectionCard({ section }: { section: Section }) {
  return (
    <View>
      <Text style={styles.sectionLabel}>{section.title}</Text>
      <View style={styles.card}>
        {section.data.map((item, i) => {
          const dotColor = DOT_COLOR[item.action] ?? colors.accent;
          const label = ACTION_LABEL[item.action] ?? 'Change';
          const badge = BADGE_LABEL[item.action];
          const itemDate = new Date(item.created_at);
          const dateStr = isFinite(itemDate.getTime())
            ? (isSameDay(itemDate, new Date()) ? `Today ${format(itemDate, 'h:mm a')}` : `${format(itemDate, 'MMM d')} · ${format(itemDate, 'h:mm a')}`)
            : '';
          const amtColor = item.action === 'settled' ? colors.income : item.action === 'deleted' || item.action === 'created' ? colors.expense : undefined;

          return (
            <View
              key={item.id}
              style={[styles.entry, i < section.data.length - 1 && styles.entryBorder]}
            >
              <View style={[styles.entryDot, { backgroundColor: dotColor }]} />
              <View style={styles.entryBody}>
                <Text style={styles.entryLabel}>{label}</Text>
                <Text style={styles.entrySummary} numberOfLines={2}>{item.summary}</Text>
                {dateStr ? <Text style={styles.entryTime}>· you · {dateStr}</Text> : null}
              </View>
              {badge ? (
                <View style={[styles.actionBadge, { backgroundColor: badge === 'DEL' ? colors.expenseTint : '#221A00' }]}>
                  <Text style={[styles.actionBadgeText, { color: badge === 'DEL' ? colors.expense : colors.healthAmber }]}>{badge}</Text>
                </View>
              ) : item.amount != null ? (
                <Text style={[styles.entryAmt, { color: amtColor ?? colors.textSecondary }]}>
                  {item.action === 'settled' ? '+' : item.action === 'created' ? '−' : ''}{formatCompact(item.amount)}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
});

export default function HistoryScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const { data, error: loadError, refreshing, onRefresh, reload } = useScreenData(
    (db) => getAuditLog(db, { groupId: groupId || undefined }),
    [groupId],
  );
  const entries = data ?? [];

  const sections: Section[] = useMemo(() => {
    const visible = entries.slice(0, pageLimit);
    const map = new Map<string, AuditLog[]>();
    for (const e of visible) {
      const d = new Date(e.created_at);
      if (!isFinite(d.getTime())) continue;
      const key = dateLabel(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [entries, pageLimit]);

  const hasMore = entries.length > pageLimit;

  const renderSection = useCallback(
    ({ item }: { item: Section }) => <SectionCard section={item} />,
    [],
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Audit log" onBack={() => router.back()} />

      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.title}
          renderItem={renderSection}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xl }]}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={9}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={<Text style={styles.subtitle}>Every change made to your data, in order.</Text>}
          ListEmptyComponent={
            <EmptyState icon="clock" title="Nothing logged yet" body="Every change you make — adding, editing, deleting, settling — is recorded here." />
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.loadMore} onPress={() => setPageLimit(p => p + PAGE_SIZE)} accessibilityRole="button">
                <Text style={styles.loadMoreText}>Load older entries</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 13, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  scroll: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs },
  title: { fontSize: 24, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, letterSpacing: -0.5, paddingBottom: 6 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 18 },
  sectionLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: 8, marginTop: 4 },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: 'hidden', ...shadow.sm },
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  entryBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  entryDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 5 },
  entryBody: { flex: 1 },
  entryLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, marginBottom: 2 },
  entrySummary: { fontSize: 11, color: colors.textMuted, marginBottom: 2, lineHeight: 15 },
  entryTime: { fontSize: 10, color: '#2A3C39' },
  entryAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, flexShrink: 0 },
  actionBadge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 },
  actionBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  loadMore: { alignItems: 'center', paddingVertical: space.md },
  loadMoreText: { fontSize: 12, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
