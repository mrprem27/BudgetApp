import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { IconCircle } from './IconCircle';
import { colors, type, space, layout } from '../tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  /** The raw rupees string the field holds (`paiseToInput` / `parseToPaise`). */
  value: string;
  onChangeText: (s: string) => void;
  iconColor?: string;
  autoFocus?: boolean;
};

/**
 * The form row for money (AGENTS.md §4): icon disc, label, and a right-aligned ₹ amount with no
 * border of its own — the card around it is the field. Use inside a `Card`, with
 * `<Divider indent="text" />` between rows.
 */
export function AmountRow({ icon, label, value, onChangeText, iconColor = colors.accent, autoFocus }: Props) {
  return (
    <View style={styles.row}>
      <IconCircle icon={icon} size={layout.iconCircle} color={iconColor} />
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <View style={styles.amount}>
        <Text style={styles.rupee}>₹</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          selectTextOnFocus
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.smd,
    minHeight: layout.rowMinHeight, paddingHorizontal: space.md,
  },
  label: { ...type.body, color: colors.textPrimary, flexShrink: 1 },
  amount: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  rupee: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.textSecondary, marginRight: 2 },
  input: {
    fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: colors.textPrimary,
    textAlign: 'right', minWidth: 72, paddingVertical: space.sm,
  },
});
