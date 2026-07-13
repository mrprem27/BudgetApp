import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenData } from '../../../src/hooks/useScreenData';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, layout } from '../../../src/constants/layout';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { GroupForm } from '../../../src/components/finance/GroupForm';
import { getGroupById, updateGroup, archiveGroupSafe, deleteGroup, type SplitMode } from '../../../src/db/queries/groups';
import { getGroupMembers, getAllPersons, getMe, addMemberToGroup, removeMemberFromGroup, type Person } from '../../../src/db/queries/persons';
import { GROUP_COLORS } from '../../../src/constants/palette';
import { haptic } from '../../../src/lib/haptics';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('credit-card');
  const [color, setColor] = useState(GROUP_COLORS[0]);
  const [defaultSplit, setDefaultSplit] = useState<SplitMode>('equal');
  const [members, setMembers] = useState<string[]>([]);     // selected non-me ids
  const [isPersonal, setIsPersonal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Read-only load: the group's current values + selectable persons + the
  // initial-members snapshot (used by handleSave to diff adds/removals).
  const { data, error, reload } = useScreenData(async (db) => {
    const group = id ? await getGroupById(db, id) : null;
    if (!group) return { group: null, allPersons: [] as Person[], initialMembers: [] as string[] };
    const [mems, persons, me] = await Promise.all([getGroupMembers(db, id), getAllPersons(db), getMe(db)]);
    const meId = me?.id;
    const initialMembers = mems.filter(p => p.id !== meId).map(p => p.id);
    return { group, allPersons: persons.filter(p => p.id !== meId), initialMembers };
  }, [id]);

  const allPersons = data?.allPersons ?? [];
  const initialMembers = data?.initialMembers ?? [];

  // Seed the editable form fields once the read-only data arrives.
  useEffect(() => {
    if (!id || !data) return;
    if (!data.group) { Alert.alert('Group not found', 'This group may have been deleted.'); router.back(); return; }
    setName(data.group.name);
    setIcon(data.group.icon);
    setColor(data.group.color);
    setDefaultSplit(data.group.default_split);
    setIsPersonal(data.group.is_personal === 1);
    setMembers(data.initialMembers);
  }, [data]);

  useEffect(() => { if (!id) router.back(); }, [id]);

  if (!id) return null;

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateGroup(db, id, name.trim(), icon, color, defaultSplit);
      if (!isPersonal) {
        const added = members.filter(m => !initialMembers.includes(m));
        const removed = initialMembers.filter(m => !members.includes(m));
        for (const pid of added) await addMemberToGroup(db, id, pid);
        for (const pid of removed) await removeMemberFromGroup(db, id, pid);
      }
      haptic.success();
      router.back();
    } catch (e) {
      haptic.error();
      Alert.alert('Couldn’t save changes', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmArchive() {
    Alert.alert('Archive this group?', 'It’s hidden from your main view but all data is kept. You can restore it later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => {
        const ok = await archiveGroupSafe(db, id);
        if (ok) { haptic.warning(); router.replace('/groups'); }
      } },
    ]);
  }

  function confirmDelete() {
    Alert.alert('Delete this group?', 'This permanently deletes the group and all its expenses, splits and budgets. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const ok = await deleteGroup(db, id);
        if (ok) { haptic.warning(); router.replace('/groups'); }
        else Alert.alert('Can’t delete', 'The Personal group can’t be deleted.');
      } },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Edit group" onBack={() => router.back()} />
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <GroupForm
          values={{ name, icon, color, members, defaultSplit }}
          onChange={(patch) => {
            if (patch.name !== undefined) setName(patch.name);
            if (patch.icon !== undefined) setIcon(patch.icon);
            if (patch.color !== undefined) setColor(patch.color);
            if (patch.members !== undefined) setMembers(patch.members);
            if (patch.defaultSplit !== undefined) setDefaultSplit(patch.defaultSplit);
          }}
          allPersons={allPersons}
          showMembers={!isPersonal}
        />

        <View style={{ height: space.lg }} />
        <PrimaryButton label="Save changes" onPress={handleSave} disabled={!name.trim()} loading={saving} />

        {!isPersonal && (
          <View style={styles.danger}>
            <TouchableOpacity style={styles.dangerBtn} onPress={confirmArchive} accessibilityRole="button">
              <Text style={styles.dangerArchive}>Archive group</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.dangerBtn, styles.deleteBtn]} onPress={confirmDelete} accessibilityRole="button">
              <Text style={styles.dangerDelete}>Delete group</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.xl },
  danger: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  dangerBtn: { flex: 1, alignItems: 'center', paddingVertical: space.md, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  deleteBtn: { backgroundColor: colors.expenseTint, borderColor: colors.expenseTintStrong },
  dangerArchive: { ...type.body, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  dangerDelete: { ...type.body, color: colors.expense, fontFamily: 'Inter_600SemiBold' },
});
