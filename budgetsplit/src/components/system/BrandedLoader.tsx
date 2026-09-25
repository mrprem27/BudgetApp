import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme';

/**
 * The boot gate's screen: the app background and nothing else.
 *
 * It is the same colour as the native launch screen (`expo-splash-screen` in
 * `app.json`), so launch → loader → first screen reads as one continuous blank
 * until real content draws. It used to show the finished logo and a spinner,
 * which on a first launch put the completed mark on screen a moment before the
 * onboarding hero animation assembled it from nothing — the reveal, spoiled.
 * Boot takes well under a second, so a spinner had nothing to report.
 */
export function BrandedLoader() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
