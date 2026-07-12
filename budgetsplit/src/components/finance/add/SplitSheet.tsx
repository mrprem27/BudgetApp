import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { splitEqual, splitByPercent, splitByShares, parseToPaise, formatRupees } from '../../../lib/money';
import { SplitEditor } from './SplitEditor';
import { PrimaryButton } from '../../ui/PrimaryButton';
import type { Person } from '../../../db/queries/persons';
import { type SplitMode } from '../../../constants/enums';

/**
 * The "Split" bottom-sheet for Quick Add — sheet chrome + remainder + Done around
 * the shared {@link SplitEditor}. Fully controlled; split state lives in the
 * parent (app/add/quick.tsx). The split UI itself is the shared SplitEditor so
 * Quick / itemized / import group-split all look and behave identically.
 */
export function SplitSheet({
  visible, onClose,
  members, splitMembers, setSplitMembers,
  splitType, setSplitType,
  exactAmounts, setExactAmounts,
  percentages, setPercentages,
  ratios, setRatios,
  total, remainder,
}: {
  visible: boolean;
  onClose: () => void;
  members: Person[];
  splitMembers: string[];
  setSplitMembers: React.Dispatch<React.SetStateAction<string[]>>;
  splitType: SplitMode;
  setSplitType: (t: SplitMode) => void;
  exactAmounts: Record<string, string>;
  setExactAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  percentages: Record<string, string>;
  setPercentages: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  ratios: Record<string, string>;
  setRatios: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  total: number;
  remainder: number;
}) {
  // Computed share (paise) per member for the active mode — feeds SplitEditor's display.
  const result = (id: string): number => {
    if (!splitMembers.includes(id)) return 0;
    const idx = splitMembers.indexOf(id);
    if (splitType === 'exact') return parseToPaise(exactAmounts[id] ?? '0');
    if (splitType === 'percent') {
      const pcts = splitMembers.map(mid => { const p = parseInt(percentages[mid] ?? '0', 10); return Number.isFinite(p) ? p : 0; });
      return splitByPercent(total, pcts)[idx] ?? 0;
    }
    if (splitType === 'shares') {
      const rs = splitMembers.map(mid => { const r = parseInt(ratios[mid] ?? '1', 10); return Number.isFinite(r) && r > 0 ? r : 1; });
      return splitByShares(total, rs)[idx] ?? 0;
    }
    return splitEqual(total, splitMembers.length)[idx] ?? 0;
  };
  const rawValue = (id: string): string =>
    splitType === 'exact' ? (exactAmounts[id] ?? '')
    : splitType === 'percent' ? (percentages[id] ?? '')
    : splitType === 'shares' ? (ratios[id] ?? '1')
    : '';
  const onValue = (id: string, v: string) => {
    if (splitType === 'exact') setExactAmounts(prev => ({ ...prev, [id]: v }));
    else if (splitType === 'percent') setPercentages(prev => ({ ...prev, [id]: v }));
    else if (splitType === 'shares') setRatios(prev => ({ ...prev, [id]: v }));
  };
  const onToggle = (id: string) =>
    setSplitMembers(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.splitSheet} onPress={e => e.stopPropagation()}>
          <Text style={styles.splitTitle}>Split</Text>

          <ScrollView style={{ maxHeight: 340 }}>
            <SplitEditor
              members={members}
              included={splitMembers}
              onToggle={onToggle}
              mode={splitType}
              onMode={setSplitType}
              rawValue={rawValue}
              onValue={onValue}
              result={result}
            />
          </ScrollView>

          <View style={styles.remainderBar}>
            <Text style={[styles.remainderText, { color: remainder === 0 ? colors.income : colors.expense }]}>
              {remainder === 0
                ? 'Balanced'
                : remainder > 0
                ? `${formatRupees(remainder)} unassigned`
                : `${formatRupees(-remainder)} over-assigned`}
            </Text>
          </View>

          <PrimaryButton label="Done" onPress={onClose} style={{ marginTop: space.md }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  splitSheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md, maxHeight: '80%' },
  splitTitle: { ...type.subheading, color: colors.textPrimary },
  remainderBar: { paddingVertical: space.sm, alignItems: 'center', borderTopWidth: 1, borderColor: colors.border },
  remainderText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  doneBtn: { height: 52, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { ...type.button, color: colors.bg },
});
