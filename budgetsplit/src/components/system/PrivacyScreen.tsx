import React, { useEffect, useState } from 'react';
import { AppState, View, Text, Image, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, type, space } from '../tokens';

const LOGO = require('../../../assets/splash-icon.png');

/**
 * Covers the app with a branded screen whenever it leaves the foreground, so
 * sensitive financial data never appears in the OS app-switcher snapshot.
 * Honors the "Privacy screen" preference (default on). No native blur module —
 * reload-friendly.
 */
export function PrivacyScreen() {
  const [hidden, setHidden] = useState(false);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('privacy_screen').then(v => setEnabled(v !== 'false'));
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setHidden(false);
        AsyncStorage.getItem('privacy_screen').then(v => setEnabled(v !== 'false'));
      } else {
        // Cover immediately (synchronously) so the snapshot is masked.
        setHidden(true);
      }
    });
    return () => sub.remove();
  }, []);

  if (!enabled || !hidden) return null;

  return (
    <View style={styles.overlay}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.brand}>BudgetSplit</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
    gap: space.md,
  },
  logo: { width: 84, height: 84 },
  brand: { ...type.title, color: colors.textPrimary },
});
