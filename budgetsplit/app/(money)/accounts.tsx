import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { Divider } from '../../src/components/ui/Divider';
import { ListRow } from '../../src/components/ui/ListRow';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../src/components/ui/Skeleton';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { PayMethodDisc } from '../../src/components/finance/pay/PayMethodGlyph';
import { AccountSheet } from '../../src/components/finance/money/AccountSheet';
import { useContentInset } from '../../src/hooks/useContentInset';
import { useAccounts } from '../../src/hooks/useAccounts';
import { formatRupees } from '../../src/lib/money';
import { backOr } from '../../src/lib/nav';
import { PAY_METHOD_LABEL, PayMethod } from '../../src/constants/enums';
import type { AccountKind } from '../../src/db/queries/accountSql';
import type { AccountWithBalance } from '../../src/db/queries/accounts';

const KINDS: AccountKind[] = ['bank', 'cash', 'wallet', 'card'];

/** What one account row says under its name: a card's limit and due day. */
function cardLine(a: AccountWithBalance): string | undefined {
  if (a.kind !== 'card') return undefined;
  const parts = [a.credit_limit ? `Limit ${formatRupees(a.credit_limit)}` : null, a.due_day ? `due on the ${a.due_day}` : null];
  return parts.filter(Boolean).join(' · ') || undefined;
}

/**
 * Where your money is held or borrowed from (`U-68`, SC-48): each account with what it holds
 * today, grouped by kind. Tap one to rename it or correct its balance; add as many as you have.
 */
export default function AccountsScreen() {
  const router = useRouter();
  const bottomPad = useContentInset();
  const a = useAccounts();
  const [sheet, setSheet] = useState<{ account?: AccountWithBalance } | null>(null);

  const row = (acc: AccountWithBalance, i: number, archived = false) => (
    <View key={acc.id}>
      {i > 0 && <Divider indent="text" />}
      <ListRow
        leading={<PayMethodDisc method={acc.kind as PayMethod} size={layout.iconCircle} color={archived ? colors.textMuted : colors.accent} />}
        title={acc.name}
        subtitle={archived ? 'Not in use · tap to use again' : cardLine(acc)}
        value={<Text style={[styles.amount, acc.kind === 'card' && acc.balance > 0 && styles.owed]}>
          {acc.kind === 'card' ? `${formatRupees(acc.balance)} owed` : formatRupees(acc.balance)}
        </Text>}
        onPress={() => (archived ? void a.unarchive(acc.id) : setSheet({ account: acc }))}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenHeader title="Accounts" onBack={() => backOr(router, '/(tabs)/savings')} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={a.refreshing} onRefresh={a.onRefresh} />}
      >
        {a.error ? <ErrorState onRetry={a.reload} /> : a.loading ? <SkeletonCard height={220} /> : (
          <>
            {KINDS.map(kind => {
              const list = a.accounts.filter(acc => acc.kind === kind);
              if (list.length === 0) return null;
              return (
                <View key={kind}>
                  <SectionHeader title={PAY_METHOD_LABEL[kind as PayMethod]} />
                  <Card clip>{list.map((acc, i) => row(acc, i))}</Card>
                </View>
              );
            })}
            {a.archived.length > 0 && (
              <View>
                <SectionHeader title="Not in use" />
                <Card clip>{a.archived.map((acc, i) => row(acc, i, true))}</Card>
              </View>
            )}
            <SecondaryButton label="Add account" icon="plus" onPress={() => setSheet({})} style={styles.add} />
          </>
        )}
      </ScrollView>

      <AccountSheet
        state={sheet}
        busy={a.busy}
        onClose={() => setSheet(null)}
        onCreate={async (input) => { if (await a.create(input)) setSheet(null); }}
        onSave={async (acc, input) => { if (await a.save(acc, input)) setSheet(null); }}
        onArchive={async (acc) => { if (await a.archive(acc)) setSheet(null); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  amount: { ...type.amountSM, color: colors.textPrimary },
  owed: { color: colors.expense },
  add: { marginTop: space.lg },
});
