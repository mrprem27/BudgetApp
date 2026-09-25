import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { MemberAvatar } from '../src/components/finance/MemberAvatar';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { ComingUpList } from '../src/components/finance/home/ComingUpList';
import { useScreenData } from '../src/hooks/useScreenData';
import { getAllGroups } from '../src/db/queries/groups';
import { getRecurringForGroup, getSkipsMap } from '../src/db/queries/recurring';
import { getGlobalNet } from '../src/db/queries/balances';
import { getMe, getAllPersons, type Person } from '../src/db/queries/persons';
import { simplify } from '../src/lib/settle';
import { buildUpcoming, type UpcomingItem } from '../src/lib/upcoming';
import { formatCompact } from '../src/lib/money';
import { oweView } from '../src/lib/owe';
import { IconCircle } from '../src/components/ui/IconCircle';

type SettleReminder = { from: string; to: string; amount: number; counterpart: Person; iOwe: boolean };

export default function UpcomingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const me = await getMe(db);
    if (!me) return { bills: [] as UpcomingItem[], settles: [] as SettleReminder[] };
    const grps = await getAllGroups(db);

    // Bills coming up in the next ~2 weeks (from recurring expense rules).
    const recurringByGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    const billRules = recurringByGroup.flat();
    const billSkips = await getSkipsMap(db, billRules.map(r => r.id));
    const bills = buildUpcoming(billRules, me.id, Date.now(), 8, 14, billSkips);

    // Pending settle-ups that involve me.
    const persons = await getAllPersons(db);
    const pmap = new Map(persons.map(p => [p.id, p]));
    const mine = simplify(await getGlobalNet(db)).filter(s => s.from === me.id || s.to === me.id);
    const settles = mine.map(s => {
      const iOwe = s.from === me.id;
      const other = pmap.get(iOwe ? s.to : s.from);
      return { from: s.from, to: s.to, amount: s.amount, counterpart: other as Person, iOwe };
    }).filter(s => s.counterpart) as SettleReminder[];

    return { bills, settles };
  }, []);

  const bills = data?.bills ?? [];
  const settles = data?.settles ?? [];
  const nothing = !loading && bills.length === 0 && settles.length === 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Upcoming" onBack={() => router.back()} />
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.intro}>Nudges before bills and settle-ups.</Text>

        {/* UPCOMING — recurring bills due soon. Same component Plan uses
            (`ComingUpList`) — this screen used to hand-roll its own row for
            the identical data, which is the duplication `SPEC-2026-09-FEEDBACK.md` §6 exists
            to remove. `onLogPayment` carries the bill through to Add
            pre-filled: opening it blank meant reading "Netflix ₹649 due
            tomorrow" and then retyping all four fields the row had just
            shown. `groupId` matters most — logging a shared flat bill into
            Personal silently loses its split. */}
        {bills.length > 0 && (
          <ComingUpList
            items={bills}
            showIcon
            onLogPayment={(b) => router.push({
              pathname: '/add/quick',
              params: {
                kind: 'expense',
                groupId: b.groupId,
                amount: String(b.amount),
                category: b.category,
                note: b.name,
              },
            })}
          />
        )}

        {/* SETTLE UP — pending balances with people */}
        {settles.length > 0 && (
          <>
            <Text style={[styles.secLabel, styles.secLabelSettle]}>SETTLE UP · {settles.length}</Text>
            <View style={styles.card}>
              {settles.map((s, i) => (
                <View key={`settle-${s.from}-${s.to}`} style={[styles.row, i < settles.length - 1 ? styles.rowBorder : null]}>
                  <MemberAvatar name={s.counterpart.name} color={s.counterpart.avatar_color} size={40} imageUri={s.counterpart.image_uri} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>Settle {s.counterpart.name.split(' ')[0]}</Text>
                    {(() => {
                      const ov = oweView(s.iOwe ? -s.amount : s.amount);
                      return (
                        <Text style={[styles.rowSub, { color: ov.color }]}>
                          {ov.label} {formatCompact(s.amount)}
                        </Text>
                      );
                    })()}
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSettle]} onPress={() => router.push(`/add/quick?kind=transfer&to=${s.counterpart.id}`)} accessibilityRole="button">
                      <Text style={[styles.actionBtnText, { color: colors.onAccent }]}>Settle now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </>
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
        <TouchableOpacity style={styles.manageRow} onPress={() => router.push('/settings/notifications')} accessibilityRole="button">
          <IconCircle icon="settings" size={36} iconSize={16} color={colors.accent} bg={colors.accentMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.manageTitle}>Reminder settings</Text>
            <Text style={styles.manageSub}>When and how you're nudged</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  intro: { ...type.label, color: colors.textMuted, marginBottom: space.xs },
  secLabel: { fontSize: 10, color: colors.healthAmber, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm, marginTop: space.xs },
  secLabelSettle: { color: colors.settle, marginTop: space.md },
  card: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  rowSub: { ...type.caption, color: colors.textSecondary, marginBottom: space.sm },
  actionBtn: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 14 },
  actionBtnSettle: { backgroundColor: colors.settle },
  actionBtnText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginTop: space.sm, ...shadow.sm },
  manageTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  manageSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
