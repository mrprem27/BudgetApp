import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { monthShort } from '../../../lib/dateFormat';
import { colors, type, space, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { formatCompact } from '../../../lib/money';
import { MemberAvatar } from '../MemberAvatar';
import { BalanceRow } from '../BalanceRow';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { BalanceChip } from '../../ui/BalanceChip';
import { OverviewCard } from '../../ui/OverviewCard';
import { AnimatedBar } from '../../ui/anim/AnimatedBar';
import type { Contributions, SettlementSummary } from '../../../lib/groupDetail';
import type { Person } from '../../../db/queries/persons';

type Settle = { from: string; to: string; amount: number };

type Props = {
  refreshing: boolean;
  onRefresh: () => void;
  members: Person[];
  net: Record<string, number>;
  meId: string;
  totalSpent: number;
  settlements: Settle[];
  personMap: Map<string, Person>;
  simplifyOn: boolean;
  onToggleSimplify: (on: boolean) => void;
  onInvite: () => void;
  onSettlePair: (from: string, to: string, amount: number) => void;
  /** Opens the Add screen prefilled with this group — the CTA on the settled state. */
  onAddExpense: () => void;
  groupName: string;
  /**
   * Who paid what, and each member's distance from a fair share. Moved here from the
   * Budget tab, where it sat between the budget hero and the category list: it's a
   * settlement concern, and the people and balances it talks about are on this tab.
   * Already computed by `computeContributions` in `lib/groupDetail`.
   */
  contributions: Contributions;
  /** How much is still to move, and who's already square. */
  summary: SettlementSummary;
};

/**
 * Group Members tab: what the group spent, who owes whom, who paid what, and the roster.
 *
 * **The settlements list comes first, because it is the only thing here you can act
 * on.** It used to be last — under a settings toggle — while the tab opened with a
 * balance figure the pinned header was already showing. That duplicate is gone: the
 * header owns "your balance", this tab owns the group's.
 *
 * The member list is no longer collapsed behind a disclosure. A tab named "Members"
 * that hides its members was hiding its own subject, and the tab pill now states the
 * count anyway.
 */
export function MembersTab({
  members, net, meId, totalSpent, settlements, personMap, simplifyOn, onToggleSimplify,
  onInvite, onSettlePair, onAddExpense, groupName, contributions, summary, refreshing, onRefresh,
}: Props) {
  const bottomPad = useContentInset({ fab: true });

  return (
    <ScrollView
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* "Group spend", not "total": AGENTS §12 — only expenses are counted here,
          so the label has to say which kind it means. */}
      <OverviewCard
        eyebrow="Group spend"
        amount={totalSpent}
        supporting={contributions.total > 0
          ? `Fair share ${formatCompact(contributions.fairShare)} each · ${members.length} member${members.length === 1 ? '' : 's'}`
          : `${members.length} member${members.length === 1 ? '' : 's'}`}
        stats={[
          { key: 'open', value: settlements.length, label: 'to settle', tint: settlements.length > 0 ? colors.expense : colors.textPrimary },
          { key: 'outstanding', value: formatCompact(summary.openTotal), label: 'outstanding' },
          { key: 'settled', value: `${summary.settledCount}/${members.length}`, label: 'settled', tint: colors.income },
        ]}
      />

      {settlements.length > 0 ? (
        <>
          {/* The toggle sits in the header of the list it changes — and toggling it
              changes `settlements.length`, which is *in* that header's title, so
              cause and effect land in one glance. A chip with no trailing affordance
              is a toggle (§9); it must not gain a ✕ or a ⌄. */}
          <SectionHeader
            title={`${settlements.length} payment${settlements.length > 1 ? 's' : ''} to settle`}
            right={
              <Chip
                label={simplifyOn ? 'Simplified' : 'All debts'}
                icon="shuffle"
                selected={simplifyOn}
                onPress={() => onToggleSimplify(!simplifyOn)}
                accessibilityLabel={simplifyOn
                  ? 'Simplify debts is on, showing the fewest possible payments. Tap to show every direct debt'
                  : 'Simplify debts is off, showing every direct debt. Tap to simplify'}
              />
            }
          />
          <Card clip>
            {settlements.map((s, i) => {
              const fromPerson = personMap.get(s.from);
              const toPerson = personMap.get(s.to);
              if (!fromPerson || !toPerson) return null;
              return (
                <React.Fragment key={`${s.from}-${s.to}-${i}`}>
                  {i > 0 && <Divider indent="none" />}
                  <View style={styles.balanceRowWrap}>
                    <BalanceRow from={fromPerson} to={toPerson} amount={s.amount} onPaid={() => onSettlePair(s.from, s.to, s.amount)} />
                  </View>
                </React.Fragment>
              );
            })}
          </Card>
        </>
      ) : (
        /* Now the first thing you see when the group is square, so §2's CTA
           requirement actually bites — it used to be a dead end at the bottom. */
        <EmptyState
          icon="check-circle"
          title="All settled up"
          body={`No outstanding balances in ${groupName}.`}
          tint={colors.income}
          actionLabel="Add an expense"
          onAction={onAddExpense}
        />
      )}

      {/* WHO PAID WHAT — each member's share of the spend, and their distance from an
          even split. The bar is `AnimatedBar`; this used to hand-roll a third static
          progress track while `BudgetBar` and `AnimatedBar` both already existed. */}
      {contributions.total > 0 && (
        <>
          <SectionHeader title="Who paid what" />
          <Card padded>
            {contributions.rows.map((r, i) => (
              <View key={r.member.id} style={i > 0 ? styles.contribRowGap : undefined}>
                <View style={styles.contribHead}>
                  <MemberAvatar name={r.member.name} color={r.member.avatar_color} size={28} imageUri={r.member.image_uri} />
                  <Text style={styles.contribName} numberOfLines={1}>{r.member.name}{r.member.is_me ? ' (me)' : ''}</Text>
                  <Text style={styles.contribPaid}>{formatCompact(r.paid)}</Text>
                  <Text style={[styles.contribDelta, { color: r.net > 0 ? colors.income : r.net < 0 ? colors.expense : colors.textMuted }]}>
                    {r.net > 0 ? `+${formatCompact(r.net)}` : r.net < 0 ? `−${formatCompact(-r.net)}` : '—'}
                  </Text>
                </View>
                <AnimatedBar progress={r.frac} color={r.member.avatar_color} height={6} />
              </View>
            ))}
            <Text style={styles.contribFoot}>
              Fair share is {formatCompact(contributions.fairShare)} each · + ahead, − owes the group
            </Text>
          </Card>
        </>
      )}

      <SectionHeader
        title="Members"
        right={<Chip label="Invite" icon="user-plus" onPress={onInvite} accessibilityLabel="Invite someone to this group" />}
      />
      <Card clip>
        {members.map((m, i) => {
          const v = net[m.id] ?? 0;
          const isLargest = v > 0 && members.every(o => o.id === m.id || (net[o.id] ?? 0) <= v);
          const sub = isLargest && !m.is_me
            ? 'Largest contributor'
            : m.joined_at ? `Joined ${monthShort(m.joined_at)}` : undefined;
          return (
            <React.Fragment key={m.id}>
              {i > 0 && <Divider indent="text" />}
              {/* `BalanceChip` renders nothing at zero, so a settled member's row is
                  simply clean — better than the old "₹0 / settled" pair, which spent
                  two lines saying nothing happened. */}
              <ListRow
                leading={<MemberAvatar name={m.name} color={m.avatar_color} size={layout.avatarSize} imageUri={m.image_uri} />}
                title={`${m.name}${m.is_me ? ' (you)' : ''}`}
                subtitle={sub}
                value={<BalanceChip net={v} />}
                onPress={onInvite}
              />
            </React.Fragment>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // No `gap` (AGENTS §12): it used to stack with every card's own `marginBottom`,
  // making the real gutter 24px and the space above each SectionHeader 32px.
  listContent: { padding: layout.screenPaddingH },
  contribRowGap: { marginTop: space.md },
  contribHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  contribName: { ...type.body, color: colors.textPrimary, flex: 1 },
  contribPaid: { ...type.amountSM, color: colors.textPrimary },
  contribDelta: { ...type.captionSemi, minWidth: 52, textAlign: 'right' },
  contribFoot: { ...type.caption, color: colors.textMuted, marginTop: space.md },
  balanceRowWrap: { paddingHorizontal: space.md },
});
