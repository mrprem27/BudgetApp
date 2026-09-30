import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { ComingUpList } from '../../src/components/finance/home/ComingUpList';
import { useScreenData } from '../../src/hooks/useScreenData';
import { loadUpcomingScreen } from '../../src/lib/upcomingData';
import { formatCompact } from '../../src/lib/money';
import { oweView } from '../../src/lib/owe';
import { canRemind } from '../../src/lib/whatsappReminder';
import { useReminder } from '../../src/hooks/useReminder';
import { Card } from '../../src/components/ui/Card';
import { backOr } from '../../src/lib/nav';


export default function UpcomingScreen() {
  const router = useRouter();
  const remind = useReminder();
  const insets = useSafeAreaInsets();
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(loadUpcomingScreen, []);

  const bills = data?.bills ?? [];
  const settles = data?.settles ?? [];
  const nothing = !loading && bills.length === 0 && settles.length === 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Upcoming" onBack={() => backOr(router, '/(tabs)')} />
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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

        {/* SETTLE UP — open balances with people, worded by who owes whom. Someone who
            owes you gets a Remind (WhatsApp) and a way to record their payment; someone
            you owe gets Pay. The direction of the settle-up itself follows the balance
            (`settleDirection`), so both buttons open pointing the right way. */}
        {settles.length > 0 && (
          <>
            <Text style={[styles.secLabel, styles.secLabelSettle]}>SETTLE UP · {settles.length}</Text>
            <Card>
              {settles.map((s, i) => {
                const net = s.iOwe ? -s.amount : s.amount;
                const ov = oweView(net);
                const first = s.counterpart.name.split(' ')[0];
                const settle = () => router.push(`/add/quick?kind=transfer&to=${s.counterpart.id}`);
                return (
                  <View key={`settle-${s.from}-${s.to}`} style={[styles.row, i < settles.length - 1 ? styles.rowBorder : null]}>
                    <MemberAvatar name={s.counterpart.name} color={s.counterpart.avatar_color} size={40} imageUri={s.counterpart.image_uri} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{ov.withName(first)}</Text>
                      <Text style={[styles.rowSub, { color: ov.color }]}>{formatCompact(s.amount)}</Text>
                      <View style={styles.actions}>
                        {canRemind(net, s.counterpart.mobile) && (
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.actionBtnGhost]}
                            onPress={() => remind(s.counterpart, s.amount)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remind ${first} on WhatsApp`}
                          >
                            <Feather name="message-circle" size={14} color={colors.accent} />
                            <Text style={[styles.actionBtnText, { color: colors.accent }]}>Remind</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSettle]} onPress={settle} accessibilityRole="button">
                          <Text style={[styles.actionBtnText, { color: colors.onAccent }]}>{s.iOwe ? 'Pay' : 'Record payment'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {nothing && (
          <EmptyState
            icon="bell"
            title="Nothing due"
            body="No bills due soon and no open balances with anyone."
            tint={colors.textSecondary}
          />
        )}

      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  secLabel: { fontSize: 10, color: colors.healthAmber, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm, marginTop: space.xs },
  secLabelSettle: { color: colors.settle, marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  rowSub: { ...type.caption, color: colors.textSecondary, marginBottom: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actionBtnGhost: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.accent },
  actionBtn: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 14 },
  actionBtnSettle: { backgroundColor: colors.settle },
  actionBtnText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
});
