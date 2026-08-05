import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { formatRupees, parseToPaise } from '../../../lib/money';
import type { ParsedLineItem } from '../../../lib/ocrProviders';
import { alpha } from '../../../theme';

/**
 * Shown after a receipt scan. When the active provider produced raw OCR text
 * (the on-device path), it's always visible — this is the accuracy-verification
 * panel, since the heuristic line-item guess below it is best-effort and will
 * miss things, so seeing exactly what was read is the real safety net. The
 * cloud provider extracts items directly with no raw-text step (rawText is
 * null), so that panel is skipped and only the candidate list shows. All
 * candidates start selected; any can be unchecked before "Add" appends them
 * into the itemized form's item list.
 */
export function ReceiptScanSheet({
  visible,
  onClose,
  rawText,
  candidates,
  onAddItems,
  fellBack = false,
}: {
  visible: boolean;
  onClose: () => void;
  rawText: string | null;
  candidates: ParsedLineItem[];
  onAddItems: (drafts: ParsedLineItem[]) => void;
  /** Cloud scanning failed and the on-device reader covered for it (`V2-13`). */
  fellBack?: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (visible) setSelected(new Set(candidates.map((_, i) => i)));
  }, [visible, candidates]);

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const chosen = candidates.filter((_, i) => selected.has(i));

  return (
    <SheetModal visible={visible} onClose={onClose} title="Scanned receipt">
      {/* Said plainly, because on-device reading misses items on cramped receipts far
          more often — "check the list" is real advice here and noise otherwise. */}
      {fellBack && (
        <View style={styles.fallbackNote}>
          <Feather name="wifi-off" size={14} color={colors.healthAmber} />
          <Text style={styles.fallbackText}>Cloud scanning wasn’t available, so this was read on your device. Check the items below — on-device reading misses more.</Text>
        </View>
      )}
      {rawText !== null && (
        <>
          <Text style={styles.label}>RAW SCAN TEXT</Text>
          <Text style={styles.hint}>Check this against your receipt — the item guesses below are best-effort.</Text>
          <ScrollView style={styles.rawBox} nestedScrollEnabled>
            <Text style={styles.rawText} selectable>{rawText.trim() || 'No text detected.'}</Text>
          </ScrollView>
        </>
      )}

      {candidates.length > 0 ? (
        <>
          <Text style={[styles.label, { marginTop: space.md }]}>LOOKS LIKE {candidates.length} ITEM{candidates.length === 1 ? '' : 'S'}</Text>
          {candidates.map((c, i) => {
            const checked = selected.has(i);
            return (
              <TouchableOpacity
                key={i}
                style={[styles.row, checked && styles.rowOn]}
                onPress={() => toggle(i)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <Feather name={checked ? 'check-circle' : 'circle'} size={20} color={checked ? colors.accent : colors.textMuted} />
                <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.rowAmount}>{c.qty} × {formatRupees(parseToPaise(c.unitPrice))}</Text>
              </TouchableOpacity>
            );
          })}
          <PrimaryButton
            label={chosen.length === 0 ? 'Select at least one' : `Add ${chosen.length} item${chosen.length === 1 ? '' : 's'}`}
            onPress={() => onAddItems(chosen)}
            disabled={chosen.length === 0}
            style={styles.button}
          />
        </>
      ) : (
        <Text style={[styles.hint, { marginTop: space.md }]}>No items recognized — add them manually below, or try scanning again with a clearer photo.</Text>
      )}
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  label: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: space.xs },
  hint: { ...type.caption, color: colors.textSecondary, lineHeight: 16, marginBottom: space.sm },
  rawBox: { maxHeight: 180, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  rawText: { fontFamily: 'SpaceMono_400Regular', fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  fallbackNote: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, backgroundColor: alpha(colors.healthAmber, 13), borderRadius: radius.md, borderWidth: 1, borderColor: alpha(colors.healthAmber, 33), padding: space.sm, marginBottom: space.md },
  fallbackText: { ...type.caption, color: colors.healthAmber, flex: 1, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm + 2, paddingHorizontal: space.sm, borderRadius: radius.md, marginBottom: space.xs },
  rowOn: { backgroundColor: colors.bgMuted },
  rowName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold', flex: 1 },
  rowAmount: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: colors.textSecondary },
  button: { marginTop: space.sm },
});
