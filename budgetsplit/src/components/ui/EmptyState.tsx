import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body?: string;
  /** Optional CTA. */
  actionLabel?: string;
  onAction?: () => void;
  /** Tint for the icon + its circle (defaults to accent). */
  tint?: string;
};

/**
 * The one empty-state layout used everywhere: icon circle → title → body →
 * optional primary action. Per AGENTS.md §2, never render a bare "nothing here".
 */
export function EmptyState({ icon, title, body, actionLabel, onAction, tint = colors.accent }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: tint + '22' }]}>
        <Feather name={icon} size={26} color={tint} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  title: { ...type.subheading, color: colors.textPrimary, textAlign: 'center' },
  body: { ...type.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 320, lineHeight: 22 },
  action: { alignSelf: 'stretch', marginTop: space.md, paddingHorizontal: space.lg, borderRadius: radius.md },
});
