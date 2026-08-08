import React from 'react';
import { View } from 'react-native';
import { Card } from '../../ui/Card';
import { ListRow } from '../../ui/ListRow';
import { Divider } from '../../ui/Divider';
import { IconCircle } from '../../ui/IconCircle';
import { AmountText } from '../../ui/AmountText';
import { SectionHeader } from '../../ui/SectionHeader';
import { colors, layout } from '../../tokens';
import { categoryVisual } from '../../../constants/categories';
import { asFeather } from '../../../constants/palette';
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
 * Deliberately not the same list as `/plan/recurring`, which shows one row per
 * *rule*. The two genuinely differ at the edges: a yearly rule due in eleven months
 * is a rule with no upcoming charge, a paused or fully-skipped rule likewise, and one
 * rule can produce several rows here but only ever one there. What made them read as
 * duplicates was that both were labelled with generic "recurring" wording and neither
 * said which question it answered — so the caller supplies a title naming the *window*
 * ("Due this month"), and this list never claims to be the inventory.
 *
 * Now built from `Card`/`ListRow`/`IconCircle` like every other list, so the preview
 * and the manager read as one feature. It previously hand-rolled its own card, a 36px
 * icon disc, and a bold `SpaceMono` amount in `colors.settle` that appeared nowhere
 * else in the app.
 */
export function ComingUpList({ items, title = 'Coming up', showIcon = false, headerRight }: Props) {
  return (
    <View>
      <SectionHeader title={title} right={headerRight} />
      <Card clip>
        {items.map((it, i) => {
          const vis = showIcon ? categoryVisual(it.category) : null;
          return (
            <View key={`${it.id}-${it.dateMs}`}>
              {i > 0 && <Divider indent={showIcon ? 'text' : 'none'} />}
              <ListRow
                leading={vis ? (
                  <IconCircle
                    icon={asFeather(vis.icon, 'calendar')}
                    size={layout.iconCircle}
                    color={vis.color ?? colors.accent}
                  />
                ) : undefined}
                title={it.name}
                subtitle={`Recurring · ${whenLabel(it.daysUntil)}`}
                value={<AmountText paise={it.amount} size="sm" forceColor={colors.textPrimary} rounded />}
                chevron={false}
                accessibilityLabel={`${it.name}, due ${whenLabel(it.daysUntil)}`}
              />
            </View>
          );
        })}
      </Card>
    </View>
  );
}
