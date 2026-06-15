import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay, startOfDay, startOfMonth, subDays } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { FilterBar } from '../src/components/ui/FilterBar';
import { getAuditLog } from '../src/db/queries/audit';
import { formatRupees } from '../src/lib/money';
import type { AuditLog, AuditAction } from '../src/db/queries/audit';

const ACTION_ICON: Record<AuditAction, { icon: keyof typeof Feather.glyphMap; color: string }> = {
  created:  { icon: 'plus-circle', color: colors.income },
  updated:  { icon: 'edit-2', color: colors.accent },
  deleted:  { icon: 'trash-2', color: colors.expense },
  settled:  { icon: 'check-circle', color: colors.settle },
  paused:   { icon: 'pause-circle', color: colors.healthAmber },
  resumed:  { icon: 'play-circle', color: colors.income },
  ended:    { icon: 'x-circle', color: colors.textMuted },
};

function rangeStart(range: string): number | undefined {
  const now = new Date();
  switch (range) {
    case 'today': return startOfDay(now).getTime();
    case 'week':  return subDays(startOfDay(now), 7).getTime();
    case 'month': return startOfMonth(now).getTime();
    default: return undefined;
  }
}

export default function HistoryScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [action, setAction] = useState('all');
  const [range, setRange] = useState('all');

  useFocusEffect(useCallback(() => { load(); }, [groupId, action, range]));

  async function load() {
    const rows = await getAuditLog(db, {
      groupId: groupId || undefined,
      action: action === 'all' ? undefined : (action as AuditAction),
      fromMs: rangeStart(range),
    });
    setEntries(rows);
  }

  const sections = useMemo(() => {
    const map = new Map<string, AuditLog[]>();
    for (const e of entries) {
      const d = new Date(e.created_at);
      const key = isSameDay(d, new Date()) ? 'Today' : format(d, 'dd MMM yyyy');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [entries]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="History" onBack={() => router.back()} />
      <View style={styles.filters}>
        <FilterBar
          selected={{ action, range }}
          onSelect={(k, v) => (k === 'action' ? setAction(v) : setRange(v))}
          groups={[
            { key: 'action', options: [
              { label: 'All', value: 'all' },
              { label: 'Added', value: 'created' },
              { label: 'Edited', value: 'updated' },
              { label: 'Deleted', value: 'deleted' },
              { label: 'Settled', value: 'settled' },
            ] },
            { key: 'range', options: [
              { label: 'All time', value: 'all' },
              { label: 'Today', value: 'today' },
              { label: '7 days', value: 'week' },
              { label: 'This month', value: 'month' },
            ] },
          ]}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={e => e.id}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) => {
          const meta = ACTION_ICON[item.action] ?? ACTION_ICON.updated;
          return (
            <View style={styles.row}>
              <View style={[styles.iconDot, { backgroundColor: meta.color + '22' }]}>
                <Feather name={meta.icon} size={15} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summary}>{item.summary}</Text>
                <Text style={styles.time}>{format(new Date(item.created_at), 'h:mm a')}</Text>
              </View>
              {item.amount != null && (
                <Text style={styles.amount}>{formatRupees(item.amount)}</Text>
              )}
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <EmptyState icon="clock" title="No history yet" body="Every change you make — adding, editing, deleting, settling — is recorded here." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  filters: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  list: { padding: layout.screenPaddingH, paddingBottom: 60 },
  sectionHeader: { ...type.caption, color: colors.textMuted, marginTop: space.md, marginBottom: space.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  iconDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  summary: { ...type.body, color: colors.textPrimary },
  time: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  amount: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 34 + space.md },
});
