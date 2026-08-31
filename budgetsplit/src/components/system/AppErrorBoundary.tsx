import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ErrorBoundaryProps } from 'expo-router';
import { colors, type, space, layout } from '../tokens';
import { ErrorState } from '../ui/ErrorState';

/**
 * What a screen shows instead of a white screen when its render throws.
 *
 * There was no error boundary anywhere in this app, so any render-time throw
 * took the whole thing down with nothing on screen and nothing said — which is
 * how a one-line defect on Linked people (`boundName` reading `link.person.id`
 * off a cast empty object) became "the sharing flow is unreachable" rather than
 * "one row looks wrong".
 *
 * `expo-router` gives every route file a named `ErrorBoundary` export and wraps
 * that route in it. Prefer the ROUTE-level export (`routeErrorBoundary` below)
 * over the root one: it replaces only that screen's content, so the stack, the
 * header and the back gesture all still work and the user can leave. A root
 * boundary replaces the navigator itself, which leaves retry as the only exit —
 * and retry re-renders the same route, so a crash on mount simply loops.
 *
 * The message is shown, not swallowed. A crash the user can describe is worth
 * far more than a tidy apology, and this build has never run on a phone.
 */
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ErrorState
          title="This screen hit a problem"
          body="The rest of the app is fine. You can go back, or try this screen again."
          onRetry={() => { retry(); }}
        />
        <View style={styles.detail}>
          <Text style={styles.detailLabel}>WHAT WENT WRONG</Text>
          <Text style={styles.detailText}>{messageOf(error)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The named export a route file needs:
 *
 *   export const ErrorBoundary = routeErrorBoundary;
 *
 * A plain alias rather than a factory — there is nothing to configure yet, and
 * a factory would invite per-screen copy that then drifts.
 */
export const routeErrorBoundary = AppErrorBoundary;

/** Never let the error screen be the thing that throws. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'No details were reported.';
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.screenPaddingH },
  detail: { marginTop: space.lg, paddingHorizontal: space.md },
  detailLabel: { ...type.caption, color: colors.textMuted, marginBottom: space.xs },
  detailText: { ...type.caption, color: colors.textSecondary },
});
