import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Chip } from './Chip';
import { Card } from './Card';
import { Divider } from './Divider';
import { ListRow } from './ListRow';
import { SheetModal } from './SheetModal';
import { DatePickerSheet } from './DatePickerSheet';
import { colors, type, space, radius } from '../tokens';
import { shortDate } from '../../lib/dateFormat';
import { TXN_KIND, TXN_KIND_LABEL_PLURAL } from '../../constants/enums';
import {
  KIND_ANY, RANGE_LABEL, resolveRange,
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
   * When true: chips + a compact search icon are shown inline on one row.
   * Tapping the search icon replaces the chip row with a full-width input.
   * Clearing/blurring collapses back.
   */
  collapsible?: boolean;
  /**
   * Screen-specific exclusive choices that are **not** transaction filters —
   * Personal's group scope, Search's source. Everything a *transaction* can be
   * filtered by has a named prop below, because those must behave identically
   * everywhere (`lib/txnFilter.ts`).
   */
  groups?: ChipGroup[];
  /** Selected value per group key. Missing key = first option. */
  selected: Record<string, string>;
  onSelect: (key: string, value: string) => void;

  /** Kind. Omit the handler to hide the chip. */
  kind?: KindFilter;
  onKind?: (k: KindFilter) => void;

  /** Date range. `custom` opens two date pickers. */
  range?: RangePreset;
  customFrom?: number | null;
  customTo?: number | null;
  onRange?: (preset: RangePreset, from: number | null, to: number | null) => void;

  /** Who is on the entry. Pass an empty list to hide the chip. */
  people?: FilterPerson[];
  personId?: string | null;
  onPerson?: (id: string | null) => void;
};

/**
 * The one filter bar. Chip filters + optional collapsible search.
 *
 * ## It used to be one of the four variants it exists to prevent
 *
 * `AGENTS.md` §9 says the pill shape is `ui/Chip` and forbids hand-rolling one —
 * and this component, the *shared* one, built its chips out of `TouchableOpacity`
 * with a private 30pt stylesheet. So the app had four filter chip implementations
 * and the common component was one of them (`OV-34`).
 *
 * ## And the surfaces disagreed about what filtering means
 *
 * Personal offered group scope and **no text search at all**; the group ledger
 * offered kind and free text; Search offered source, kind and a much wider text
 * match. Date range existed only in Review, and **person existed nowhere** — on an
 * app whose whole premise is shared spending. The matching now lives in
 * `lib/txnFilter.ts` so it cannot drift again; this file is only the controls.
 *
 * Non-collapsible: search box on top, chip rows below.
 * Collapsible: chips + a search icon on one row; tapping it expands the input.
 * Chips always live in exactly ONE position — no dual-rendering.
 */
export function FilterBar({
  search, onSearch, searchPlaceholder = 'Search…', collapsible = false,
  groups = [], selected, onSelect,
  kind, onKind,
  range = 'any', customFrom = null, customTo = null, onRange,
  people = [], personId = null, onPerson,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(!!search);
  const [sheet, setSheet] = useState<'range' | 'person' | null>(null);
  const [datePick, setDatePick] = useState<'from' | 'to' | null>(null);
  const inputRef = useRef<TextInput>(null);

  function openSearch() {
    setSearchOpen(true);
    // Small delay so the input mounts before we try to focus it.
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function closeSearch() {
    onSearch?.('');
    setSearchOpen(false);
  }

  const person = people.find(p => p.id === personId) ?? null;
  const rangeLabel = range === 'custom'
    ? `${customFrom ? shortDate(new Date(customFrom)) : 'Start'} – ${customTo ? shortDate(new Date(customTo)) : 'Now'}`
    : RANGE_LABEL[range];

  /*
   * Memoised because this rebuilds every chip element, and a search field sits
   * directly above it: without this, each keystroke re-created the whole chip row
   * on top of the consumer's own re-filter, and `personal.tsx` froze on a large
   * ledger. Consumers must pass a stable `groups` array for it to hold — see the
   * note there.
   */
  const scopeChips = useMemo(() => groups.flatMap(g => {
    const active = selected[g.key] ?? g.options[0]?.value;
    return g.options.map(o => (
      <Chip
        key={`${g.key}:${o.value}`}
        label={o.label}
        selected={active === o.value}
        onPress={() => onSelect(g.key, o.value)}
      />
    ));
  }), [groups, selected, onSelect]);

  /**
   * The transaction filters, in the order you reach for them.
   *
   * Kind is a set of toggles (tap the active one to clear); range and person hold
   * a value and open a picker, so they carry a chevron — §9's one-affordance rule
   * doing the explaining.
   */
  const txnChips = (
    <>
      {/* `settlement` is labelled "Transfers", not "Settlements" — one word for
          person-to-person movement, matching the Reports drill-down's tab and the
          Transfer pill you entered it with. An investment is a settlement too, and
          it is found by its own text ("gold", "Invested") rather than by a fifth
          chip: this row already carries kind, date and person, and `SC-23`'s whole
          point is the text field above it. */}
      {onKind && TXN_KIND.map(k => (
        <Chip
          key={k}
          label={TXN_KIND_LABEL_PLURAL[k]}
          selected={kind === k}
          onPress={() => onKind(kind === k ? KIND_ANY : k)}
        />
      ))}
      {onRange && (
        <Chip
          icon="calendar"
          label={rangeLabel}
          selected={range !== 'any'}
          chevron
          maxWidth={180}
          onPress={() => setSheet('range')}
          accessibilityLabel={`Date range: ${rangeLabel}. Change`}
        />
      )}
      {onPerson && people.length > 0 && (
        <Chip
          icon="user"
          label={person?.name ?? 'Anyone'}
          selected={!!person}
          chevron
          maxWidth={160}
          onPress={() => setSheet('person')}
          accessibilityLabel={person ? `Only ${person.name}. Change` : 'Filter by person'}
        />
      )}
    </>
  );

  const sheets = (
    <>
      <SheetModal visible={sheet === 'range'} onClose={() => setSheet(null)} title="When">
        <Card clip>
          {(['any', '7d', '30d', 'thisMonth', 'lastMonth', 'custom'] as RangePreset[]).map((r, i) => (
            <React.Fragment key={r}>
              {i > 0 && <Divider indent="text" />}
              <ListRow
                icon={r === 'custom' ? 'sliders' : 'calendar'}
                iconColor={range === r ? colors.accent : colors.textSecondary}
                title={RANGE_LABEL[r]}
                chevron={r === 'custom'}
                selected={range === r}
                value={range === r && r !== 'custom' ? <Feather name="check" size={18} color={colors.accent} /> : undefined}
                onPress={() => {
                  if (r === 'custom') { setSheet(null); setDatePick('from'); return; }
                  const { from, to } = resolveRange(r);
                  onRange?.(r, from, to);
                  setSheet(null);
                }}
              />
            </React.Fragment>
          ))}
        </Card>
      </SheetModal>

      {/* Custom bounds. Two passes through the same picker — from, then to — so
          there is one calendar in the app rather than a bespoke range widget.
          No time step: a ledger row is found by day. Review chains into
          `TimePickerSheet` because a parsed import genuinely carries a moment. */}
      <DatePickerSheet
        visible={datePick !== null}
        value={(datePick === 'to' ? customTo : customFrom) ?? Date.now()}
        onClose={() => setDatePick(null)}
        onChange={(ms) => {
          if (datePick === 'from') {
            const start = new Date(ms); start.setHours(0, 0, 0, 0);
            onRange?.('custom', start.getTime(), customTo);
            setDatePick('to');
          } else {
            // End of the chosen day, so "to 15 June" includes the 15th.
            const end = new Date(ms); end.setHours(23, 59, 59, 999);
            onRange?.('custom', customFrom, end.getTime());
            setDatePick(null);
          }
        }}
      />

      <SheetModal visible={sheet === 'person'} onClose={() => setSheet(null)} title="Who's on it">
        <Card clip>
          <ListRow
            icon="users"
            iconColor={!person ? colors.accent : colors.textSecondary}
            title="Anyone"
            chevron={false}
            selected={!person}
            value={!person ? <Feather name="check" size={18} color={colors.accent} /> : undefined}
            onPress={() => { onPerson?.(null); setSheet(null); }}
          />
          {people.map(p => (
            <React.Fragment key={p.id}>
              <Divider indent="text" />
              <ListRow
                icon="user"
                iconColor={personId === p.id ? colors.accent : colors.textSecondary}
                title={p.name}
                chevron={false}
                selected={personId === p.id}
                value={personId === p.id ? <Feather name="check" size={18} color={colors.accent} /> : undefined}
                onPress={() => { onPerson?.(p.id); setSheet(null); }}
              />
            </React.Fragment>
          ))}
        </Card>
      </SheetModal>
    </>
  );

  if (collapsible) {
    // One row: either chips + search icon, OR full-width search input.
    return (
      <View style={styles.collapsibleRow}>
        {searchOpen ? (
          // Full-width search — chips are fully hidden to free up space.
          <>
            <TouchableOpacity
              onPress={closeSearch}
              hitSlop={8}
              style={styles.collapseBtn}
              accessibilityRole="button"
              accessibilityLabel="Close search"
            >
              <Feather name="chevron-left" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.searchBox}>
              <Feather name="search" size={15} color={colors.textMuted} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={onSearch}
                autoCorrect={false}
                returnKeyType="search"
                onBlur={() => { if (!search) closeSearch(); }}
              />
              {!!search && (
                <TouchableOpacity onPress={() => onSearch?.('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Feather name="x" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          // Chip row + search icon at the end.
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRowContent}
              keyboardShouldPersistTaps="handled"
              style={styles.chipScroll}
            >
              {scopeChips}
              {txnChips}
            </ScrollView>
            {onSearch && (
              <TouchableOpacity
                onPress={openSearch}
                hitSlop={8}
                style={styles.searchIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Search"
              >
                <Feather name="search" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </>
        )}
        {sheets}
      </View>
    );
  }

  // Non-collapsible: search box above, chip rows below.
  return (
    <View style={styles.wrap}>
      {onSearch && (
        <View style={styles.searchBox}>
          <Feather name="search" size={15} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
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
      )}
      {groups.map(g => {
        const active = selected[g.key] ?? g.options[0]?.value;
        return (
          <ScrollView
            key={g.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRowContent}
            keyboardShouldPersistTaps="handled"
          >
            {g.options.map(o => (
              <Chip
                key={o.value}
                label={o.label}
                selected={active === o.value}
                onPress={() => onSelect(g.key, o.value)}
              />
            ))}
          </ScrollView>
        );
      })}
      {(onKind || onRange || onPerson) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRowContent}
          keyboardShouldPersistTaps="handled"
        >
          {txnChips}
        </ScrollView>
      )}
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },

  // Collapsible: single row containing chips OR search.
  collapsibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 40,
  },
  chipScroll: { flex: 1 },
  chipRowContent: { gap: space.sm, alignItems: 'center', flexDirection: 'row' },

  searchIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  collapseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Shared search box (used by both collapsible-open and non-collapsible).
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    height: 40,
  },
  // No lineHeight — it misaligns the placeholder/text in a single-line input.
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textPrimary, padding: 0 },
});
