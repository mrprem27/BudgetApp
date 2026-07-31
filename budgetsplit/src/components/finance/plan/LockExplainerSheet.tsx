import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';

/**
 * One-time explainer shown the first time a user protects a goal, so
 * "Protect" is never mistaken for real fund segregation — this app has no
 * account separation at all, protected or not (see savingsEngine.ts's
 * overspend raid, which is the only thing "Protect" actually gates).
 */
export function LockExplainerSheet({ visible, onClose, onConfirm }: { visible: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <SheetModal visible={visible} onClose={onClose} title="What protecting does">
      <View style={styles.iconWrap}>
        <Feather name="shield" size={22} color={colors.accent} />
      </View>
      <Text style={styles.body}>
        Protecting a goal only shields it from the automatic overspend cover — if your cash
        goes negative, BudgetSplit won't pull from a protected goal to cover it.
      </Text>
      <Text style={styles.body}>
        It doesn't move your money anywhere else or make it inaccessible. None of your goals
        ever hold segregated real funds — this app has no actual account separation,
        protected or not.
      </Text>
      <PrimaryButton label="Got it" onPress={onConfirm} style={styles.button} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 44, height: 44, borderRadius: radius.lg,
    backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center',
    marginBottom: space.md,
  },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 20, marginBottom: space.md },
  button: { marginTop: space.xs },
});
