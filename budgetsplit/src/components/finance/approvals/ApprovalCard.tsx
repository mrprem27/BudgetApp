import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { colors, type, space } from '../../tokens';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { ListRow } from '../../ui/ListRow';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SecondaryButton } from '../../ui/SecondaryButton';
import { trustAndApproveLabel, trustMeans } from '../../../lib/trustCopy';
import { SectionHeader } from '../../ui/SectionHeader';
import { describeImpact, isIncomingTransfer, type PendingEntry } from '../../../lib/approvalData';
import { PayMethodSelector } from '../PayMethodSelector';
import { INCOME_LANDING, INCOME_LANDING_DEFAULT, type PayMethod } from '../../../constants/enums';
import { formatRupees } from '../../../lib/money';

type Props = {
  authorName: string;
  entries: PendingEntry[];
  /** What accepting all of theirs would cost me. */
  total: number;
  busyId: string | null;
  onApprove: (txnId: string, landedPayMethod?: PayMethod) => void;
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
          <EntryRow
            key={e.txnId}
            entry={e}
            divided={i > 0}
            busy={busyId === e.txnId}
            onApprove={onApprove}
            onReject={onReject}
          />
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

      {/*
        * The label names BOTH halves, because this button does both.
        *
        * It read `Trust {authorName}` — identical to the person screen's button,
        * which only sets the flag. This one also approves everything waiting
        * (`useApprovals.trustAuthor`), so the same words cleared a queue in one
        * place and did not in the other. A user who learned the word here learned
        * the wrong thing for there.
        */}
      <SecondaryButton
        label={trustAndApproveLabel(authorName, entries.length)}
        size="md"
        onPress={onTrust}
        style={styles.trustBtn}
      />
      <Text style={styles.hint}>{trustMeans(authorName)}</Text>
    </>
  );
}

/**
 * One entry. Split out because money arriving needs its own local state — the
 * landing method — and a `useState` per row cannot live inside a `.map()`.
 */
function EntryRow({ entry: e, divided, busy, onApprove, onReject }: {
  entry: PendingEntry;
  divided: boolean;
  busy: boolean;
  onApprove: (txnId: string, landedPayMethod?: PayMethod) => void;
  onReject: (entry: PendingEntry) => void;
}) {
  const incoming = isIncomingTransfer(e);
  // Defaulted, not blank: a required question with no default is friction, and
  // Bank is where a settlement most often lands. Still changeable in one tap.
  const [landed, setLanded] = useState<PayMethod>(INCOME_LANDING_DEFAULT);

  return (
    <View>
      {divided && <Divider indent="text" />}
      <ListRow
        icon={e.kind === 'settlement' ? 'repeat' : e.recurFreq ? 'refresh-cw' : 'shopping-bag'}
        title={describeImpact(e)}
        subtitle={format(new Date(e.date), 'd MMM')}
        variant="stacked"
        chevron={false}
      />

      {/*
        Only for money arriving. The sender says how they sent it; only you know
        where it actually turned up, and the two are routinely different. Asking
        here is also the moment you would notice it never arrived at all.
      */}
      {incoming && (
        <View style={styles.landing}>
          <Text style={styles.landingLabel}>Where did it land?</Text>
          <PayMethodSelector value={landed} onChange={setLanded} options={INCOME_LANDING} />
        </View>
      )}

      <View style={styles.decideRow}>
        <SecondaryButton
          label={incoming ? 'Never arrived' : 'Not mine'}
          size="md"
          danger
          onPress={() => onReject(e)}
          disabled={busy}
          style={styles.decideBtn}
        />
        <PrimaryButton
          label={incoming ? 'Got it' : 'Approve'}
          onPress={() => onApprove(e.txnId, incoming ? landed : undefined)}
          loading={busy}
          style={styles.decideBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  landing: { paddingHorizontal: space.md, paddingBottom: space.sm },
  landingLabel: { ...type.caption, color: colors.textSecondary, marginBottom: space.xs },
  decideRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  decideBtn: { flex: 1 },
  trustBtn: { marginTop: space.md },
  hint: { ...type.caption, color: colors.textSecondary, marginTop: space.sm },
});
