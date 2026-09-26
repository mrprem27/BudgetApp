import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, type, space, radius } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { Divider } from '../../src/components/ui/Divider';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { formatRupees } from '../../src/lib/money';
import { DEV_TOOLS_ENABLED } from '../../src/constants/devTools';
import { useEngineDevComparison, type EngineComparisonRow } from '../../src/hooks/useEngineDevComparison';

/**
 * Old Safe-to-Spend beside the new engine's day-by-day projection — one row per
 * persona (`SPEC-ENGINE.md` §7), plus this device's own ledger. Dev tools only
 * (`EN2`); never reachable once `DEV_TOOLS_ENABLED` is `false`, same gate and
 * same defense-in-depth pattern as `app/storage.tsx`. Read-only: nothing here
 * writes to the signed-in device's ledger — only to five throwaway in-memory
 * databases, one per persona.
 */
export default function EngineDevScreen() {
  const router = useRouter();
  useFocusEffect(useCallback(() => {
    if (!DEV_TOOLS_ENABLED) router.back();
  }, [router]));

  const { rows, error, reload } = useEngineDevComparison();

  return (
    <View style={styles.container}>
      <ScreenHeader title="Money engine (dev)" onBack={() => router.back()} />
      {error ? (
        <ErrorState onRetry={reload} body={error} />
      ) : !rows ? (
        <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Old Safe-to-Spend (a flat subtraction over 30 days) beside the new
            projection, walked day by day. They read the same whenever nothing
            lands mid-horizon; where a bill does, its day is named below —
            never just a different number with no explanation.
          </Text>
          {rows.map(row => <ComparisonCard key={row.key} row={row} />)}
          <SecondaryButton label="Recompute" onPress={reload} style={styles.recompute} />
        </ScrollView>
      )}
    </View>
  );
}

function ComparisonCard({ row }: { row: EngineComparisonRow }) {
  const events = row.v2.projection.days
    .flatMap(d => d.events.map(e => ({ ...e, dayDate: d.date })));

  return (
    <Card padded style={styles.card}>
      <Text style={styles.name}>{row.label}</Text>
      <View style={styles.figureRow}>
        <Figure label="Old" amount={row.old.amount} rate={row.old.dailyRate} />
        <Figure label="New" amount={row.v2.amount} rate={row.v2.dailyRate} />
      </View>
      <Text style={[styles.match, row.matches ? styles.matchYes : styles.matchNo]}>
        {row.matches ? 'Matches' : 'Differs — see below'}
      </Text>
      {events.length > 0 && (
        <>
          <Divider indent="none" />
          {events.map((e, i) => (
            <Text key={i} style={styles.event}>
              {new Date(e.dayDate).toISOString().slice(0, 10)} · {e.label} · {formatRupees(e.amountPaise)}
            </Text>
          ))}
        </>
      )}
    </Card>
  );
}

function Figure({ label, amount, rate }: { label: string; amount: number; rate: number | null }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureAmount}>{formatRupees(amount)}</Text>
      <Text style={styles.figureRate}>{rate == null ? 'no rate yet' : `${formatRupees(rate)}/day`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.md, paddingBottom: space.xl },
  intro: { ...type.caption, color: colors.textSecondary, marginBottom: space.md, lineHeight: 18 },
  card: { marginBottom: space.md, borderRadius: radius.lg },
  name: { ...type.labelSemi, color: colors.textPrimary, marginBottom: space.sm },
  figureRow: { flexDirection: 'row', gap: space.md },
  figure: { flex: 1 },
  figureLabel: { ...type.caption, color: colors.textMuted },
  figureAmount: { ...type.amountSM, color: colors.textPrimary },
  figureRate: { ...type.caption, color: colors.textMuted },
  match: { ...type.caption, marginTop: space.sm, fontFamily: 'Inter_600SemiBold' },
  matchYes: { color: colors.income },
  matchNo: { color: colors.healthAmber },
  event: { ...type.caption, color: colors.textSecondary, marginTop: space.xs },
  recompute: { marginTop: space.sm },
});
