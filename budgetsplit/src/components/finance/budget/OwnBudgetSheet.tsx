import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../tokens';
import { SheetModal } from '../../ui/SheetModal';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { SecondaryButton } from '../../ui/SecondaryButton';

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
    <SheetModal visible={visible} onClose={onCancel} title="Set your own budget here?">
      <View style={styles.iconWrap}>
        <Feather name="user" size={22} color={colors.accent} />
      </View>
      <Text style={styles.body}>
        You follow {groupName}'s budget right now. Your own amounts replace it — only for
        you, only in this group. Nobody else sees them and the group's copy doesn't change.
      </Text>
      <Text style={styles.body}>
        Every category you fill in stops following the group: if an admin changes that
        category later, your amount stays. Categories you leave blank keep following it.
      </Text>
      <Text style={styles.body}>
        Clear an amount any time to go back to following the group.
      </Text>
      <PrimaryButton label="Set my own" onPress={onConfirm} style={styles.primary} />
      <SecondaryButton label="Keep following the group" onPress={onCancel} />
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
