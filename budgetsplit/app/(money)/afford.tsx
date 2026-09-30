import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { KeyboardForm } from '../../src/components/ui/KeyboardForm';
import { useRouter } from 'expo-router';
import { useScreenData } from '../../src/hooks/useScreenData';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout, shadow, alpha } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { CategoryPicker } from '../../src/components/finance/CategoryPicker';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { Chip } from '../../src/components/ui/Chip';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { OptionRow } from '../../src/components/ui/OptionRow';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { loadAffordData } from '../../src/lib/affordData';
import { track } from '../../src/lib/usageEvents';
import { afford } from '../../src/lib/engine/assess';
import { affordTrace, type TraceLine, type TraceStatus } from '../../src/lib/engine/trace';
import type { AffordResult, AffordVerdict, Purchase } from '../../src/lib/engine/types';
import { parseToPaise, formatRupees, formatCompact } from '../../src/lib/money';
import { shortDate } from '../../src/lib/dateFormat';
import type { FeatherName } from '../../src/constants/palette';
import { backOr } from '../../src/lib/nav';

/**
 * `EN11` — rebuilt on the money engine (`SPEC-ENGINE.md` §4.1), "number
 * first" per the user's pick 2026-09-27: the headline and verdict lead, at
 * most 2 reasons (already ranked and phrased by the engine — no second copy
 * of the sentence to keep in sync with it), the largest comfortable amount,
 * a can-wait date, and the full working folds behind "How we got this" —
 * `affordTrace` (`lib/engine/trace.ts`): every input, dated event, low point,
 * check and the rule that turned them into the verdict, each with its number. The Need/Want chip is gone — nothing in v1 reads it (spec §5).
 *
 * `lib/afford.ts`'s six checks are deleted; this is the only caller of
 * the old formula's evaluator left, and it's gone too.
 */

type PurchaseFrequency = 'once' | 'weekly' | 'monthly' | 'yearly';
const FREQUENCY_OPTS: { key: PurchaseFrequency; label: string }[] = [
  { key: 'once', label: 'One-time' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const VERDICT_STYLE: Record<AffordVerdict, { color: string; icon: FeatherName; title: string }> = {
  'comfortable': { color: colors.income, icon: 'check-circle', title: 'Yes, you can afford it' },
  'tight': { color: colors.healthAmber, icon: 'alert-triangle', title: 'Possible, but tight' },
  'not-affordable': { color: colors.expense, icon: 'x-circle', title: 'Not right now' },
};
/** `verdict === null` (thin history, `explanation.suppressVerdict`) — a real, renderable state. */
const NEUTRAL_STYLE = { color: colors.textMuted, icon: 'help-circle' as FeatherName, title: 'Not enough data yet' };

export default function AffordScreen() {
  const router = useRouter();
  const { flags } = useFeatureFlags();
  const [amountText, setAmountText] = useState('');
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<PurchaseFrequency>('once');
  const [canWait, setCanWait] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [freqOpen, setFreqOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);

  // Errors must NOT be swallowed: a null snapshot renders as "no result yet",
  // never as a confident wrong answer — `error` short-circuits to a retry
  // screen below instead of falling through to a zeroed FinanceSnapshot.
  const { data: snapshot, error: loadError, reload } = useScreenData(loadAffordData, []);

  const amount = parseToPaise(amountText);

  const purchase: Purchase | null = useMemo(() => (amount > 0 ? {
    amountPaise: amount,
    category: categoryName ?? undefined,
    when: canWait ? 'can-wait' : 'now',
    recurrence: frequency === 'once' ? undefined : frequency,
  } : null), [amount, categoryName, canWait, frequency]);

  const result: AffordResult | null = useMemo(() => {
    if (!snapshot || !purchase) return null;
    return afford(snapshot.snapshot, purchase);
  }, [snapshot, purchase]);

  // Only built while the panel is open — it re-walks the projection twice.
  const trace = useMemo(() => {
    if (!showBreakdown || !snapshot || !purchase || !result) return null;
    return affordTrace(snapshot.snapshot, purchase, result);
  }, [showBreakdown, snapshot, purchase, result]);

  const showResult = amount > 0 && !!result;
  // Once per visit, when the first answer appears — not on every keystroke.
  const tracked = useRef(false);
  useEffect(() => {
    if (!tracked.current && result) { tracked.current = true; track('Afford checked', { verdict: result.verdict ?? 'not-enough-data', frequency }); }
  }, [result, frequency]);
  // A neutral fallback, not `null`: `verdict` is deliberately `null` when
  // history is too thin for any verdict at all (`explanation.suppressVerdict`)
  // — that's a real state to render ("Not enough data yet"), not the absence
  // of one. Gating the card on `V` being non-null used to skip it entirely.
  const V = result?.verdict != null ? VERDICT_STYLE[result.verdict] : NEUTRAL_STYLE;

  // The title already says "Not enough data yet"; the line under it says what is missing.
  const headline = !result ? '' : result.explanation.suppressVerdict
    ? `Needs ${result.explanation.missing}`
    : `${result.headline}, ${shortDate(result.lowPointAfter.date)}`;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Can I afford this?" onBack={() => backOr(router, '/(tabs)')} />
      {loadError ? (
        <ErrorState
          title="Couldn't check your balance"
          body="We couldn't read your money, so we can't answer this yet. Try again."
          onRetry={reload}
        />
      ) : (
        <KeyboardForm contentContainerStyle={styles.scroll}>
          <View style={styles.amountWrap}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              autoFocus
              accessibilityLabel="Purchase amount"
            />
          </View>

          {/* The answer, live, right under the amount — the keyboard covers everything below the
              fold, so the verdict has to sit where the typing is (`U-04`). */}
          {showResult && result && (
            <View style={[styles.liveLine, { backgroundColor: alpha(V.color, 13), borderColor: alpha(V.color, 33) }]}>
              <Feather name={V.icon} size={16} color={V.color} />
              <Text style={[styles.liveText, { color: V.color }]} numberOfLines={1}>{V.title}</Text>
            </View>
          )}

          {/* The three questions as one card of rows, each opening its own answer. */}
          <Card clip>
            <ListRow icon="repeat" title="How often" value={FREQUENCY_OPTS.find(o => o.key === frequency)?.label} onPress={() => setFreqOpen(true)} />
            <Divider indent="text" />
            <ListRow
              icon="tag"
              title="Category"
              value={categoryName
                ? <Chip label={categoryName} selected maxWidth={140} onRemove={() => setCategoryName(null)} />
                : 'Any'}
              onPress={snapshot && snapshot.categories.length > 0 ? () => setCatOpen(true) : undefined}
            />
            <Divider indent="text" />
            <ListRow
              icon="clock"
              title="Can wait"
              subtitle="Find the first comfortable date"
              chevron={false}
              value={<Switch value={canWait} onValueChange={setCanWait} trackColor={{ true: colors.accent, false: colors.bgMuted }} thumbColor={colors.textPrimary} accessibilityLabel="Can wait" />}
            />
          </Card>

          {showResult && result && (
            <View style={[styles.resultCard, { borderColor: alpha(V.color, 33) }]}>
              <Feather name={V.icon} size={30} color={V.color} style={styles.resultIcon} />
              <Text style={[styles.resultTitle, { color: V.color }]}>{V.title}</Text>
              <Text style={styles.headline}>{headline}</Text>

              {/* Thin history suppresses the verdict outright, not just the
                  confidence — showing specific reasons/amounts/dates under
                  "not enough data yet" would contradict the headline itself. */}
              {!result.explanation.suppressVerdict && (
                <>
                  {result.reasons.slice(0, 2).map((r, i) => (
                    <View key={i} style={styles.reasonRow}>
                      <View style={[styles.reasonDot, { backgroundColor: V.color }]} />
                      <Text style={styles.reasonText}>{r.label} ({formatCompact(r.amountPaise)})</Text>
                    </View>
                  ))}
                  {result.verdict !== 'not-affordable' && (
                    <Text style={styles.mostText}>Most you can spend comfortably: {formatRupees(result.largestComfortableAmount)}</Text>
                  )}
                  {canWait && result.earliestComfortableDate != null && (
                    <Text style={styles.mostText}>Comfortable from {shortDate(result.earliestComfortableDate)}</Text>
                  )}
                  {result.explanation.confidence !== 'high' && (
                    <Text style={styles.confidenceText}>
                      {result.explanation.confidence === 'low' ? 'Low confidence' : 'Medium confidence'}
                      {result.explanation.missing ? `, ${result.explanation.missing}` : ''}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          {showResult && (
            <View>
              <TouchableOpacity
                style={styles.disclosureRow}
                onPress={() => setShowBreakdown(!showBreakdown)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showBreakdown }}
              >
                <Text style={styles.disclosureText}>How we got this, full working</Text>
                <Feather name={showBreakdown ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {trace && (
                <View style={styles.traceWrap}>
                  {trace.sections.map((section, si) => (
                    <Card key={section.key} style={styles.breakdownCard}>
                      <Text style={styles.sectionTitle}>{si + 1}. {section.title}</Text>
                      {section.lines.map((line, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <View style={styles.breakdownDivider} />}
                          <TraceRow line={line} />
                        </React.Fragment>
                      ))}
                    </Card>
                  ))}
                </View>
              )}
            </View>
          )}

          {showResult && (
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              {flags.savingsGoals && (
                <SecondaryButton label="Save toward it in a goal" onPress={() => router.replace('/savings?tab=goals')} />
              )}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.ghostBtn}
                  onPress={() => router.replace(
                    `/add/quick?amount=${amount}${categoryName ? `&category=${encodeURIComponent(categoryName)}` : ''}`,
                  )}
                  accessibilityRole="button"
                >
                  <Text style={styles.ghostBtnText}>{result?.verdict === 'not-affordable' ? 'Buy anyway' : 'Log it'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => backOr(router, '/(tabs)')} accessibilityRole="button">
                  <Text style={styles.ghostBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardForm>
      )}

      {/* One question: pick exactly one. */}
      <SheetModal visible={freqOpen} onClose={() => setFreqOpen(false)} title="How often?" scroll={false}>
        <View style={styles.options}>
          {FREQUENCY_OPTS.map(o => (
            <OptionRow key={o.key} label={o.label} selected={frequency === o.key} onPress={() => { setFrequency(o.key); setFreqOpen(false); }} />
          ))}
        </View>
      </SheetModal>
      {snapshot && (
        <CategoryPicker
          categories={snapshot.categories}
          value={snapshot.categories.find(c => c.name === categoryName) ?? null}
          onChange={c => { setCategoryName(c.name); setCatOpen(false); }}
          forceOpen={catOpen}
          onClose={() => setCatOpen(false)}
          hideTrigger
        />
      )}
    </View>
  );
}

const STATUS_STYLE: Record<TraceStatus, { icon: FeatherName; color: string }> = {
  pass: { icon: 'check-circle', color: colors.income },
  warn: { icon: 'alert-triangle', color: colors.healthAmber },
  fail: { icon: 'x-circle', color: colors.expense },
  info: { icon: 'info', color: colors.textMuted },
};

function TraceRow({ line }: { line: TraceLine }) {
  const st = line.status ? STATUS_STYLE[line.status] : null;
  const valueColor = st && line.status !== 'info'
    ? st.color
    : line.amountPaise != null && line.amountPaise < 0 ? colors.expense : colors.textPrimary;
  return (
    <View style={styles.breakdownRow}>
      {st && <Feather name={st.icon} size={14} color={st.color} style={styles.statusIcon} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.breakdownLabel}>{line.label}</Text>
        {!!line.detail && <Text style={styles.breakdownHint}>{line.detail}</Text>}
      </View>
      <Text style={[styles.breakdownAmount, { color: valueColor }]}>{line.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
  amountWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderColor: colors.border },
  rupee: { fontFamily: 'SpaceMono_400Regular', fontSize: 32, color: colors.textMuted },
  amountInput: { fontFamily: 'SpaceMono_400Regular', fontSize: 40, color: colors.textPrimary, minWidth: 120, textAlign: 'center' },
  liveLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, alignSelf: 'center', paddingHorizontal: space.md, height: 36, borderRadius: radius.pill, borderWidth: 1 },
  liveText: { ...type.labelSemi },
  options: { gap: space.sm },
  resultCard: { alignItems: 'center', gap: space.xs, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, padding: space.lg, ...shadow.sm },
  resultIcon: { marginBottom: space.xs },
  resultTitle: { ...type.subheading, marginBottom: space.xs },
  headline: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'stretch', marginTop: space.xs },
  reasonDot: { width: 5, height: 5, borderRadius: 3 },
  reasonText: { ...type.caption, color: colors.textSecondary, flex: 1 },
  mostText: { ...type.caption, color: colors.textMuted, marginTop: space.sm, textAlign: 'center' },
  confidenceText: { ...type.caption, color: colors.healthAmber, marginTop: space.xs, textAlign: 'center' },
  disclosureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  disclosureText: { ...type.label, color: colors.textMuted },
  traceWrap: { gap: space.sm },
  sectionTitle: { ...type.labelSemi, color: colors.textPrimary, paddingTop: space.md, paddingBottom: space.xs },
  statusIcon: { alignSelf: 'flex-start', marginTop: 3 },
  breakdownCard: { paddingHorizontal: space.md },
  breakdownDivider: { height: 1, backgroundColor: colors.border },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm, gap: space.sm },
  breakdownLabel: { ...type.body, color: colors.textSecondary },
  breakdownHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  breakdownAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, maxWidth: '45%', textAlign: 'right' },
  actionRow: { flexDirection: 'row', gap: space.sm },
  ghostBtn: { flex: 1, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { ...type.button, color: colors.accent },
});
