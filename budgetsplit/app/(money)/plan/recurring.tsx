import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../../src/theme';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { AppRefreshControl } from '../../../src/components/ui/AppRefreshControl';
import { RecurringInventory } from '../../../src/components/finance/recurring/RecurringInventory';
import { useScreenData } from '../../../src/hooks/useScreenData';
import { useContentInset } from '../../../src/hooks/useContentInset';
import { loadRecurringInventory, loadStoppedRecurring } from '../../../src/lib/recurringData';
import { StoppedRecurring } from '../../../src/components/finance/recurring/StoppedRecurring';
import { backOr } from '../../../src/lib/nav';

/**
 * The recurring **inventory** — one row per rule, across every group.
 *
 * Not the same list as Upcoming, which is one row per upcoming *charge*: a yearly rule due in
 * eleven months, a paused rule, or one whose next occurrences are all skipped, are rules with no
 * upcoming charge — they belong here and nowhere else. The list itself is `RecurringInventory`,
 * which a group's Recurring tab renders too (`U-38`).
 */
export default function RecurringScreen() {
  const router = useRouter();
  const bottomPad = useContentInset();
  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const [active, stopped] = await Promise.all([loadRecurringInventory(db), loadStoppedRecurring(db)]);
    return { active, stopped };
  }, []);
  const subs = data?.active ?? [];
  const stopped = data?.stopped ?? [];

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Recurring" onBack={() => backOr(router, '/(tabs)/savings')} />
        <ErrorState onRetry={reload} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Recurring" onBack={() => backOr(router, '/(tabs)/savings')} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!loading && subs.length === 0 ? (
          <EmptyState
            icon="refresh-cw"
            title="No recurring items yet"
            body="Mark an expense as Recurring (monthly Netflix, rent, gym…) when you add it, and it'll show here with its monthly cost and next charge."
            actionLabel="Add a recurring expense"
            onAction={() => router.push('/add/quick?kind=expense')}
          />
        ) : subs.length > 0 ? (
          <>
            <RecurringInventory subs={subs} onOpen={id => router.push(`/recurring/${id}`)} />
            <Text style={styles.footHint}>Tap a row to edit, pause or stop it.</Text>
          </>
        ) : null}
        {/* Stopped rules were listed nowhere across groups; they sit behind one row here (`U-62`). */}
        {!loading && <StoppedRecurring stopped={stopped} onOpen={id => router.push(`/recurring/${id}`)} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  footHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md },
});
