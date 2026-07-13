import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, type, space, radius, shadow, layout } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { oweView } from '../../../lib/owe';
import { MemberAvatar } from '../MemberAvatar';
import { AvatarStack } from '../AvatarStack';
import { BalanceRow } from '../BalanceRow';
import { EmptyState } from '../../ui/EmptyState';
import type { Person } from '../../../db/queries/persons';

type Settle = { from: string; to: string; amount: number };

type Props = {
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
  groupName: string;
};

/** Group Members tab: balances summary, collapsible member list, invite, simplify
 *  toggle, and the settlement (who-owes-whom) list. Owns the expand state. */
export function MembersTab({ members, net, meId, totalSpent, settlements, personMap, simplifyOn, onToggleSimplify, onInvite, onSettlePair, groupName }: Props) {
  const [membersExpanded, setMembersExpanded] = useState(false);
  const myNet = net[meId] ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.listContent}>
      {/* GROUP BALANCES summary */}
      <View style={styles.groupBalCard}>
        <View style={styles.groupBalItem}>
          <Text style={styles.groupBalLabel}>Total spent</Text>
          <Text style={styles.groupBalAmt}>{formatCompact(totalSpent)}</Text>
        </View>
        <View style={styles.groupBalDivider} />
        <View style={styles.groupBalItem}>
          <Text style={styles.groupBalLabel}>Your balance</Text>
          <Text style={[styles.groupBalAmt, { color: myNet > 0 ? colors.income : myNet < 0 ? colors.expense : colors.textMuted }]}>
            {myNet > 0 ? `+${formatCompact(myNet)}` : myNet < 0 ? `−${formatCompact(-myNet)}` : '—'}
          </Text>
        </View>
      </View>

      {/* Member list — collapsed by default */}
      <TouchableOpacity
        style={styles.membersHeader}
        onPress={() => setMembersExpanded(e => !e)}
        accessibilityRole="button"
        accessibilityLabel={`${members.length} members, ${membersExpanded ? 'collapse' : 'expand'}`}
      >
        <AvatarStack people={members} size={24} max={5} ringColor={colors.bg} />
        <Text style={styles.membersHeaderText}>{members.length} member{members.length > 1 ? 's' : ''}</Text>
        <Feather name={membersExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {membersExpanded && (
        <View style={styles.card}>
          {members.map((m, mi) => {
            const v = net[m.id] ?? 0;
            const ov = oweView(v);
            const isLargest = v > 0 && members.every(o => o.id === m.id || (net[o.id] ?? 0) <= v);
            const sub = isLargest && !m.is_me
              ? 'Largest contributor'
              : m.joined_at ? `Joined ${format(m.joined_at, 'MMM yyyy')}` : '';
            const balLabel = v > 0 ? 'is owed' : v < 0 ? (m.is_me ? 'you owe' : 'owes') : 'settled';
            return (
              <View key={m.id} style={[styles.memberRow, mi < members.length - 1 && styles.rowBorder]}>
                <MemberAvatar name={m.name} color={m.avatar_color} size={44} imageUri={m.image_uri} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.name}{m.is_me ? <Text style={styles.youTag}> (you)</Text> : null}
                  </Text>
                  {!!sub && <Text style={styles.memberSub} numberOfLines={1}>{sub}</Text>}
                </View>
                <View style={styles.memberRight}>
                  <Text style={[styles.memberBal, { color: ov.color }]}>{v === 0 ? '₹0' : `${ov.sign}${formatCompact(ov.amount)}`}</Text>
                  <Text style={styles.memberBalLabel}>{balLabel}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <TouchableOpacity style={styles.inviteBtn} onPress={onInvite} accessibilityRole="button">
        <Feather name="user-plus" size={16} color={colors.accent} />
        <Text style={styles.inviteBtnText}>Invite someone</Text>
      </TouchableOpacity>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Simplify debts</Text>
          <Text style={styles.toggleSub}>{simplifyOn ? 'Fewest possible payments' : 'Show every direct debt'}</Text>
        </View>
        <Switch
          value={simplifyOn}
          onValueChange={onToggleSimplify}
          trackColor={{ true: colors.accent, false: colors.bgMuted }}
          thumbColor={colors.textPrimary}
          accessibilityLabel="Simplify debts"
        />
      </View>

      {settlements.length > 0 ? (
        <>
          <Text style={styles.balSectionLabel}>{settlements.length} payment{settlements.length > 1 ? 's' : ''} to settle</Text>
          <View style={styles.card}>
            {settlements.map((s, i) => {
              const fromPerson = personMap.get(s.from);
              const toPerson = personMap.get(s.to);
              if (!fromPerson || !toPerson) return null;
              return (
                <View key={`${s.from}-${s.to}-${i}`} style={[styles.balanceRowWrap, i < settlements.length - 1 && styles.rowBorder]}>
                  <BalanceRow from={fromPerson} to={toPerson} amount={s.amount} onPaid={() => onSettlePair(s.from, s.to, s.amount)} />
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <EmptyState icon="check-circle" title="All settled up" body={`No outstanding balances in ${groupName}.`} tint={colors.income} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: layout.screenPaddingH, paddingBottom: 100, gap: space.sm },
  groupBalCard: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: space.md, ...shadow.sm },
  groupBalItem: { flex: 1, alignItems: 'center', paddingVertical: space.md, gap: 3 },
  groupBalDivider: { width: 1, backgroundColor: colors.border, marginVertical: space.sm },
  groupBalLabel: { ...type.caption, color: colors.textMuted },
  groupBalAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 18, color: colors.textPrimary },
  membersHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space.sm + 2, paddingHorizontal: space.md, marginBottom: space.sm },
  membersHeaderText: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm, marginBottom: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  memberName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  youTag: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  memberSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  memberRight: { alignItems: 'flex-end' },
  memberBal: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, letterSpacing: -0.5 },
  memberBalLabel: { ...type.caption, color: colors.textMuted, fontSize: 10, marginTop: 1 },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: space.md, marginBottom: space.md },
  inviteBtnText: { ...type.body, color: colors.accent },
  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.md, ...shadow.sm },
  toggleTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  toggleSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  balSectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: space.sm, marginTop: space.xs },
  balanceRowWrap: { paddingHorizontal: space.md },
});
