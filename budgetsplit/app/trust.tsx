import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, type, space, layout, radius } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { EmptyState } from '../src/components/ui/EmptyState';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { SectionHeader } from '../src/components/ui/SectionHeader';
import { Card } from '../src/components/ui/Card';
import { Divider } from '../src/components/ui/Divider';
import { ListRow } from '../src/components/ui/ListRow';
import { MemberAvatar } from '../src/components/finance/MemberAvatar';
import { TrustSheet } from '../src/components/finance/TrustSheet';
import { useContentInset } from '../src/hooks/useContentInset';
import { useTrustCentre } from '../src/hooks/useTrustCentre';
import { trustStateLabel, trustInert, trustStandingNote } from '../src/lib/trustCopy';
import type { TrustRow } from '../src/lib/trustCentre';

/**
 * **Who can add to my ledger** — the one place that answers it.
 *
 * ## Why this screen exists
 *
 * Trust was only ever visible one person at a time, on that person's own screen,
 * and only when they had a linked account. So "who can write to my numbers right
 * now" could not be answered without visiting every contact in turn — and the
 * approvals queue's empty state sent you to People under the label "Manage who you
 * trust", a screen that does not mention trust at all.
 *
 * ## The three groups, and why the third is the point
 *
 * Not two. A person with no linked account has no write path (`lib/trust.ts` checks
 * `remote_uid` before it reads any trust value), so their setting is stored and
 * inert. Listing them under "waits for you" would reassure in the wrong direction:
 * it reads as "I am holding their entries back" when nothing of theirs can arrive
 * to be held. They get their own group, and it says so.
 *
 * ## The standing note
 *
 * Trusting somebody is not handing over the keys, and the screen has to say that
 * where the toggles are — not two taps away in a confirm dialog. Even a trusted
 * person is asked before anything claiming YOUR money moved. Wording comes from
 * `lib/trustCopy`, which is the single source and has a test forbidding a second
 * one.
 */
export default function TrustCentreScreen() {
  const router = useRouter();
  const { sections, loading, error, refreshing, onRefresh, reload, toggle } = useTrustCentre();
  const bottomPad = useContentInset();
  /*
   * The same sheet the person screen uses, not a second control for one setting.
   *
   * A bare switch here would have been quicker to tap and worse: the choice is
   * one people get wrong in the reassuring direction, and the sheet is what
   * carries the sentence saying what each answer actually does. Reusing it also
   * means this screen cannot drift from the person screen's wording, which is
   * the failure `trustCopy` was written to end.
   */
  const [sheetFor, setSheetFor] = useState<TrustRow | null>(null);

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Who can add to my ledger" onBack={() => router.back()} />
        <ErrorState onRetry={reload} />
      </View>
    );
  }

  const row = (r: TrustRow, i: number, last: number) => (
    <View key={r.person.id}>
      {i > 0 && <Divider indent="text" />}
      <ListRow
        leading={<MemberAvatar name={r.person.name} color={r.person.avatar_color} size={layout.avatarSize} imageUri={r.person.image_uri} />}
        title={r.person.name}
        // The exception is named here rather than hidden behind a tap, because
        // "trusted, except in Goa" is a different answer from "trusted" and the
        // list is where somebody is comparing people.
        subtitle={r.exceptions.length > 0
          ? `Except in ${r.exceptions.join(', ')}`
          : r.bucket === 'unreachable' ? 'No linked account' : undefined}
        value={r.bucket === 'unreachable'
          ? <Text style={styles.inert}>{trustStateLabel(r.state)}</Text>
          : trustStateLabel(r.state)}
        // Tapping the row IS the setting — that is what this screen is for.
        // Per-group exceptions stay on the person's own screen, because they are
        // a refinement of this answer rather than a competing one.
        onPress={() => setSheetFor(r)}
        accessibilityLabel={`${r.person.name}. ${trustStateLabel(r.state)}. Change.`}
      />
      {i === last && null}
    </View>
  );

  const group = (title: string, rows: TrustRow[], note?: string) => (rows.length === 0 ? null : (
    <>
      <SectionHeader title={`${title} · ${rows.length}`} />
      {note && <Text style={styles.groupNote}>{note}</Text>}
      <Card clip>{rows.map((r, i) => row(r, i, rows.length - 1))}</Card>
    </>
  ));

  return (
    <View style={styles.container}>
      <ScreenHeader title="Who can add to my ledger" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!loading && sections.total === 0 ? (
          <EmptyState
            icon="shield"
            title="Nobody else can write here"
            body="Once you share a group with someone and match them to their account, they appear here and you decide whether their entries wait for you."
            actionLabel="Add people"
            onAction={() => router.push('/friends')}
          />
        ) : (
          <>
            {/* Headings come from `trustStateLabel`, the same function the rows
                use — so a section can never be titled differently from the value
                printed against every person inside it. */}
            {group(trustStateLabel('trusted'), sections.immediate)}
            {group(trustStateLabel('review'), sections.waits)}
            {group(
              'Cannot reach you yet',
              sections.unreachable,
              sections.unreachable.length > 0 ? trustInert(sections.unreachable[0].person.name) : undefined,
            )}

            {/* Stated where the toggles are, not two taps away in a dialog. */}
            <View style={styles.standing}>
              <Text style={styles.standingText}>{trustStandingNote()}</Text>
            </View>
          </>
        )}
      </ScrollView>

      <TrustSheet
        visible={!!sheetFor}
        onClose={() => setSheetFor(null)}
        name={sheetFor?.person.name ?? ''}
        // Person-level, never a group: one of the two answers is always in force,
        // so there is no "follow the setting above" option to offer here.
        scope={null}
        value={sheetFor?.state ?? 'review'}
        inherited={sheetFor?.state ?? 'review'}
        onChoose={(next) => {
          if (!sheetFor || next === null || next === sheetFor.state) return;
          toggle(sheetFor.person, next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  // Muted, because the value is real but currently cannot do anything.
  inert: { ...type.body, color: colors.textMuted },
  groupNote: { ...type.caption, color: colors.textSecondary, marginBottom: space.sm },
  standing: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
  },
  standingText: { ...type.caption, color: colors.textSecondary, lineHeight: 18 },
});
