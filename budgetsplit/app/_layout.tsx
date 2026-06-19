import 'react-native-get-random-values';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { StatusBar } from 'expo-status-bar';
import { openDB } from '../src/db/schema';
import { seedIfNeeded } from '../src/db/seed';
import { runSavingsMaintenance } from '../src/db/queries/savings';
import { colors } from '../src/constants/colors';
import { LockGate } from '../src/components/system/LockGate';
import { OnboardingGate } from '../src/components/system/OnboardingGate';
import { PrivacyScreen } from '../src/components/system/PrivacyScreen';
import { FeatureFlagsProvider } from '../src/components/system/FeatureFlagsProvider';
import { BrandedLoader } from '../src/components/system/BrandedLoader';
import { ErrorState } from '../src/components/ui/ErrorState';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    SpaceMono_400Regular,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const db = await openDB();
        await seedIfNeeded(db);
        await runSavingsMaintenance(db); // sweep leftover → schedule → reconcile
        if (alive) { setDbReady(true); setDbError(false); }
      } catch {
        // Never strand the user on the splash — surface a retry instead.
        if (alive) setDbError(true);
      }
    })();
    return () => { alive = false; };
  }, [attempt]);

  if (dbError) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
          <ErrorState
            title="Couldn't start BudgetSplit"
            body="We couldn't open your data. Please try again."
            retryLabel="Retry"
            onRetry={() => { setDbError(false); setAttempt(a => a + 1); }}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!fontsLoaded || !dbReady) {
    return <BrandedLoader />;
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
