import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { useAttachmentPicker } from '../../../hooks/useAttachmentPicker';

type Props = {
  attachmentUri: string | null;
  onChange: (uri: string | null) => void;
  onOpenStorageSettings: () => void;
};

/** Receipt attachment row: shows the thumbnail once attached, else a pick button
 *  (camera / library on iOS, camera on Android). Handles the out-of-storage case. */
export function AttachmentRow({ attachmentUri, onChange, onOpenStorageSettings }: Props) {
  const pick = useAttachmentPicker({ onPicked: onChange, onOpenStorageSettings });

  if (attachmentUri) {
    return (
      <View style={styles.attachRow}>
        <Image source={{ uri: attachmentUri }} style={styles.attachThumb} />
        <Text style={styles.attachName} numberOfLines={1}>Receipt attached</Text>
        <TouchableOpacity onPress={() => onChange(null)} hitSlop={10} accessibilityLabel="Remove attachment">
          <Feather name="x" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <TouchableOpacity style={styles.attachBtn} onPress={pick} accessibilityRole="button" accessibilityLabel="Attach receipt">
      <Feather name="paperclip" size={16} color={colors.accent} />
      <Text style={styles.attachBtnText}>Attach receipt</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  attachBtnText: { ...type.body, color: colors.accent },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  attachThumb: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.bgMuted },
  attachName: { ...type.body, color: colors.textPrimary, flex: 1 },
});
