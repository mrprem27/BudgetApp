import 'react-native-get-random-values';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
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
import { materializeDueOccurrences } from '../src/db/queries/transactions';
import { rescheduleReminders } from '../src/lib/reminders';
import { colors } from '../src/constants/colors';
import { LockGate } from '../src/components/system/LockGate';
import { OnboardingGate } from '../src/components/system/OnboardingGate';
import { PrivacyScreen } from '../src/components/system/PrivacyScreen';
import { FeatureFlagsProvider } from '../src/components/system/FeatureFlagsProvider';
import { DataRefreshProvider } from '../src/components/system/DataRefreshProvider';
import { StoreHydrator } from '../src/components/system/StoreHydrator';
import { UndoProvider } from '../src/components/system/UndoToast';
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
    let dbRef: Awaited<ReturnType<typeof openDB>> | null = null;
    (async () => {
      try {
        const db = await openDB();
        dbRef = db;
        await seedIfNeeded(db);
        // Catch-up: any recurring occurrence that came due (incl. across a missed
        // "midnight") materializes into a real editable row the moment the app loads.
        await materializeDueOccurrences(db);
        await runSavingsMaintenance(db); // sweep leftover → schedule → reconcile
        rescheduleReminders(db).catch(() => {}); // rebuild local reminders (no-op without permission)
        if (alive) { setDbReady(true); setDbError(false); }
      } catch {
        // Never strand the user on the splash — surface a retry instead.
        if (alive) setDbError(true);
      }
    })();

    // Also catch up when the app returns to the foreground (e.g. left open
    // overnight, then reopened the next day).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && dbRef) {
        materializeDueOccurrences(dbRef).catch(() => {});
        runSavingsMaintenance(dbRef).catch(() => {});
        rescheduleReminders(dbRef).catch(() => {});
      }
    });

    return () => { alive = false; sub.remove(); };
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
          <DataRefreshProvider>
          <StoreHydrator />
          <UndoProvider>
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
                {/* Full-screen (not the iOS inset 'modal' sheet) so they read like the Settle screen. */}
                <Stack.Screen name="add/quick" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="add/income" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
                <Stack.Screen name="add/itemized" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              </Stack>
            </OnboardingGate>
          </LockGate>
          </UndoProvider>
          </DataRefreshProvider>
          </FeatureFlagsProvider>
        </SQLiteProvider>
        <PrivacyScreen />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
