import React, { useEffect, useState } from 'react';
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
  // The file can be gone while the URI remains — a rows-only restore, or photos
  // cleared from Storage. Saying "Receipt attached" over a blank square is worse
  // than saying nothing, because this row is the only evidence the photo exists.
  const [missing, setMissing] = useState(false);
  useEffect(() => { setMissing(false); }, [attachmentUri]);

  if (attachmentUri) {
    return (
      <View style={styles.attachRow}>
        {missing ? (
          <View style={[styles.attachThumb, styles.attachThumbGone]}>
            <Feather name="image" size={14} color={colors.textMuted} />
          </View>
        ) : (
          <Image source={{ uri: attachmentUri }} style={styles.attachThumb} onError={() => setMissing(true)} />
        )}
        <Text style={[styles.attachName, missing && styles.attachNameGone]} numberOfLines={1}>
          {missing ? 'Photo missing — attach again' : 'Receipt attached'}
        </Text>
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
  attachThumbGone: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  attachNameGone: { color: colors.textMuted },
  attachName: { ...type.body, color: colors.textPrimary, flex: 1 },
});
