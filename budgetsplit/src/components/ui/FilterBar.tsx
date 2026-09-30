import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInLeft, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { Chip } from './Chip';
import { SheetModal } from './SheetModal';
import { OptionRow } from './OptionRow';
import { PrimaryButton } from './PrimaryButton';
import { DateRangeSheet } from './DateRangeSheet';
import { colors, type, space, radius } from '../tokens';
import { shortDate } from '../../lib/dateFormat';
import { TXN_KIND, TXN_KIND_LABEL_PLURAL } from '../../constants/enums';
import { tagKey } from '../../lib/tags';
import { kindColor } from '../../lib/kindTheme';
import {
  KIND_ANY, RANGE_LABEL, resolveRange,
  type KindFilter, type RangePreset,
} from '../../lib/txnFilter';

export type ChipGroup = {
  key: string;
  /** Sheet title, e.g. "Show". Defaults to "Show". */
  title?: string;
  /** First option is treated as the "All"/reset default. */
  options: { label: string; value: string }[];
};

/** Someone the list can be narrowed to. */
export type FilterPerson = { id: string; name: string };

type Props = {
  /** Search field — omit to hide. */
  search?: string;
  onSearch?: (s: string) => void;
  searchPlaceholder?: string;
  /**
   * Screen-specific exclusive choices that are **not** transaction filters — Personal's group
   * scope, Search's source. Everything a *transaction* can be filtered by has a named prop below,
   * because those must behave identically everywhere (`lib/txnFilter.ts`).
   */
  groups?: ChipGroup[];
  /** Selected value per group key. Missing key = first option. */
  selected: Record<string, string>;
  onSelect: (key: string, value: string) => void;

  /** Kind. Omit the handler to hide the chip. */
  kind?: KindFilter;
  onKind?: (k: KindFilter) => void;

  /** Date range. `custom` opens the calendar. */
  range?: RangePreset;
  customFrom?: number | null;
  customTo?: number | null;
  onRange?: (preset: RangePreset, from: number | null, to: number | null) => void;

  /** Who is on the entry. Pass an empty list to hide the chip. */
  people?: FilterPerson[];
  personId?: string | null;
  onPerson?: (id: string | null) => void;

  /** Tags found on the rows, most used first. Empty list hides the chip. */
  tagOptions?: string[];
  selectedTags?: string[];
  onTags?: (tags: string[]) => void;
};

const RANGE_PRESETS: RangePreset[] = ['any', '7d', '30d', 'thisMonth', 'lastMonth'];

/** The row swapping between chips and the search field: a short cross-fade, the field arriving
 *  from where the button was. Snaps under Reduce Motion (AGENTS §11). */
const FIELD_IN = FadeInLeft.duration(200).reduceMotion(ReduceMotion.System);
const CHIPS_IN = FadeIn.duration(180).reduceMotion(ReduceMotion.System);
const OUT = FadeOut.duration(120).reduceMotion(ReduceMotion.System);

type Picker = { kind: 'group'; key: string } | { kind: 'type' | 'date' | 'who' | 'tags' };

/**
 * The one filter structure, on every ledger (Search, Personal, a group).
 *
 * **One row: a round search button, then one chip per thing you can filter by**, each saying
 * what it filters ("Date ⌄") until it is set, then its value with a ✕ ("Last 30 days ✕"). Tapping
 * a chip opens a short list for that one question. The pattern of Fold, Google Play and most
 * shopping apps, chosen because nobody has to learn it: the chip names the question, the sheet
 * answers it, the ✕ undoes it.
 *
 * It replaced a search row + a mixed strip of scope and type chips + a Filters button + a second
 * row of active chips + a sheet of chip grids — four controls to learn and two rows that came and
 * went (`U-17`). Tapping search turns the row into the field (with Cancel), so search never costs
 * a row of its own.
 *
 * What a filter *means* lives in `lib/txnFilter.ts`, so every screen matches the same way; this
 * file is only the controls. Chips are `ui/Chip` (AGENTS §9) — never hand-rolled.
 */
export function FilterBar({
  search, onSearch, searchPlaceholder = 'Search…',
  groups = [], selected, onSelect,
  kind, onKind,
  range = 'any', customFrom = null, customTo = null, onRange,
  people = [], personId = null, onPerson,
  tagOptions = [], selectedTags = [], onTags,
}: Props) {
  const [picker, setPicker] = useState<Picker | null>(null);
  // Search lives in the chip row: a round button, or the query as a chip once typed. Only while
  // typing does the row become the field, so a query never hides the filters beside it.
  const [searchOpen, setSearchOpen] = useState(false);
  const searching = !!onSearch && searchOpen;
  const [rangeOpen, setRangeOpen] = useState(false);
  const close = () => setPicker(null);

  const person = people.find(p => p.id === personId) ?? null;
  const rangeLabel = range === 'custom'
    ? `${customFrom ? shortDate(new Date(customFrom)) : 'Start'} – ${customTo ? shortDate(new Date(customTo)) : 'Now'}`
    : RANGE_LABEL[range];
  const kindSet = !!kind && kind !== KIND_ANY;
  const tagsLabel = selectedTags.length === 0 ? 'Tags'
    : selectedTags.length === 1 ? selectedTags[0] : `${selectedTags[0]} +${selectedTags.length - 1}`;

  // Everything the row can narrow counts, and Clear all undoes all of it (`U-53`). It used to
  // skip the search text and the screen's own choice (Personal's Show), so "Clear all" left the
  // list still filtered and its figures still partial.
  const groupsSet = groups.filter(g => (selected[g.key] ?? g.options[0]?.value) !== g.options[0]?.value);
  const setCount = (search?.trim() ? 1 : 0) + groupsSet.length
    + (kindSet ? 1 : 0) + (range !== 'any' ? 1 : 0) + (person ? 1 : 0) + (selectedTags.length > 0 ? 1 : 0);
  const clearAll = () => {
    onSearch?.('');
    for (const g of groupsSet) onSelect(g.key, g.options[0]!.value);
    onKind?.(KIND_ANY); onRange?.('any', null, null); onPerson?.(null); onTags?.([]);
  };

  const toggleTag = (t: string) => {
    const has = selectedTags.some(x => tagKey(x) === tagKey(t));
    onTags?.(has ? selectedTags.filter(x => tagKey(x) !== tagKey(t)) : [...selectedTags, t]);
  };

  const openGroup = picker?.kind === 'group' ? groups.find(g => g.key === picker.key) : undefined;

  return (
    <View style={styles.wrap}>
      {searching ? (
        <Animated.View key="search" style={styles.row} entering={FIELD_IN} exiting={OUT}>
          <View style={styles.searchBox}>
            <Feather name="search" size={15} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={onSearch}
              autoCorrect={false}
              autoFocus
              onBlur={() => setSearchOpen(false)}
              onSubmitEditing={() => setSearchOpen(false)}
              returnKeyType="search"
            />
            {!!search && (
              <TouchableOpacity onPress={() => onSearch?.('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <Feather name="x-circle" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => { onSearch?.(''); setSearchOpen(false); }} hitSlop={10} accessibilityRole="button" style={styles.textBtn}>
            <Text style={styles.textBtnLabel}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
      <Animated.View key="chips" entering={CHIPS_IN} exiting={OUT}>
      /* `flexGrow: 0`: a horizontal ScrollView in a column otherwise takes whatever height the
         parent offers, the row that collapsed or ballooned depending on the screen. */
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {onSearch && (search
          ? <Chip icon="search" label={`“${search}”`} selected maxWidth={160}
              onPress={() => setSearchOpen(true)} onRemove={() => onSearch('')} />
          : (
            <TouchableOpacity onPress={() => setSearchOpen(true)} style={styles.searchBtn} hitSlop={4} accessibilityRole="button" accessibilityLabel="Search">
              <Feather name="search" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        {groups.map(g => {
          const value = selected[g.key] ?? g.options[0]?.value;
          const opt = g.options.find(o => o.value === value) ?? g.options[0];
          const isDefault = value === g.options[0]?.value;
          return (
            <Chip key={g.key} label={opt?.label ?? ''} selected={!isDefault} maxWidth={180}
              onRemove={isDefault ? undefined : () => onSelect(g.key, g.options[0]!.value)}
              onPress={() => setPicker({ kind: 'group', key: g.key })} />
          );
        })}
        {onKind && (
          <Chip icon="layers" label={kindSet ? TXN_KIND_LABEL_PLURAL[kind as typeof TXN_KIND[number]] : 'Type'}
            // A set type wears its kind's colour, as every ledger row does (`U-51`).
            selected={kindSet} accent={kindSet ? kindColor(kind as typeof TXN_KIND[number]) : undefined}
            onRemove={kindSet ? () => onKind(KIND_ANY) : undefined}
            onPress={() => setPicker({ kind: 'type' })} />
        )}
        {onRange && (
          <Chip icon="calendar" label={range === 'any' ? 'Date' : rangeLabel} maxWidth={200}
            selected={range !== 'any'}
            onRemove={range !== 'any' ? () => onRange('any', null, null) : undefined}
            onPress={() => setPicker({ kind: 'date' })} />
        )}
        {onPerson && people.length > 0 && (
          <Chip icon="user" label={person?.name ?? 'Who'} maxWidth={180}
            selected={!!person} onRemove={person ? () => onPerson(null) : undefined}
            onPress={() => setPicker({ kind: 'who' })} />
        )}
        {onTags && tagOptions.length > 0 && (
          <Chip icon="tag" label={tagsLabel} maxWidth={180}
            selected={selectedTags.length > 0}
            onRemove={selectedTags.length > 0 ? () => onTags([]) : undefined}
            onPress={() => setPicker({ kind: 'tags' })} />
        )}
        {setCount > 1 && (
          <TouchableOpacity onPress={clearAll} hitSlop={10} accessibilityRole="button" style={styles.clearAll}>
            <Text style={styles.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </Animated.View>
      )}

      {/* One sheet, one question at a time. A single-choice pick closes it; tags stay open. */}
      <SheetModal visible={picker !== null} onClose={close} title={
        openGroup ? (openGroup.title ?? 'Show')
          : picker?.kind === 'type' ? 'Type'
          : picker?.kind === 'date' ? 'Date'
          : picker?.kind === 'who' ? 'Who'
          : 'Tags'
      }>
        <View style={styles.list}>
          {openGroup && openGroup.options.map(o => (
            <OptionRow key={o.value} label={o.label}
              selected={(selected[openGroup.key] ?? openGroup.options[0]?.value) === o.value}
              onPress={() => { onSelect(openGroup.key, o.value); close(); }} />
          ))}
          {picker?.kind === 'type' && onKind && [KIND_ANY, ...TXN_KIND].map(k => (
            <OptionRow key={k} label={k === KIND_ANY ? 'Everything' : TXN_KIND_LABEL_PLURAL[k as typeof TXN_KIND[number]]}
              accent={k === KIND_ANY ? undefined : kindColor(k as typeof TXN_KIND[number])}
              leading={k === KIND_ANY ? undefined : <View style={[styles.kindDot, { backgroundColor: kindColor(k as typeof TXN_KIND[number]) }]} />}
              selected={(kind ?? KIND_ANY) === k} onPress={() => { onKind(k as KindFilter); close(); }} />
          ))}
          {picker?.kind === 'date' && (
            <>
              {RANGE_PRESETS.map(r => (
                <OptionRow key={r} label={RANGE_LABEL[r]} selected={range === r}
                  onPress={() => { const { from, to } = resolveRange(r); onRange?.(r, from, to); close(); }} />
              ))}
              <OptionRow label={range === 'custom' ? rangeLabel : 'Pick dates…'} selected={range === 'custom'}
                onPress={() => { close(); setRangeOpen(true); }} />
            </>
          )}
          {picker?.kind === 'who' && (
            <>
              <OptionRow label="Anyone" selected={!person} onPress={() => { onPerson?.(null); close(); }} />
              {people.map(p => (
                <OptionRow key={p.id} label={p.name} selected={personId === p.id}
                  onPress={() => { onPerson?.(p.id); close(); }} />
              ))}
            </>
          )}
          {picker?.kind === 'tags' && (
            <>
              {tagOptions.map(t => (
                <OptionRow key={t} label={t} selected={selectedTags.some(x => tagKey(x) === tagKey(t))} onPress={() => toggleTag(t)} />
              ))}
              <PrimaryButton label="Done" onPress={close} style={styles.done} />
            </>
          )}
        </View>
      </SheetModal>

      {/* Custom bounds: one calendar, tap the first day then the last. */}
      <DateRangeSheet
        visible={rangeOpen}
        from={customFrom}
        to={customTo}
        onClose={() => setRangeOpen(false)}
        onApply={(f, t) => onRange?.('custom', f, t)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  strip: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // Same height and shape as a Chip, so the row reads as one set of pills.
  searchBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  chipRow: { gap: space.sm, alignItems: 'center', flexDirection: 'row' },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.bgInput, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.smd, height: 36,
  },
  // No lineHeight — it misaligns the placeholder/text in a single-line input.
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textPrimary, padding: 0 },
  clearAll: { paddingHorizontal: space.sm, height: 36, justifyContent: 'center' },
  clearAllText: { ...type.labelSemi, color: colors.accent },
  textBtn: { height: 36, justifyContent: 'center' },
  textBtnLabel: { ...type.labelSemi, color: colors.accent },
  list: { gap: space.sm },
  done: { marginTop: space.md },
  kindDot: { width: 10, height: 10, borderRadius: 5 },
});
