import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PressableScale } from './PressableScale';
import { colors, type, space, radius, layout } from '../tokens';
import { alpha } from '../../theme';

type Props = {
  /** The chosen day, 1–31. */
  value: number;
  onChange: (day: number) => void;
  /** Tint for the chosen cell. Defaults to the app accent. */
  accent?: string;
  /** Announced on each cell, e.g. `d => \`Paid on the ${ordinal(d)}\``. */
  labelFor?: (day: number) => string;
};

/** 1…31. Built once — the array is constant. */
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * Pick a day of the month, 1–31, as a 7-column grid.
 *
 * ## Why every day, and not a shortlist
 *
 * Onboarding offered seven of them — `[1, 5, 7, 10, 15, 25, 30]` — so someone paid
 * on the 28th could not say so, and had to pick a day their salary does not land
 * on. The same argument that turned `PayMethodSelector` from a sideways scroll into
 * a list applies here: **how many options exist must not depend on which ones
 * someone thought to offer.** A month has 31 days; all 31 fit on one screen.
 *
 * ## Why a grid and not a calendar
 *
 * A day-of-month is not a date. A calendar would say "the 3rd of September", which
 * is a different claim from "the 3rd, every month", and it immediately raises the
 * question this control does not have to answer — *what happens in February*.
 * Callers clamp (`paydayAnchor` resolves 31 to the 28th in a short month), and a
 * grid of bare numbers is the shape that matches that meaning.
 *
 * ## Why these are not `Chip`s
 *
 * AGENTS §9 owns the pill shape and forbids hand-rolling one — so this is
 * deliberately **not** a pill: `radius.md` on a fixed-width cell, not `radius.pill`
 * on a content-width one. A row of 31 pills would be ragged (a "1" is half the
 * width of a "31") and would read as 31 independent toggles rather than one answer.
 * The colours are the chip vocabulary — `bgMuted` unset, accent-tinted when chosen —
 * so it still belongs to the same system.
 *
 * ## The gutter is a margin, not padding, and that is a §6 requirement
 *
 * The tappable box is the `PressableScale`, so whichever way the gutter is
 * expressed decides whether §6's 44pt is met:
 *
 * - `padding` on the wrapper puts the gutter **inside** the column, so the
 *   pressable is `column − 2 × space.xs`. On a 375pt phone that is **41pt** — under
 *   the minimum, on all 31 targets.
 * - `margin` on the cell puts it **outside**, so the pressable spans the whole
 *   column and only the paint is inset. Same picture, a compliant target.
 *
 * Column width is `(screen − 2 × layout.screenPaddingH) / 7` = **49pt** on the
 * narrowest phone this app supports (SE 2/3 at 375pt; the deployment target is iOS
 * 16.4, which the 320pt SE 1st gen cannot run). Height is `layout.touchMin`
 * outright. So 49 × 44, unaided — no `hitSlop`, and none that would work: the
 * columns are adjacent, so horizontal slop would overlap the neighbouring day.
 *
 * The first version of this comment quoted the 49pt figure while the code used
 * `padding`, and concluded §6 held. The number was the column; the target was the
 * column minus its gutters.
 */
export function DayOfMonthGrid({ value, onChange, accent = colors.accent, labelFor }: Props) {
  return (
    <View style={styles.grid}>
      {DAYS.map(d => {
        const on = d === value;
        return (
          // The width lives on a plain wrapper, not on `PressableScale`: it applies
          // `style` to an inner Animated.View, which would then be measured against
          // a Pressable that is itself content-sized. `Chip`'s `grow` does the same.
          <View key={d} style={styles.cellWrap}>
            <PressableScale
              onPress={() => onChange(d)}
              accessibilityLabel={labelFor?.(d) ?? String(d)}
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.cell, on && { backgroundColor: alpha(accent, 20), borderColor: accent }]}>
                <Text style={[styles.day, on && { color: accent, ...type.labelSemi }]}>{d}</Text>
              </View>
            </PressableScale>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // A 7-wide wrap rather than a fixed 5×7, so the last row's three cells stay full
  // width and left-aligned — which is what the end of a month looks like.
  //
  // No `gap` here on purpose: with percentage widths summing to exactly 100%, any
  // gap pushes the seventh cell onto its own line. The gutters are a margin on the
  // cell instead, which meets its neighbour's at `space.sm` — and, unlike padding
  // on the wrapper, leaves the whole column tappable (see the note above).
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWrap: { width: `${100 / 7}%` },
  cell: {
    margin: space.xs,
    height: layout.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  day: { ...type.label, color: colors.textSecondary },
});
