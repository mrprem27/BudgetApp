import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, AppState, AppStateStatus, TouchableOpacity,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { space, radius } from '../../constants/layout';

/**
 * Wraps the app. If the user has enabled biometric lock, the app locks whenever
 * it goes to the background and requires Face ID / Touch ID to re-enter.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [authing, setAuthing] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Load the preference on mount; if enabled, start locked.
  useEffect(() => {
    (async () => {
      const val = await AsyncStorage.getItem('biometric_enabled');
      const on = val === 'true';
      setEnabled(on);
      if (on) {
        setLocked(true);
        authenticate();
      }
    })();
  }, []);

  // Re-check the preference each time the app returns to foreground (it may have
  // been toggled in Settings) and lock on background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      const prev = appState.current;
      appState.current = next;

      if (next === 'background' || next === 'inactive') {
        const val = await AsyncStorage.getItem('biometric_enabled');
        if (val === 'true') setLocked(true);
        return;
      }

      if (next === 'active' && (prev === 'background' || prev === 'inactive')) {
        const val = await AsyncStorage.getItem('biometric_enabled');
        const on = val === 'true';
        setEnabled(on);
        if (on && locked) authenticate();
      }
    });
    return () => sub.remove();
  }, [locked]);

  const authenticate = useCallback(async () => {
    if (authing) return;
    setAuthing(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        // No biometrics available — don't trap the user out of their own data.
        setLocked(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock BudgetSplit',
        fallbackLabel: 'Use passcode',
      });
      if (result.success) setLocked(false);
    } finally {
      setAuthing(false);
    }
  }, [authing]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {enabled && locked && (
        <View style={styles.overlay}>
          <View style={styles.iconCircle}>
            <Feather name="lock" size={36} color={colors.accent} />
          </View>
          <Text style={styles.title}>BudgetSplit Locked</Text>
          <Text style={styles.subtitle}>Authenticate to continue</Text>
          <TouchableOpacity
            style={styles.unlockBtn}
            onPress={authenticate}
            accessibilityRole="button"
            accessibilityLabel="Unlock with Face ID"
          >
            <Feather name="unlock" size={18} color={colors.bg} />
            <Text style={styles.unlockText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: { ...type.heading, color: colors.textPrimary },
  subtitle: { ...type.body, color: colors.textSecondary, marginBottom: space.lg },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.md,
  },
  unlockText: { ...type.button, color: colors.bg },
});
