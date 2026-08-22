import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { colors, type, space } from '../../tokens';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { SectionHeader } from '../../ui/SectionHeader';
import { describeImpact, type PendingEntry } from '../../../lib/approvalData';
import { formatRupees } from '../../../lib/money';

type Props = {
  authorName: string;
  entries: PendingEntry[];
  /** What accepting all of theirs would cost me. */
  total: number;
  busyId: string | null;
  onApprove: (txnId: string) => void;
  onReject: (entry: PendingEntry) => void;
  onTrust: () => void;
};

/**
 * Everything one person is waiting on, in one card.
 *
 * Grouped by author rather than by date because "who is asking" is the decision.
 * That is also what earns the Trust row at the bottom: after the second or third
 * entry from the same person, tapping Approve again is not the honest answer.
 *
 * Mirrors the "Waiting for you" shape in `settings/linked.tsx` — the app's
 * existing precedent for approving something a person sent you.
 */
export function ApprovalCard({
  authorName, entries, total, busyId, onApprove, onReject, onTrust,
}: Props) {
  return (
    <>
      <SectionHeader title={authorName} />
      <Card>
        {entries.map((e, i) => (
          <View key={e.txnId}>
            {i > 0 && <Divider indent="text" />}
            <ListRow
              icon={e.kind === 'settlement' ? 'repeat' : 'shopping-bag'}
              title={describeImpact(e)}
              subtitle={format(new Date(e.date), 'd MMM')}
              variant="stacked"
              chevron={false}
            />
            <View style={styles.decideRow}>
              <SecondaryButton
                label="Not mine"
                size="md"
                danger
                onPress={() => onReject(e)}
                disabled={busyId === e.txnId}
                style={styles.decideBtn}
              />
              <PrimaryButton
                label="Approve"
                onPress={() => onApprove(e.txnId)}
                loading={busyId === e.txnId}
                style={styles.decideBtn}
              />
            </View>
          </View>
        ))}
      </Card>

      {/*
        Named, not implied. "Approve all" without the figure is a convenience;
        with it, it is a decision.
      */}
      {entries.length > 1 && (
        <Text style={styles.hint}>
          Accepting all {entries.length} would add {formatRupees(total)} to your spending.
        </Text>
      )}

      <SecondaryButton
        label={`Trust ${authorName}`}
        size="md"
        onPress={onTrust}
        style={styles.trustBtn}
      />
      <Text style={styles.hint}>
        Their entries would count straight away, in every group you share.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  decideRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  decideBtn: { flex: 1 },
  trustBtn: { marginTop: space.md },
  hint: { ...type.caption, color: colors.textSecondary, marginTop: space.sm },
});
