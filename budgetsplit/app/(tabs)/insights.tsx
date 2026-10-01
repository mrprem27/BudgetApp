import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { useScreenData } from '../../src/hooks/useScreenData';
import { LineChart } from 'react-native-gifted-charts';
import { getDate, getDaysInMonth } from 'date-fns';
import { monthLabel } from '../../src/lib/dateFormat';
import { colors, type, space, layout, radius, alpha } from '../../src/theme';
import { categoryVisual } from '../../src/constants/categories';
import { asFeather, decor } from '../../src/constants/palette';
import { HeaderIconButton } from '../../src/components/ui/HeaderIconButton';
import { Card } from '../../src/components/ui/Card';
import { ListRow } from '../../src/components/ui/ListRow';
import { Divider } from '../../src/components/ui/Divider';
import { useContentInset } from '../../src/hooks/useContentInset';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { Badge } from '../../src/components/ui/Badge';
import { Chip } from '../../src/components/ui/Chip';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { MoneyPreferences } from '../../src/components/finance/settings/MoneyPreferences';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { InfoLabel } from '../../src/components/ui/InfoLabel';
import { InsightTile, InsightGrid } from '../../src/components/finance/insights/InsightTile';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { Feather } from '@expo/vector-icons';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { InsightText } from '../../src/components/finance/InsightText';
import { LOW_SAMPLE_TXNS } from '../../src/components/finance/SampleNote';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { healthColor, recColor } from '../../src/components/finance/group/helpers';

import type { Insight } from '../../src/lib/savingsInsights';
import { formatCompact, formatCompactMajor, formatAxisShort } from '../../src/lib/money';
import { loadInsightsData } from '../../src/lib/insightsData';
import { forecastTile } from '../../src/lib/forecastVerdict';
import { budgetHealth, utilLabel } from '../../src/lib/budget';
import { shortDate } from '../../src/lib/dateFormat';
import { plotWidth, axisSpacing } from '../../src/lib/chartAxis';

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

type Sheet = 'outlook' | 'attention' | 'forecast' | 'shifts' | 'whatif' | 'savings' | 'prefs' | null;
/** Each section's name, said once: on its tile and on the sheet the tile opens. */
const TITLE: Record<Exclude<Sheet, null>, string> = {
  // Short enough to fit half a row on a small phone: "Changed vs last month" was cut to
  // "Changed vs last m…", which lost the one word that said what it was.
  outlook: 'Cash outlook',
  prefs: 'How your money works',
  attention: 'Needs attention',
  forecast: 'Month end',
  shifts: 'What changed',
  whatif: 'What if',
  savings: 'Ways to save',
};

export default function InsightsScreen() {
  const router = useRouter();
  const { flags } = useFeatureFlags();
  const [cutPct, setCutPct] = useState(20);
  // Which section's sheet is up. One at a time, by construction.
  const [sheet, setSheet] = useState<Sheet>(null);
  const closeSheet = () => setSheet(null);

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
  const outlook = data?.outlook ?? null;

  /**
   * Measured, not guessed. `spacing` was `Math.max(8, 300 / len)` — 300 being a
   * magic width the chart never measured — so a 31-day month gave 9.68px per label
   * container. The library renders each label in a View exactly `spacing` wide at
   * numberOfLines={1}: one digit fits, two do not, hence "1…", "2…", "3…".
   */
  const contentInset = useContentInset({ tabBar: true });
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

  // Said on a tile and again in its sheet, so each is worked out once.
  const outlookColor = !outlook || outlook.suppressed ? colors.textSecondary : outlook.safeToSpend >= 0 ? colors.income : colors.expense;
  const outlookUntil = outlook ? shortDate(new Date(outlook.untilMs)) : '';
  const cutSaving = whatIf ? Math.round((whatIf.monthly * cutPct) / 100) : 0;
  // The same figure and words as Home's month-end tile (`forecastTile`), not a second phrasing of it.
  const forecast = hasForecast ? forecastTile({ projected, budget }) : null;

  // What the projections rest on, said behind the headline's (i) rather than as a line of its own.
  const sampleLine = txnCount <= 0 ? '' : ` Based on ${txnCount} ${txnCount === 1 ? 'entry' : 'entries'} this month${txnCount < LOW_SAMPLE_TXNS ? ', so it will sharpen as you log more' : ''}.`;

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
      <ScreenHeader
        large
        title="Insights"
        // The one way into Reports from here, so it is the thing the Reports switch turns off.
        right={flags.reports ? <HeaderIconButton icon="pie-chart" color={colors.accent} label="Reports" showLabel onPress={() => router.push('/reports')} /> : undefined}
      />
      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: contentInset }]}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {nothingYet ? (
          /* The CTA is the point, not decoration: this screen has nothing to show
             until expenses exist, so the only useful thing it can offer is the way
             to create one. */
          <EmptyState
            icon="bar-chart-2"
            title="No insights yet"
            body="Log a few expenses and split with a group, patterns, alerts and balances show up here."
            tint={colors.textSecondary}
            actionLabel="Add an expense"
            onAction={() => router.push('/add/quick')}
          />
        ) : (
            /*
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
              */
            <Card padded style={styles.headline}>
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
                  {/* The verdict is the line; how it is reached (your pace, the budget's, how many
                      entries it rests on) is behind the (i), not three more lines under it. */}
                  <View style={styles.verdictRow}>
                    <InfoLabel
                      label={overspend
                        ? `At this pace you'll be ${formatCompact(projected - budget)} over by month-end`
                        : `At this pace you'll finish with ${formatCompact(budget - projected)} to spare`}
                      labelStyle={[styles.verdict, { color: overspend ? colors.expense : colors.income }]}
                      info={`You're averaging ${formatCompact(dailyAvg)} a day; your budget allows ${formatCompact(budgetPerDay)} a day.${sampleLine}`}
                      accessibilityLabel="How this is worked out"
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.heroSub}>spent so far · {formatCompact(projected)} projected by month-end</Text>
                  <Divider indent="none" />
                  {/* Without a budget every section below is a description with nothing to
                      measure against, so the way to fix that is the card's own action. */}
                  <View style={styles.verdictRow}>
                    <InfoLabel
                      label="No budget to measure this against"
                      labelStyle={styles.noBudget}
                      info={`Set a budget and this becomes “on track” or “over by ₹X” instead of just a number.${sampleLine}`}
                    />
                  </View>
                  <View style={styles.heroCta}>
                    <Chip label="Set a budget" icon="target" onPress={() => router.push('/budget')} />
                  </View>
                </>
              )}
            </Card>
        )}

        {/*
          * THE SECTIONS, AS TILES (`U-91`).
          *
          * Each was a collapsed `SectionCard` in one column: nine rows at the same weight, none
          * showing its figure until opened. A tile carries the section's colour and the one figure
          * it comes down to, and opens a sheet with everything the section holds. A section with
          * nothing to say has no tile, as it had no card.
          */}
        <InsightGrid>
          {outlook && (
            <InsightTile
              key="outlook" icon="compass" tint={decor.blue} title={TITLE.outlook}
              figure={outlook.suppressed ? 'Learning' : formatCompact(outlook.safeToSpend)}
              figureColor={outlookColor}
              line={outlook.suppressed ? 'needs a little more history' : `safe to spend until ${outlookUntil}`}
              onPress={() => setSheet('outlook')}
            />
          )}
          {attentionCount > 0 && (
            <InsightTile
              key="attention" icon="alert-triangle" tint={colors.expense} title={TITLE.attention}
              figure={overTotal > 0 ? formatCompact(overTotal) : String(attentionCount)}
              figureColor={colors.expense}
              // The amount is the overruns'; the count beside it has to be theirs too, not the notes'.
              line={overTotal > 0 ? `over budget in ${drivers.length} ${drivers.length === 1 ? 'category' : 'categories'}` : attentionCount === 1 ? 'thing to look at' : 'things to look at'}
              onPress={() => setSheet('attention')}
            />
          )}
          {!nothingYet && (
            <InsightTile
              key="forecast" icon="trending-up" tint={colors.accent} title={TITLE.forecast}
              figure={forecast ? forecast.amount : 'Soon'}
              figureColor={!forecast ? colors.textSecondary : forecast.tone === 'over' ? colors.expense : forecast.tone === 'good' ? colors.income : undefined}
              line={forecast ? forecast.sub : 'after a few days of spending'}
              onPress={() => setSheet('forecast')}
            />
          )}
          {shifts.length > 0 && (
            <InsightTile
              key="shifts" icon="repeat" tint={decor.orange} title={TITLE.shifts}
              figure={`${shifts[0].pct > 0 ? '+' : ''}${shifts[0].pct}%`}
              figureColor={shifts[0].pct > 5 ? colors.expense : shifts[0].pct < -5 ? colors.income : undefined}
              line={shifts.length === 1 ? `${shifts[0].cat} vs last month` : `${shifts[0].cat} vs last month, and ${shifts.length - 1} more`}
              onPress={() => setSheet('shifts')}
            />
          )}
          {whatIf && whatIf.monthly > 0 && (
            <InsightTile
              key="whatif" icon="scissors" tint={decor.pink} title={TITLE.whatif}
              figure={formatCompact(cutSaving)}
              figureColor={colors.income}
              line={`a month, spending ${cutPct}% less on ${whatIf.name}`}
              onPress={() => setSheet('whatif')}
            />
          )}
          {savings.length > 0 && (
            <InsightTile
              key="savings" icon="feather" tint={colors.income} title={TITLE.savings}
              figure={String(savings.length)}
              line={savings.length === 1 ? 'idea from your own spending' : 'ideas from your own spending'}
              onPress={() => setSheet('savings')}
            />
          )}
        </InsightGrid>

        {/* Not a tile: it holds no figure, it is where the figures are configured. So it is a
            button of its own, full width, with the settings glyph (yours, 2026-10-01). Reports is
            the header's action, and Export all data is on Profile with your other data. */}
        <PressableScale style={styles.prefs} onPress={() => setSheet('prefs')} accessibilityLabel={`${TITLE.prefs}. Pay cycle, safe to spend, defaults. Open`}>
          <IconCircle icon="settings" size={layout.avatarSize} color={decor.violet} />
          <View style={styles.prefsText}>
            <Text style={styles.prefsTitle}>{TITLE.prefs}</Text>
            <Text style={styles.prefsSub}>Pay cycle, safe to spend, defaults</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </PressableScale>
      </ScrollView>
      )}

      {/* One sheet per section, each opening on what the section is and an (i) for how it is worked out. */}
      {outlook && (
        <InsightSheet id="outlook" sheet={sheet} onClose={closeSheet}
          label={outlook.suppressed ? 'Still learning your spending' : 'What is safe to spend, and why'}
            info="Today's cash, every known bill and income up to payday, and your everyday spending for the days between. The lowest point on that walk is what is safe to spend.">
          {outlook.suppressed ? (
            <Text style={styles.pace}>Needs {outlook.missing ?? 'a little more history'} before it can project your cash.</Text>
          ) : (
            <>
              <Card clip>
                <ListRow
                  icon="shield"
                  iconColor={outlookColor}
                  title="Safe to spend"
                  subtitle={outlook.noDip ? `Through ${outlookUntil}, every known bill paid` : `Your lowest point ahead, on ${outlookUntil}`}
                  value={<Text style={[styles.outlookAmt, { color: outlookColor }]}>{formatCompact(outlook.safeToSpend)}</Text>}
                  chevron={false}
                />
                {outlook.upcomingBills > 0 && (
                  <>
                    <Divider indent="text" />
                    <ListRow icon="calendar" title="Bills before then" value={formatCompact(outlook.upcomingBills)}
                      onPress={() => { closeSheet(); router.push('/upcoming'); }} />
                  </>
                )}
                {outlook.dailyRate != null && (
                  <>
                    <Divider indent="text" />
                    <ListRow icon="coffee" title="Everyday spending" value={`${formatCompact(outlook.dailyRate)}/day`} chevron={false} />
                  </>
                )}
                {outlook.warning && (
                  <>
                    <Divider indent="text" />
                    <NoteRow
                      icon="alert-triangle"
                      tint={colors.healthAmber}
                      body={<Text style={[styles.noteText, { color: colors.healthAmber }]}>
                        Runs low on {shortDate(new Date(outlook.warning.date))}, when {outlook.warning.label} ({formatCompact(outlook.warning.amountPaise)}) is due.
                      </Text>}
                    />
                  </>
                )}
              </Card>
              <Text style={[styles.pace, styles.sheetFoot]}>
                {outlook.confidence === 'high' ? 'High confidence' : outlook.confidence === 'medium' ? 'Medium confidence' : 'Low confidence'}
                {outlook.missing ? ` · sharper with ${outlook.missing}` : ''}
              </Text>
            </>
          )}
        </InsightSheet>
      )}

      {/*
        * NEEDS ATTENTION — the merge.
        *
        * "Recommendations" and "Driving overspend" were two sections built from
        * the same over-budget categories, so the screen printed "You're ₹800
        * over on Food (140% used)" and then, one section later, "Food · ₹800
        * over". One section, drivers first (the amount is the actionable part),
        * then whatever the rule engine has left to say that isn't a repeat.
        */}
      <InsightSheet id="attention" sheet={sheet} onClose={closeSheet}
          label={overTotal > 0 ? `${formatCompact(overTotal)} over budget this month` : 'Worth a look this month'}
          info="Categories that have passed their budget, largest first, then anything else this month's spending flagged. Tap a category to see its entries.">
        <Card clip>
          {drivers.map((d, i) => {
            const vis = categoryVisual(d.category);
            return (
              <View key={d.key}>
                {i > 0 && <Divider indent="text" />}
                <ListRow
                  leading={<IconCircle icon={asFeather(vis?.icon, 'tag')} size={layout.iconCircle} color={vis?.color ?? colors.accent} />}
                  title={d.category}
                  subtitle={multiGroup ? d.group : undefined}
                  value={<Text style={styles.over}>{formatCompact(d.over)} over</Text>}
                  onPress={() => { closeSheet(); router.push(`/category/${encodeURIComponent(d.category)}`); }}
                />
              </View>
            );
          })}
          {notes.map((r, i) => (
            <View key={r.key}>
              {(i > 0 || drivers.length > 0) && <Divider indent="text" />}
              <NoteRow
                icon={asFeather(r.icon, 'info')}
                tint={recColor(r.severity)}
                body={<Text style={[styles.noteText, { color: recColor(r.severity) }]}>{r.text}</Text>}
                caption={multiGroup ? r.group : undefined}
              />
            </View>
          ))}
        </Card>
      </InsightSheet>

      {/* A forecast needs at least two days of spending to draw a line through, so early in
          the month there is nothing honest to show. The tile stays and says why (`W1-12`): a
          section that vanished read as a feature removed, and a projection from one day's
          data would swing wildly and be worse than none. */}
      <InsightSheet id="forecast" sheet={sheet} onClose={closeSheet}
          label={hasForecast ? `${formatCompactMajor(projectedTotal)} projected by month-end` : 'Appears after a few days of spending'}
          info={hasForecast
            ? 'Your spending so far this month, carried on at the same pace to the last day. Solid is spent, dashed is ahead.'
            : 'A projection this early would swing on a single purchase. It appears from the third day of the month, once there is spending to base it on.'}>
        {hasForecast && (
          <Card padded>
            <View onLayout={onChartLayout}>
              {/* Drawn only once the width is measured, and re-keyed if it changes: the chart
                  animates its own drawing, and one that starts at a guessed width and is then
                  re-laid-out mid-animation stalls half-drawn on the first open. */}
              {chartW > 0 ? (
                <LineChart
                  key={Math.round(chartW)}
                  data={forecastProjected}
                  data2={forecastActual}
                  color1={colors.accent}
                  color2={colors.expense}
                  thickness1={2}
                  thickness2={2.5}
                  strokeDashArray1={[5, 5]}
                  noOfSections={4}
                  maxValue={Math.ceil((Math.max(...forecastActual.map(d => d.value), ...forecastProjected.map(d => d.value), 1)) * 1.1)}
                  spacing={axisSpacing(plotWidth(chartW, 0), forecastProjected.length)}
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
              ) : <View style={styles.chartHold} />}
              <View style={styles.legend}>
                <LegendItem color={colors.expense} label="Actual" />
                <LegendItem color={colors.accent} label="Projected" />
              </View>
            </View>
          </Card>
        )}
      </InsightSheet>

      <InsightSheet id="shifts" sheet={sheet} onClose={closeSheet}
          label={`${shifts.length} ${shifts.length === 1 ? 'category' : 'categories'} moved most`}
          info="This month's spending in each category against last month's, largest change first.">
        <Card clip>
          {shifts.map((s, i) => {
            const vis = categoryVisual(s.cat);
            const up = s.pct > 5, down = s.pct < -5;
            return (
              <View key={s.cat}>
                {i > 0 && <Divider indent="text" />}
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
        </Card>
      </InsightSheet>

      {whatIf && whatIf.monthly > 0 && (
        <InsightSheet id="whatif" sheet={sheet} onClose={closeSheet}
          label={`Your biggest category is ${whatIf.name}`}
            info="Takes what you spend on your biggest category in a month and shows what a cut would keep, a month and over a year.">
          <Card padded>
            <Text style={styles.whatIfLead}>
              Spend {cutPct}% less on <Text style={styles.whatIfName}>{whatIf.name}</Text> and you'd keep
            </Text>
            <Text style={styles.whatIfSave}>
              {formatCompact(cutSaving)}<Text style={styles.whatIfPer}>/month</Text>
            </Text>
            <Text style={styles.whatIfYear}>
              ≈ {formatCompact(cutSaving * 12)} over a year
            </Text>
            {/* `ui/Chip`, not a fourth hand-rolled pill (§9). */}
            <View style={styles.cutRow}>
              {[10, 20, 30].map(p => (
                <Chip key={p} grow label={`${p}%`} selected={cutPct === p} onPress={() => setCutPct(p)} />
              ))}
            </View>
          </Card>
        </InsightSheet>
      )}

      <InsightSheet id="savings" sheet={sheet} onClose={closeSheet}
          label={`${savings.length} ${savings.length === 1 ? 'idea' : 'ideas'} from your own spending`}
          info="Read from your own entries: habits that add up, and what a small change to one would come to.">
        <Card clip>
          {savings.map((ins, i) => {
            const tint = insightTint(ins.tone);
            return (
              <View key={ins.text}>
                {i > 0 && <Divider indent="text" />}
                <NoteRow
                  icon={asFeather(ins.icon, 'info')}
                  tint={tint}
                  body={<InsightText text={ins.text} color={tint} style={styles.noteText} />}
                />
              </View>
            );
          })}
        </Card>
      </InsightSheet>

      {/* The answers the forecasts above are built on (`U-86`), in the colour Settings gives its
          Preferences. The pickers are rendered beside this sheet, not inside it, and it steps
          aside while one is up: only one sheet can be on stage (`lib/sheetStage`). Mounted with
          the screen, so its rows have read their settings before the sheet can be opened. */}
      <MoneyPreferences
        tint={decor.violet}
        wrap={(sections, pickerOpen) => (
          <InsightSheet id="prefs" sheet={sheet} hidden={pickerOpen} onClose={closeSheet}
            label="What the forecasts are built on"
            info="Safe to spend, the month-end forecast and Can I afford all read these answers. Change one and they move with it.">
            {sections.map((sec, i) => (
              <View key={sec.title}>
                <SectionHeader title={sec.title} first={i === 0} />
                <Card clip>{sec.rows}</Card>
              </View>
            ))}
          </InsightSheet>
        )}
      />
    </View>
  );
}

/**
 * One section's sheet: its title (the tile's), then what the section is with how it is worked
 * out behind an (i). `hidden` steps it aside while a picker opened from inside it is up.
 */
function InsightSheet({ id, sheet, hidden, onClose, label, info, children }: {
  id: Exclude<Sheet, null>;
  sheet: Sheet;
  hidden?: boolean;
  onClose: () => void;
  label: string;
  info: string;
  children?: React.ReactNode;
}) {
  return (
    <SheetModal visible={sheet === id && !hidden} onClose={onClose} title={TITLE[id]}>
      <View style={styles.sheetIntro}>
        <InfoLabel label={label} labelStyle={styles.sheetIntroLabel} info={info} />
      </View>
      {children}
    </SheetModal>
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
  // No `gap`: the headline card and each row of tiles carry their own bottom margin (§3).
  scroll: { padding: layout.screenPaddingH },
  headline: { marginBottom: space.md },
  sheetIntro: { marginBottom: space.md },
  sheetIntroLabel: { ...type.bodySemi, color: colors.textPrimary },
  sheetFoot: { marginTop: space.md },
  verdictRow: { marginTop: space.md },
  noBudget: { ...type.bodySemi, color: colors.textSecondary },
  prefs: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, marginTop: space.xs,
    borderRadius: radius.lg, borderWidth: 1, backgroundColor: alpha(decor.violet, 8), borderColor: alpha(decor.violet, 25),
  },
  prefsText: { flex: 1, minWidth: 0 },
  prefsTitle: { ...type.bodySemi, color: colors.textPrimary },
  prefsSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  sampleNote: { textAlign: 'left', marginTop: space.md, marginBottom: 0 },
  outlookAmt: { ...type.amountSM },

  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  eyebrow: { ...type.sectionLabel, color: colors.textMuted },
  hero: { ...type.amountXL },
  heroSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  heroBar: { marginTop: space.md, marginBottom: space.md },
  heroCta: { alignSelf: 'flex-start', marginTop: space.md },
  verdict: { ...type.bodySemi },
  pace: { ...type.caption, color: colors.textMuted, marginTop: space.xs, lineHeight: 17 },

  over: { ...type.amountSM, color: colors.expense },

  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md },
  noteBody: { flex: 1, minWidth: 0 },
  noteText: { ...type.label, lineHeight: 19 },
  noteCaption: { ...type.caption, color: colors.textMuted, marginTop: 2 },

  chartHold: { height: 220 },
  legend: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  legendText: { ...type.caption, color: colors.textMuted },
  pointerLabel: {
    backgroundColor: colors.bgCard, borderRadius: 6, paddingHorizontal: space.sm,
    paddingVertical: 5, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  pointerLabelText: { ...type.amountSM, color: colors.textPrimary },

  whatIfLead: { ...type.body, color: colors.textSecondary, lineHeight: 20 },
  whatIfName: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  whatIfSave: { ...type.amountLG, color: colors.income, marginTop: space.xs },
  whatIfPer: { ...type.caption, color: colors.textMuted },
  whatIfYear: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  cutRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
