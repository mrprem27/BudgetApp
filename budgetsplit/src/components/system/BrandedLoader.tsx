import React from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';
import { space } from '../../constants/layout';

const LOGO = require('../../../assets/splash-icon.png');

/**
 * Full-screen branded loading state — the donut logo + a subtle spinner.
 * Used for the boot gate (fonts/DB) and the onboarding gate so the hand-off
 * from the native splash stays seamless instead of flashing a bare spinner.
 */
export function BrandedLoader() {
  return (
    <View style={styles.container}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator color={colors.accent} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 84, height: 84 },
  spinner: { marginTop: space.lg },
});
