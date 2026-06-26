import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { categoryVisual } from '../src/constants/categories';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { MemberAvatar } from '../src/components/finance/MemberAvatar';
import { AppRefreshControl, useRefresh } from '../src/components/ui/AppRefreshControl';
import { getAllGroups } from '../src/db/queries/groups';
import { getRecurringForGroup } from '../src/db/queries/transactions';
import { getGlobalNet } from '../src/db/queries/balances';
import { getMe, getAllPersons, type Person } from '../src/db/queries/persons';
import { simplify } from '../src/lib/settle';
import { buildUpcoming, type UpcomingItem } from '../src/lib/upcoming';
import { formatRupees, formatCompact } from '../src/lib/money';

type SettleReminder = { from: string; to: string; amount: number; counterpart: Person; iOwe: boolean };

function dueLabel(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 6) return `In ${days} days`;
  return `In ${Math.round(days / 7)} wk`;
}

export default function RemindersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bills, setBills] = useState<UpcomingItem[]>([]);
  const [settles, setSettles] = useState<SettleReminder[]>([]);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));
  const { refreshing, onRefresh } = useRefresh(() => load());

  async function load() {
    const grps = await getAllGroups(db);
    const me = await getMe(db);
    if (!me) { setLoaded(true); return; }

    // Bills coming up in the next ~2 weeks (from recurring expense rules).
    const recurringByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    setBills(buildUpcoming(recurringByGroup.flat(), me.id, Date.now(), 8, 14));

    // Pending settle-ups that involve me.
    const persons = await getAllPersons(db);
    const pmap = new Map(persons.map(p => [p.id, p]));
    const mine = simplify(await getGlobalNet(db)).filter(s => s.from === me.id || s.to === me.id);
    setSettles(mine.map(s => {
      const iOwe = s.from === me.id;
      const other = pmap.get(iOwe ? s.to : s.from);
      return { from: s.from, to: s.to, amount: s.amount, counterpart: other as Person, iOwe };
    }).filter(s => s.counterpart));

    setLoaded(true);
  }

  const nothing = loaded && bills.length === 0 && settles.length === 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Reminders" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.intro}>Nudges before bills and settle-ups.</Text>

        {(bills.length > 0 || settles.length > 0) && (
          <Text style={styles.secLabel}>UPCOMING · {bills.length + settles.length}</Text>
        )}

        {(bills.length > 0 || settles.length > 0) && (
          <View style={styles.card}>
            {bills.map((b, i) => {
              const vis = categoryVisual(b.category);
              return (
                <View key={`bill-${b.id}`} style={[styles.row, i < bills.length - 1 || settles.length > 0 ? styles.rowBorder : null]}>
                  <View style={[styles.icon, { backgroundColor: (vis?.color ?? colors.accent) + '22' }]}>
                    <Feather name={vis?.icon ?? 'calendar'} size={18} color={vis?.color ?? colors.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{b.name}</Text>
                      <View style={styles.dueChip}><Text style={styles.dueChipText}>{dueLabel(b.daysUntil)}</Text></View>
                    </View>
                    <Text style={styles.rowSub}>{formatRupees(b.amount)} · {format(b.dateMs, 'd MMM')}</Text>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/add/quick?kind=expense' as any)} accessibilityRole="button">
                      <Text style={styles.actionBtnText}>Log payment</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {settles.map((s, i) => (
              <View key={`settle-${s.from}-${s.to}`} style={[styles.row, i < settles.length - 1 ? styles.rowBorder : null]}>
                <MemberAvatar name={s.counterpart.name} color={s.counterpart.avatar_color} size={40} imageUri={s.counterpart.image_uri} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>Settle {s.counterpart.name.split(' ')[0]}</Text>
                  <Text style={styles.rowSub}>
                    {s.iOwe ? 'You owe' : 'Owes you'} {formatCompact(s.amount)}
                  </Text>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSettle]} onPress={() => router.push(`/add/quick?kind=transfer&to=${s.counterpart.id}` as any)} accessibilityRole="button">
                    <Text style={[styles.actionBtnText, { color: '#fff' }]}>Settle now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {nothing && (
          <EmptyState
            icon="bell"
            title="Nothing due"
            body="No upcoming bills or settle-ups right now. Recurring bills and balances you owe show up here as they approach."
            tint={colors.textSecondary}
          />
        )}

        {/* Manage reminder timing/notifications */}
        <TouchableOpacity style={styles.manageRow} onPress={() => router.push('/settings/notifications' as any)} accessibilityRole="button">
          <View style={styles.manageIcon}><Feather name="settings" size={16} color={colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.manageTitle}>Reminder settings</Text>
            <Text style={styles.manageSub}>When and how you're nudged</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  intro: { ...type.label, color: colors.textMuted, marginBottom: space.xs },
  secLabel: { fontSize: 10, color: colors.healthAmber, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: 8, marginTop: 4 },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  rowTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  rowSub: { ...type.caption, color: colors.textSecondary, marginBottom: space.sm },
  dueChip: { backgroundColor: colors.healthAmber + '22', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  dueChipText: { ...type.caption, color: colors.healthAmber, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  actionBtn: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  actionBtnSettle: { backgroundColor: colors.settle },
  actionBtnText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginTop: space.sm, ...shadow.sm },
  manageIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  manageTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  manageSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
