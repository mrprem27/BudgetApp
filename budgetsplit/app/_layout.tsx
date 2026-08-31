import 'react-native-get-random-values';
import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { View, AppState } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';
import { StatusBar } from 'expo-status-bar';
import { openDB, applyConnectionPragmas } from '../src/db/schema';
import { seedIfNeeded } from '../src/db/seed';
import { runSavingsMaintenance } from '../src/db/queries/savings';
import { materializeDueOccurrences } from '../src/db/queries/recurring';
import { reapDeletedAttachments } from '../src/db/queries/transactions';
import { deleteAttachment } from '../src/lib/attachment';
import { drainVoiceInbox, ensureVoiceInbox } from '../src/lib/voiceDrain';
import * as Notifications from 'expo-notifications';
import { rescheduleReminders } from '../src/lib/reminders';
import { routeForReminder } from '../src/lib/notificationRoutes';
import { setPendingOverspendNotice } from '../src/lib/overspendNotice';
import { colors } from '../src/theme';
import { LockGate } from '../src/components/system/LockGate';
import { OnboardingGate } from '../src/components/system/OnboardingGate';
import { PrivacyScreen } from '../src/components/system/PrivacyScreen';
import { FeatureFlagsProvider, FlagsGate } from '../src/components/system/FeatureFlagsProvider';
import { DataRefreshProvider } from '../src/components/system/DataRefreshProvider';
import { StoreHydrator } from '../src/components/system/StoreHydrator';
import { ToastProvider } from '../src/components/system/Toast';
import { BrandedLoader } from '../src/components/system/BrandedLoader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { AppErrorBoundary } from '../src/components/system/AppErrorBoundary';
import { isRestoring } from '../src/lib/restoreGuard';

/**
 * The last resort, and only that.
 *
 * `expo-router` wraps each route in its own `ErrorBoundary` export, so this one
 * catches what no route boundary can: a throw inside the providers, the gates,
 * or this layout itself. It replaces the navigator, which means Retry is the
 * only way out and a crash on mount will loop — so screens that can plausibly
 * throw should export their own instead of leaning on this. Still worth having:
 * a message beats the white screen that every render throw produced before.
 */
export { AppErrorBoundary as ErrorBoundary };

// Soft-deleted transactions older than this have long outlived the ~5s Undo
// toast — their receipt photo is never coming back, so the reaper unlinks it.
// A safety margin, not a number shown anywhere, so it needs no product call.
const ATTACHMENT_REAP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Read-then-delete, same split as deleteGroup's own orphaned-attachment cleanup. */
async function reapOrphanedAttachments(db: Awaited<ReturnType<typeof openDB>>): Promise<void> {
  const orphaned = await reapDeletedAttachments(db, ATTACHMENT_REAP_MAX_AGE_MS);
  for (const uri of orphaned) await deleteAttachment(uri);
}

export default function RootLayout() {
  const router = useRouter();
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
        // Phrases dictated to Siri while the app was closed. Drained here — before
        // `setDbReady`, so nothing has mounted yet and every screen's first load already
        // includes them, with no `refresh()` needed. Its own catch: a capture that can't be
        // filed must never turn into the "Couldn't start BudgetSplit" screen.
        ensureVoiceInbox();
        await drainVoiceInbox(db).catch(() => {});
        // Scheduled goal funding runs unattended — the user set it up, and it moves
        // money *into* goals. The overspend raid no longer applies here: it only
        // *proposes*, and Plan asks before anything leaves a goal (`V2-10`). Persist
        // the proposal so it survives to whenever the user next opens that tab.
        const raid = await runSavingsMaintenance(db);
        if (raid.total > 0) setPendingOverspendNotice(raid).catch(() => {});
        rescheduleReminders(db).catch(() => {}); // rebuild local reminders (no-op without permission)
        reapOrphanedAttachments(db).catch(() => {});
        if (alive) { setDbReady(true); setDbError(false); }
      } catch {
        // Never strand the user on the splash — surface a retry instead.
        if (alive) setDbError(true);
      }
    })();

    // Also catch up when the app returns to the foreground (e.g. left open
    // overnight, then reopened the next day).
    const sub = AppState.addEventListener('change', (state) => {
      /*
       * Skipped entirely while a restore is running.
       *
       * These four run on a DIFFERENT connection from the one the restore holds
       * exclusively, so its transaction does not protect them — and a restore is
       * started from a document picker or share sheet, both of which background
       * the app, so coming back from one fires this handler at exactly the wrong
       * moment. Writing into a half-wiped database, or taking the WAL write lock
       * and failing the restore, are both live outcomes.
       *
       * Nothing is lost by skipping: the next foreground picks it all up.
       */
      if (state === 'active' && dbRef && !isRestoring()) {
        materializeDueOccurrences(dbRef).catch(() => {});
        runSavingsMaintenance(dbRef)
          .then((raid) => { if (raid.total > 0) return setPendingOverspendNotice(raid); })
          .catch(() => {});
        rescheduleReminders(dbRef).catch(() => {});
        reapOrphanedAttachments(dbRef).catch(() => {});
      }
    });

    // A tapped reminder lands where it was talking about (`V2-15`). Registered here
    // because this listener must exist before the OS delivers a cold-start tap, and
    // `getLastNotificationResponseAsync` covers the case where it already did.
    const tapSub = Notifications.addNotificationResponseReceivedListener(res => {
      const to = routeForReminder(res.notification.request.identifier);
      if (to) router.push(to as Href);
    });
    Notifications.getLastNotificationResponseAsync()
      .then(res => {
        const to = res && routeForReminder(res.notification.request.identifier);
        // Deferred past the splash: routing while the DB is still opening would push
        // onto a tree that hasn't mounted.
        if (to) setTimeout(() => router.push(to as Href), 0);
      })
      .catch(() => {});

    return () => { alive = false; sub.remove(); tapSub.remove(); };
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
      {/*
        Android had NO keyboard handling at all — not one screen moved. Three
        causes stacked: every `KeyboardAvoidingView` passed
        `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`, which makes a
        KAV a plain `View` on Android; the fix used elsewhere,
        `automaticallyAdjustKeyboardInsets`, is iOS-only; and Expo 54+ makes
        edge-to-edge mandatory, under which `adjustResize` no longer resizes the
        window, so the platform fallback is a no-op too.

        `KeyboardProvider` gives one code path that genuinely works on both. It
        must sit above every screen, hence here.
      */}
      <KeyboardProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        {/*
          `onInit` because pragmas are PER CONNECTION, and this is the second
          connection — the one every screen writes through. `openDB` sets the
          same two on its own; without this the two disagreed about foreign-key
          enforcement, which made the same delete succeed on one and fail on the
          other. See `applyConnectionPragmas` for why the answer is OFF for now.
        */}
        <SQLiteProvider databaseName="budgetsplit.db" onInit={applyConnectionPragmas}>
          <FeatureFlagsProvider>
          <FlagsGate>
          <DataRefreshProvider>
          <StoreHydrator />
          <ToastProvider>
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
                <Stack.Screen name="add/itemized" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              </Stack>
            </OnboardingGate>
          </LockGate>
          </ToastProvider>
          </DataRefreshProvider>
          </FlagsGate>
          </FeatureFlagsProvider>
        </SQLiteProvider>
        <PrivacyScreen />
      </GestureHandlerRootView>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
