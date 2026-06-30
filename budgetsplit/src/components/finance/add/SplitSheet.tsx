import React from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { colors, type, space, radius } from '../../tokens';
import { splitEqual, formatRupees } from '../../../lib/money';
import { MemberAvatar } from '../MemberAvatar';
import type { Person } from '../../../db/queries/persons';
import { SPLIT_MODE, type SplitMode } from '../../../constants/enums';

/**
 * The "Split" bottom-sheet editor for Quick Add. Fully controlled — every piece
 * of split state lives in the parent (app/add/quick.tsx); this is the
 * presentation + input wiring only. Extracted verbatim, no logic change.
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.splitSheet} onPress={e => e.stopPropagation()}>
          <Text style={styles.splitTitle}>Split</Text>

          <View style={styles.splitTypeRow}>
            {SPLIT_MODE.map(st => (
              <TouchableOpacity
                key={st}
                style={[styles.splitTypeBtn, splitType === st && styles.splitTypeActive]}
                onPress={() => setSplitType(st)}
                accessibilityRole="button"
                accessibilityState={{ selected: splitType === st }}
              >
                <Text style={[styles.splitTypeLabel, splitType === st && { color: colors.bg }]}>
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 300 }}>
            {members.map(m => {
              const included = splitMembers.includes(m.id);
              let inputEl = null;
              if (included && splitType === 'exact') {
                inputEl = (
                  <TextInput
                    style={styles.splitInput}
                    value={exactAmounts[m.id] ?? ''}
                    onChangeText={v => setExactAmounts(prev => ({ ...prev, [m.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="₹0"
                    placeholderTextColor={colors.textMuted}
                  />
                );
              } else if (included && splitType === 'percent') {
                inputEl = (
                  <TextInput
                    style={styles.splitInput}
                    value={percentages[m.id] ?? ''}
                    onChangeText={v => setPercentages(prev => ({ ...prev, [m.id]: v }))}
                    keyboardType="number-pad"
                    placeholder="%"
                    placeholderTextColor={colors.textMuted}
                  />
                );
              } else if (included && splitType === 'shares') {
                inputEl = (
                  <TextInput
                    style={styles.splitInput}
                    value={ratios[m.id] ?? '1'}
                    onChangeText={v => setRatios(prev => ({ ...prev, [m.id]: v }))}
                    keyboardType="number-pad"
                    placeholder="1"
                    placeholderTextColor={colors.textMuted}
                  />
                );
              } else if (included && splitType === 'equal') {
                const idx = splitMembers.indexOf(m.id);
                const eq = splitEqual(total, splitMembers.length);
                inputEl = <Text style={styles.eqAmount}>{formatRupees(eq[idx] ?? 0)}</Text>;
              }
              return (
                <View key={m.id} style={styles.splitRow}>
                  <MemberAvatar name={m.name} color={m.avatar_color} size={36} imageUri={m.image_uri} onPress={() => {
                    setSplitMembers(prev =>
                      prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                    );
                  }} selected={included} />
                  <Text style={styles.splitName}>{m.name}</Text>
                  {inputEl}
                </View>
              );
            })}
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

          <TouchableOpacity style={styles.doneBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  splitSheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md, maxHeight: '80%' },
  splitTitle: { ...type.subheading, color: colors.textPrimary },
  splitTypeRow: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  splitTypeBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: radius.sm },
  splitTypeActive: { backgroundColor: colors.accent },
  splitTypeLabel: { ...type.caption, color: colors.textSecondary },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  splitName: { ...type.body, color: colors.textPrimary, flex: 1 },
  splitInput: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, width: 80, textAlign: 'right', borderWidth: 1, borderColor: colors.border },
  eqAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 14, color: colors.textSecondary },
  remainderBar: { paddingVertical: space.sm, alignItems: 'center', borderTopWidth: 1, borderColor: colors.border },
  remainderText: { ...type.label, fontFamily: 'Inter_600SemiBold' },
  doneBtn: { height: 52, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { ...type.button, color: colors.bg },
});
