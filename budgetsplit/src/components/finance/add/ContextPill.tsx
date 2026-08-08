import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableScale } from '../../ui/PressableScale';
import { IconCircle } from '../../ui/IconCircle';
import { colors, type, space, radius } from '../../tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  /** The thing itself — a group name, a settlement scope. Tinted. */
  label: string;
  /** Quiet qualifier after a middot: "4 people · equal", "₹2,400". */
  detail?: string;
  tint?: string;
  onPress: () => void;
  accessibilityLabel: string;
};

/**
 * The compact pill that sits above the amount on Add and says what this
 * transaction is *about* — which group an expense lands in, or which debt a
 * settlement is paying down.
 *
 * Deliberately a pill, not a card. The first version of this was a full-width card
 * row and read as a page header: it competed with the amount for the top of the
 * screen, which is the wrong hierarchy. Destination is context, and context should
 * be quiet — so it's centred and small, a caption over the number below it.
 *
 * Shared by expense and transfer so the two don't drift into two different
 * group-pickers on one screen, which is exactly what happened before: expense had
 * a wrapping pill row, transfer had its own scope chips further down the form.
 */
export function ContextPill({ icon, label, detail, tint = colors.accent, onPress, accessibilityLabel }: Props) {
  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={onPress}
        hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
        accessibilityLabel={accessibilityLabel}
      >
        <View style={styles.pill}>
          <IconCircle icon={icon} size={22} color={tint} iconSize={12} />
          <Text style={[styles.label, { color: tint }]} numberOfLines={1}>{label}</Text>
          {!!detail && <Text style={styles.detail} numberOfLines={1}>· {detail}</Text>}
          <Feather name="chevron-down" size={14} color={colors.textMuted} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.smd,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  label: { ...type.labelSemi, flexShrink: 1 },
  detail: { ...type.caption, color: colors.textMuted, flexShrink: 1 },
});
