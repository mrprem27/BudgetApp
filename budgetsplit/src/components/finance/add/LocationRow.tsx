import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import type { CapturedPlace } from '../../../lib/location';

type Props = {
  place: CapturedPlace | null;
  capturing: boolean;
  onRecapture: () => void;
  onClear: () => void;
};

/** Location tag row (shown when the user has location tagging on). */
export function LocationRow({ place, capturing, onRecapture, onClear }: Props) {
  return (
    <View style={styles.attachRow}>
      <Feather name="map-pin" size={16} color={place ? colors.accent : colors.textMuted} />
      <Text style={styles.attachName} numberOfLines={1}>
        {capturing ? 'Locating…' : place?.label || (place ? 'Location tagged' : 'No location yet')}
      </Text>
      {place ? (
        <TouchableOpacity onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove location">
          <Feather name="x" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onRecapture} hitSlop={10} disabled={capturing} accessibilityRole="button" accessibilityLabel="Capture location">
          <Feather name="refresh-cw" size={15} color={colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  attachName: { ...type.body, color: colors.textPrimary, flex: 1 },
});
