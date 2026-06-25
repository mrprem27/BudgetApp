import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { getDate, getDaysInMonth, format } from 'date-fns';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { categoryVisual } from '../src/constants/categories';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { AppRefreshControl, useRefresh } from '../src/components/ui/AppRefreshControl';
import { getTransactionsInRange, getRecurringForGroup } from '../src/db/queries/transactions';
import { getBudgetAnalytics } from '../src/lib/analytics';
import { getAllGroups } from '../src/db/queries/groups';
import { getGroupNet } from '../src/db/queries/balances';
import { getMe } from '../src/db/queries/persons';
import { formatCompact } from '../src/lib/money';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';

type Shift = { cat: string; thisAmt: number; pct: number };

export default function InsightsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flags } = useFeatureFlags();

  const [loading, setLoading] = useState(true);
  const [personalId, setPersonalId] = useState('');
  const [monthSpend, setMonthSpend] = useState(0);
  const [budget, setBudget] = useState(0);
  const [projected, setProjected] = useState(0);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [owedToMe, setOwedToMe] = useState(0);
  const [iOwe, setIOwe] = useState(0);
  const [owedPeople, setOwedPeople] = useState(0);
  const [owePeople, setOwePeople] = useState(0);
  const [subNames, setSubNames] = useState<string[]>([]);
  const [subsMonthly, setSubsMonthly] = useState(0);
  const [whatIf, setWhatIf] = useState<{ name: string; monthly: number } | null>(null);
  const [cutPct, setCutPct] = useState(20);

  useFocusEffect(useCallback(() => { load(); }, []));
  const { refreshing, onRefresh } = useRefresh(() => load());

  async function load() {
    const grps = await getAllGroups(db);
    setPersonalId(grps.find(g => g.is_personal === 1)?.id ?? '');

    // This month vs last month spend by category (for shifts + velocity).
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const lastMonthEnd = new Date(monthStart.getTime() - 1);
    const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
    const [monthTxns, lastMonthTxns] = await Promise.all([
      getTransactionsInRange(db, null, monthStart.getTime(), Date.now()),
      getTransactionsInRange(db, null, lastMonthStart.getTime(), lastMonthEnd.getTime()),
    ]);
    const catMap: Record<string, number> = {};
    const lastCatMap: Record<string, number> = {};
    for (const t of monthTxns) if (t.kind === 'expense') {
      const amt = t.shares.reduce((s: number, sh: { amount: number }) => s + sh.amount, 0);
      catMap[t.category] = (catMap[t.category] ?? 0) + amt;
    }
    for (const t of lastMonthTxns) if (t.kind === 'expense') {
      const amt = t.shares.reduce((s: number, sh: { amount: number }) => s + sh.amount, 0);
      lastCatMap[t.category] = (lastCatMap[t.category] ?? 0) + amt;
    }
    const totalMonthSpend = Object.values(catMap).reduce((s, v) => s + v, 0);
    setMonthSpend(totalMonthSpend);

    // Top spending category powers the "What if I cut…" simulator.
    const topEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
    setWhatIf(topEntry ? { name: topEntry[0], monthly: topEntry[1] } : null);

    // Month-end projection from daily pace.
    const today = new Date();
    const dayOfMonth = getDate(today);
    const daysInMonth = getDaysInMonth(today);
    setProjected(dayOfMonth > 0 ? Math.round((totalMonthSpend / dayOfMonth) * daysInMonth) : 0);

    // Total budget across all groups.
    const analyticsAll = await Promise.all(grps.map(g => getBudgetAnalytics(db, g)));
    setBudget(analyticsAll.reduce((s, a) => s + a.totalAllocated, 0));

    // Biggest category shifts vs last month.
    const computed: Shift[] = Object.entries(catMap)
      .filter(([cat]) => lastCatMap[cat])
      .map(([cat, thisAmt]) => {
        const lastAmt = lastCatMap[cat] ?? 0;
        return { cat, thisAmt, pct: lastAmt > 0 ? Math.round(((thisAmt - lastAmt) / lastAmt) * 100) : 0 };
      })
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 3);
    setShifts(computed);

    // Net exposure across all non-personal groups.
    const me = await getMe(db);
    let oTm = 0, iO = 0, oP = 0, owP = 0;
    if (me) {
      for (const g of grps) {
        if (g.is_personal === 1) continue;
        const myNet = (await getGroupNet(db, g.id))[me.id] ?? 0;
        if (myNet > 0) { oTm += myNet; oP += 1; }
        else if (myNet < 0) { iO += -myNet; owP += 1; }
      }
    }
    setOwedToMe(oTm); setIOwe(iO); setOwedPeople(oP); setOwePeople(owP);

    // Subscriptions = recurring EXPENSE rules (reliable; not guessed from logs).
    if (flags.subscriptions) {
      const byGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
      const rules = byGroup.flat().filter(t => t.kind === 'expense' && t.recur_freq && (!t.recur_state || t.recur_state === 'active'));
      const monthly = rules.reduce((s, t) => {
        const amt = t.shares.reduce((x, sh) => x + sh.amount, 0);
        const f = t.recur_freq;
        return s + (f === 'daily' ? amt * 30 : f === 'weekly' ? Math.round(amt * 52 / 12) : f === 'yearly' ? Math.round(amt / 12) : amt);
      }, 0);
      setSubNames(rules.map(t => (t.note && t.note.trim()) || t.category));
      setSubsMonthly(monthly);
    } else {
      setSubNames([]); setSubsMonthly(0);
    }
    setLoading(false);
  }

  const today = new Date();
  const dayOfMonth = getDate(today);
  const daysInMonth = getDaysInMonth(today);
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const overspend = budget > 0 && projected > budget;
  const pctUsed = budget > 0 ? Math.min(100, Math.round((monthSpend / budget) * 100)) : 0;
  const dailyAvg = dayOfMonth > 0 ? Math.round(monthSpend / dayOfMonth) : 0;
  const budgetPerDay = daysInMonth > 0 ? Math.round(budget / daysInMonth) : 0;
  const net = owedToMe - iOwe;
  const nothingYet = !loading && !overspend && shifts.length === 0 && owedToMe === 0 && iOwe === 0 && subNames.length === 0 && !whatIf;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Insights"
        onBack={() => router.back()}
        right={<View style={styles.monthPill}><Text style={styles.monthPillText}>{format(today, 'MMMM')}</Text></View>}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.eyebrow}>{format(today, 'MMMM yyyy')} · {dayOfMonth} days in</Text>

        {/* HERO — spending velocity (only when projected to overspend) */}
        {overspend && (
          <View style={styles.velocityCard}>
            <View style={styles.velocityHeader}>
              <View style={styles.velocityDot} />
              <Text style={styles.velocityLabel}>Spending velocity</Text>
            </View>
            <Text style={styles.velocityMsg}>
              At this pace you'll overspend by <Text style={{ color: colors.expense }}>{formatCompact(projected - budget)}</Text> by month-end
            </Text>
            <Text style={styles.velocitySub}>
              You're averaging {formatCompact(dailyAvg)}/day · budget allows {formatCompact(budgetPerDay)}/day
            </Text>
            <View style={styles.velocityBarRow}>
              <View style={styles.velocityLegend}>
                <Text style={styles.velocityLegendMuted}>₹0</Text>
                <Text style={[styles.velocityLegendMuted, { color: colors.expense }]}>Projected {formatCompact(projected)}</Text>
                <Text style={styles.velocityLegendMuted}>Budget {formatCompact(budget)}</Text>
              </View>
              <View style={styles.velocityBarTrack}>
                <View style={[styles.velocityBarFill, { width: `${Math.min(100, Math.round((budget / projected) * 100))}%` }]} />
              </View>
              <Text style={styles.velocityLegendMuted}>{pctUsed}% budget used · {daysLeft} days left</Text>
            </View>
            <TouchableOpacity style={styles.velocityCta} onPress={() => personalId && router.push(`/group/${personalId}` as any)} accessibilityRole="button">
              <Text style={styles.velocityCtaText}>See what to cut</Text>
              <Feather name="chevron-right" size={12} color={colors.accent} />
            </TouchableOpacity>
          </View>
        )}

        {/* SHIFTS VS LAST MONTH */}
        {shifts.length > 0 && (
          <>
            <Text style={styles.secLabel}>SHIFTS VS LAST MONTH</Text>
            <View style={styles.secCard}>
              {shifts.map((s, i) => {
                const vis = categoryVisual(s.cat);
                const up = s.pct > 5, down = s.pct < -5;
                return (
                  <View key={s.cat} style={[styles.shiftRow, i < shifts.length - 1 && styles.rowBorder]}>
                    <View style={[styles.shiftEmoji, { backgroundColor: (vis?.color ?? colors.accent) + '22' }]}>
                      <Feather name={vis?.icon ?? 'tag'} size={16} color={vis?.color ?? colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shiftCat}>{s.cat}</Text>
                      <Text style={styles.shiftAmt}>{formatCompact(s.thisAmt)} this month</Text>
                    </View>
                    <View style={[styles.shiftBadge, { backgroundColor: up ? '#2A1714' : down ? '#081F16' : colors.bgCard, borderColor: colors.border, borderWidth: 1 }]}>
                      {up && <Feather name="arrow-up" size={10} color={colors.expense} />}
                      {down && <Feather name="arrow-down" size={10} color={colors.income} />}
                      <Text style={[styles.shiftBadgeText, { color: up ? colors.expense : down ? colors.income : colors.textMuted }]}>
                        {up ? `+${s.pct}%` : down ? `${s.pct}%` : '~same'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* WHAT IF — cut the top category and see the saving */}
        {whatIf && whatIf.monthly > 0 && (
          <>
            <Text style={styles.secLabel}>WHAT IF…</Text>
            <View style={[styles.secCard, { padding: space.md }]}>
              <Text style={styles.whatIfLead}>
                Cut <Text style={{ color: colors.accent, fontFamily: 'Inter_600SemiBold' }}>{whatIf.name}</Text> by
              </Text>
              <View style={styles.whatIfChips}>
                {[10, 20, 30].map(p => (
                  <TouchableOpacity key={p} style={[styles.whatIfChip, cutPct === p && styles.whatIfChipActive]} onPress={() => setCutPct(p)} accessibilityRole="button" accessibilityState={{ selected: cutPct === p }}>
                    <Text style={[styles.whatIfChipText, cutPct === p && { color: colors.bg }]}>{p}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.whatIfSave}>
                You'd save <Text style={{ color: colors.income, fontFamily: 'Inter_600SemiBold' }}>{formatCompact(Math.round((whatIf.monthly * cutPct) / 100))}</Text>/mo
              </Text>
              <Text style={styles.whatIfYear}>≈ {formatCompact(Math.round((whatIf.monthly * cutPct) / 100) * 12)} a year</Text>
            </View>
          </>
        )}

        {/* ACROSS ALL GROUPS */}
        {(owedToMe > 0 || iOwe > 0) && (
          <>
            <Text style={styles.secLabel}>ACROSS ALL GROUPS</Text>
            <View style={[styles.secCard, { padding: space.md }]}>
              <View style={styles.netRow}>
                <Text style={styles.shiftCat}>Net position</Text>
                <Text style={[styles.netAmt, { color: net >= 0 ? colors.income : colors.expense }]}>
                  {net >= 0 ? '+' : '−'}{formatCompact(Math.abs(net))}
                </Text>
              </View>
              <Text style={[styles.shiftAmt, { marginBottom: 10 }]}>
                You're owed {formatCompact(owedToMe)} · You owe {formatCompact(iOwe)}
              </Text>
              <View style={styles.netDivider} />
              <View style={styles.netTilesRow}>
                <View style={styles.netTile}>
                  <Text style={styles.netTileLabel}>Owed to you</Text>
                  <Text style={[styles.netTileAmt, { color: colors.income }]}>{formatCompact(owedToMe)}</Text>
                  <Text style={styles.netTilePeople}>{owedPeople} {owedPeople === 1 ? 'person' : 'people'}</Text>
                </View>
                <View style={[styles.netTile, { backgroundColor: '#2A1714', borderColor: '#3A1F1C' }]}>
                  <Text style={styles.netTileLabel}>You owe</Text>
                  <Text style={[styles.netTileAmt, { color: colors.expense }]}>{formatCompact(iOwe)}</Text>
                  <Text style={styles.netTilePeople}>{owePeople} {owePeople === 1 ? 'person' : 'people'}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* SUBSCRIPTIONS NUDGE */}
        {flags.subscriptions && subNames.length > 0 && (
          <View style={styles.subsCard}>
            <View style={styles.subsHeader}>
              <View style={styles.subsDot} />
              <Text style={styles.subsLabel}>Subscriptions · {formatCompact(subsMonthly)}/mo</Text>
            </View>
            <Text style={styles.subsTitle}>{subNames.length} active {subNames.length === 1 ? 'subscription' : 'subscriptions'}</Text>
            <Text style={styles.subsSub}>{subNames.slice(0, 3).join(', ')}{subNames.length > 3 ? ` and ${subNames.length - 3} more` : ''}.</Text>
            <View style={styles.subsActions}>
              <TouchableOpacity style={styles.subsReviewBtn} onPress={() => router.push('/plan/subscriptions' as any)} accessibilityRole="button">
                <Text style={styles.subsReviewText}>Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {nothingYet && (
          <EmptyState
            icon="bar-chart-2"
            title="No insights yet"
            body="Log a few expenses and split with a group — patterns, alerts, and balances show up here."
            tint={colors.textSecondary}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  monthPill: { backgroundColor: colors.bgMuted, borderRadius: 100, paddingVertical: 7, paddingHorizontal: 14 },
  monthPillText: { fontSize: 12, color: colors.textSecondary, fontFamily: 'Inter_400Regular' },
  eyebrow: { fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: space.xs },

  velocityCard: { backgroundColor: '#1A1014', borderRadius: 18, padding: 18, borderWidth: 1.5, borderColor: '#3A1F1C' },
  velocityHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  velocityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.expense },
  velocityLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.expense, textTransform: 'uppercase', letterSpacing: 0.8 },
  velocityMsg: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, letterSpacing: -0.3, marginBottom: 6, lineHeight: 23 },
  velocitySub: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: 14 },
  velocityBarRow: { marginBottom: 12, gap: 5 },
  velocityLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  velocityLegendMuted: { fontSize: 10, color: colors.textMuted },
  velocityBarTrack: { height: 6, backgroundColor: colors.bgMuted, borderRadius: 3, overflow: 'hidden' },
  velocityBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  velocityCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border },
  velocityCtaText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },

  secLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: 8, marginTop: 4 },
  whatIfLead: { ...type.body, color: colors.textSecondary, marginBottom: space.sm },
  whatIfChips: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  whatIfChip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, backgroundColor: colors.bgMuted },
  whatIfChipActive: { backgroundColor: colors.accent },
  whatIfChipText: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  whatIfSave: { ...type.body, color: colors.textPrimary },
  whatIfYear: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  secCard: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.md, paddingVertical: 11 },
  shiftEmoji: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  shiftCat: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  shiftAmt: { fontSize: 11, color: colors.textMuted },
  shiftBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  shiftBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  netAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, letterSpacing: -0.5 },
  netDivider: { height: 1, backgroundColor: colors.border, marginBottom: 10 },
  netTilesRow: { flexDirection: 'row', gap: 6 },
  netTile: { flex: 1, backgroundColor: '#081F16', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#0C3D22' },
  netTileLabel: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 3 },
  netTileAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, letterSpacing: -0.5 },
  netTilePeople: { fontSize: 10, color: colors.textMuted, marginTop: 2 },

  subsCard: { backgroundColor: '#1A1A3A', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: colors.settle, marginTop: space.xs },
  subsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  subsDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.settle },
  subsLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: colors.settle, textTransform: 'uppercase', letterSpacing: 0.8 },
  subsTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary, marginBottom: 4 },
  subsSub: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  subsActions: { flexDirection: 'row', gap: 6, marginTop: 12 },
  subsReviewBtn: { flex: 1, backgroundColor: '#13203A', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A5A' },
  subsReviewText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.settle },
});
