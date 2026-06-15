import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { MemberAvatar } from '../../src/components/MemberAvatar';
import { getTxnById, softDeleteTxn } from '../../src/db/queries/transactions';
import { getGroupById } from '../../src/db/queries/groups';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getAuditLog } from '../../src/db/queries/audit';
import { categoryVisual } from '../../src/constants/categories';
import { formatRupees } from '../../src/lib/money';
import { haptic } from '../../src/lib/haptics';
import type { TxnWithSplits } from '../../src/db/queries/transactions';
import type { Person } from '../../src/db/queries/persons';
import type { AuditLog, AuditAction } from '../../src/db/queries/audit';

const ACTION_META: Record<AuditAction, { icon: keyof typeof Feather.glyphMap; color: string; label: string }> = {
  created:  { icon: 'plus-circle', color: colors.income, label: 'Added' },
  updated:  { icon: 'edit-2', color: colors.accent, label: 'Edited' },
  deleted:  { icon: 'trash-2', color: colors.expense, label: 'Deleted' },
  settled:  { icon: 'check-circle', color: colors.settle, label: 'Settled' },
  paused:   { icon: 'pause-circle', color: colors.healthAmber, label: 'Paused' },
  resumed:  { icon: 'play-circle', color: colors.income, label: 'Resumed' },
  ended:    { icon: 'x-circle', color: colors.textMuted, label: 'Ended' },
};

export default function TxnDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [txn, setTxn] = useState<TxnWithSplits | null>(null);
  const [members, setMembers] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [groupName, setGroupName] = useState('');
  const [history, setHistory] = useState<AuditLog[]>([]);

  useFocusEffect(useCallback(() => { load(); }, [id]));

  async function load() {
    const t = await getTxnById(db, id);
    setTxn(t);
    if (!t) return;
    const [grp, mems, meRow, hist] = await Promise.all([
      getGroupById(db, t.group_id),
      getGroupMembers(db, t.group_id),
      getMe(db),
      getAuditLog(db, { entityId: id }),
    ]);
    setGroupName(grp?.name ?? '');
    setMembers(mems);
    setMe(meRow);
    setHistory(hist);
  }

  if (!txn) return <View style={styles.container}><ScreenHeader title="Transaction" onBack={() => router.back()} /></View>;

  const nameOf = (pid: string) => members.find(m => m.id === pid)?.name ?? 'Someone';
  const vis = categoryVisual(txn.category);
  const total = txn.payments.reduce((s, p) => s + p.amount, 0);
  const isSettlement = txn.kind === 'settlement';
  const isIncome = txn.kind === 'income';
  const kindColor = isIncome ? colors.income : isSettlement ? colors.settle : colors.expense;
  const kindLabel = isSettlement
    ? (txn.category === 'Transfer' ? 'Transfer' : 'Settlement')
    : isIncome ? 'Income' : 'Expense';

  function onDelete() {
    Alert.alert('Delete transaction?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await softDeleteTxn(db, id); haptic.warning(); router.back(); } },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Transaction"
        onBack={() => router.back()}
        right={!isSettlement ? (
          <TouchableOpacity onPress={() => router.push(`/add/quick?editId=${id}&groupId=${txn.group_id}`)} hitSlop={10} accessibilityLabel="Edit">
            <Feather name="edit-2" size={18} color={colors.accent} />
          </TouchableOpacity>
        ) : undefined}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.iconDot, { backgroundColor: vis.color + '22' }]}>
            <Feather name={vis.icon as any} size={24} color={vis.color} />
          </View>
          <Text style={styles.heroAmount}>{formatRupees(total)}</Text>
          <View style={styles.kindRow}>
            <View style={[styles.kindBadge, { backgroundColor: kindColor + '22' }]}>
              <Text style={[styles.kindText, { color: kindColor }]}>{kindLabel}</Text>
            </View>
            <Text style={styles.heroCat}>{txn.category}</Text>
          </View>
          {!!txn.note && <Text style={styles.heroNote}>{txn.note}</Text>}
        </View>

        {/* Meta */}
        <View style={styles.card}>
          <Row label="When" value={format(new Date(txn.date), 'dd MMM yyyy · h:mm a')} />
          <View style={styles.divider} />
          <Row label="Group" value={groupName} />
          <View style={styles.divider} />
          <Row label="Added by" value={me?.name ? `${me.name} (you)` : 'You'} />
          {!!txn.place_label && (<><View style={styles.divider} /><Row label="Location" value={txn.place_label} /></>)}
        </View>

        {/* Paid by */}
        {txn.payments.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{isSettlement ? 'From' : 'Paid by'}</Text>
            <View style={styles.card}>
              {txn.payments.map((p, i) => (
                <View key={p.personId} style={[styles.personRow, i < txn.payments.length - 1 && styles.divider]}>
                  <MemberAvatar name={nameOf(p.personId)} color={members.find(m => m.id === p.personId)?.avatar_color ?? colors.accent} size={32} />
                  <Text style={styles.personName} numberOfLines={1}>{nameOf(p.personId)}</Text>
                  <Text style={styles.personAmt}>{formatRupees(p.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Split / To */}
        {txn.shares.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{isSettlement ? 'To' : 'Split between'}</Text>
            <View style={styles.card}>
              {txn.shares.map((s, i) => (
                <View key={s.personId} style={[styles.personRow, i < txn.shares.length - 1 && styles.divider]}>
                  <MemberAvatar name={nameOf(s.personId)} color={members.find(m => m.id === s.personId)?.avatar_color ?? colors.accent} size={32} />
                  <Text style={styles.personName} numberOfLines={1}>{nameOf(s.personId)}</Text>
                  <Text style={styles.personAmt}>{formatRupees(s.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* History */}
        <Text style={styles.sectionLabel}>History</Text>
        <View style={styles.card}>
          {history.length === 0 ? (
            <Text style={styles.emptyHistory}>No changes recorded.</Text>
          ) : history.map((h, i) => {
            const meta = ACTION_META[h.action] ?? ACTION_META.updated;
            return (
              <View key={h.id} style={[styles.histRow, i < history.length - 1 && styles.divider]}>
                <View style={[styles.histIcon, { backgroundColor: meta.color + '22' }]}>
                  <Feather name={meta.icon} size={13} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histText}>{h.summary}</Text>
                  <Text style={styles.histTime}>{format(new Date(h.created_at), 'dd MMM yyyy · h:mm a')}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {!isSettlement && (
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} accessibilityRole="button">
            <Feather name="trash-2" size={16} color={colors.expense} />
            <Text style={styles.deleteText}>Delete transaction</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: 60 },
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.md },
  iconDot: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  heroAmount: { ...type.amountXL, color: colors.textPrimary },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kindBadge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  kindText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  heroCat: { ...type.body, color: colors.textSecondary },
  heroNote: { ...type.body, color: colors.textPrimary, textAlign: 'center', marginTop: space.xs },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  metaLabel: { ...type.label, color: colors.textSecondary },
  metaValue: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.xs },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  personName: { ...type.body, color: colors.textPrimary, flex: 1 },
  personAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  histIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  histText: { ...type.label, color: colors.textPrimary },
  histTime: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  emptyHistory: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.md },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  deleteText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
});
