import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TabPills } from '../../ui/TabPills';
import { haptic } from '../../../lib/haptics';
import { TXN_SOURCE_LABEL, TXN_SOURCE_ICON, type TxnSource } from '../../../constants/enums';
import { asFeather } from '../../../constants/palette';
import { colors, space, layout } from '../../tokens';
import { reviewStyles } from './reviewStyles';

type Props = {
  /** Only the sources actually present, in canonical order. */
  sources: TxnSource[];
  /** Null = the "All" tab. */
  active: TxnSource | null;
  onChange: (s: TxnSource | null) => void;
  /** Count per source, plus the total for "All". */
  countOf: (s: TxnSource | null) => number;
};

/**
 * Source tabs, above the list rather than as headers inside it.
 *
 * Review was already sectioned by source, but as inline headers you had to scroll past one
 * source to reach another — and they are independent inboxes: a Gmail import has nothing to do
 * with what you said to Siri, so choosing between them should be a tap. The headers stay for
 * the "All" tab, where they are the only thing separating the groups.
 *
 * Renders nothing when there is only one source, since a segmented control with one option is
 * a label pretending to be a choice.
 */
export function ReviewSourceTabs({ sources, active, onChange, countOf }: Props) {
  if (sources.length < 2) return null;

  return (
    <View style={styles.wrap}>
      <TabPills
        tabs={[
          { key: 'all', label: `All ${countOf(null)}` },
          ...sources.map(src => ({ key: src, label: `${TXN_SOURCE_LABEL[src]} ${countOf(src)}` })),
        ]}
        active={active ?? 'all'}
        onChange={(k) => { haptic.selection(); onChange(k === 'all' ? null : k as TxnSource); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Outside the scroll view, so switching source never means scrolling back up to find it.
  wrap: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
});

/**
 * The inline header between sources on the All tab.
 *
 * Only the All tab renders these — on a single-source tab they would repeat the pill you just
 * tapped. Lives beside the tabs because they name the same thing and drift otherwise.
 */
export function ReviewSourceHeader({ source, count }: { source: TxnSource; count: number }) {
  return (
    <View style={reviewStyles.sectionHeader}>
      <View style={reviewStyles.sectionIcon}>
        <Feather name={asFeather(TXN_SOURCE_ICON[source], 'inbox')} size={12} color={colors.accent} />
      </View>
      <Text style={reviewStyles.sectionHeaderText}>{TXN_SOURCE_LABEL[source]}</Text>
      <Text style={reviewStyles.sectionHeaderCount}>{count}</Text>
    </View>
  );
}
