import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { PrimaryButton } from './PrimaryButton';
import { alpha } from '../../theme';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tint?: string;
};

/**
 * The one empty-state layout used everywhere.
 *
 * Refinements:
 *  - Icon circle 56px (was 64) — reduces visual weight; the tint carries the
 *    identity without needing size.
 *  - Softer icon tint background (8% opacity, was 13%) — reads as a wash
 *    rather than a coloured chip. Follows the Notion/Linear empty-state
 *    aesthetic.
 *  - Tighter type — heading (was subheading) title and slightly relaxed body
 *    line-height for readability.
 *  - Bottom padding trimmed so the action button doesn't feel marooned.
 */
export function EmptyState({ icon, title, body, actionLabel, onAction, tint = colors.accent }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: alpha(tint, 8) }]}>
        <Feather name={icon} size={24} color={tint} />
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
  wrap: { alignItems: 'center', paddingVertical: space.xl + space.sm, paddingHorizontal: space.xl, gap: space.sm },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  title: { ...type.heading, color: colors.textPrimary, textAlign: 'center' },
  body: { ...type.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 22 },
  action: { alignSelf: 'stretch', marginTop: space.md, paddingHorizontal: space.lg, borderRadius: radius.md },
});
