import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Image, Modal, useWindowDimensions } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useScreenData } from '../../src/hooks/useScreenData';
import { dateTime, fullDate } from '../../src/lib/dateFormat';
import { PAY_METHOD_LABEL } from '../../src/constants/enums';
import { myShareOf, myPaidOf, txnTotal } from '../../src/lib/splitMath';
import { colors, type, space, radius, layout, shadow, alpha } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Banner } from '../../src/components/ui/Banner';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';

import { categoryVisual } from '../../src/constants/categories';
import { formatRupees } from '../../src/lib/money';

import type { TxnWithSplits, LineItem } from '../../src/db/queries/transactions';
import type { Person } from '../../src/db/queries/persons';
import type { AuditLog, AuditAction } from '../../src/db/queries/audit';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { useTxnDetail } from '../../src/hooks/useTxnDetail';
import { Chip } from '../../src/components/ui/Chip';
import { parseTags } from '../../src/lib/tags';

const ACTION_META: Record<AuditAction, { icon: keyof typeof Feather.glyphMap; color: string; label: string }> = {
  created:  { icon: 'plus-circle', color: colors.income, label: 'Added' },
  updated:  { icon: 'edit-2', color: colors.accent, label: 'Edited' },
  deleted:  { icon: 'trash-2', color: colors.expense, label: 'Deleted' },
  archived: { icon: 'archive', color: colors.textMuted, label: 'Archived' },
  settled:  { icon: 'check-circle', color: colors.settle, label: 'Settled' },
  paused:   { icon: 'pause-circle', color: colors.healthAmber, label: 'Paused' },
  resumed:  { icon: 'play-circle', color: colors.income, label: 'Resumed' },
  ended:    { icon: 'x-circle', color: colors.textMuted, label: 'Ended' },
};

export default function TxnDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();

  const {
    txn, members, me, groupName, isPersonal, history, items, parentRule,
    loading, error, reload,
    showAttachment, setShowAttachment,
    chooseReceiptSource, removeReceipt, onDelete,
  } = useTxnDetail(id);

  /**
   * Set when the OS fails to decode the attachment — the row points at a file
   * that is no longer on disk. Keyed off the URI so replacing the receipt clears
   * it rather than leaving the card stuck reporting a photo that now exists.
   */
  const [attachmentMissing, setAttachmentMissing] = useState(false);
  useEffect(() => { setAttachmentMissing(false); }, [txn?.attachment_uri]);

  // No id → nothing to show; bounce back (kept as an effect so hooks above still run).
  useEffect(() => { if (!id) router.back(); }, [id, router]);

  if (!id) return null;

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
  const total = txnTotal(txn);
  const tags = parseTags(txn.tags);
  const isSettlement = txn.kind === 'settlement';
  const isIncome = txn.kind === 'income';
  const isItemized = txn.entry_mode === 'itemized';
  // Materialized recurring occurrences are read-only — manage the series from
  // the Recurring screen instead.
  /*
   * An entry someone else wrote and I have not accepted is not mine to edit or
   * delete. Editing it would rewrite their assertion under their name; deleting it
   * would be a reject that leaves no decision behind. Both live on the approvals
   * screen instead, where the choice is Approve or Not mine.
   */
  const isPendingPeer = txn.pendingApproval;
  const canEdit = !txn.parent_recur_id && !isPendingPeer;
  const editHref = isItemized
    ? `/add/itemized?editId=${id}`
    : isSettlement
    ? `/add/quick?kind=transfer&editId=${id}`
    : `/add/quick?editId=${id}&groupId=${txn.group_id}`;
  const kindColor = isIncome ? colors.income : isSettlement ? colors.settle : colors.expense;
  const kindLabel = isSettlement
    ? (txn.category === 'Transfer' ? 'Transfer' : 'Settlement')
    : isIncome ? 'Income' : 'Expense';

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
        {isPendingPeer && (
          <Banner
            tone={colors.healthAmber}
            icon="user-check"
            text="Waiting for you. None of the figures below have been counted yet."
            actionLabel="Decide"
            onAction={() => router.push('/approvals')}
          />
        )}
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.iconDot, { backgroundColor: alpha(vis.color, 13) }]}>
            <Feather name={vis.icon} size={24} color={vis.color} />
          </View>
          <Text style={styles.heroAmount}>{formatRupees(total)}</Text>
          <View style={styles.kindRow}>
            <View style={[styles.kindBadge, { backgroundColor: alpha(kindColor, 13) }]}>
              <Text style={[styles.kindText, { color: kindColor }]}>{kindLabel}</Text>
            </View>
            <Text style={styles.heroCat}>{txn.category}</Text>
          </View>
          {!!txn.note && <Text style={styles.heroNote}>{txn.note}</Text>}
          {/* Read-only here: tags are edited on the Add/Edit screen, and this is a detail
              view. Shown at all because storing something the user typed and never
              displaying it back is the same as not storing it. */}
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map(t => (
                <Chip key={t} label={t} icon="hash" maxWidth={160} />
              ))}
            </View>
          )}
          {/* Cash vs consumption: what you paid out of pocket vs your share. */}
          {!isPersonal && !isIncome && !isSettlement && (() => {
            const myPaid = myPaidOf(txn, me?.id ?? '');
            const myShare = myShareOf(txn, me?.id ?? '');
            if (myPaid === myShare) return null;
            return <Text style={styles.heroCashLine}>You paid {formatRupees(myPaid)} · your share {formatRupees(myShare)}</Text>;
          })()}
        </View>

        {/* Meta */}
        <View style={styles.card}>
          <Row label="When" value={(() => { const d = new Date(txn.date); return isFinite(d.getTime()) ? dateTime(d) : '—'; })()} />
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
                      ? `Schedule started ${fullDate(new Date(parentRule.date))}`
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
            {/* A photo file can be gone while the row still points at it — a restore
                from a rows-only backup lands exactly here, and so does a user who
                cleared photos from Storage. Without `onError` this card announced
                "Receipt attached" over a blank square, which is the one thing it
                must not do: it is the only signal that the receipt still exists. */}
            <TouchableOpacity
              style={styles.attachCard}
              onPress={() => { if (!attachmentMissing) setShowAttachment(true); }}
              disabled={attachmentMissing}
              accessibilityLabel={attachmentMissing ? 'Receipt file is missing' : 'View receipt'}
            >
              {attachmentMissing ? (
                <View style={[styles.attachThumb, styles.attachThumbGone]}>
                  <Feather name="image" size={16} color={colors.textMuted} />
                </View>
              ) : (
                <Image
                  source={{ uri: txn.attachment_uri }}
                  style={styles.attachThumb}
                  onError={() => setAttachmentMissing(true)}
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.attachLabel}>
                  {attachmentMissing ? 'Receipt photo missing' : 'Receipt attached'}
                </Text>
                <Text style={styles.attachHint}>
                  {attachmentMissing
                    ? 'The file is no longer on this device. Attach it again below.'
                    : 'Tap to view full size'}
                </Text>
              </View>
              {!attachmentMissing && <Feather name="maximize-2" size={16} color={colors.textMuted} />}
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
            <IconCircle icon="camera" size={40} iconSize={18} color={colors.accent} bg={colors.accentMuted} />
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
                  <View style={[styles.histIcon, { backgroundColor: alpha(meta.color, 13) }]}>
                    <Feather name={meta.icon} size={11} color={meta.color} />
                  </View>
                  {!last && <View style={styles.histRailLine} />}
                </View>
                <View style={[styles.histContent, !last && { paddingBottom: space.md }]}>
                  <Text style={styles.histText}>{h.summary}</Text>
                  <Text style={styles.histTime}>{(() => { const d = new Date(h.created_at); return isFinite(d.getTime()) ? dateTime(d) : '—'; })()}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {!isPendingPeer && (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} accessibilityRole="button">
          <Feather name="trash-2" size={16} color={colors.expense} />
          <Text style={styles.deleteText}>Delete {isSettlement ? 'settlement' : 'transaction'}</Text>
        </TouchableOpacity>
        )}
      </ScrollView>

      {!!txn.attachment_uri && (
        <Modal visible={showAttachment} transparent animationType="fade" onRequestClose={() => setShowAttachment(false)}>
          <View style={styles.attachOverlay}>
            <TouchableOpacity style={styles.attachClose} onPress={() => setShowAttachment(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={24} color={colors.onAccent} />
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
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md, justifyContent: 'center' },
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
  splitOweRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.smd, paddingLeft: space.sm },
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
  attachThumbGone: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  attachLabel: { ...type.body, color: colors.textPrimary },
  attachHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  attachAddCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: space.md },
  attachAddTitle: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  receiptActions: { flexDirection: 'row', gap: space.sm },
  receiptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgCard },
  receiptBtnText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  attachOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  attachClose: { position: 'absolute', top: 56, right: 20, zIndex: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  attachZoom: { justifyContent: 'center', alignItems: 'center' },
});
