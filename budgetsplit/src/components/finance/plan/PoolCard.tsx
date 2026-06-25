import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, type, space, radius, shadow } from '../../tokens';
import { formatCompact } from '../../../lib/money';
import { AmountText } from '../../ui/AmountText';

/** Savings-pool summary card on the Plan tab. Presentational; parent owns the
 *  add/withdraw sheets. Extracted from app/(tabs)/savings.tsx. */
export function PoolCard({
  pool,
  goalsCount,
  onAdd,
  onWithdraw,
}: {
  pool: { total: number; unallocated: number };
  goalsCount: number;
  onAdd: () => void;
  onWithdraw: () => void;
}) {
  return (
    <LinearGradient colors={[colors.accentMuted, colors.bgCard]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.poolCard}>
      <Text style={styles.poolLabel}>Savings Pool</Text>
      <View style={styles.poolMainRow}>
        <View style={{ flex: 1 }}>
          <AmountText paise={pool.total} size="xl" forceColor={colors.textPrimary} compact />
          <Text style={styles.poolSub}>
            {formatCompact(pool.unallocated)} unallocated · {goalsCount} {goalsCount === 1 ? 'goal' : 'goals'}
          </Text>
        </View>
        <View style={styles.poolActions}>
          <TouchableOpacity style={styles.poolActionBtn} onPress={onAdd} accessibilityRole="button" accessibilityLabel="Add to savings">
            <Feather name="plus" size={18} color={colors.accent} />
          </TouchableOpacity>
          {pool.unallocated > 0 && (
            <TouchableOpacity style={styles.poolActionBtn} onPress={onWithdraw} accessibilityRole="button" accessibilityLabel="Withdraw from savings">
              <Feather name="arrow-up" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  poolCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accent + '33', padding: space.lg, ...shadow.md },
  poolLabel: { ...type.caption, color: colors.accent, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm },
  poolMainRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  poolSub: { ...type.caption, color: colors.textMuted, marginTop: 4 },
  poolActions: { flexDirection: 'row', gap: space.sm },
  poolActionBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg + '66' },
});
