import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../tokens';
import { Input } from '../../ui/Input';
import { formatRupees } from '../../../lib/money';

/**
 * Split by items as one grid (`U-69`): every figure on the screen sits in the same right-hand
 * column, so an item's total, the subtotal, tax and the total, and each person's share line up
 * down the page. The widths live here and nowhere else. The price each goes under the item's name:
 * three money columns do not fit a 375pt phone at the app's amount size.
 */
export const GRID = { qty: 32, total: 88, action: 24 } as const;

/** Name, then quantity and price each: the one way an item is typed, to add it or to edit it. */
export function ItemFields({ name, qty, price, onName, onQty, onPrice, onSubmit, autoFocus }: {
  name: string; qty: string; price: string;
  onName: (v: string) => void; onQty: (v: string) => void; onPrice: (v: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.fields}>
      <Input value={name} onChangeText={onName} placeholder="Item" autoCapitalize="sentences"
        returnKeyType="next" accessibilityLabel="Item name" autoFocus={autoFocus} />
      <View style={styles.fieldRow}>
        <Input style={styles.qtyField} value={qty} onChangeText={t => onQty(t.replace(/[^0-9]/g, ''))}
          keyboardType="numeric" placeholder="Qty" accessibilityLabel="Quantity" />
        <Input style={styles.flex} value={price} onChangeText={t => onPrice(t.replace(/[^0-9.]/g, ''))}
          amount placeholder="Price each" accessibilityLabel="Price each" returnKeyType="done" onSubmitEditing={onSubmit} />
      </View>
    </View>
  );
}

/** The column names above the item rows. */
export function ItemGridHeader() {
  return (
    <View style={[styles.row, styles.headerRow]}>
      <Text style={[styles.head, styles.flex]}>Item</Text>
      <Text style={[styles.head, styles.qty]}>Qty</Text>
      <Text style={[styles.head, styles.total]}>Total</Text>
      <View style={styles.action} />
    </View>
  );
}

/** One item on the grid. `below` is what sits under the name (who had it). */
export function ItemGridRow({ name, qty, unitPaise, totalPaise, below, onPress, onRemove }: {
  name: string; qty: number; unitPaise: number; totalPaise: number;
  below?: React.ReactNode;
  onPress?: () => void;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.flex} onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`Edit ${name}`}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.each} numberOfLines={1}>{formatRupees(unitPaise)} each</Text>
        {below}
      </TouchableOpacity>
      <Text style={[styles.cell, styles.qty]}>{qty}</Text>
      <Text style={[styles.cell, styles.total]} numberOfLines={1}>{formatRupees(totalPaise)}</Text>
      {onRemove ? (
        <TouchableOpacity style={styles.action} onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${name}`}>
          <Feather name="trash-2" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ) : <View style={styles.action} />}
    </View>
  );
}

/**
 * A label and an amount in the total column: subtotal, tax, the total, a person's share. `leading`
 * is an avatar or a remove button; the amount always lands under the item totals.
 */
export function GridAmountRow({ label, amount, leading, strong, tone, signed }: {
  label: string; amount: number;
  leading?: React.ReactNode;
  strong?: boolean;
  tone?: string;
  /** '+' or '−' before the amount (a discount, a tip). */
  signed?: '+' | '−';
}) {
  return (
    <View style={styles.row}>
      {leading}
      <Text style={[strong ? styles.labelStrong : styles.label, styles.flex]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.cell, styles.total, strong && styles.cellStrong, tone ? { color: tone } : null]} numberOfLines={1}>
        {signed ?? ''}{formatRupees(amount)}
      </Text>
      <View style={styles.action} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fields: { gap: space.sm },
  fieldRow: { flexDirection: 'row', gap: space.sm },
  qtyField: { width: 72 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.rowMinHeight, paddingVertical: space.sm },
  headerRow: { minHeight: 0, paddingVertical: space.xs },
  head: { ...type.caption, color: colors.textMuted },
  name: { ...type.body, color: colors.textPrimary },
  each: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  label: { ...type.body, color: colors.textSecondary },
  labelStrong: { ...type.bodySemi, color: colors.textPrimary },
  cell: { ...type.amountSM, color: colors.textPrimary, textAlign: 'right' },
  cellStrong: { color: colors.accent },
  qty: { width: GRID.qty, textAlign: 'right' },
  total: { width: GRID.total, textAlign: 'right' },
  action: { width: GRID.action, alignItems: 'center' },
});
