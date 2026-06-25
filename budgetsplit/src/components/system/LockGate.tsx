import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, AppState, AppStateStatus, TouchableOpacity, Image, Linking,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { settings } from '../../lib/settings';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { space, radius } from '../../constants/layout';

const LOGO = require('../../../assets/splash-icon.png');

/**
 * Wraps the app. If the user has enabled biometric lock, the app locks whenever
 * it goes to the background and requires Face ID / Touch ID to re-enter.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [authing, setAuthing] = useState(false);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Load the preference on mount; if enabled, start locked.
  useEffect(() => {
    (async () => {
      try {
        const on = await settings.biometricEnabled();
        setEnabled(on);
        if (on) {
          setLocked(true);
          authenticate();
        }
      } catch {
        setEnabled(false);
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
        if (await settings.biometricEnabled()) setLocked(true);
        return;
      }

      if (next === 'active' && (prev === 'background' || prev === 'inactive')) {
        const on = await settings.biometricEnabled();
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
        // Hardware present but nothing enrolled — show the error card so the
        // user can either set up Face ID or disable the lock in the app.
        if (hasHardware && !enrolled) {
          setNotEnrolled(true);
        } else {
          // No hardware at all — silently unlock (simulator / old device).
          setLocked(false);
        }
        return;
      }
      setNotEnrolled(false);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock BudgetSplit',
        fallbackLabel: 'Use passcode',
      });
      if (result.success) { setLocked(false); setNotEnrolled(false); }
    } catch {
      // Auth threw (e.g. too many attempts / OS lockout) — stay locked; the
      // user can retry with the Unlock button. Never crash on a rejection.
    } finally {
      setAuthing(false);
    }
  }, [authing]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {enabled && locked && (
        <View style={styles.overlay}>
          {notEnrolled ? (
            // Biometric hardware present but nothing enrolled — show escape hatches
            <>
              <View style={styles.notEnrolledCard}>
                <View style={styles.notEnrolledIcon}>
                  <Feather name="alert-triangle" size={24} color={colors.expense} />
                </View>
                <Text style={styles.notEnrolledTitle}>Face ID not set up</Text>
                <Text style={styles.notEnrolledBody}>
                  BudgetSplit is locked but Face ID / Touch ID isn't enrolled on this device.{'\n'}Set it up in iOS Settings, or disable the lock here.
                </Text>
                <TouchableOpacity
                  style={styles.settingsBtn}
                  onPress={() => Linking.openSettings()}
                  accessibilityRole="button"
                >
                  <Text style={styles.settingsBtnText}>Open iOS Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.disableLockBtn}
                  onPress={async () => { await settings.setBiometricEnabled(false); setEnabled(false); setLocked(false); setNotEnrolled(false); }}
                  accessibilityRole="button"
                >
                  <Text style={styles.disableLockText}>Disable lock in BudgetSplit</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* The lock nests in the donut's centre — the logo IS the lock UI */}
              <View style={styles.lockMark}>
                <Image source={LOGO} style={styles.lockMarkImg} resizeMode="contain" />
                <View style={styles.lockMarkCenter}>
                  <Feather name="lock" size={26} color={colors.accent} />
                </View>
              </View>
              <Text style={styles.title}>BudgetSplit Locked</Text>
              <Text style={styles.subtitle}>Authenticate to continue</Text>
              <TouchableOpacity
                style={styles.unlockBtn}
                onPress={authenticate}
                accessibilityRole="button"
                accessibilityLabel="Unlock"
              >
                <Feather name="unlock" size={18} color={colors.bg} />
                <Text style={styles.unlockText}>Unlock</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={authenticate} hitSlop={8} accessibilityRole="button" accessibilityLabel="Use passcode instead" style={styles.passcodeBtn}>
                <Text style={styles.passcodeText}>Use passcode instead</Text>
              </TouchableOpacity>
              <Text style={styles.lockFooter}>Settings › Privacy &amp; Security</Text>
            </>
          )}
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
  lockMark: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  lockMarkImg: { position: 'absolute', width: 120, height: 120 },
  lockMarkCenter: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.heading, color: colors.textPrimary },
  subtitle: { ...type.body, color: colors.textSecondary, marginBottom: space.lg },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.md,
  },
  unlockText: { ...type.button, color: colors.bg },
  passcodeBtn: { paddingVertical: space.sm },
  passcodeText: { ...type.body, color: colors.textSecondary },
  lockFooter: { ...type.caption, color: colors.textMuted, marginTop: space.sm },

  notEnrolledCard: {
    width: 300,
    backgroundColor: '#1A0A0A',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.expense,
    padding: space.lg,
    alignItems: 'center',
    gap: space.md,
  },
  notEnrolledIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.expense + '22', alignItems: 'center', justifyContent: 'center' },
  notEnrolledTitle: { ...type.heading, color: colors.expense, textAlign: 'center' },
  notEnrolledBody: { ...type.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  settingsBtn: {
    backgroundColor: colors.expense,
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: radius.md,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  settingsBtnText: { ...type.button, color: colors.bg },
  disableLockBtn: { paddingVertical: space.sm },
  disableLockText: { ...type.body, color: colors.textMuted, textDecorationLine: 'underline' },
});
