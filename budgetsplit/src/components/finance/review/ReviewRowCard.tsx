import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { SplitEditor } from '../add/SplitEditor';
import { colors, type, space, radius, layout, shadow } from '../../tokens';
import { categoryVisual } from '../../../constants/categories';
import { asFeather } from '../../../constants/palette';
import { parseToPaise, formatRupees, splitByMode } from '../../../lib/money';
import { haptic } from '../../../lib/haptics';
import { alpha } from '../../../theme';
import type { RowEdit, SplitState } from '../../../lib/reviewCommit';
import type { PendingTxn } from '../../../db/queries/pending';
import type { Person } from '../../../db/queries/persons';
import { type TxnKind, PAY_METHOD_LABEL, PAY_METHOD_EMOJI, TXN_KIND_LABEL } from '../../../constants/enums';

/** Kind chips on each row. "Transfer" is the UI name for a `settlement` — money
 *  moving between accounts or people, which is neither spend nor earnings. */
const KIND_CHIPS: { kind: TxnKind; label: string }[] = [
  { kind: 'expense', label: 'Exp' },
  { kind: 'income', label: 'Inc' },
  { kind: 'settlement', label: 'Txfr' },
];

type Props = {
  row: PendingTxn;
  /** The row's effective state — stored values with the local draft applied. */
  v: RowEdit;
  /** The row's effective split state. */
  st: SplitState;
  sharedGroups: { id: string; name: string }[];
  groupMembers: Record<string, Person[]>;
  hasGroups: boolean;
  selectMode: boolean;
  checked: boolean;
  /** This row is mid-commit. */
  saving: boolean;
  /** A batch commit is running, so every row's Confirm is inert. */
  batchSaving: boolean;
  onToggleSelect: (id: string) => void;
  /** Per keystroke — local state only, so typing never hits the DB. */
  onAmountChange: (id: string, text: string) => void;
  /** On blur — flushes the amount to the saved draft. */
  onAmountBlur: (id: string, text: string) => void;
  onPatch: (id: string, patch: Partial<RowEdit>) => void;
  onSplitChange: (row: PendingTxn, patch: Partial<SplitState>) => void;
  onOpenCategory: (id: string) => void;
  onOpenDest: (id: string) => void;
  onOpenCounterparty: (id: string) => void;
  onOpenPay: (id: string) => void;
  onConfirm: (row: PendingTxn) => void;
  onDiscard: (row: PendingTxn) => void;
};

/**
 * One editable row in the Review inbox.
 *
 * **This component MUST stay at module scope.** It previously lived as a plain render
 * function inside `ReviewScreen` because the obvious refactor — declaring
 * `function RowCard()` *inside* the screen — creates a brand-new component **type** on
 * every screen render. React compares element types by identity, so a new type means
 * unmount + remount of the whole subtree, which destroys the `TextInput` and drops
 * keyboard focus mid-digit while typing an amount. At module scope the type is stable,
 * so React reconciles in place and the input keeps focus. `app/review.tsx` carried a
 * comment warning about this for exactly that reason.
 *
 * The amount is deliberately split across two handlers: `onAmountChange` per keystroke
 * (local state only) and `onAmountBlur` once (writes the draft). Persisting on every
 * keystroke would put a DB write between the keypress and the re-render.
 */
export const ReviewRowCard = React.memo(function ReviewRowCard({
  row, v, st, sharedGroups, groupMembers, hasGroups,
  selectMode, checked, saving, batchSaving,
  onToggleSelect, onAmountChange, onAmountBlur, onPatch, onSplitChange,
  onOpenCategory, onOpenDest, onOpenCounterparty, onOpenPay, onConfirm, onDiscard,
}: Props) {
  const vis = categoryVisual(v.category);
  const isGroup = v.dest !== 'personal';
  const isTransfer = v.kind === 'settlement';
  const groupName = isGroup ? (sharedGroups.find(g => g.id === v.dest)?.name ?? 'Group') : 'Personal';
  const gm = isGroup ? (groupMembers[v.dest] ?? []) : [];
  // A transfer into a group settles with one member instead of splitting.
  const splitting = isGroup && !isTransfer;
  const total = parseToPaise(v.amount);
  const shares = splitting ? splitByMode(total, st.included, st.mode, st.values) : {};
  const assigned = splitting ? st.included.reduce((s, id) => s + (shares[id] ?? 0), 0) : total;
  const balanced = !splitting || (st.included.length > 0 && assigned === total);
  // A group transfer can't be saved until you say who it was with.
  const other = gm.find(m => m.id === v.counterparty) ?? null;
  const inbound = v.direction === 'credit';
  const ready = balanced && (!isGroup || !isTransfer || other !== null);

  return (
    <View style={[styles.card, selectMode && checked && styles.cardChecked]}>
      <View style={styles.rowTop}>
        {selectMode && (
          <TouchableOpacity
            onPress={() => onToggleSelect(row.id)}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={`Select ${row.description}`}
            style={styles.checkbox}
          >
            <Feather name={checked ? 'check-circle' : 'circle'} size={20} color={checked ? colors.accent : colors.textMuted} />
          </TouchableOpacity>
        )}
        <Text style={styles.desc} numberOfLines={1}>{row.description}</Text>
        <Text style={styles.date}>{format(row.date, 'd MMM · h:mm a')}</Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.amtWrap}>
          <Text style={styles.rupee}>₹</Text>
          <TextInput
            style={styles.amtInput}
            value={v.amount}
            onChangeText={(t) => onAmountChange(row.id, t.replace(/[^0-9.]/g, ''))}
            onEndEditing={(e) => onAmountBlur(row.id, e.nativeEvent.text)}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
          />
        </View>
        <View style={styles.kindToggle}>
          {KIND_CHIPS.map(({ kind: k, label }) => (
            <TouchableOpacity
              key={k}
              style={[styles.kindBtn, v.kind === k && KIND_ON_STYLE[k]]}
              // Switching kind clears the category — the picker's list changes
              // with it, so keeping the old name would show a stale chip.
              onPress={() => { haptic.selection(); onPatch(row.id, k === 'expense' ? { kind: k, category: '' } : { kind: k, category: '', dest: 'personal' }); }}
              accessibilityRole="button"
              accessibilityLabel={TXN_KIND_LABEL[k]}
              accessibilityState={{ selected: v.kind === k }}
            >
              <Text style={[styles.kindText, v.kind === k && styles.kindTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.discardBtn} onPress={() => onDiscard(row)} accessibilityRole="button" accessibilityLabel="Remove">
          <Feather name="trash-2" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.pill} onPress={() => onOpenCategory(row.id)} accessibilityRole="button" accessibilityLabel="Category">
          <View style={[styles.pillDot, { backgroundColor: alpha(vis.color ?? colors.accent, 13) }]}>
            <Feather name={asFeather(vis.icon, 'tag')} size={12} color={vis.color ?? colors.accent} />
          </View>
          <Text style={styles.pillText} numberOfLines={1}>{v.category || 'Category'}</Text>
          <Feather name="chevron-down" size={12} color={colors.textMuted} />
        </TouchableOpacity>
        {hasGroups && v.kind !== 'income' && (
          <TouchableOpacity style={[styles.pill, isGroup && styles.pillGroup]} accessibilityState={{ selected: isGroup }} onPress={() => onOpenDest(row.id)} accessibilityRole="button" accessibilityLabel="Personal or group">
            <Feather name={isGroup ? 'users' : 'user'} size={12} color={isGroup ? colors.settle : colors.textSecondary} />
            <Text style={[styles.pillText, isGroup && { color: colors.settle }]} numberOfLines={1}>{groupName}</Text>
            <Feather name="chevron-down" size={12} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Transfer specifics: which way the money went, and (in a group) who with.
          Direction is seeded from the statement, but not every export signs its
          amounts — and money arriving can be a transfer TO you rather than income —
          so it's a tap to flip. */}
      {isTransfer && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.pill}
            onPress={() => { haptic.selection(); onPatch(row.id, { direction: inbound ? 'debit' : 'credit' }); }}
            accessibilityRole="button"
            accessibilityLabel={inbound ? 'Money in — tap to change to money out' : 'Money out — tap to change to money in'}
          >
            <Feather
              name={inbound ? 'arrow-down-left' : 'arrow-up-right'}
              size={12}
              color={inbound ? colors.income : colors.expense}
            />
            <Text style={[styles.pillText, { color: inbound ? colors.income : colors.expense }]} numberOfLines={1}>
              {inbound ? 'Money in' : 'Money out'}
            </Text>
            <Feather name="repeat" size={11} color={colors.textMuted} />
          </TouchableOpacity>
          {isGroup && (
            <TouchableOpacity
              style={[styles.pill, other ? styles.pillGroup : styles.pillNeeded]}
              onPress={() => onOpenCounterparty(row.id)}
              accessibilityRole="button"
              accessibilityLabel={inbound ? 'Who paid you' : 'Who you paid'}
            >
              <Feather name="user" size={12} color={other ? colors.settle : colors.expense} />
              <Text style={[styles.pillText, { color: other ? colors.settle : colors.expense }]} numberOfLines={1}>
                {other ? `${inbound ? 'From' : 'To'} ${other.name}` : (inbound ? 'From whom?' : 'To whom?')}
              </Text>
              <Feather name="chevron-down" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Pay method — pre-filled from detection when the source carried a cue. */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.payPill, v.payMethod !== '' && styles.payPillSet]}
          onPress={() => onOpenPay(row.id)}
          accessibilityRole="button"
          accessibilityLabel={v.payMethod ? `Paid via ${PAY_METHOD_LABEL[v.payMethod]}` : 'Set payment method'}
        >
          <Text style={styles.payEmoji}>{v.payMethod ? PAY_METHOD_EMOJI[v.payMethod] : '💳'}</Text>
          <Text style={[styles.pillText, v.payMethod !== '' && { color: colors.textPrimary }]} numberOfLines={1}>
            {v.payMethod ? PAY_METHOD_LABEL[v.payMethod] : 'Pay method'}
          </Text>
          <Feather name="chevron-down" size={12} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Inline split — group expenses only; a group transfer settles instead. */}
      {splitting && (
        <View style={styles.splitBlock}>
          <SplitEditor
            members={gm}
            included={st.included}
            onToggle={(id) => onSplitChange(row, { included: st.included.includes(id) ? st.included.filter(x => x !== id) : [...st.included, id] })}
            mode={st.mode}
            onMode={(m) => onSplitChange(row, { mode: m })}
            rawValue={(id) => st.values[id] ?? ''}
            onValue={(id, val) => onSplitChange(row, { values: { ...st.values, [id]: val } })}
            result={(id) => shares[id] ?? 0}
          />
          <Text style={[styles.splitMeta, { color: balanced ? colors.income : colors.expense }]}>
            {st.included.length === 0 ? 'Pick who shares this'
              : assigned === total ? 'Balanced'
              : assigned < total ? `${formatRupees(total - assigned)} unassigned`
              : `${formatRupees(assigned - total)} over`}
          </Text>
        </View>
      )}

      {/* Per-row Confirm — hidden in selection mode (batch Save is the action there). */}
      {!selectMode && (
        <View style={styles.confirmRow}>
          <TouchableOpacity
            style={[styles.confirmBtn, (!ready || saving || batchSaving) && styles.confirmBtnOff]}
            onPress={() => onConfirm(row)}
            disabled={!ready || saving || batchSaving}
            accessibilityRole="button"
            accessibilityLabel="Save this transaction"
          >
            <Feather name="check" size={14} color={colors.bg} />
            <Text style={styles.confirmBtnText}>{saving ? 'Saving…' : 'Confirm'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, ...shadow.sm },
  cardChecked: { borderColor: colors.accent },
  checkbox: { marginRight: space.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  desc: { ...type.bodySemi, color: colors.textPrimary, flex: 1 },
  date: { ...type.caption, color: colors.textMuted },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  amtWrap: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm, flex: 1 },
  rupee: { ...type.body, color: colors.textMuted },
  amtInput: { flex: 1, ...type.body, color: colors.textPrimary, fontFamily: 'SpaceMono_400Regular', paddingVertical: space.sm },
  kindToggle: { flexDirection: 'row', backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 2 },
  kindBtn: { paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.sm },
  kindExpense: { backgroundColor: colors.expense },
  kindIncome: { backgroundColor: colors.income },
  kindSettle: { backgroundColor: colors.settle },
  kindText: { ...type.label, color: colors.textSecondary },
  kindTextOn: { ...type.labelSemi, color: colors.bg },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgMuted, borderRadius: radius.pill, paddingHorizontal: space.smd, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
  pillGroup: { borderColor: alpha(colors.settle, 33) },
  pillNeeded: { borderColor: colors.expense, backgroundColor: alpha(colors.expense, 9) },
  pillDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pillText: { ...type.label, color: colors.textSecondary, flex: 1 },
  payPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgMuted, borderRadius: radius.pill, paddingHorizontal: space.smd, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', maxWidth: '60%' },
  payPillSet: { borderColor: alpha(colors.accent, 33) },
  payEmoji: { fontSize: 14 },
  // Was 34×34 — under AGENTS §6's 44pt floor, on a *destructive* control.
  discardBtn: { width: layout.touchMin, height: layout.touchMin, borderRadius: layout.touchMin / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgMuted },
  splitBlock: { gap: space.sm },
  splitMeta: { ...type.label, color: colors.textSecondary, flexShrink: 1, textAlign: 'right' },
  // Right-aligned via justifyContent, not a <View style={{flex:1}}/> spacer.
  confirmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, minHeight: layout.touchMin - 8, borderRadius: radius.md, backgroundColor: colors.accent },
  confirmBtnOff: { opacity: 0.5 },
  confirmBtnText: { ...type.labelSemi, color: colors.bg },
});

/** Fill for the selected kind chip. Declared after `styles` so it can reference it. */
const KIND_ON_STYLE: Record<TxnKind, object> = {
  expense: styles.kindExpense,
  income: styles.kindIncome,
  settlement: styles.kindSettle,
};
