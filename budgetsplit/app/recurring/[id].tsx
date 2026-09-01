import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, alpha } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Card } from '../../src/components/ui/Card';
import { Chip } from '../../src/components/ui/Chip';
import { Divider } from '../../src/components/ui/Divider';
import { ListRow } from '../../src/components/ui/ListRow';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { AmountText } from '../../src/components/ui/AmountText';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useContentInset } from '../../src/hooks/useContentInset';
import { useRecurringActions } from '../../src/hooks/useRecurringActions';
import { useStore } from '../../src/store';
import { getTxnById } from '../../src/db/queries/transactions';
import { getSkipsMap } from '../../src/db/queries/recurring';
import { getGroupById } from '../../src/db/queries/groups';
import { categoryVisual } from '../../src/constants/categories';
import { asFeather } from '../../src/constants/palette';
import { freqLabel, nextUnskippedOccurrence } from '../../src/lib/recurrence';
import { myShareOrTotal, txnTotal } from '../../src/lib/splitMath';
import { formatCompact } from '../../src/lib/money';
import { fullDate } from '../../src/lib/dateFormat';
import { backOr } from '../../src/lib/nav';

/**
 * **One** recurring rule — what tapping a rule anywhere in the app now opens.
 *
 * ## Why this screen exists
 *
 * Recurring rules were listed four times — `plan/recurring` (all groups by kind),
 * Personal's Recurring tab (all groups by group), the group's Recurring tab (one
 * group) — and every one of them navigated into a *fifth* list,
 * `group/[id]/recurring`, which re-rendered the same group's rules as 184pt cards
 * and was the only place carrying the actions. So tapping a rule showed you a list
 * of rules: the tapped one got a 2.6s highlight and nothing scrolled to it, which
 * on a twelve-rule group meant it was usually off-screen.
 *
 * A list navigates to the thing, not to another list. That screen is deleted and
 * this is what its links point at.
 *
 * ## The two figures it corrects
 *
 * The deleted screen summed **all** payments, so a ₹9,000 rent split three ways
 * read ₹9,000 here and ₹3,000 on Plan; and it titled rows `category`, so "Netflix"
 * appeared as "Entertainment". Both now match every other surface — `myShareOrTotal`
 * and `note || category`, the same derivations `RecurringRow` uses.
 *
 * The whole bill is not hidden, it is named underneath: on a shared rule "your
 * share" is the number you plan against, and the total is the number on the invoice.
 */
export default function RecurringRuleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const meId = useStore(s => s.me?.id) ?? '';
  const bottomPad = useContentInset();

  const { data, loading, error, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const rule = await getTxnById(db, id);
    if (!rule) return { rule: null, skips: undefined, groupName: null };
    const [skipMap, group] = await Promise.all([
      getSkipsMap(db, [rule.id]),
      getGroupById(db, rule.group_id),
    ]);
    return {
      rule,
      skips: skipMap.get(rule.id),
      groupName: group && group.is_personal !== 1 ? group.name : null,
    };
  }, [id]);

  const { skipNext, undoSkip, pause, resume, edit, end } = useRecurringActions(reload);

  const rule = data?.rule ?? null;

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Recurring" onBack={() => backOr(router, '/plan/recurring')} />
        <ErrorState onRetry={reload} />
      </View>
    );
  }
  // `loading` is "nothing has resolved yet", so a missing rule is only real once a
  // load has actually finished (see `useScreenData`).
  if (!rule) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Recurring" onBack={() => backOr(router, '/plan/recurring')} />
        {!loading && (
          <EmptyState
            icon="repeat"
            title="Recurring item not found"
            body="It may have been stopped and removed. Past occurrences it already created stay in your history."
            tint={colors.textSecondary}
            actionLabel="See all recurring"
            onAction={() => router.replace('/plan/recurring')}
          />
        )}
      </View>
    );
  }

  const visual = categoryVisual(rule.category);
  const name = rule.note?.trim() || rule.category;
  const wholeBill = txnTotal(rule);
  const myShare = myShareOrTotal(rule, meId);
  const shared = myShare !== wholeBill;

  const state = rule.recur_state;
  const stateMeta = state === 'paused' ? { label: 'Paused', color: colors.healthAmber }
    : state === 'ended' ? { label: 'Ended', color: colors.textMuted }
    : { label: 'Active', color: colors.income };

  // A paused or ended series has no next charge, whatever the date walk says —
  // `nextUnskippedOccurrence` models the calendar, not the rule's state.
  const next = state === 'active' ? nextUnskippedOccurrence(rule, Date.now() + 1, data?.skips) : null;

  /*
   * UPCOMING skips only, which is what the banner claims to count.
   *
   * `getSkipsMap` has no date filter and `resumeRecurring` writes a skip row for
   * every occurrence in the paused gap — all of them in the past. So pausing a
   * daily rule for a month and resuming made this read "30 occurrences skipped",
   * and offered an Undo that `undoNextSkip` (which filters `>= now`) could not act on.
   */
  const upcomingSkips = data?.skips ? [...data.skips].filter(d => d >= Date.now()).length : 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Recurring" onBack={() => backOr(router, '/plan/recurring')} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Card padded>
          <View style={styles.head}>
            <IconCircle
              icon={asFeather(visual?.icon, 'repeat')}
              size={44}
              color={visual?.color ?? colors.accent}
              iconSize={20}
            />
            <View style={styles.headText}>
              <Text style={styles.name} numberOfLines={2}>{name}</Text>
              <Text style={styles.freq}>{freqLabel(rule.recur_freq, rule.recur_interval)}</Text>
            </View>
            <View style={styles.headRight}>
              <AmountText paise={myShare} size="md" forceColor={colors.textPrimary} rounded />
              {/* Named, not hidden: "your share" is what you plan against, the
                  total is what's on the bill. */}
              {shared && <Text style={styles.ofTotal}>of {formatCompact(wholeBill)}</Text>}
            </View>
          </View>

          <Divider indent="none" />

          <View style={styles.metaRow}>
            <Meta label="Started" value={fullDate(new Date(rule.date))} />
            <Meta
              label={state === 'active' ? (next ? 'Next' : 'No more due') : stateMeta.label}
              value={
                next ? fullDate(next)
                : rule.recur_end ? fullDate(new Date(rule.recur_end))
                : '—'
              }
            />
          </View>

          <View style={styles.tags}>
            <Chip label={stateMeta.label} accent={stateMeta.color} selected />
            {data?.groupName && <Chip label={data.groupName} icon="users" />}
            {rule.category !== name && <Chip label={rule.category} icon={asFeather(visual?.icon, 'tag')} />}
          </View>

          {upcomingSkips > 0 && (
            <View style={styles.skipBanner}>
              <Feather name="skip-forward" size={13} color={colors.healthAmber} />
              <Text style={styles.skipText}>
                {upcomingSkips === 1
                  ? 'The next occurrence is skipped'
                  : `${upcomingSkips} upcoming occurrences are skipped`}
              </Text>
            </View>
          )}
        </Card>

        {/*
          * The actions as a list of rows, not a strip of five small buttons.
          *
          * The deleted screen packed Edit · Skip · Undo · Pause · Stop into one
          * flex row per card, five ways across the screen width — under 44pt each
          * once the labels fit (§6), and it repeated the strip for every rule in
          * the group. There is one rule here, so each action gets a full row: a
          * real touch target, room for the label, and no competition for width.
          */}
        {state !== 'ended' ? (
          <>
            <SectionHeader title="Manage" />
            <Card clip>
              <ListRow icon="edit-2" title="Edit" subtitle="Amount, category or schedule" onPress={() => edit(rule.id)} />

              {state === 'active' && next && (
                <>
                  <Divider indent="text" />
                  <ListRow icon="skip-forward" title="Skip the next one" subtitle={`Due ${fullDate(next)}`} onPress={() => skipNext(rule.id)} />
                </>
              )}

              {upcomingSkips > 0 && (
                <>
                  <Divider indent="text" />
                  <ListRow icon="rotate-ccw" title="Undo the next skip" subtitle="Put the skipped occurrence back" onPress={() => undoSkip(rule.id)} />
                </>
              )}

              <Divider indent="text" />
              {state === 'paused' ? (
                <ListRow icon="play" iconColor={colors.income} title="Resume" subtitle="Start creating occurrences again" onPress={() => resume(rule.id)} />
              ) : (
                <ListRow icon="pause" iconColor={colors.healthAmber} title="Pause" subtitle="Stop for now, keep the schedule" onPress={() => pause(rule.id)} />
              )}

              <Divider indent="text" />
              <ListRow icon="x-circle" title="Stop for good" subtitle="Past occurrences stay in history" danger onPress={() => end(rule.id)} />
            </Card>
          </>
        ) : (
          <Text style={styles.endedNote}>
            This series has ended and creates nothing new. The occurrences it already
            made are still in your history.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaVal}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },

  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  headText: { flex: 1, minWidth: 0 },
  headRight: { alignItems: 'flex-end' },
  name: { ...type.subheading, color: colors.textPrimary },
  freq: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
  ofTotal: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  metaRow: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  metaItem: { flex: 1 },
  metaLabel: { ...type.caption, color: colors.textMuted },
  metaVal: { ...type.label, color: colors.textPrimary, marginTop: 2 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },

  skipBanner: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md,
    paddingHorizontal: space.sm, paddingVertical: space.xs,
    backgroundColor: alpha(colors.healthAmber, 9), borderRadius: radius.sm,
  },
  skipText: { ...type.caption, color: colors.healthAmber, flex: 1 },

  endedNote: { ...type.caption, color: colors.textMuted, lineHeight: 18, marginTop: space.md },
});
