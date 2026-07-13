import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Image, Modal, useWindowDimensions, Platform, ActionSheetIOS } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useScreenData } from '../../src/hooks/useScreenData';
import { format } from 'date-fns';
import { PAY_METHOD_LABEL } from '../../src/constants/enums';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { getTxnById, softDeleteTxn, restoreTxn, getLineItems, setTxnAttachment } from '../../src/db/queries/transactions';
import { pickAttachment, deleteAttachment, AttachmentStorageError } from '../../src/lib/attachment';
import { useUndo } from '../../src/components/system/UndoToast';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { getGroupById } from '../../src/db/queries/groups';
import { getGroupMembers, getMe } from '../../src/db/queries/persons';
import { getAuditLog } from '../../src/db/queries/audit';
import { categoryVisual } from '../../src/constants/categories';
import { formatRupees } from '../../src/lib/money';
import { haptic } from '../../src/lib/haptics';
import type { TxnWithSplits, LineItem } from '../../src/db/queries/transactions';
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

type TxnDetailData = {
  txn: TxnWithSplits | null;
  members: Person[];
  me: Person | null;
  groupName: string;
  isPersonal: boolean;
  history: AuditLog[];
  items: LineItem[];
  parentRule: TxnWithSplits | null;
};

export default function TxnDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useUndo();
  const { refresh } = useDataRefresh();
  const [showAttachment, setShowAttachment] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();

  const { data, loading, error, reload } = useScreenData(async (database): Promise<TxnDetailData> => {
    const t = await getTxnById(database, id);
    if (!t) {
      return { txn: null, members: [], me: null, groupName: '', isPersonal: false, history: [], items: [], parentRule: null };
    }
    const [grp, mems, meRow, hist, li] = await Promise.all([
      getGroupById(database, t.group_id),
      getGroupMembers(database, t.group_id),
      getMe(database),
      getAuditLog(database, { entityId: id }),
      t.entry_mode === 'itemized' ? getLineItems(database, id) : Promise.resolve([]),
    ]);
    const parentRule = t.parent_recur_id ? await getTxnById(database, t.parent_recur_id) : null;
    return {
      txn: t,
      members: mems,
      me: meRow,
      groupName: grp?.name ?? '',
      isPersonal: grp?.is_personal === 1,
      history: hist,
      items: li,
      parentRule,
    };
  }, [id]);

  const txn = data?.txn ?? null;
  const members = data?.members ?? [];
  const me = data?.me ?? null;
  const groupName = data?.groupName ?? '';
  const isPersonal = data?.isPersonal ?? false;
  const history = data?.history ?? [];
  const items = data?.items ?? [];
  const parentRule = data?.parentRule ?? null;

  // No id → nothing to show; bounce back (kept as an effect so hooks above still run).
  useEffect(() => { if (!id) router.back(); }, [id, router]);

  if (!id) return null;

  async function attachReceipt(source: 'camera' | 'gallery') {
    try {
      const uri = await pickAttachment(source);
      if (!uri) return;
      // Replacing an existing receipt → remove the old file from disk first.
      if (txn?.attachment_uri) await deleteAttachment(txn.attachment_uri);
      await setTxnAttachment(db, id, uri);
      haptic.success();
      await reload();
    } catch (e) {
      if (e instanceof AttachmentStorageError) {
        Alert.alert('Low on storage', 'Your device is low on storage. Free up space and try again.');
      } else {
        Alert.alert('Something went wrong', 'Could not attach the receipt.');
      }
    }
  }

  function chooseReceiptSource() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take photo', 'Choose from library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) attachReceipt('camera'); if (i === 2) attachReceipt('gallery'); },
      );
    } else {
      attachReceipt('camera');
    }
  }

  function removeReceipt() {
    if (!txn?.attachment_uri) return;
    Alert.alert('Remove receipt?', 'The photo will be deleted from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const old = txn.attachment_uri;
          await setTxnAttachment(db, id, null);
          if (old) await deleteAttachment(old);
          haptic.warning();
          setShowAttachment(false);
          await reload();
        },
      },
    ]);
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Transaction" onBack={() => router.back()} />
        <ErrorState onRetry={reload} />
      </View>
    );
  }

  // Loaded but no row → it was deleted/settled (e.g. opened from a stale list).
  if (!loading && !error && txn == null) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Transaction" onBack={() => router.back()} />
        <EmptyState
          icon="file-minus"
          title="Transaction not found"
          body="It may have been deleted or settled. It's no longer available to view."
          actionLabel="Go back"
          onAction={() => router.back()}
          tint={colors.textSecondary}
        />
      </View>
    );
  }
  if (!txn) return <View style={styles.container}><ScreenHeader title="Transaction" onBack={() => router.back()} /></View>;

  const nameOf = (pid: string) => members.find(m => m.id === pid)?.name ?? 'Someone';
  const imageOf = (pid: string) => members.find(m => m.id === pid)?.image_uri ?? null;
  const vis = categoryVisual(txn.category);
  const total = txn.payments.reduce((s, p) => s + p.amount, 0);
  const isSettlement = txn.kind === 'settlement';
  const isIncome = txn.kind === 'income';
  const isItemized = txn.entry_mode === 'itemized';
  // Materialized recurring occurrences are read-only — manage the series from
  // the Recurring screen instead.
  const canEdit = !txn.parent_recur_id;
  const editHref = isItemized
    ? `/add/itemized?editId=${id}`
    : isSettlement
    ? `/add/quick?kind=transfer&editId=${id}`
    : `/add/quick?editId=${id}&groupId=${txn.group_id}`;
  const kindColor = isIncome ? colors.income : isSettlement ? colors.settle : colors.expense;
  const kindLabel = isSettlement
    ? (txn.category === 'Transfer' ? 'Transfer' : 'Settlement')
    : isIncome ? 'Income' : 'Expense';

  function onDelete() {
    Alert.alert('Delete transaction?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await softDeleteTxn(db, id);
          refresh();
          haptic.warning();
          showUndo({
            message: 'Transaction deleted',
            onUndo: async () => { try { await restoreTxn(db, id); refresh(); haptic.success(); } catch { /* ignore */ } },
          });
          router.back();
        } catch {
          haptic.error();
          Alert.alert('Something went wrong', 'Please try again.');
        }
      } },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Transaction"
        onBack={() => router.back()}
        right={canEdit ? (
          <TouchableOpacity onPress={() => router.push(editHref as never)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit">
            <Feather name="edit-2" size={18} color={colors.accent} />
          </TouchableOpacity>
        ) : undefined}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.iconDot, { backgroundColor: vis.color + '22' }]}>
            <Feather name={vis.icon} size={24} color={vis.color} />
          </View>
          <Text style={styles.heroAmount}>{formatRupees(total)}</Text>
          <View style={styles.kindRow}>
            <View style={[styles.kindBadge, { backgroundColor: kindColor + '22' }]}>
              <Text style={[styles.kindText, { color: kindColor }]}>{kindLabel}</Text>
            </View>
            <Text style={styles.heroCat}>{txn.category}</Text>
          </View>
          {!!txn.note && <Text style={styles.heroNote}>{txn.note}</Text>}
          {/* Cash vs consumption: what you paid out of pocket vs your share. */}
          {!isPersonal && !isIncome && !isSettlement && (() => {
            const myPaid = txn.payments.find(p => p.personId === me?.id)?.amount ?? 0;
            const myShare = txn.shares.find(s => s.personId === me?.id)?.amount ?? 0;
            if (myPaid === myShare) return null;
            return <Text style={styles.heroCashLine}>You paid {formatRupees(myPaid)} · your share {formatRupees(myShare)}</Text>;
          })()}
        </View>

        {/* Meta */}
        <View style={styles.card}>
          <Row label="When" value={(() => { const d = new Date(txn.date); return isFinite(d.getTime()) ? format(d, 'dd MMM yyyy · h:mm a') : '—'; })()} />
          <View style={styles.divider} />
          <Row label="Group" value={groupName} />
          {txn.pay_method && (
            <>
              <View style={styles.divider} />
              <Row label="Paid via" value={PAY_METHOD_LABEL[txn.pay_method]} />
            </>
          )}
          {/* "Added by" is shared-group attribution — meaningless in the solo ledger. */}
          {!isPersonal && (
            <>
              <View style={styles.divider} />
              <Row label="Added by" value={me?.name ? `${me.name} (you)` : 'You'} />
            </>
          )}
          {!!txn.parent_recur_id && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.recurRow}
                onPress={() => router.push(`/group/${parentRule?.group_id ?? txn.group_id}/recurring?focus=${txn.parent_recur_id}`)}
                accessibilityRole="button"
                accessibilityLabel="View the recurring schedule that created this"
              >
                <Text style={styles.metaLabel}>Recurring</Text>
                <View style={styles.recurValue}>
                  <Feather name="repeat" size={13} color={colors.accent} />
                  <Text style={styles.recurText} numberOfLines={1}>
                    {parentRule
                      ? `Schedule started ${format(new Date(parentRule.date), 'dd MMM yyyy')}`
                      : `Created by recurring schedule`}
                  </Text>
                  <Feather name="chevron-right" size={15} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            </>
          )}
          {!!txn.place_label && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.locationRow}
                disabled={!txn.lat || !txn.lng}
                onPress={() => txn.lat && txn.lng && Linking.openURL(`maps://?ll=${txn.lat},${txn.lng}&q=${encodeURIComponent(txn.place_label ?? '')}`)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${txn.place_label} in Maps`}
              >
                <Feather name="map-pin" size={14} color={txn.lat != null && txn.lng != null ? colors.accent : colors.textSecondary} />
                <Text style={[styles.locationText, txn.lat != null && txn.lng != null ? { color: colors.accent } : null]}>{txn.place_label}</Text>
                {txn.lat != null && txn.lng != null && <Feather name="external-link" size={12} color={colors.accent} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Receipt — preview when present, attach CTA otherwise. Not for settlements. */}
        {!isSettlement && (
        <>
        <Text style={styles.receiptLabel}>RECEIPT</Text>
        {txn.attachment_uri ? (
          <>
            <TouchableOpacity style={styles.attachCard} onPress={() => setShowAttachment(true)} accessibilityLabel="View receipt">
              <Image source={{ uri: txn.attachment_uri }} style={styles.attachThumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.attachLabel}>Receipt attached</Text>
                <Text style={styles.attachHint}>Tap to view full size</Text>
              </View>
              <Feather name="maximize-2" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={styles.receiptActions}>
              <TouchableOpacity style={styles.receiptBtn} onPress={chooseReceiptSource} accessibilityRole="button">
                <Feather name="refresh-cw" size={14} color={colors.accent} />
                <Text style={styles.receiptBtnText}>Replace</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.receiptBtn} onPress={removeReceipt} accessibilityRole="button">
                <Feather name="trash-2" size={14} color={colors.expense} />
                <Text style={[styles.receiptBtnText, { color: colors.expense }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity style={styles.attachAddCard} onPress={chooseReceiptSource} accessibilityRole="button" accessibilityLabel="Add receipt">
            <View style={styles.attachAddIcon}>
              <Feather name="camera" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.attachAddTitle}>Add receipt</Text>
              <Text style={styles.attachHint}>Camera · Photo library</Text>
            </View>
            <Feather name="plus" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        </>
        )}

        {/* Split summary — who paid, then who owes — one card, not two forms. */}
        {!isPersonal && (txn.payments.length > 0 || txn.shares.length > 0) && (() => {
          const colorOf = (id: string) => members.find(m => m.id === id)?.avatar_color ?? colors.accent;

          if (isSettlement) {
            const from = txn.payments[0];
            const to = txn.shares[0];
            if (!from || !to) return null;
            return (
              <View style={styles.card}>
                <View style={styles.settleFlow}>
                  <MemberAvatar name={nameOf(from.personId)} color={colorOf(from.personId)} size={30} imageUri={imageOf(from.personId)} />
                  <Text style={styles.settleName} numberOfLines={1}>{nameOf(from.personId)}</Text>
                  <Feather name="arrow-right" size={16} color={colors.settle} />
                  <MemberAvatar name={nameOf(to.personId)} color={colorOf(to.personId)} size={30} imageUri={imageOf(to.personId)} />
                  <Text style={styles.settleName} numberOfLines={1}>{nameOf(to.personId)}</Text>
                  <Text style={styles.settleAmt}>{formatRupees(from.amount)}</Text>
                </View>
              </View>
            );
          }

          // Net per person = paid − share. Payers shown as "paid"; negatives "owe".
          const paid = new Map<string, number>();
          txn.payments.forEach(p => paid.set(p.personId, (paid.get(p.personId) ?? 0) + p.amount));
          const share = new Map<string, number>();
          txn.shares.forEach(s => share.set(s.personId, (share.get(s.personId) ?? 0) + s.amount));
          const ids = new Set<string>([...paid.keys(), ...share.keys()]);
          const paidRows = [...paid.entries()].filter(([, a]) => a > 0);
          const oweRows = [...ids]
            .map(id => ({ id, net: (paid.get(id) ?? 0) - (share.get(id) ?? 0) }))
            .filter(o => o.net < 0)
            .sort((a, b) => a.net - b.net);

          return (
            <View style={styles.card}>
              {paidRows.map(([id, amt]) => (
                <View key={`paid-${id}`} style={styles.splitPaidRow}>
                  <MemberAvatar name={nameOf(id)} color={colorOf(id)} size={30} imageUri={imageOf(id)} />
                  <Text style={styles.splitPaidName} numberOfLines={1}>
                    <Text style={styles.splitPaidNameBold}>{nameOf(id)}</Text> paid
                  </Text>
                  <Text style={styles.splitPaidAmt}>{formatRupees(amt)}</Text>
                </View>
              ))}
              {oweRows.length > 0 && <View style={styles.divider} />}
              {oweRows.map(o => (
                <View key={`owe-${o.id}`} style={styles.splitOweRow}>
                  <View style={styles.splitConnector} />
                  <MemberAvatar name={nameOf(o.id)} color={colorOf(o.id)} size={22} imageUri={imageOf(o.id)} />
                  <Text style={styles.splitOweName} numberOfLines={1}>{nameOf(o.id)} owes</Text>
                  <Text style={styles.splitOweAmt}>{formatRupees(-o.net)}</Text>
                </View>
              ))}
            </View>
          );
        })()}

        {/* Itemized line items (read-only) */}
        {isItemized && items.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Items</Text>
            <View style={styles.card}>
              {items.map((it, i) => (
                <View key={it.id} style={[styles.personRow, i < items.length - 1 && styles.divider]}>
                  <Text style={styles.personName} numberOfLines={1}>{it.qty > 1 ? `${it.qty} × ` : ''}{it.name}</Text>
                  <Text style={styles.personAmt}>{formatRupees(it.qty * it.unit_price)}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.itemHint}>Tap the edit icon to change items, splits or who paid.</Text>
          </>
        )}

        {/* History */}
        <Text style={styles.sectionLabel}>History</Text>
        <View style={[styles.card, styles.histCard]}>
          {history.length === 0 ? (
            <Text style={styles.emptyHistory}>No changes recorded.</Text>
          ) : history.map((h, i) => {
            const meta = ACTION_META[h.action] ?? ACTION_META.updated;
            const last = i === history.length - 1;
            return (
              <View key={h.id} style={styles.histRow}>
                <View style={styles.histRail}>
                  <View style={[styles.histIcon, { backgroundColor: meta.color + '22' }]}>
                    <Feather name={meta.icon} size={11} color={meta.color} />
                  </View>
                  {!last && <View style={styles.histRailLine} />}
                </View>
                <View style={[styles.histContent, !last && { paddingBottom: space.md }]}>
                  <Text style={styles.histText}>{h.summary}</Text>
                  <Text style={styles.histTime}>{(() => { const d = new Date(h.created_at); return isFinite(d.getTime()) ? format(d, 'dd MMM yyyy · h:mm a') : '—'; })()}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} accessibilityRole="button">
          <Feather name="trash-2" size={16} color={colors.expense} />
          <Text style={styles.deleteText}>Delete {isSettlement ? 'settlement' : 'transaction'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {!!txn.attachment_uri && (
        <Modal visible={showAttachment} transparent animationType="fade" onRequestClose={() => setShowAttachment(false)}>
          <View style={styles.attachOverlay}>
            <TouchableOpacity style={styles.attachClose} onPress={() => setShowAttachment(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={24} color="#fff" />
            </TouchableOpacity>
            <ScrollView
              style={{ width: winW, height: winH }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              contentContainerStyle={styles.attachZoom}
              centerContent
            >
              {/* Explicit pixel size — a percentage height collapses to 0 inside
                  a ScrollView, which left the image invisible. */}
              <Image source={{ uri: txn.attachment_uri }} style={{ width: winW, height: winH }} resizeMode="contain" />
            </ScrollView>
          </View>
        </Modal>
      )}
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
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  hero: { alignItems: 'center', gap: space.xs, paddingVertical: space.md },
  iconDot: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  heroAmount: { ...type.amountXL, color: colors.textPrimary },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kindBadge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  kindText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  heroCat: { ...type.body, color: colors.textSecondary },
  heroNote: { ...type.body, color: colors.textPrimary, textAlign: 'center', marginTop: space.xs },
  heroCashLine: { ...type.caption, color: colors.textSecondary, textAlign: 'center', marginTop: space.sm },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  metaLabel: { ...type.label, color: colors.textSecondary },
  metaValue: { ...type.body, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  recurRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  recurValue: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  recurText: { ...type.body, color: colors.accent, flexShrink: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.md },
  locationText: { ...type.body, color: colors.textPrimary, flex: 1, lineHeight: 20 },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.xs },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  personName: { ...type.body, color: colors.textPrimary, flex: 1 },
  personAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textPrimary },

  // Split summary
  splitPaidRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  splitPaidName: { ...type.body, color: colors.textSecondary, flex: 1 },
  splitPaidNameBold: { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  splitPaidAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, color: colors.textPrimary },
  splitOweRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm + 2, paddingLeft: space.sm },
  splitConnector: { width: 10, height: 1.5, backgroundColor: colors.border, marginRight: space.xs },
  splitOweName: { ...type.body, color: colors.textSecondary, flex: 1 },
  splitOweAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.expense },
  settleFlow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  settleName: { ...type.body, color: colors.textPrimary, flexShrink: 1 },
  settleAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 15, color: colors.settle, marginLeft: 'auto' },

  // History timeline
  histCard: { paddingTop: space.sm, paddingBottom: space.md },
  histRow: { flexDirection: 'row', gap: space.sm },
  histRail: { width: 24, alignItems: 'center', paddingTop: space.sm },
  histIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  histRailLine: { flex: 1, width: 1.5, backgroundColor: colors.border, marginTop: 2 },
  histContent: { flex: 1, paddingTop: space.sm },
  histText: { ...type.label, color: colors.textSecondary },
  histTime: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  emptyHistory: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.md },
  itemHint: { ...type.caption, color: colors.textMuted },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, marginTop: space.sm },
  deleteText: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },

  receiptLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', marginTop: space.xs },
  attachCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  attachThumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.bgMuted },
  attachLabel: { ...type.body, color: colors.textPrimary },
  attachHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  attachAddCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: space.md },
  attachAddIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  attachAddTitle: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  receiptActions: { flexDirection: 'row', gap: space.sm },
  receiptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  receiptBtnText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  attachOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  attachClose: { position: 'absolute', top: 56, right: 20, zIndex: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  attachZoom: { justifyContent: 'center', alignItems: 'center' },
});
