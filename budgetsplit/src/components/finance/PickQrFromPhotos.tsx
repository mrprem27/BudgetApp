import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../tokens';

/** Ghost action shared by both QR scanners — a saved screenshot instead of a live camera. */
export function PickQrFromPhotos({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} accessibilityRole="button">
      <Feather name="image" size={16} color={colors.accent} />
      <Text style={styles.text}>Choose from photos</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space.sm, minHeight: layout.touchMin, marginBottom: space.md,
  },
  text: { ...type.button, color: colors.accent },
});
