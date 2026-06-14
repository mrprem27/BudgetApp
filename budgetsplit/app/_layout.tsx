import 'react-native-get-random-values';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SQLiteProvider } from 'expo-sqlite';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { openDB } from '../src/db/schema';
import { seedIfNeeded } from '../src/db/seed';
import { colors } from '../src/constants/colors';
import { LockGate } from '../src/components/LockGate';
import { OnboardingGate } from '../src/components/OnboardingGate';

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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SQLiteProvider databaseName="budgetsplit.db">
        <StatusBar style="light" />
        <LockGate>
          <OnboardingGate>
            <Slot />
          </OnboardingGate>
        </LockGate>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
