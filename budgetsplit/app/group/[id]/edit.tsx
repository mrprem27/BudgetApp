import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenData } from '../../../src/hooks/useScreenData';
import { getGroupContext } from '../../../src/db/queries/groups';
import { canDeleteGroup, canEditGroup, isAdmin } from '../../../src/lib/permissions';
import { colors, type, space, radius, layout } from '../../../src/theme';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Banner } from '../../../src/components/ui/Banner';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { GroupForm } from '../../../src/components/finance/GroupForm';
import {
  getGroupById, updateGroup, archiveGroupSafe, deleteGroup, leaveGroup, stopSyncingGroup,
  type SplitMode,
} from '../../../src/db/queries/groups';
import { getGroupNet } from '../../../src/db/queries/balances';
import { announceGroupExit } from '../../../src/lib/syncEngine';
import { oweView } from '../../../src/lib/owe';
import { getGroupMembers, getAllPersons, getMe, addMemberToGroup, removeMemberFromGroup, type Person } from '../../../src/db/queries/persons';
import { GROUP_COLORS } from '../../../src/constants/palette';
import { useDataRefresh } from '../../../src/components/system/DataRefreshProvider';
import { haptic } from '../../../src/lib/haptics';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
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
    if (!group) return { group: null, allPersons: [] as Person[], initialMembers: [] as string[], meId: '', ctx: null, myNet: 0 };
    const [mems, persons, me] = await Promise.all([getGroupMembers(db, id), getAllPersons(db), getMe(db)]);
    const meId = me?.id;
    const initialMembers = mems.filter(p => p.id !== meId).map(p => p.id);
    const ctx = meId ? await getGroupContext(db, id, meId) : null;
    // Where I stand in this group, so leaving can say the figure rather than
    // block on it. Read from the group's own net — never recomputed here.
    const myNet = meId ? (await getGroupNet(db, id))[meId] ?? 0 : 0;
    return { group, allPersons: persons.filter(p => p.id !== meId), initialMembers, meId: meId ?? '', ctx, myNet };
  }, [id]);

  const allPersons = data?.allPersons ?? [];
  const initialMembers = data?.initialMembers ?? [];
  const meId = data?.meId ?? '';
  // Deleting takes every member's history with it, so it is the creator's call alone.
  const mayDelete = data?.ctx ? canDeleteGroup(data.ctx) : false;
  // Admins only, matching `canAddMember` / `canRemoveMember` / `canEditGroup`. The
  // query layer refuses either way now; these stop offering a plain member controls
  // whose Save can only fail.
  const mayManageMembers = data?.ctx ? isAdmin(data.ctx) : false;
  const mayEdit = data?.ctx ? canEditGroup(data.ctx) : false;

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
      await updateGroup(db, id, name.trim(), icon, color, defaultSplit, meId);
      if (!isPersonal) {
        const added = members.filter(m => !initialMembers.includes(m));
        const removed = initialMembers.filter(m => !members.includes(m));
        // `meId` is not optional here. Passing nothing used to skip the check
        // entirely, which let any member add or remove anyone from this screen —
        // including the creator, who is un-removable by design.
        for (const pid of added) await addMemberToGroup(db, id, pid, meId);
        for (const pid of removed) await removeMemberFromGroup(db, id, pid, meId);
      }
      haptic.success();
      refresh();
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
        // `dismissTo`, like delete and leave below — `replace` swaps only THIS
        // screen, leaving the group's detail screen underneath it, so Back from
        // the groups list walked straight back into the group just archived.
        if (ok) { haptic.warning(); refresh(); router.dismissTo('/groups'); }
      } },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'Delete for everyone?',
      'This group closes for you and everyone in it, and nobody can add to it again.\n\n'
      + 'Your own history is kept — what you spent still counts in the months it happened in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for everyone', style: 'destructive', onPress: async () => {
          try {
            // Server first: the owner check lives there, and a local delete it
            // refused would leave the two permanently disagreeing about whether
            // this group exists. The roster goes with it, before `deleted_at`
            // makes every write from this device refused.
            await announceGroupExit(db, id, 'delete');
            const res = await deleteGroup(db, id, meId);
            if (!res.ok) {
              Alert.alert('Can’t delete', 'The Personal group can’t be deleted.');
              return;
            }
            haptic.warning();
            refresh();
            router.dismissTo('/groups');
          } catch (e) {
            haptic.error();
            Alert.alert('Couldn’t delete', e instanceof Error ? e.message : 'Please try again.');
          }
        } },
      ],
    );
  }

  /**
   * Leaving is the non-creator's exit, and there was none: `leaveSyncGroup` had
   * no callers, Members hides the remove action for yourself, and a local delete
   * resurrected the group on the next pull. Somebody could share a group with you
   * and you could not get out of it.
   */
  function confirmLeave() {
    const owed = data?.myNet ?? 0;
    const settleFirst = owed !== 0;
    Alert.alert(
      'Leave this group?',
      (settleFirst
        ? `${oweView(owed).withName(name || 'this group')}. Leaving does not clear it.\n\n`
        : '')
      + 'You stop getting its updates and can’t add to it. Everything you’ve already '
      + 'shared stays, for you and for them.',
      [
        { text: 'Cancel', style: 'cancel' },
        ...(settleFirst
          ? [{ text: 'Settle up first', onPress: () => router.push('/(tabs)/groups' as const) }]
          : []),
        { text: settleFirst ? 'Leave anyway' : 'Leave', style: 'destructive' as const, onPress: async () => {
          const res = await leaveGroup(db, id, meId);
          if (!res.ok) {
            Alert.alert(
              'Can’t leave',
              res.reason === 'creator'
                ? 'You created this group, so it always keeps you — otherwise nobody could manage it. Delete it for everyone instead.'
                : 'Please try again.',
            );
            return;
          }
          // Publish the departure, tell the server, THEN stop syncing — dropping
          // the queue first would leave nothing able to publish it.
          await announceGroupExit(db, id, 'leave');
          await stopSyncingGroup(db, id);
          haptic.warning();
          refresh();
          router.dismissTo('/groups');
        } },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Edit group" onBack={() => router.back()} />
      {error ? (
        <ErrorState onRetry={reload} />
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
          showMembers={!isPersonal && mayManageMembers}
        />

        <View style={{ height: space.lg }} />
        {/*
          Say it, rather than presenting a Save that can only be refused. The
          name, icon, colour and split all belong to the whole group now — they
          travel on the roster — so changing them is an admin act.
        */}
        {!isPersonal && !mayEdit && (
          <Banner icon="lock" text="Only an admin can change this group's details." />
        )}
        <PrimaryButton
          label="Save changes"
          onPress={handleSave}
          disabled={!name.trim() || (!isPersonal && !mayEdit)}
          loading={saving}
        />

        {!isPersonal && (
          <View style={styles.danger}>
            <TouchableOpacity style={styles.dangerBtn} onPress={confirmArchive} accessibilityRole="button">
              <Text style={styles.dangerArchive}>Archive group</Text>
            </TouchableOpacity>
            {/* The creator's exit is Delete; everyone else's is Leave. The two are
                mutually exclusive because a group must always keep the one person
                who cannot be removed from it. */}
            {mayDelete ? (
              <TouchableOpacity style={[styles.dangerBtn, styles.deleteBtn]} onPress={confirmDelete} accessibilityRole="button">
                <Text style={styles.dangerDelete}>Delete for everyone</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.dangerBtn, styles.deleteBtn]} onPress={confirmLeave} accessibilityRole="button">
                <Text style={styles.dangerDelete}>Leave group</Text>
              </TouchableOpacity>
            )}
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
