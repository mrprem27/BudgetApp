import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '../../ui/Card';
import { Divider } from '../../ui/Divider';
import { SectionHeader } from '../../ui/SectionHeader';
import { colors, type, space, radius } from '../../tokens';
import { categoryVisual } from '../../../constants/categories';
import { asFeather } from '../../../constants/palette';
import { formatCompact } from '../../../lib/money';
import { alpha } from '../../../theme';
import type { UpcomingItem } from '../../../lib/upcoming';

type Props = {
  items: UpcomingItem[];
  /** Section label — defaults to the Home wording. */
  title?: string;
  /** Show a category icon per row (Plan's due-this-month list). */
  showIcon?: boolean;
  /** Right-hand slot on the header — Plan passes a link into the manager. */
  headerRight?: React.ReactNode;
};

function whenLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
}

/**
 * The next few recurring **charges** — one row per upcoming occurrence.
 *
 * Deliberately not the same list as `/plan/recurring`, which shows one row per *rule*: a
 * yearly rule due in eleven months, or a paused or fully-skipped one, is a rule with no
 * upcoming charge. The titles carry that distinction ("Due this month" is a window,
 * "Recurring" is the inventory) — without it the pair reads as one list shown twice.
 *
 * **This is a dense preview, so it does NOT use `ListRow`.** An earlier pass routed it
 * through `ListRow` for consistency and the result was reported as cluttered — rightly:
 * `ListRow` is built for settings-style rows at `space.md` padding and a 13px subtitle,
 * which added 8px per row and a larger secondary line. Over five rows that turns a quiet
 * glance-at-it block into a slab. `Card` and `Divider` still supply the chrome, so it
 * belongs to the design system; only the row metrics are local, and on purpose.
 */
export function ComingUpList({ items, title = 'Coming up', showIcon = false, headerRight }: Props) {
  return (
    <View>
      {/* `first` matters: callers put a `gap` on their scroll container, and
          SectionHeader's own `space.lg` top margin would stack with it — 40px of air
          above a compact list (AGENTS §12). */}
      <SectionHeader title={title} right={headerRight} first />
      <Card clip>
        {items.map((it, i) => {
          const vis = showIcon ? categoryVisual(it.category) : null;
          return (
            <View key={`${it.id}-${it.dateMs}`}>
              {i > 0 && <Divider indent={showIcon ? 'text' : 'none'} />}
              <View style={styles.row}>
                {vis && (
                  <View style={[styles.icon, { backgroundColor: alpha(vis.color ?? colors.accent, 13) }]}>
                    <Feather name={asFeather(vis.icon, 'calendar')} size={16} color={vis.color ?? colors.accent} />
                  </View>
                )}
                <View style={styles.mid}>
                  <Text style={styles.name} numberOfLines={1}>{it.name}</Text>
                  <Text style={styles.sub}>Recurring · {whenLabel(it.daysUntil)}</Text>
                </View>
                {/* `colors.settle` is the recurring/settlement colour (AGENTS §10), and it
                    is what made this figure scannable at a glance. */}
                <Text style={styles.amount}>{formatCompact(it.amount)}</Text>
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  // 12px vertical, not `space.md` — see the note above about density.
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.smd },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mid: { flex: 1, minWidth: 0 },
  name: { ...type.bodySemi, color: colors.textPrimary, marginBottom: 2 },
  sub: { ...type.caption, color: colors.textMuted },
  amount: { ...type.amountSM, color: colors.settle },
});
