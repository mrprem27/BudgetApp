import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../tokens';

type Props = {
  title: string;
  /** Show a back chevron on the left and call this when tapped. */
  onBack?: () => void;
  /** Optional content rendered on the right (e.g. action buttons). */
  right?: React.ReactNode;
  /** Larger, left-aligned title for top-level tab screens. */
  large?: boolean;
  /** A small badge that sits right after the title (Home's streak). */
  titleAccessory?: React.ReactNode;
};

/**
 * Safe-area-aware screen header. Pads the top by the device inset so titles
 * never collide with the status bar / Dynamic Island, replacing the previous
 * hardcoded `paddingTop` on every screen.
 */
export function ScreenHeader({ title, onBack, right, large, titleAccessory }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            hitSlop={10}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleWrap}>
          <Text
            style={[large ? styles.titleLarge : styles.title, onBack && styles.titleWithBack, styles.titleText]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {titleAccessory}
        </View>
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: space.sm,
    backgroundColor: colors.bg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    gap: space.xs,
  },
  backBtn: {
    marginLeft: -6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.heading, color: colors.textPrimary, flex: 1 },
  titleLarge: { ...type.title, color: colors.textPrimary, flex: 1 },
  titleWithBack: { ...type.heading },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 0 },
  titleText: { flex: 0, flexShrink: 1 },
});
