import React from 'react';
import { Chip } from '../../src/components/ui/Chip';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout, alpha } from '../../src/theme';
import { categoryVisual } from '../../src/constants/categories';
import { asFeather } from '../../src/constants/palette';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { AmountText } from '../../src/components/ui/AmountText';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useContentInset } from '../../src/hooks/useContentInset';
import { useRecurringActions } from '../../src/hooks/useRecurringActions';
import { getAllGroups } from '../../src/db/queries/groups';
import { getRecurringForGroup, getSkipsMap } from '../../src/db/queries/recurring';
import { nextUnskippedOccurrence, recurringMonthlyEquivalent, freqLabel } from '../../src/lib/recurrence';
import { shortDate } from '../../src/lib/dateFormat';
import { myShareOrTotal, myIncomeOf, txnTotal } from '../../src/lib/splitMath';
import { getMe } from '../../src/db/queries/persons';
import type { RecurFreq, TxnKind } from '../../src/constants/enums';
import { formatCompact } from '../../src/lib/money';
import { backOr } from '../../src/lib/nav';

type Sub = { id: string; groupId: string; name: string; category: string; kind: TxnKind; amount: number; freq: RecurFreq; interval: number | null; nextMs: number | null; paused: boolean };

// Normalise a recurring charge to a per-month figure for the running totals.
const toMonthly = recurringMonthlyEquivalent;

/**
 * The recurring **inventory** — one row per rule, with the actions that change it.
 *
 * Not the same list as Plan's "Due this month", which is one row per upcoming *charge*.
 * The two diverge at the edges: a yearly rule due in eleven months, a paused rule, or one
 * whose next occurrences are all skipped, are rules with no upcoming charge — they belong
 * here and nowhere else. Keeping the titles distinct ("Recurring" = the things themselves,
 * "Due this month" = a forward window) is what stops the pair reading as one list shown
 * twice, which is how it was reported.
 */
export default function RecurringScreen() {
  const router = useRouter();
  const bottomPad = useContentInset();

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const now = Date.now();
    const grps = await getAllGroups(db);
    const byGroup = await Promise.all(grps.map(g => getRecurringForGroup(db, g.id)));
    // Every kind: recurring income (salary) belongs on this screen too — it was
    // invisible everywhere until it first materialized, which made onboarding's
    // income answer look like it did nothing.
    /*
     * Paused rules are IN this list, and that is the whole point of the screen.
     *
     * They were filtered out while the row offered a Pause button and no Resume
     * anywhere in the app — so Pause removed the rule from the only screen that
     * lists it, permanently, with no undo. This screen's own docblock above says
     * a paused rule "belongs here and nowhere else"; the filter contradicted it.
     */
    const rules = byGroup.flat().filter(t =>
      t.recur_freq
      && t.recur_state !== 'ended'
      /*
       * NOT a rule somebody else proposed and I have not accepted.
       *
       * `getRecurringForGroup` deliberately includes pending peer rules, and every
       * other consumer filters them (`lib/upcoming.ts:125`, `expandUpcoming:46`).
       * This one did not — so a flatmate's proposed "Gym ₹12,000/mo" added ₹4,000
       * to my committed total the moment they typed it, before I had agreed to
       * anything, and appeared in no upcoming list to explain where it came from.
       * The place to decide about a peer's rule is the approvals queue.
       */
      && !t.pendingApproval);
    // Skips have to be loaded, not inferred: "next" must be the next date that actually
    // happens, not the next one the schedule would produce.
    const skips = await getSkipsMap(db, rules.map(r => r.id));
    const meRow = await getMe(db);
    const list: Sub[] = rules.map(t => ({
      id: t.id,
      groupId: t.group_id,
      name: (t.note && t.note.trim()) || t.category,
      category: t.category,
      kind: t.kind,
      // My share — the only basis that sums honestly with budgets and afford.
      // Income is attributed by payments, so it reads the other side.
      amount: meRow
        ? (t.kind === 'income' ? myIncomeOf(t, meRow.id) : myShareOrTotal(t, meRow.id))
        : txnTotal(t),
      freq: t.recur_freq!,
      interval: t.recur_interval,
      // A paused rule has no next charge — `materializeDueOccurrences` filters on
      // `recur_state = 'active'` — so showing the schedule's next date would
      // advertise a charge that will not happen.
      nextMs: t.recur_state === 'paused' ? null : nextUnskippedOccurrence(t, now, skips.get(t.id)),
      paused: t.recur_state === 'paused',
    }));
    // Paused rules sink below the live ones: they are here to be found and
    // resumed, not to lead a list of what is about to be charged.
    list.sort((a, b) =>
      Number(a.paused) - Number(b.paused) || (a.nextMs ?? Infinity) - (b.nextMs ?? Infinity));
    return list;
  }, []);

  const subs = data ?? [];
  // Edit and Stop are not here: they are destructive or navigational, and live on
  // the rule's own screen — which is where tapping a row already goes.
  const { skipNext, pause, resume } = useRecurringActions(reload);
  /*
   * THREE kinds, three sums. §12 forbids one total across them, and this was
   * quietly breaking it: `kind !== 'income'` folded standing TRANSFERS into a
   * figure labelled "Money out · your share". A monthly ₹10,000 transfer to a
   * savings account is money moving between your own pockets, not money spent —
   * counting it as committed spending overstates the one number this screen
   * exists to give, and `lib/upcoming.ts` refuses to do it on the same data.
   */
  const outSubs = subs.filter(s => s.kind === 'expense');
  const inSubs = subs.filter(s => s.kind === 'income');
  const moveSubs = subs.filter(s => s.kind === 'settlement');
  // Paused rules are listed but never summed: a paused subscription is not money
  // leaving each month, and counting it would overstate the committed total.
  const live = (rows: Sub[]) => rows.filter(s => !s.paused);
  const monthly = (rows: Sub[]) => live(rows).reduce((s, x) => s + toMonthly(x.amount, x.freq, x.interval), 0);
  const monthlyOut = monthly(outSubs);
  const monthlyIn = monthly(inSubs);
  const monthlyMoved = monthly(moveSubs);
  const activeCount = live(subs).length;
  const pausedCount = subs.length - activeCount;
  const nextUp = subs.find(s => s.nextMs != null);

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Recurring" onBack={() => backOr(router, '/(tabs)/savings')} />
        <ErrorState onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Recurring" onBack={() => backOr(router, '/(tabs)/savings')} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!loading && subs.length === 0 ? (
          <EmptyState
            icon="refresh-cw"
            title="No recurring items yet"
            body="Mark an expense as Recurring (monthly Netflix, rent, gym…) when you add it, and it'll show here with its monthly cost and next charge."
            actionLabel="Add a recurring expense"
            onAction={() => router.push('/add/quick?kind=expense')}
          />
        ) : subs.length > 0 ? (
          <>
            {/* The one hero figure on this screen (AGENTS §1): my monthly
                commitment. Income is its own labelled figure, never merged. */}
            <Card padded style={styles.totalCard}>
              <View style={styles.totalRow}>
                <View style={styles.totalLeft}>
                  {/* "a month" is not decoration: every row below shows its own
                      PER-CHARGE amount, so a yearly ₹12,000 rule reads ₹12,000 in
                      the list while contributing ₹1,000 here. Two bases in one
                      card; only the label can tell them apart. */}
                  <Text style={styles.totalLabel}>Spending a month · your share</Text>
                  <AmountText paise={monthlyOut} size="xl" forceColor={colors.textPrimary} />
                  <Text style={styles.totalSub}>
                    ≈ {formatCompact(monthlyOut * 12)} a year
                    {monthlyIn > 0 ? ` · +${formatCompact(monthlyIn)}/mo in` : ''}
                    {monthlyMoved > 0 ? ` · ${formatCompact(monthlyMoved)}/mo moved` : ''}
                  </Text>
                </View>
                <View style={styles.totalRight}>
                  <Text style={styles.totalCount}>
                    {activeCount} active{pausedCount > 0 ? ` · ${pausedCount} paused` : ''}
                  </Text>
                  {nextUp?.nextMs != null && (
                    <Text style={styles.totalNext}>next {shortDate(nextUp.nextMs)}</Text>
                  )}
                </View>
              </View>
            </Card>

            {/* Transfers get their own section rather than hiding inside "Money
                out" — they are the third kind, and §12 says a kind's total is its
                own. */}
            {([['Money out', outSubs], ['Money in', inSubs], ['Moved between your own', moveSubs]] as const).map(([title, rows]) => rows.length === 0 ? null : (
              <View key={title}>
                <SectionHeader title={title} right={<Text style={styles.count}>{rows.length}</Text>} />
                <Card clip>
                  {rows.map((s, i) => {
                    const vis = categoryVisual(s.category);
                    /*
                     * No actions on the list. The row taps through to this rule's
                     * own screen, where Edit, Skip, Pause and Stop already live.
                     *
                     * It used to carry FOUR `SecondaryButton`s permanently visible —
                     * 52pt of chrome on a 75pt row, ~29% of the screen's height, for
                     * maintenance nobody is doing while reading a list. They did not
                     * even fit: four labels across a 390pt screen leaves ~75pt each,
                     * "Skip next" needs ~78, and the container has a fixed height
                     * with no `numberOfLines`, so it wrapped and clipped.
                     *
                     * A swipe was tried in between and rejected: it trades visible
                     * clutter for an invisible gesture, on a screen whose complaint
                     * was that it is confusing. A list should be a list.
                     */
                    return (
                      <View key={s.id}>
                        {i > 0 && <Divider indent="text" />}
                        <ListRow
                          leading={
                            <IconCircle
                              icon={asFeather(vis?.icon, s.kind === 'income' ? 'trending-up' : 'refresh-cw')}
                              size={layout.iconCircle}
                              color={vis?.color ?? (s.kind === 'income' ? colors.income : colors.accent)}
                            />
                          }
                          title={s.name}
                          subtitle={`${s.name === s.category ? '' : `${s.category} · `}${freqLabel(s.freq, s.interval)}${
                            s.nextMs != null ? ` · next ${shortDate(s.nextMs)}` : ''}`}
                          value={
                            <View style={styles.rowValue}>
                              {/* Paused is a state, so it looks like one — it was a
                                  lowercase word appended to a muted subtitle while
                                  the amount stayed at full weight, so a paused rule
                                  was visually identical to a live one. */}
                              {s.paused && <Chip label="Paused" icon="pause" />}
                              <AmountText paise={s.amount} size="sm" forceColor={s.kind === 'income' ? colors.income : colors.textPrimary} rounded />
                            </View>
                          }
                          onPress={() => router.push(`/group/${s.groupId}/recurring?focus=${s.id}`)}
                          accessibilityLabel={`${s.name}, ${freqLabel(s.freq, s.interval)}${s.paused ? ', paused' : ''}`}
                        />
                      </View>
                    );
                  })}
                </Card>
              </View>
            ))}

            <Text style={styles.footHint}>Tap a row to edit, pause or stop it.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  // Tinted settle, matching how a recurring/settlement concern is coloured elsewhere.
  totalCard: { backgroundColor: alpha(colors.settle, 8), borderColor: colors.settle },
  totalRow: { flexDirection: 'row', alignItems: 'flex-start' },
  totalLeft: { flex: 1 },
  totalLabel: { ...type.sectionLabel, color: colors.settle, marginBottom: space.xs },
  totalSub: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  totalRight: { alignItems: 'flex-end' },
  totalCount: { ...type.caption, color: colors.textSecondary },
  totalNext: { ...type.caption, color: colors.textMuted, marginTop: space.xs },
  count: { ...type.amountSM, color: colors.textSecondary },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  footHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md },
});
