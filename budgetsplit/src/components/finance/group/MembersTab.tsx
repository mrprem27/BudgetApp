import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { AppSwitch } from '../../ui/AppSwitch';
import { Feather } from '@expo/vector-icons';
import { monthShort } from '../../../lib/dateFormat';
import { colors, type, space, layout } from '../../tokens';
import { useContentInset } from '../../../hooks/useContentInset';
import { formatCompact } from '../../../lib/money';
import { oweView } from '../../../lib/owe';
import { MemberAvatar } from '../MemberAvatar';
import { BalanceRow } from '../BalanceRow';
import { Chip } from '../../ui/Chip';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { SectionHeader } from '../../ui/SectionHeader';
import { AppRefreshControl } from '../../ui/AppRefreshControl';
import { Card } from '../../ui/Card';
import { AnimatedBar } from '../../ui/anim/AnimatedBar';
import type { Contributions } from '../../../lib/groupDetail';
import type { Person } from '../../../db/queries/persons';

type Settle = { from: string; to: string; amount: number };

type Props = {
  refreshing: boolean;
  onRefresh: () => void;
  members: Person[];
  net: Record<string, number>;
  settlements: Settle[];
  personMap: Map<string, Person>;
  simplifyOn: boolean;
  onToggleSimplify: (on: boolean) => void;
  onInvite: () => void;
  onSettlePair: (from: string, to: string, amount: number) => void;
  groupName: string;
  /**
   * Trust everyone currently in this group, in one tap.
   *
   * A BUTTON, never a setting on the group. A stored group-level flag would
   * silently extend trust to whoever is added next month — somebody you have
   * never met gaining the ability to move your money by being invited. Writing
   * each person instead gives the same one tap and cannot do that: a new member
   * still starts on "asks me" (`IV-10`).
   *
   * Absent when there is nobody to trust, or when nobody here has an account yet.
   */
  onTrustAll?: () => void;
  /** How many people this would actually change, for the label. */
  trustAllCount?: number;
  /**
   * Who paid what, and each member's distance from a fair share. Moved here from the
   * Budget tab, where it sat between the budget hero and the category list: it's a
   * settlement concern, and the people and balances it talks about are on this tab.
   * Already computed by `computeContributions` in `lib/groupDetail`.
   */
  contributions: Contributions;
};

/**
 * Group Members tab, in two sections (`U-90`):
 *
 * - **Members**: one list. Each person's balance on the right, what they paid and how that
 *   compares (a bar against the biggest payer) under their name. Add sits in the section's
 *   header; "Trust everyone here" is the list's last row when it applies.
 * - **Payments to settle**: who pays whom, with Simplify as a switch in that section's header,
 *   because it changes that list and nothing else.
 *
 * It was seven boxes: a balance summary repeating the header card, an Add row, a collapsed
 * member list, "who paid what" listing the same people again, a dashed Trust button, a Simplify
 * card and the payments, spaced by a container gap AND each card's own margin (AGENTS §3).
 */
export function MembersTab({ members, net, settlements, personMap, simplifyOn, onToggleSimplify, onInvite, onSettlePair, groupName, contributions, refreshing, onRefresh, onTrustAll, trustAllCount = 0 }: Props) {
  const bottomPad = useContentInset({ fab: true });
  const paidBy = new Map(contributions.rows.map(r => [r.member.id, r]));
  const showPaid = contributions.total > 0;
  const showTrust = !!onTrustAll && trustAllCount > 0;

  return (
    <ScrollView
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <SectionHeader
        first
        title={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
        right={<Chip size="sm" label="Add" icon="user-plus" accent={colors.accent} onPress={onInvite} accessibilityLabel="Add member" />}
      />
      <Card clip>
        {members.map((m, mi) => {
          const v = net[m.id] ?? 0;
          const ov = oweView(v);
          const paid = paidBy.get(m.id);
          const balLabel = v > 0 ? 'is owed' : v < 0 ? (m.is_me ? 'you owe' : 'owes') : 'settled';
          return (
            <View key={m.id}>
              {mi > 0 && <Divider indent="text" />}
              <View style={styles.memberRow}>
                <MemberAvatar name={m.name} color={m.avatar_color} size={layout.avatarSize} imageUri={m.image_uri} />
                <View style={styles.memberBody}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.name}{m.is_me ? <Text style={styles.youTag}> (you)</Text> : null}
                  </Text>
                  {showPaid && paid ? (
                    <>
                      <Text style={styles.memberSub} numberOfLines={1}>Paid {formatCompact(paid.paid)}</Text>
                      <View style={styles.paidBar}>
                        <AnimatedBar progress={paid.frac} color={m.avatar_color} height={4} />
                      </View>
                    </>
                  ) : m.joined_at ? (
                    <Text style={styles.memberSub} numberOfLines={1}>Joined {monthShort(m.joined_at)}</Text>
                  ) : null}
                </View>
                <View style={styles.memberRight}>
                  <Text style={[styles.memberBal, { color: ov.color }]}>{v === 0 ? '₹0' : `${ov.sign}${formatCompact(ov.amount)}`}</Text>
                  <Text style={styles.memberBalLabel}>{balLabel}</Text>
                </View>
              </View>
            </View>
          );
        })}
        {/* A row, never a setting on the group: it writes each person here now, so somebody
            added next month still starts on "asks me" (`IV-10`). */}
        {showTrust && (
          <>
            <Divider indent="text" />
            <ListRow
              icon="shield"
              title="Trust everyone here"
              subtitle="Their entries count without asking you"
              value={String(trustAllCount)}
              onPress={onTrustAll}
              accessibilityLabel={`Trust everyone in ${groupName}`}
            />
          </>
        )}
      </Card>
      {showPaid && (
        <Text style={styles.foot}>An even share is {formatCompact(contributions.fairShare)} each.</Text>
      )}

      {settlements.length > 0 ? (
        <>
          <SectionHeader
            title={`${settlements.length} ${settlements.length === 1 ? 'payment' : 'payments'} to settle`}
            right={
              // A switch with its name, not a chip: a tinted chip read as a button that did
              // something once, and said nothing about what (yours, 2026-10-01). The line under
              // the list says what the current setting means.
              <View style={styles.simplify}>
                <Text style={styles.simplifyLabel}>Simplify</Text>
                <AppSwitch
                  value={simplifyOn}
                  onValueChange={onToggleSimplify}
                  accessibilityLabel={`Simplify debts, ${simplifyOn ? 'on: fewest possible payments' : 'off: every direct debt'}`}
                />
              </View>
            }
          />
          <Card clip>
            {settlements.map((s, i) => {
              const fromPerson = personMap.get(s.from);
              const toPerson = personMap.get(s.to);
              if (!fromPerson || !toPerson) return null;
              return (
                <View key={`${s.from}-${s.to}-${i}`}>
                  {i > 0 && <Divider indent="none" />}
                  <View style={styles.balanceRowWrap}>
                    <BalanceRow from={fromPerson} to={toPerson} amount={s.amount} onPaid={() => onSettlePair(s.from, s.to, s.amount)} />
                  </View>
                </View>
              );
            })}
          </Card>
          <Text style={styles.foot}>
            {simplifyOn ? 'Simplified: the fewest payments that settle everyone.' : 'Every debt as it was made, person to person.'}
          </Text>
        </>
      ) : (
        // One quiet line, not a 64pt illustration in the middle of a list: nothing here is missing.
        <View style={styles.settled}>
          <Feather name="check-circle" size={16} color={colors.income} />
          <Text style={styles.settledText}>All settled up in {groupName}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // No `gap`: `SectionHeader` owns the space between sections, and a gap would add to it.
  listContent: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.smd, paddingHorizontal: space.md },
  memberBody: { flex: 1, minWidth: 0 },
  memberName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  youTag: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  memberSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  paidBar: { marginTop: space.xs },
  memberRight: { alignItems: 'flex-end' },
  memberBal: { ...type.amountSM },
  memberBalLabel: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  foot: { ...type.caption, color: colors.textMuted, marginTop: space.sm },
  balanceRowWrap: { paddingHorizontal: space.md },
  simplify: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  simplifyLabel: { ...type.caption, color: colors.textSecondary },

  settled: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  settledText: { ...type.body, color: colors.textSecondary },
});
