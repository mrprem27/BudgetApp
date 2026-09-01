import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useScreenData } from '../src/hooks/useScreenData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { getDate, getDaysInMonth } from 'date-fns';
import { monthLabel } from '../src/lib/dateFormat';
import { colors, type, space, layout, alpha } from '../src/theme';
import { categoryVisual } from '../src/constants/categories';
import { asFeather } from '../src/constants/palette';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { Badge } from '../src/components/ui/Badge';
import { Card } from '../src/components/ui/Card';
import { Chip } from '../src/components/ui/Chip';
import { Divider } from '../src/components/ui/Divider';
import { ListRow } from '../src/components/ui/ListRow';
import { IconCircle } from '../src/components/ui/IconCircle';
import { SectionCard } from '../src/components/ui/SectionCard';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorState } from '../src/components/ui/ErrorState';
import { AppRefreshControl } from '../src/components/ui/AppRefreshControl';
import { InsightText } from '../src/components/finance/InsightText';
import { SampleNote } from '../src/components/finance/SampleNote';
import { BudgetBar } from '../src/components/finance/BudgetBar';
import { healthColor, recColor } from '../src/components/finance/group/helpers';

import type { Insight } from '../src/lib/savingsInsights';
import { formatCompact, formatCompactMajor, formatAxisShort } from '../src/lib/money';
import { loadInsightsData } from '../src/lib/insightsData';
import { budgetHealth, utilLabel } from '../src/lib/budget';
import { plotWidth, axisSpacing } from '../src/lib/chartAxis';

function insightTint(tone: Insight['tone']): string {
  switch (tone) {
    case 'achieve': return colors.income;
    case 'warn': return colors.healthAmber;
    case 'progress': return colors.income;
    default: return colors.accent; // motivate, compare
  }
}

/**
 * Recommendations that repeat something already on this screen.
 *
 * `analytics.ts` emits `over-{category}` for the top three over-budget categories
 * per group — which is exactly what the "Needs attention" rows below are built
 * from — and a `projected` line ("At this pace you'll spend X — Y, Z% over
 * budget") that the headline and the chart badge each state too. Three renderings
 * of one projection, and every overrun printed twice in two shapes.
 *
 * `ontrack` fires per group when nothing else does, so a user in four groups got
 * "All budgets are on track" four times under a headline already saying it.
 */
const isDuplicateRec = (id: string) =>
  id.startsWith('over-') || id === 'projected' || id === 'ontrack';

/** Sections start closed except the one you came here for. */
const DEFAULT_OPEN = 'attention';

export default function InsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cutPct, setCutPct] = useState(20);
  const [open, setOpen] = useState<Set<string>>(new Set([DEFAULT_OPEN]));
  const toggle = (key: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const { data, loading, error: loadError, refreshing, onRefresh, reload } =
    useScreenData((db) => loadInsightsData(db), []);

  const monthSpend = data?.monthSpend ?? 0;
  const txnCount = data?.txnCount ?? 0;
  const budget = data?.budget ?? 0;
  const projected = data?.projected ?? 0;
  const forecastActual = data?.forecastActual ?? [];
  const forecastProjected = data?.forecastProjected ?? [];
  const projectedTotal = data?.projectedTotal ?? 0;
  const shifts = data?.shifts ?? [];
  const whatIf = data?.whatIf ?? null;
  const drivers = data?.drivers ?? [];
  const savings = data?.savings ?? [];
  const multiGroup = data?.multiGroup ?? false;
  const notes = (data?.recommendations ?? []).filter(r => !isDuplicateRec(r.id));

  /**
   * Measured, not guessed. `spacing` was `Math.max(8, 300 / len)` — 300 being a
   * magic width the chart never measured — so a 31-day month gave 9.68px per label
   * container. The library renders each label in a View exactly `spacing` wide at
   * numberOfLines={1}: one digit fits, two do not, hence "1…", "2…", "3…".
   */
  const [chartW, setChartW] = useState(0);
  const onChartLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setChartW(prev => (Math.abs(prev - w) > 0.5 ? w : prev));
  };

  const today = new Date();
  const dayOfMonth = getDate(today);
  const daysInMonth = getDaysInMonth(today);
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const hasBudget = budget > 0;
  const overspend = hasBudget && projected > budget;
  const pctUsed = hasBudget ? Math.round((monthSpend / budget) * 100) : null;
  const dailyAvg = dayOfMonth > 0 ? Math.round(monthSpend / dayOfMonth) : 0;
  const budgetPerDay = hasBudget && daysInMonth > 0 ? Math.round(budget / daysInMonth) : 0;
  const hasForecast = forecastActual.length >= 2 && forecastProjected.length >= 1;

  const attentionCount = drivers.length + notes.length;
  const overTotal = drivers.reduce((s, d) => s + d.over, 0);
  const nothingYet = !loading && !hasBudget && attentionCount === 0 && shifts.length === 0
    && !whatIf && savings.length === 0 && !hasForecast;

  return (
    <View style={styles.container}>
      {/* No month control in the header on purpose. The eyebrow below already names
          the month, and this screen is present-tense — forecast to month-end, "N days
          in", velocity, what-if — so a past month would render a page of claims about
          a month that already finished. Month history is Reports' job, and it has a
          selector capped at the current month. */}
      <ScreenHeader title="Insights" onBack={() => router.back()} />
      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.lg }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {nothingYet ? (
          /* The CTA is the point, not decoration: this screen has nothing to show
             until expenses exist, so the only useful thing it can offer is the way
             to create one. */
          <EmptyState
            icon="bar-chart-2"
            title="No insights yet"
            body="Log a few expenses and split with a group — patterns, alerts and balances show up here."
            tint={colors.textSecondary}
            actionLabel="Add an expense"
            onAction={() => router.push('/add/quick')}
          />
        ) : (
          <>
            {/*
              * THE HEADLINE — always here.
              *
              * This card used to render only when you were projected to overspend,
              * so a good month opened on a chart with no answer to "how am I doing".
              * A screen whose headline exists only when things are bad has no
              * headline; it has an alarm.
              *
              * It was also a bespoke surface (radius 18, border 1.5, padding 18)
              * whose bar filled `budget / projected` in accent — so the FILLED part
              * was your budget and the empty part was the overspend, inverted from
              * `BudgetBar` and Home's `ForecastCard`, where the fill is spend tinted
              * by health. Three legend labels sat `space-between` above a track they
              * did not align with. `Card` + `BudgetBar` replace all of it.
              */}
            <Card padded>
              <View style={styles.headRow}>
                <Text style={styles.eyebrow}>{monthLabel(today)} · {dayOfMonth} days in</Text>
                <Badge
                  label={`${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
                  tone="neutral"
                  icon="clock"
                />
              </View>

              <Text style={[styles.hero, { color: healthColor(budgetHealth(pctUsed)) }]}>
                {formatCompact(monthSpend)}
              </Text>

              {hasBudget ? (
                <>
                  <Text style={styles.heroSub}>
                    of {formatCompact(budget)} · {utilLabel(pctUsed ?? 0)} used
                  </Text>
                  <View style={styles.heroBar}>
                    <BudgetBar pct={pctUsed} health={budgetHealth(pctUsed)} height={10} />
                  </View>
                  <Divider indent="none" />
                  <Text style={[styles.verdict, { color: overspend ? colors.expense : colors.income }]}>
                    {overspend
                      ? `At this pace you'll be ${formatCompact(projected - budget)} over by month-end`
                      : `At this pace you'll finish with ${formatCompact(budget - projected)} to spare`}
                  </Text>
                  <Text style={styles.pace}>
                    You're averaging {formatCompact(dailyAvg)}/day · your budget allows {formatCompact(budgetPerDay)}/day
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.heroSub}>spent so far · {formatCompact(projected)} projected by month-end</Text>
                  <Divider indent="none" />
                  {/* Without a budget every section below is a description with
                      nothing to measure against, so the way to fix that is the
                      card's own action rather than a line of advice. */}
                  <Text style={styles.pace}>
                    Set a budget and this becomes “on track” or “over by ₹X” instead of just a number.
                  </Text>
                  <View style={styles.heroCta}>
                    <Chip label="Set a budget" icon="target" onPress={() => router.push('/budget')} />
                  </View>
                </>
              )}
            </Card>

            {/* One note for the whole screen — every projection below shares the sample. */}
            {!loading && <SampleNote txnCount={txnCount} lowSampleHint="Projections below will sharpen as you log more." />}

            {/*
              * NEEDS ATTENTION — the merge.
              *
              * "Recommendations" and "Driving overspend" were two sections built from
              * the same over-budget categories, so the screen printed "You're ₹800
              * over on Food (140% used)" and then, one section later, "Food · ₹800
              * over". One section, drivers first (the amount is the actionable part),
              * then whatever the rule engine has left to say that isn't a repeat.
              */}
            {attentionCount > 0 && (
              <SectionCard
                title="Needs attention"
                subtitle={overTotal > 0
                  ? `${attentionCount} ${attentionCount === 1 ? 'thing' : 'things'} · ${formatCompact(overTotal)} over`
                  : `${attentionCount} ${attentionCount === 1 ? 'thing' : 'things'}`}
                icon="alert-triangle"
                iconColor={colors.expense}
                expanded={open.has('attention')}
                onToggle={() => toggle('attention')}
              >
                {drivers.map((d, i) => {
                  const vis = categoryVisual(d.category);
                  return (
                    <View key={d.key}>
                      <Divider indent="text" />
                      <ListRow
                        leading={<IconCircle icon={asFeather(vis?.icon, 'tag')} size={layout.iconCircle} color={vis?.color ?? colors.accent} />}
                        title={d.category}
                        subtitle={multiGroup ? d.group : undefined}
                        value={<Text style={styles.over}>{formatCompact(d.over)} over</Text>}
                        chevron={false}
                        onPress={() => router.push(`/category/${encodeURIComponent(d.category)}`)}
                      />
                    </View>
                  );
                })}
                {notes.map(r => (
                  <View key={r.key}>
                    <Divider indent="text" />
                    <NoteRow
                      icon={asFeather(r.icon, 'info')}
                      tint={recColor(r.severity)}
                      body={<Text style={[styles.noteText, { color: recColor(r.severity) }]}>{r.text}</Text>}
                      caption={multiGroup ? r.group : undefined}
                    />
                  </View>
                ))}
              </SectionCard>
            )}

            {hasForecast && (
              <SectionCard
                title="Month-end forecast"
                subtitle={`${formatCompactMajor(projectedTotal)} projected · solid is spent, dashed is ahead`}
                icon="trending-up"
                expanded={open.has('forecast')}
                onToggle={() => toggle('forecast')}
              >
                <Divider indent="none" />
                <View style={styles.chartWrap} onLayout={onChartLayout}>
                  <LineChart
                    data={forecastProjected}
                    data2={forecastActual}
                    color1={colors.accent}
                    color2={colors.expense}
                    thickness1={2}
                    thickness2={2.5}
                    strokeDashArray1={[5, 5]}
                    noOfSections={4}
                    maxValue={Math.ceil((Math.max(...forecastActual.map(d => d.value), ...forecastProjected.map(d => d.value), 1)) * 1.1)}
                    // Until the first layout lands there is nothing measured to
                    // divide, so hold the old constant for one frame rather than
                    // collapsing every label to the floor.
                    spacing={plotWidth(chartW, space.md) > 0 ? axisSpacing(plotWidth(chartW, space.md), forecastProjected.length) : 8}
                    initialSpacing={8}
                    endSpacing={8}
                    xAxisThickness={0}
                    yAxisThickness={0}
                    yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
                    formatYLabel={formatAxisShort}
                    xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
                    hideRules
                    isAnimated
                    disableScroll
                    pointerConfig={{
                      pointerStripUptoDataPoint: true,
                      pointerStripColor: alpha(colors.textMuted, 38),
                      pointerStripWidth: 1,
                      pointerColor: colors.accent,
                      radius: 5,
                      pointerLabelWidth: 76,
                      pointerLabelHeight: 32,
                      activatePointersOnLongPress: false,
                      autoAdjustPointerLabelPosition: true,
                      pointerLabelComponent: (items: Array<{ value: number }>) => (
                        <View style={styles.pointerLabel}>
                          <Text style={styles.pointerLabelText}>{formatAxisShort(items[0]?.value ?? 0)}</Text>
                        </View>
                      ),
                    }}
                  />
                  <View style={styles.legend}>
                    <LegendItem color={colors.expense} label="Actual" />
                    <LegendItem color={colors.accent} label="Projected" />
                  </View>
                </View>
              </SectionCard>
            )}

            {shifts.length > 0 && (
              <SectionCard
                title="Changed vs last month"
                subtitle={`${shifts.length} ${shifts.length === 1 ? 'category' : 'categories'} moved most`}
                icon="repeat"
                expanded={open.has('shifts')}
                onToggle={() => toggle('shifts')}
              >
                {shifts.map(s => {
                  const vis = categoryVisual(s.cat);
                  const up = s.pct > 5, down = s.pct < -5;
                  return (
                    <View key={s.cat}>
                      <Divider indent="text" />
                      <ListRow
                        leading={<IconCircle icon={asFeather(vis?.icon, 'tag')} size={layout.iconCircle} color={vis?.color ?? colors.accent} />}
                        title={s.cat}
                        subtitle={`${formatCompact(s.thisAmt)} this month`}
                        value={
                          <Badge
                            label={up ? `+${s.pct}%` : down ? `${s.pct}%` : 'about the same'}
                            tone={up ? 'expense' : down ? 'income' : 'neutral'}
                            icon={up ? 'arrow-up' : down ? 'arrow-down' : undefined}
                          />
                        }
                        chevron={false}
                      />
                    </View>
                  );
                })}
              </SectionCard>
            )}

            {whatIf && whatIf.monthly > 0 && (
              <SectionCard
                title="What if I cut back?"
                subtitle={`Your biggest category is ${whatIf.name}`}
                icon="scissors"
                expanded={open.has('whatif')}
                onToggle={() => toggle('whatif')}
              >
                <Divider indent="none" />
                <View style={styles.whatIf}>
                  <Text style={styles.whatIfLead}>
                    Spend {cutPct}% less on <Text style={styles.whatIfName}>{whatIf.name}</Text> and you'd keep
                  </Text>
                  <Text style={styles.whatIfSave}>
                    {formatCompact(Math.round((whatIf.monthly * cutPct) / 100))}<Text style={styles.whatIfPer}>/month</Text>
                  </Text>
                  <Text style={styles.whatIfYear}>
                    ≈ {formatCompact(Math.round((whatIf.monthly * cutPct) / 100) * 12)} over a year
                  </Text>
                  {/* `ui/Chip`, not a fourth hand-rolled pill (§9). */}
                  <View style={styles.cutRow}>
                    {[10, 20, 30].map(p => (
                      <Chip key={p} grow label={`${p}%`} selected={cutPct === p} onPress={() => setCutPct(p)} />
                    ))}
                  </View>
                </View>
              </SectionCard>
            )}

            {savings.length > 0 && (
              <SectionCard
                title="Ways to save"
                subtitle={`${savings.length} ${savings.length === 1 ? 'idea' : 'ideas'} from your own spending`}
                icon="feather"
                iconColor={colors.income}
                expanded={open.has('savings')}
                onToggle={() => toggle('savings')}
              >
                {savings.map(ins => {
                  const tint = insightTint(ins.tone);
                  return (
                    <View key={ins.text}>
                      <Divider indent="text" />
                      <NoteRow
                        icon={asFeather(ins.icon, 'info')}
                        tint={tint}
                        body={<InsightText text={ins.text} color={tint} style={styles.noteText} />}
                      />
                    </View>
                  );
                })}
              </SectionCard>
            )}
          </>
        )}
      </ScrollView>
      )}
    </View>
  );
}

/**
 * A row whose value is a **sentence**, so it has to wrap.
 *
 * `ListRow` truncates its title to one line by design, which is right for a label
 * and wrong for advice. Recommendations and savings nudges are the same shape —
 * tinted disc, wrapping body, optional group caption — and had two hand-rolled
 * versions with different paddings and different disc geometry (34px `radius: 9`
 * tiles vs a 28px circle) for the identical job.
 */
function NoteRow({ icon, tint, body, caption }: {
  icon: React.ComponentProps<typeof IconCircle>['icon'];
  tint: string;
  body: React.ReactNode;
  caption?: string;
}) {
  return (
    <View style={styles.noteRow}>
      <IconCircle icon={icon} size={layout.iconCircle} color={tint} />
      <View style={styles.noteBody}>
        {body}
        {!!caption && <Text style={styles.noteCaption}>{caption}</Text>}
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendLine, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  // No `gap`: `SectionCard` carries its own `marginBottom` (§3), and stacking the
  // two is what put 32px between every card on the budget editor (§12).
  scroll: { padding: layout.screenPaddingH },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  eyebrow: { ...type.sectionLabel, color: colors.textMuted },
  hero: { ...type.amountXL },
  heroSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  heroBar: { marginTop: space.md, marginBottom: space.md },
  heroCta: { alignSelf: 'flex-start', marginTop: space.md },
  verdict: { ...type.bodySemi, marginTop: space.md },
  pace: { ...type.caption, color: colors.textMuted, marginTop: space.xs, lineHeight: 17 },

  over: { ...type.amountSM, color: colors.expense },

  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md },
  noteBody: { flex: 1, minWidth: 0 },
  noteText: { ...type.label, lineHeight: 19 },
  noteCaption: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  chartWrap: { paddingHorizontal: space.md, paddingBottom: space.md, paddingTop: space.sm },
  legend: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  legendText: { ...type.caption, color: colors.textMuted },
  pointerLabel: {
    backgroundColor: colors.bgCard, borderRadius: 6, paddingHorizontal: space.sm,
    paddingVertical: 5, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  pointerLabelText: { ...type.amountSM, color: colors.textPrimary },

  whatIf: { padding: space.md },
  whatIfLead: { ...type.body, color: colors.textSecondary, lineHeight: 20 },
  whatIfName: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  whatIfSave: { ...type.amountLG, color: colors.income, marginTop: space.xs },
  whatIfPer: { ...type.caption, color: colors.textMuted },
  whatIfYear: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  cutRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
