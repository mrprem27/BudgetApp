import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../tokens';
import { alpha } from '../../../theme';
import { asFeather } from '../../../constants/palette';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { AmountText } from '../../ui/AmountText';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { AvatarStack } from '../AvatarStack';
import { oweView } from '../../../lib/owe';
import type { BudgetGroup } from '../../../db/queries/groups';
import type { Person } from '../../../db/queries/persons';

type Props = {
  group: BudgetGroup;
  members: Person[];
  /** My net in this group: > 0 owed to me, < 0 I owe, 0 square. */
  myNet: number;
  /**
   * The one counterpart to offer "Settle up" with, or null when there isn't one.
   * Derived by `primarySettleTarget` (lib/groupDetail) — null keeps the button
   * off rather than opening a transfer form with an empty payee.
   */
  settleWith: Person | null;
  onSettle: (personId: string) => void;
};

/**
 * The group hub's fixed header: who this group is, and where I stand in it.
 *
 * Replaces `GroupHero` + `GroupBalanceCard`, which were two stacked blocks with
 * two competing hero figures — the name at a hand-written `fontSize: 26` and the
 * balance at a raw `22` mono, neither a token, against AGENTS §1's one-hero rule.
 * Now there are three tiers: the screen header at 20, the group name at 16, and
 * the balance at 24 mono as the only hero.
 *
 * **One `Card clip`, tinted on the bottom half only.** Identity is neutral
 * information that doesn't change with the balance; washing the whole card coral
 * would make the group itself look like the problem. The balance half paints
 * inside the clip, so its corners follow the radius and its top edge is a
 * `Divider`, not a second border.
 *
 * `React.memo` is load-bearing: this sits above the tab switch and above the
 * lifted search state, so it re-renders on every keystroke unless its props stay
 * primitive. That's why it takes `myNet: number` and a resolved `settleWith`
 * rather than the `net` map and the settlement list, both of which are fresh
 * objects on every load.
 */
export const GroupHeader = React.memo(function GroupHeader({
  group, members, myNet, settleWith, onSettle,
}: Props) {
  const ov = oweView(myNet);
  const settled = ov.direction === 'settled';

  return (
    <Card clip style={styles.card}>
      <View style={styles.identity}>
        <IconCircle
          icon={asFeather(group.icon, 'credit-card')}
          size={layout.avatarSize}
          color={group.color}
          bg={alpha(group.color, 20)}
          style={styles.tile}
        />
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>{group.name}</Text>
          <View style={styles.members}>
            <AvatarStack people={members} size={20} max={4} ringColor={colors.bgCard} />
            <Text style={styles.membersText}>
              {members.length} member{members.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      </View>

      <Divider indent="none" />

      {/* `minHeight` is pinned so the card is the same height in all three states —
          otherwise the tabs below it shift when a group settles up. */}
      <View style={[styles.balance, { backgroundColor: settled ? alpha(colors.settle, 8) : ov.direction === 'owe' ? colors.expenseTint : colors.incomeTint }]}>
        {settled ? (
          <>
            <Feather name="check-circle" size={18} color={colors.settle} />
            {/* Said out loud rather than left blank: absence alone isn't feedback (§2). */}
            <Text style={styles.settledText}>All settled up</Text>
          </>
        ) : (
          <>
            <View style={styles.balanceText}>
              <Text style={[styles.eyebrow, { color: ov.color }]}>
                {ov.direction === 'owe' ? 'YOU OWE' : "YOU'RE OWED"}
              </Text>
              <AmountText paise={ov.amount} size="lg" compact forceColor={ov.color} />
            </View>
            {settleWith && (
              <SecondaryButton
                size="sm"
                fit
                label="Settle up"
                onPress={() => onSettle(settleWith.id)}
              />
            )}
          </>
        )}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { marginHorizontal: layout.screenPaddingH, marginBottom: space.sm },

  identity: {
    flexDirection: 'row', alignItems: 'center', gap: space.smd,
    paddingHorizontal: space.md, paddingVertical: space.smd,
  },
  // The one override on IconCircle: a group's icon reads as an app tile, not a
  // person's avatar, so it keeps the squircle instead of becoming a disc.
  tile: { borderRadius: radius.lg },
  identityText: { flex: 1, minWidth: 0 },
  name: { ...type.subheading, color: colors.textPrimary },
  members: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  membersText: { ...type.caption, color: colors.textMuted },

  balance: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.md, paddingVertical: space.sm,
    minHeight: layout.rowMinHeight,
  },
  balanceText: { flex: 1, minWidth: 0 },
  eyebrow: { ...type.sectionLabel },
  settledText: { ...type.bodySemi, color: colors.settle },
});
