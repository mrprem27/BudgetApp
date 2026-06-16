import 'react-native-get-random-values';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { openDB } from '../src/db/schema';
import { seedIfNeeded } from '../src/db/seed';
import { colors } from '../src/constants/colors';
import { LockGate } from '../src/components/system/LockGate';
import { OnboardingGate } from '../src/components/system/OnboardingGate';
import { PrivacyScreen } from '../src/components/system/PrivacyScreen';
import { FeatureFlagsProvider } from '../src/components/system/FeatureFlagsProvider';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    SpaceMono_400Regular,
  });

  useEffect(() => {
    (async () => {
      const db = await openDB();
      await seedIfNeeded(db);
      setDbReady(true);
    })();
  }, []);

  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
  }, []);

  if (!fontsLoaded || !dbReady) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <SQLiteProvider databaseName="budgetsplit.db">
          <FeatureFlagsProvider>
          <StatusBar style="light" />
          <LockGate>
            <OnboardingGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="add/quick" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="add/income" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="add/itemized" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="add/transfer" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              </Stack>
            </OnboardingGate>
          </LockGate>
          </FeatureFlagsProvider>
        </SQLiteProvider>
        <PrivacyScreen />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
