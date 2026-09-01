import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SecondaryButton } from '../../ui/SecondaryButton';
import {
  overrideConfirmTitle, overrideConfirmBody, overrideConfirmCta, overrideConfirmCancel,
} from '../../../lib/budgetCopy';

/**
 * Consent before your first override in a group.
 *
 * Not an `Alert.alert`: this is a policy with a real cost, and an iOS alert holding
 * three paragraphs reads as an error and gets dismissed unread. The intent shipped
 * in `596b194` ("switching asks first, stating that cost") but the dialog never did
 * — the guard that was supposed to open it just swallowed the tap.
 */
export function OwnBudgetSheet({
  visible, groupName, onCancel, onConfirm,
}: {
  visible: boolean;
  groupName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <SheetModal visible={visible} onClose={onCancel} title={overrideConfirmTitle}>
      <View style={styles.iconWrap}>
        <Feather name="user" size={22} color={colors.accent} />
      </View>
      {/* From `lib/budgetCopy`, not written here: this sheet, the editor's hint and
          the Budget tab's empty state described the same policy in three different
          sets of words. */}
      {overrideConfirmBody(groupName).map(para => (
        <Text key={para} style={styles.body}>{para}</Text>
      ))}
      <PrimaryButton label={overrideConfirmCta} onPress={onConfirm} style={styles.primary} />
      <SecondaryButton label={overrideConfirmCancel} onPress={onCancel} />
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 44, height: 44, borderRadius: radius.lg,
    backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center',
    marginBottom: space.md,
  },
  body: { ...type.body, color: colors.textSecondary, lineHeight: 20, marginBottom: space.md },
  primary: { marginTop: space.xs, marginBottom: space.sm },
});
