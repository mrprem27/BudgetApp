import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, Platform, ActionSheetIOS } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { pickAttachment, AttachmentStorageError } from '../../../lib/attachment';

type Props = {
  attachmentUri: string | null;
  onChange: (uri: string | null) => void;
  onOpenStorageSettings: () => void;
};

/** Receipt attachment row: shows the thumbnail once attached, else a pick button
 *  (camera / library on iOS, camera on Android). Handles the out-of-storage case. */
export function AttachmentRow({ attachmentUri, onChange, onOpenStorageSettings }: Props) {
  const pick = () => {
    const attach = async (src: 'camera' | 'gallery') => {
      try {
        const u = await pickAttachment(src);
        if (u) onChange(u);
      } catch (e) {
        if (e instanceof AttachmentStorageError) {
          Alert.alert(
            'Photo couldn’t be saved',
            'Your device is low on storage. Free up space and try again — your expense will still save without the photo.',
            [
              { text: 'Storage settings', onPress: onOpenStorageSettings },
              { text: 'OK', style: 'cancel' },
            ],
          );
        }
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) attach('camera'); if (i === 2) attach('gallery'); },
      );
    } else {
      attach('camera');
    }
  };

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
