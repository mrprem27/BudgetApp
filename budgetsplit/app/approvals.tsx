import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, layout } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { ApprovalCard } from '../src/components/finance/approvals/ApprovalCard';
import { useApprovals } from '../src/hooks/useApprovals';
import type { PendingEntry } from '../src/lib/approvalData';
import type { PayMethod } from '../src/constants/enums';

/**
 * Entries other people wrote that are waiting on you.
 *
 * Deliberately **not** part of Review. Review's rows are drafts *you* authored —
 * an import you are still shaping, where every field is editable. These are
 * assertions someone else made: you accept or refuse them, and you never silently
 * rewrite them. One "Confirm" button meaning both things would teach the wrong
 * reflex on the screen where it matters most.
 */
export default function ApprovalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busyId, setBusyId] = useState<string | null>(null);
  const {
    byAuthor, approve, reject, trustAuthor,
    error, refreshing, onRefresh, reload,
  } = useApprovals();

  async function run(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    try { await fn(); } finally { setBusyId(null); }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Waiting for you" onBack={() => router.back()} />
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {byAuthor.length === 0 ? (
            <EmptyState
              icon="user-check"
              title="Nothing waiting"
              body="When someone adds an expense in a group you share, it will wait here until you accept it — and it won't touch your numbers until you do."
            />
          ) : (
            byAuthor.map(group => (
              <ApprovalCard
                key={group.authorId}
                authorName={group.authorName}
                entries={group.entries}
                total={group.total}
                busyId={busyId}
                onApprove={(txnId: string, landed?: PayMethod) => run(txnId, () => approve(txnId, landed))}
                onReject={(entry: PendingEntry) => run(entry.txnId, () => reject(entry))}
                onTrust={() => run(group.authorId, () => trustAuthor(group.authorId, group.authorName, group.entries))}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // No `gap` here: ApprovalCard renders card-grouped rows, and a container gap
  // would slice each card into separate slabs (AGENTS §12).
  scroll: { paddingHorizontal: layout.screenPaddingH },
});
