import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Chip } from './Chip';
import { SheetModal } from './SheetModal';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';
import { DateRangeSheet } from './DateRangeSheet';
import { FiltersButton } from './FiltersButton';
import { colors, type, space, radius, layout } from '../tokens';
import { shortDate } from '../../lib/dateFormat';
import { TXN_KIND, TXN_KIND_LABEL_PLURAL } from '../../constants/enums';
import { tagKey } from '../../lib/tags';
import {
  KIND_ANY, RANGE_LABEL, resolveRange, extraFilterCount,
  type KindFilter, type RangePreset,
} from '../../lib/txnFilter';

export type ChipGroup = {
  key: string;
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

  /** Kind. Omit the handler to hide the chips. */
  kind?: KindFilter;
  onKind?: (k: KindFilter) => void;

  /** Date range. `custom` opens the calendar. */
  range?: RangePreset;
  customFrom?: number | null;
  customTo?: number | null;
  onRange?: (preset: RangePreset, from: number | null, to: number | null) => void;

  /** Who is on the entry. Pass an empty list to hide the section. */
  people?: FilterPerson[];
  personId?: string | null;
  onPerson?: (id: string | null) => void;

  /** Tags found on the rows, most used first. Empty list hides the section. */
  tagOptions?: string[];
  selectedTags?: string[];
  onTags?: (tags: string[]) => void;
};

const RANGE_PRESETS: RangePreset[] = ['any', '7d', '30d', 'thisMonth', 'lastMonth'];

/**
 * The one filter structure, on every ledger (Search, Personal, a group).
 *
 * Two tiers, by how often you reach for them:
 *   - **inline** — the search field, the screen's own scope, and the entry type. Always visible.
 *   - **behind `Filters`** — when, who, tags. One button with a count badge; whatever is set shows
 *     below as removable chips, and only then, so an unfiltered list carries no extra row.
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);

  const person = people.find(p => p.id === personId) ?? null;
  const rangeLabel = range === 'custom'
    ? `${customFrom ? shortDate(new Date(customFrom)) : 'Start'} – ${customTo ? shortDate(new Date(customTo)) : 'Now'}`
    : RANGE_LABEL[range];

  const hasWhen = !!onRange;
  const hasWho = !!onPerson && people.length > 0;
  const hasTags = !!onTags && tagOptions.length > 0;
  const hasMore = hasWhen || hasWho || hasTags;
  // A set range counts once, whichever preset; the badge rule lives in `extraFilterCount`.
  const activeCount = extraFilterCount({ from: range === 'any' ? null : 0, to: null, personId: person?.id ?? null, tags: selectedTags });

  const toggleTag = (t: string) => {
    const has = selectedTags.some(x => tagKey(x) === tagKey(t));
    onTags?.(has ? selectedTags.filter(x => tagKey(x) !== tagKey(t)) : [...selectedTags, t]);
  };
  const clearAll = () => { onRange?.('any', null, null); onPerson?.(null); onTags?.([]); };

  /* Memoised: a search field sits directly above, and without this each keystroke rebuilt every
     chip on top of the consumer's own re-filter (`personal.tsx` froze on a large ledger).
     Consumers must pass a stable `groups` array for it to hold. */
  const scopeChips = useMemo(() => groups.flatMap(g => {
    const active = selected[g.key] ?? g.options[0]?.value;
    return g.options.map(o => (
      <Chip key={`${g.key}:${o.value}`} label={o.label} selected={active === o.value} onPress={() => onSelect(g.key, o.value)} />
    ));
  }), [groups, selected, onSelect]);

  const kindChips = onKind && TXN_KIND.map(k => (
    <Chip key={k} label={TXN_KIND_LABEL_PLURAL[k]} selected={kind === k} onPress={() => onKind(kind === k ? KIND_ANY : k)} />
  ));

  const filtersButton = hasMore ? <FiltersButton count={activeCount} onPress={() => setSheetOpen(true)} /> : null;

  const inlineChips = (scopeChips.length > 0 || kindChips) ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled" style={styles.flex}>
      {scopeChips}
      {kindChips}
    </ScrollView>
  ) : <View style={styles.flex} />;

  return (
    <View style={styles.wrap}>
      {onSearch ? (
        <>
          <View style={styles.topRow}>
            <View style={styles.searchBox}>
              <Feather name="search" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={onSearch}
                autoCorrect={false}
                returnKeyType="search"
              />
              {!!search && (
                <TouchableOpacity onPress={() => onSearch('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Feather name="x" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {filtersButton}
          </View>
          {(scopeChips.length > 0 || kindChips) && inlineChips}
        </>
      ) : (
        <View style={styles.topRow}>
          {inlineChips}
          {filtersButton}
        </View>
      )}

      {activeCount > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
          {range !== 'any' && <Chip icon="calendar" label={rangeLabel} selected maxWidth={180} onRemove={() => onRange?.('any', null, null)} />}
          {person && <Chip icon="user" label={person.name} selected maxWidth={160} onRemove={() => onPerson?.(null)} />}
          {selectedTags.map(t => <Chip key={t} icon="tag" label={t} selected maxWidth={140} onRemove={() => toggleTag(t)} />)}
        </ScrollView>
      )}

      <SheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters">
        <>
          {hasWhen && (
            <>
              <Text style={styles.section}>When</Text>
              <View style={styles.wrapChips}>
                {RANGE_PRESETS.map(r => (
                  <Chip
                    key={r}
                    label={RANGE_LABEL[r]}
                    selected={range === r}
                    onPress={() => { const { from, to } = resolveRange(r); onRange?.(r, from, to); }}
                  />
                ))}
                <Chip
                  icon="calendar"
                  label={range === 'custom' ? rangeLabel : 'Pick dates'}
                  selected={range === 'custom'}
                  chevron
                  onPress={() => { setSheetOpen(false); setRangeOpen(true); }}
                />
              </View>
            </>
          )}
          {hasWho && (
            <>
              <Text style={styles.section}>Who</Text>
              <View style={styles.wrapChips}>
                <Chip label="Anyone" selected={!person} onPress={() => onPerson?.(null)} />
                {people.map(p => (
                  <Chip key={p.id} label={p.name} maxWidth={160} selected={personId === p.id} onPress={() => onPerson?.(personId === p.id ? null : p.id)} />
                ))}
              </View>
            </>
          )}
          {hasTags && (
            <>
              <Text style={styles.section}>Tags</Text>
              <View style={styles.wrapChips}>
                {tagOptions.map(t => (
                  <Chip key={t} icon="tag" label={t} maxWidth={160} selected={selectedTags.some(x => tagKey(x) === tagKey(t))} onPress={() => toggleTag(t)} />
                ))}
              </View>
            </>
          )}
          <View style={styles.footer}>
            {activeCount > 0 && <SecondaryButton label="Clear" onPress={clearAll} style={styles.footerBtn} />}
            <PrimaryButton label="Done" onPress={() => setSheetOpen(false)} style={styles.footerBtn} />
          </View>
        </>
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
  wrap: { gap: space.sm },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chipRow: { gap: space.sm, alignItems: 'center', flexDirection: 'row' },

  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, height: 40,
  },
  // No lineHeight — it misaligns the placeholder/text in a single-line input.
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textPrimary, padding: 0 },

  section: { ...type.label, color: colors.textSecondary, marginTop: space.md, marginBottom: space.sm },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  footerBtn: { flex: 1, minHeight: layout.touchMin },
});
