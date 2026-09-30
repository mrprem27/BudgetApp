import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { colors, type, space, radius, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { HeaderIconButton } from '../../src/components/ui/HeaderIconButton';
import { TabPills } from '../../src/components/ui/TabPills';
import { FilterBar } from '../../src/components/ui/FilterBar';
import { rankTagsByFrequency } from '../../src/lib/tags';
import { applyFilters, filtersActive, KIND_ANY, RANGE_LABEL, type KindFilter, type RangePreset } from '../../src/lib/txnFilter';
import { PersonalHero } from '../../src/components/finance/personal/PersonalHero';
import { activityTotals } from '../../src/lib/activityTotals';
import { singleMonthKey } from '../../src/lib/dateRange';
import { TransactionRow } from '../../src/components/finance/TransactionRow';
import { TxnCell } from '../../src/components/finance/TxnCell';
import { SectionHeader } from '../../src/components/ui/SectionHeader';
import { BudgetList } from '../../src/components/finance/budget/BudgetList';
import { budgetCaption } from '../../src/lib/budgetCopy';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { FAB } from '../../src/components/ui/FAB';
import { SettingsRow, settingsRowDivider } from '../../src/components/ui/SettingsRow';
import { useGroupTxnActions } from '../../src/hooks/useGroupTxnActions';
import type { MyActivityItem } from '../../src/db/queries/transactions';
import { loadPersonal, scopeActivity, type ActivityScope } from '../../src/lib/personalData';
import { useScreenData } from '../../src/hooks/useScreenData';
import { useContentInset } from '../../src/hooks/useContentInset';
import { useStore } from '../../src/store';
import { groupByDate } from '../../src/lib/txnGrouping';
import { formatCompact } from '../../src/lib/money';
import { haptic } from '../../src/lib/haptics';
import { buildGroupExportCsv } from '../../src/lib/groupExport';
import { shareCsv, csvFileSlug } from '../../src/lib/shareCsv';
import { keyboardAwareScroll } from '../../src/components/ui/KeyboardForm';
import { RecurringTab } from '../../src/components/finance/group/RecurringTab';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';
import { backOr } from '../../src/lib/nav';

/*
 * Three tabs, the same three a group has for its own money: Activity, Budget, Recurring.
 *
 * Recurring here is the PERSONAL group's own rules — exactly what a group's Recurring tab shows
 * for that group. (An earlier Recurring tab here listed every SHARED group's rules, which was just
 * Money → Recurring again; that is why it was removed, and why this one is scoped to Personal.)
 */
type TabKey = 'activity' | 'budget' | 'recurring';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'activity', label: 'Activity' },
  { key: 'budget', label: 'Budget' },
  { key: 'recurring', label: 'Recurring' },
];

const listScroll = keyboardAwareScroll();

export default function PersonalScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const me = useStore((s) => s.me);
  const myId = me?.id ?? '';

  const bottomPad = useContentInset({ fab: true });
  const [tab, setTab] = useState<TabKey>('activity');
  // The Recurring switch hides this tab too, not only Money's Recurring row.
  const { flags } = useFeatureFlags();
  const tabs = flags.recurring ? TABS : TABS.filter(t => t.key !== 'recurring');
  useEffect(() => { if (!flags.recurring && tab === 'recurring') setTab('activity'); }, [flags.recurring, tab]);
  // Personal, every group, or both. One group on its own is that group's screen, not a filter here.
  const [filter, setFilter] = useState<ActivityScope>('personal');
  // The transaction filters, none of which this screen had: it offered scope only.
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>(KIND_ANY);
  const [range, setRange] = useState<RangePreset>('any');
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showMenu, setShowMenu] = useState(false);

  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    if (!me) throw new Error('No current user');
    return loadPersonal(db, me.id);
  }, [me?.id]);

  const persons = data?.persons ?? [];
  // Stable identity: `FilterBar` memoises on it, and the person sheet only needs
  // id + name. Me included — "only what I'm on" is a real question here, because
  // this ledger already spans every group.
  const people = useMemo(() => persons.map(p => ({ id: p.id, name: p.name })), [persons]);
  const activity = data?.activity ?? [];
  const groups = data?.groups ?? [];
  // `getMyGlobalBudgetSummary` is the canonical answer to "how am I doing against
  // my budget" — it carries the overview figures as well as the rows. This screen
  // used `getMyGlobalBudgetStatus`, which returns rows only, which is why it had no
  // overview to render.
  const budget = data?.budget ?? null;
  const summary = data?.summary ?? { owe: 0, lent: 0 };
  const recurringRules = data?.recurringRules ?? [];
  const recurSkips = data?.recurSkips;

  const personalGroup = useMemo(() => groups.find(g => g.is_personal === 1) ?? null, [groups]);
  // One way into Add from this screen, for the button and the Recurring tab alike.
  // One way into Add from here; the Recurring tab's opens with Repeat on (`OV-27`).
  const addPersonal = (repeat = false) => { if (personalGroup) router.push(`/add/quick?groupId=${personalGroup.id}&kind=expense${repeat ? '&repeat=1' : ''}`); };

  // Rows span every group, so the actions read the owning group off each txn.
  const { handleDelete, handleEditTxn } = useGroupTxnActions(reload);

  /*
   * Scope narrows WHICH LEDGER; `applyFilters` narrows the rows inside it.
   *
   * This screen offered scope and nothing else — no free text, no kind, no dates —
   * while the group ledger and Search each offered a different subset. `OV-34`
   * collapsed the predicate into `lib/txnFilter.ts`, so a word that finds a row on
   * one of the three now finds it on all of them.
   */
  const scoped = useMemo(() => scopeActivity(activity, filter), [activity, filter]);
  const tagOptions = useMemo(() => rankTagsByFrequency(scoped.map(t => t.tags)), [scoped]);
  const filtered = useMemo(
    () => applyFilters(scoped, { query, kind, from, to, personId, tags }),
    [scoped, query, kind, from, to, personId, tags],
  );
  const sections = useMemo(() => groupByDate(filtered), [filtered]);

  /*
   * The card above the list describes the list (`U-52`). Unfiltered, it is where you stand with
   * everyone today — owe, owed, net. Once anything narrows the list (a date, a type, a person, a
   * search, or Groups / All), it adds up exactly those rows: what you spent, what came in, and how
   * the period moved you with other people. A card that stayed on today's balances while the list
   * below showed last month answered a question nobody had asked.
   */
  // Search finds rows; it does not change what the card is about (`U-62`) — only the filters do.
  const narrowed = filter !== 'personal' || filtersActive({ query: '', kind, from, to, personId, tags });
  /*
   * The row under the hero adds up what the list shows (`U-63`). With no date chosen the list
   * runs through all time, and an all-time "spent" answers nothing — so the row reads this month
   * then, and says so. Choose a date and it reads exactly that.
   */
  const monthStart = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }, []);
  const rowRows = useMemo(
    () => (from == null && to == null ? filtered.filter(t => t.date >= monthStart) : filtered),
    [filtered, from, to, monthStart],
  );
  const rowTotals = useMemo(() => activityTotals(rowRows, myId), [rowRows, myId]);
  // Which filters are on, counted, so the row says why its numbers changed ("This month · 2 filters").
  const filterCount = (filter !== 'personal' ? 1 : 0) + (kind !== KIND_ANY ? 1 : 0) + (personId ? 1 : 0) + tags.length;
  const period = from == null && to == null ? 'This month' : range === 'custom' ? 'Chosen dates' : RANGE_LABEL[range];
  const rowLabel = filterCount > 0 ? `${period} · ${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}` : period;
  const clearFilters = useCallback(() => {
    setFilter('personal'); setQuery(''); setKind(KIND_ANY); setRange('any');
    setFrom(null); setTo(null); setPersonId(null); setTags([]);
  }, []);
  const openReports = () => {
    // One calendar month opens Reports on that month; any other span opens it on exactly that
    // range (`U-60`); no date filter opens it on this month.
    const m = singleMonthKey(from, to);
    const isWholeMonth = m != null && (range === 'thisMonth' || range === 'lastMonth');
    router.push(isWholeMonth ? `/reports?month=${m}`
      : from != null && to != null ? `/reports?from=${from}&to=${to}`
      : from != null ? `/reports?from=${from}&to=${Date.now()}`
      : '/reports');
  };

  // Stable identities, so the filter bar and the list below do not re-render per keystroke.
  const filterGroups = useMemo(() => [{
    key: 'scope',
    title: 'Show',
    options: [
      { label: 'Personal', value: 'personal' },
      { label: 'Groups', value: 'groups' },
      { label: 'All', value: 'all' },
    ],
  }], []);
  const filterSelected = useMemo(() => ({ scope: filter }), [filter]);
  const onSelectFilter = useCallback((_: string, v: string) => setFilter(v as ActivityScope), []);

  // Inline arrows here make SectionList re-render every visible row on any state
  // change, filter typing included.
  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => <SectionHeader title={section.title} />,
    [],
  );
  const renderItem = useCallback(
    ({ item, index, section }: { item: MyActivityItem; index: number; section: { data: MyActivityItem[] } }) => (
      <TxnCell first={index === 0} last={index === section.data.length - 1}>
        <TransactionRow
          txn={item}
          myId={myId}
          members={persons}
          isPersonal={item.isPersonal}
          groupName={item.isPersonal ? undefined : item.groupName}
          onPress={() => handleEditTxn(item)}
          onDelete={() => handleDelete(item.id)}
        />
      </TxnCell>
    ),
    [myId, persons, handleEditTxn, handleDelete],
  );

  function openBudgetEditor() {
    router.push('/budget');
  }

  async function handleExport() {
    const pg = personalGroup;
    setShowMenu(false);
    if (!pg) return;
    try {
      const { csv, rowCount } = await buildGroupExportCsv(db, pg);
      if (rowCount === 0) {
        Alert.alert('Nothing to export', 'You have no personal transactions yet.');
        return;
      }
      const fileName = `budgetsplit_${csvFileSlug(pg.name)}.csv`;
      const { uri, shared } = await shareCsv(csv, fileName, 'Export Personal');
      haptic.success();
      if (!shared) Alert.alert('Saved', `Sharing isn't available here. The CSV was saved to:\n${uri}`);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Personal"
        onBack={() => backOr(router, '/(tabs)')}
        right={
          <HeaderIconButton icon="more-horizontal" label="Personal options" onPress={() => setShowMenu(true)} />
        }
      />

      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
        <>
          {me && (
            <PersonalHero
              name={me.name}
              color={me.avatar_color ?? colors.accent}
              imageUri={me.image_uri}
              owe={summary.owe}
              owed={summary.lent}
              totals={rowTotals}
              periodLabel={rowLabel}
              onReports={openReports}
            />
          )}

          {/* Was a byte-identical copy of the group screen's local tab strip, which
              was itself a reimplementation of `TabPills`. One component now. */}
          <View style={styles.tabs}>
            <TabPills
              tabs={tabs}
              active={tab}
              onChange={(k) => { setTab(k as typeof tab); haptic.selection(); }}
            />
          </View>

          {/* ACTIVITY */}
          {tab === 'activity' && (
            <SectionList
              sections={sections}
              keyExtractor={t => t.id}
              // The FilterBar search is in the header; matches below it must
              // scroll clear of the keyboard (AGENTS.md §6b).
              renderScrollComponent={listScroll}
              contentContainerStyle={[styles.activityContent, { paddingBottom: bottomPad }]}
              refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListHeaderComponent={
                activity.length > 0 ? (
                  <View style={{ marginBottom: space.xs }}>
                    <FilterBar
                      selected={filterSelected}
                      onSelect={onSelectFilter}
                      groups={filterGroups}
                      search={query}
                      onSearch={setQuery}
                      searchPlaceholder="Search your activity…"
                      kind={kind}
                      onKind={setKind}
                      range={range}
                      customFrom={from}
                      customTo={to}
                      onRange={(r, f2, t2) => { setRange(r); setFrom(f2); setTo(t2); }}
                      people={people}
                      personId={personId}
                      onPerson={setPersonId}
                      tagOptions={tagOptions}
                      selectedTags={tags}
                      onTags={setTags}
                    />
                  </View>
                ) : null
              }
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              renderItem={renderItem}
              ListEmptyComponent={
                loading ? null : (
                  <EmptyState
                    icon="inbox"
                    title="Nothing here yet"
                    body={narrowed || query.trim() ? 'No transactions match these filters.' : 'Your personal expenses & income will show here.'}
                    tint={colors.textSecondary}
                    // A filter hiding everything and an empty ledger need different
                    // ways out — clearing EVERY filter (it used to reset only
                    // Personal / Groups / All), or adding the first entry.
                    actionLabel={narrowed || query.trim() ? 'Clear filters' : 'Add a transaction'}
                    onAction={narrowed || query.trim() ? clearFilters : () => router.push('/add/quick')}
                  />
                )
              }
            />
          )}

          {/* BUDGET — global: my total share-spend (personal + groups) vs my limits.
              The same `BudgetList` the group Budget tab renders. It used to be a
              heading, a note, a hand-rolled list and a hand-rolled empty card with a
              naked 22pt icon where §2 requires the 64pt circle — the same idea as the
              group tab at a lower level of finish, missing the overview and the
              filters entirely. */}
          {tab === 'budget' && (
            <BudgetList
              rows={budget?.rows ?? []}
              spent={budget?.spent ?? 0}
              allocated={budget?.allocated ?? 0}
              pct={budget?.pct ?? null}
              pooledAllocated={budget?.pooled ?? 0}
              pooledCount={budget?.pooledCount ?? 0}
              invested={budget?.invested ?? 0}
              caption={budgetCaption({ scope: 'global', allocated: formatCompact(budget?.allocated ?? 0) })}
              onEdit={openBudgetEditor}
              refreshing={refreshing}
              onRefresh={onRefresh}
              bottomPad={bottomPad}
              empty={
                <EmptyState
                  icon="target"
                  title="No budget yet"
                  body="Set category limits measured against your total spending, personal plus your share of every group."
                  tint={colors.textSecondary}
                  actionLabel="Set a budget"
                  onAction={openBudgetEditor}
                />
              }
            />
          )}

          {tab === 'recurring' && personalGroup && me && (
            <RecurringTab
              refreshing={refreshing}
              onRefresh={onRefresh}
              rules={recurringRules}
              skips={recurSkips}
              meId={me.id}
              onAdd={() => addPersonal(true)}
              onOpenRule={(ruleId) => router.push(`/recurring/${ruleId}`)}
            />
          )}

          {/* Single-tap FAB — pre-fills the personal group. */}
          {personalGroup && (
            <FAB onPress={() => addPersonal()} aboveTabBar={false} />
          )}
        </>
      )}

      {/* Options menu — mirrors the group screen's overflow. */}
      <SheetModal visible={showMenu} onClose={() => setShowMenu(false)} title="Personal" scroll={false}>
        <View style={styles.menuCard}>
          <SettingsRow
            icon="clock"
            label="Audit log"
            onPress={() => {
              setShowMenu(false);
              if (personalGroup) router.push(`/history?groupId=${personalGroup.id}`);
            }}
          />
          <View style={settingsRowDivider} />
          <SettingsRow icon="pie-chart" label="Reports" onPress={() => { setShowMenu(false); router.push('/reports'); }} />
          <View style={settingsRowDivider} />
          <SettingsRow icon="download" label="Export as CSV" onPress={handleExport} />
        </View>
        <Text style={styles.personalNote}>
          This is your private personal space, it can't be shared, archived, or have other members.
        </Text>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabs: { marginHorizontal: layout.screenPaddingH, marginBottom: space.sm },


  // No `gap` here: a date section's rows form ONE card, so any gap between them
  // slices it into separate slabs. `SectionHeader` supplies its own spacing.
  //
  // The same inset as every other tab body (group and Personal alike): switching tabs must not
  // move anything. It was 16pt all round; tightened to a 4pt top under the tabs (`U-37`).
  activityContent: { paddingHorizontal: layout.screenPaddingH, paddingTop: space.xs },



  menuCard: { backgroundColor: colors.bgInput, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  personalNote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, paddingHorizontal: space.md },
});
