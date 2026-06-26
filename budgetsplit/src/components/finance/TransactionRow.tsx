import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { AmountText } from '../ui/AmountText';
import { colors, type, space } from '../tokens';
import { formatRupees, formatCompact } from '../../lib/money';
import { categoryVisual } from '../../constants/categories';
import type { TxnWithSplits } from '../../db/queries/transactions';
import type { Person } from '../../db/queries/persons';

type Props = {
  txn: TxnWithSplits;
  myId: string;
  onPress?: () => void;
  onDelete?: () => void;
  showDate?: boolean;
  members?: Person[];
  isPersonal?: boolean;
  /** Muted group label shown under the primary line — for cross-group lists. */
  groupName?: string;
  /** Highlight this substring (case-insensitive) inside the primary text. */
  highlight?: string;
};

function highlightParts(title: string, term: string): { text: string; hit: boolean }[] {
  const q = term.trim();
  if (!q) return [{ text: title, hit: false }];
  const lower = title.toLowerCase();
  const ql = q.toLowerCase();
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  while (i < title.length) {
    const idx = lower.indexOf(ql, i);
    if (idx < 0) { out.push({ text: title.slice(i), hit: false }); break; }
    if (idx > i) out.push({ text: title.slice(i, idx), hit: false });
    out.push({ text: title.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return out;
}

export const TransactionRow = React.memo(function TransactionRow({
  txn, myId, onPress, onDelete, showDate = false, members, isPersonal, groupName, highlight,
}: Props) {
  const myShare = txn.shares.find(s => s.personId === myId)?.amount ?? 0;
  const nameOf = (pid?: string) => members?.find(m => m.id === pid)?.name ?? 'Someone';

  // Determine display amount and settlement title.
  let settlementTitle: string | null = null;
  let displayAmount: number;
  if (txn.kind === 'income') {
    displayAmount = txn.payments.find(p => p.personId === myId)?.amount ?? 0;
  } else if (txn.kind === 'settlement') {
    const fromId = txn.payments[0]?.personId;
    const toId = txn.shares[0]?.personId;
    const amount = txn.payments[0]?.amount ?? 0;
    const iPaid = fromId === myId;
    const iGot = toId === myId;
    displayAmount = iPaid ? -amount : amount;
    if (members && !isPersonal) {
      settlementTitle = iPaid
        ? `You paid ${nameOf(toId)}`
        : iGot
        ? `${nameOf(fromId)} paid you`
        : `${nameOf(fromId)} paid ${nameOf(toId)}`;
    }
  } else {
    displayAmount = -myShare;
  }

  const visual = txn.kind === 'income'
    ? { icon: 'trending-up' as const, color: colors.income }
    : txn.kind === 'settlement'
    ? { icon: 'check-circle' as const, color: colors.settle }
    : categoryVisual(txn.category);

  // Attribution — shown on the RIGHT side below the amount.
  let attribution: { text: string; color: string } | null = null;
  if (members && !isPersonal && txn.kind === 'expense') {
    const myPaid = txn.payments.find(p => p.personId === myId)?.amount ?? 0;
    const lent = myPaid - myShare;
    if (lent > 0) {
      attribution = { text: `lent ${formatCompact(lent)}`, color: colors.income };
    } else if (lent < 0) {
      attribution = { text: `borrowed ${formatCompact(-lent)}`, color: colors.expense };
    }
  }

  const hasAttachment = !!txn.attachment_uri;

  // Display hierarchy:
  // If there's a note (user typed a title/note), that's the primary line.
  // Category goes below as secondary — helps scan by recognizable names.
  // Settlements always show the directional sentence as primary.
  // If no note, category is primary (nothing below).
  const note = txn.note?.trim();
  const primaryText = settlementTitle ?? (note || txn.category);
  const secondaryText = !settlementTitle && note ? txn.category : null;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      onLongPress={onDelete}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${primaryText}: ${formatRupees(Math.abs(displayAmount))}`}
    >
      <View style={[styles.iconCircle, { backgroundColor: visual.color + '22' }]}>
        <Feather name={visual.icon} size={18} color={visual.color} />
      </View>

      <View style={styles.middle}>
        {/* Primary line: note/title + attachment icon */}
        <View style={styles.primaryLine}>
          <Text style={styles.primary} numberOfLines={1}>
            {highlight
              ? highlightParts(primaryText, highlight).map((p, i) => (
                  <Text key={i} style={p.hit ? styles.hl : undefined}>{p.text}</Text>
                ))
              : primaryText}
          </Text>
          {hasAttachment && (
            <Feather name="paperclip" size={11} color={colors.textMuted} style={styles.clipIcon} />
          )}
        </View>

        {/* Secondary line: category (only when note is primary) */}
        {secondaryText ? (
          <Text style={styles.secondary} numberOfLines={1}>{secondaryText}</Text>
        ) : null}

        {/* Group chip — cross-group list context */}
        {groupName ? (
          <View style={styles.groupChip}>
            <Feather name="users" size={10} color={colors.textMuted} />
            <Text style={styles.groupText} numberOfLines={1}>{groupName}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.right}>
        <AmountText paise={displayAmount} size="sm" />
        {/* Lending/borrowing info below amount */}
        {attribution ? (
          <Text style={[styles.attribution, { color: attribution.color }]} numberOfLines={1}>
            {attribution.text}
          </Text>
        ) : null}
        {/* Date (cross-group list) */}
        {showDate && Number.isFinite(txn.date) ? (
          <Text style={styles.date}>{format(new Date(txn.date), 'd MMM')}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    minHeight: 64,
    gap: space.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  middle: {
    flex: 1,
    minWidth: 0,
  },
  primaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  primary: {
    ...type.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  clipIcon: {
    flexShrink: 0,
  },
  secondary: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  hl: {
    color: colors.accent,
    fontFamily: 'Inter_600SemiBold',
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  groupText: {
    ...type.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  attribution: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  date: {
    ...type.caption,
    color: colors.textMuted,
  },
});
