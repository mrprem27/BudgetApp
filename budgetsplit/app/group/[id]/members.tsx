import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenData } from '../../../src/hooks/useScreenData';

import { Feather } from '@expo/vector-icons';
import { colors, type, space, layout } from '../../../src/theme';
import { AVATAR_COLORS } from '../../../src/constants/categories';
import { getGroupMembers, getAllPersons, insertPerson, addMemberToGroup, removeMemberFromGroup, setPersonImage, updatePersonName } from '../../../src/db/queries/persons';
import { pickAndSaveAvatar } from '../../../src/lib/avatar';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { AppRefreshControl } from '../../../src/components/ui/AppRefreshControl';
import { useToast } from '../../../src/components/system/Toast';
import { getGroupNet } from '../../../src/db/queries/balances';
import { MemberAvatar } from '../../../src/components/finance/MemberAvatar';
import { PersonPicker } from '../../../src/components/finance/PersonPicker';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { formatRupees } from '../../../src/lib/money';
import { oweView } from '../../../src/lib/owe';
import { useDataRefresh } from '../../../src/components/system/DataRefreshProvider';
import { haptic } from '../../../src/lib/haptics';
import type { Person } from '../../../src/db/queries/persons';
import { Card } from '../../../src/components/ui/Card';
import { Divider } from '../../../src/components/ui/Divider';
import { ListRow } from '../../../src/components/ui/ListRow';
import { PersonNameSheet } from '../../../src/components/finance/PersonNameSheet';
import { getMe } from '../../../src/db/queries/persons';
import { getGroupContext, getGroupMembersWithRoles, setMemberRole } from '../../../src/db/queries/groups';
import { isAdmin, canRemoveMember, canChangeRole } from '../../../src/lib/permissions';

export default function MembersScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const router = useRouter();
  const { showUndo } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [renamePerson, setRenamePerson] = useState<Person | null>(null);
  const [renameText, setRenameText] = useState('');
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const { data, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const me = await getMe(db);
    const meId = me?.id ?? '';
    const [members, allPersons, net, roles, ctx] = await Promise.all([
      getGroupMembers(db, groupId),
      getAllPersons(db),
      getGroupNet(db, groupId),
      getGroupMembersWithRoles(db, groupId),
      getGroupContext(db, groupId, meId),
    ]);
    return { members, allPersons, net, roles, ctx, meId };
  }, [groupId]);
  const members = data?.members ?? [];
  const allPersons = data?.allPersons ?? [];
  const net = data?.net ?? {};
  const meId = data?.meId ?? '';
  const ctx = data?.ctx ?? null;
  const roleOf = new Map((data?.roles ?? []).map(r => [r.person_id, r]));
  const mayManage = ctx ? isAdmin(ctx) : false;

  useEffect(() => { if (!groupId) router.back(); }, [groupId]);
  if (!groupId) return null;

  const memberIds = new Set(members.map(m => m.id));

  function togglePending(id: string) {
    setPendingIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function commitAdd() {
    if (pendingIds.length === 0) return;
    try {
      for (const pid of pendingIds) await addMemberToGroup(db, groupId, pid, meId);
      haptic.success();
      setShowAdd(false);
      setPendingIds([]);
      await reload(); refresh();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  function openRename(person: Person) {
    setRenamePerson(person);
    setRenameText(person.name);
  }

  async function handleRename() {
    const trimmed = renameText.trim();
    if (!renamePerson || !trimmed || trimmed === renamePerson.name) { setRenamePerson(null); return; }
    try {
      await updatePersonName(db, renamePerson.id, trimmed);
      haptic.success();
      setRenamePerson(null);
      await reload(); refresh();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  async function toggleAdmin(person: Person) {
    const next = roleOf.get(person.id)?.role === 'admin' ? 'member' : 'admin';
    try {
      await setMemberRole(db, groupId, meId, person.id, next);
      haptic.success();
      await reload(); refresh();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  async function handleRemove(person: Person) {
    // The creator is un-removable by anyone, including themselves: a group with no
    // permanent admin cannot be managed again. Said out loud rather than silently
    // refused by the query.
    if (!canRemoveMember(ctx ?? { createdBy: null, actorId: meId, actorRole: null }, person.id)) {
      Alert.alert(
        `Can't remove ${person.name}`,
        roleOf.get(person.id)?.is_creator
          ? 'They created this group. A group always keeps its creator, so there is always someone who can manage it.'
          : 'Only an admin can remove members.',
        [{ text: 'OK' }],
      );
      return;
    }
    const balance = net[person.id] ?? 0;
    if (balance !== 0) {
      Alert.alert(
        `Can't remove ${person.name}`,
        `Settle up ${formatRupees(Math.abs(balance))} first before removing.`,
        [{ text: 'OK' }],
      );
      return;
    }
    Alert.alert(`Remove ${person.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await removeMemberFromGroup(db, groupId, person.id, meId);
            await reload(); refresh();
            showUndo({
              message: `Removed ${person.name}`,
              onUndo: async () => { try { await addMemberToGroup(db, groupId, person.id, meId); await reload(); refresh(); } catch { /* ignore */ } },
            });
          } catch {
            haptic.error();
            Alert.alert('Something went wrong', 'Please try again.');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Members" onBack={() => router.back()} />

      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
      <ScrollView
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {members.length > 0 && (
          <Card clip style={styles.membersCard}>
            {members.map((item, index) => {
              const renderRightActions = () => (
                <TouchableOpacity
                  style={styles.swipeAction}
                  onPress={() => { swipeableRefs.current.get(item.id)?.close(); handleRemove(item); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                >
                  <Feather name="user-minus" size={16} color={colors.onAccent} />
                  <Text style={styles.swipeActionText}>Remove</Text>
                </TouchableOpacity>
              );
              const role = roleOf.get(item.id);
              // Creator outranks admin as a label: "Admin" is a role that can be taken
              // away, "Creator" never can, and that difference is the whole point of the
              // protection. It rides in the subtitle rather than a badge beside the name
              // because `ListRow`'s title is a single string — and one line of
              // "Creator · Owes ₹2,100" reads better than a badge plus a second line.
              const balance = net[item.id] ?? 0;
              const ov = balance !== 0 ? oweView(balance) : null;
              const roleWord = role?.is_creator ? 'Creator' : role?.role === 'admin' ? 'Admin' : null;
              const subtitle = [roleWord, ov ? `${ov.thirdPerson} ${formatRupees(ov.amount)}` : null]
                .filter(Boolean).join(' · ') || undefined;
              return (
                <React.Fragment key={item.id}>
                  {/* Outside the Swipeable: a divider inside it slides away with the
                      row and leaves a gap in the card while the action is open. */}
                  {index > 0 && <Divider indent="text" />}
                  <Swipeable
                    ref={(ref) => { if (ref) swipeableRefs.current.set(item.id, ref); }}
                    renderRightActions={item.is_me ? undefined : renderRightActions}
                    overshootRight={false}
                    friction={2}
                  >
                  {/* The row must be opaque: it translates over the red Remove action,
                      which would otherwise show through it. `Card`'s background is
                      behind the Swipeable, not behind the sliding row. */}
                  <View style={styles.rowSurface}>
                  <ListRow
                    leading={
                      <MemberAvatar
                        name={item.name}
                        color={item.avatar_color}
                        size={layout.avatarSize}
                        imageUri={item.image_uri}
                        onPress={async () => { const uri = await pickAndSaveAvatar(item.id); if (uri) { await setPersonImage(db, item.id, uri); haptic.success(); await reload(); refresh(); } }}
                      />
                    }
                    title={`${item.name}${item.is_me ? ' (me)' : ''}`}
                    subtitle={subtitle}
                    /* The row itself renames; the shield is a separate, smaller target
                       for a different action, so the row gets no chevron competing
                       with it. */
                    chevron={false}
                    onPress={() => openRename(item)}
                    accessibilityLabel={`Rename ${item.name}`}
                    value={
                      <View style={styles.rowActions}>
                        {mayManage && canChangeRole(ctx!, item.id) && (
                          <TouchableOpacity
                            onPress={() => toggleAdmin(item)}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={role?.role === 'admin' ? `Remove admin from ${item.name}` : `Make ${item.name} an admin`}
                          >
                            <Feather
                              name={role?.role === 'admin' ? 'shield-off' : 'shield'}
                              size={16}
                              color={role?.role === 'admin' ? colors.accent : colors.textMuted}
                            />
                          </TouchableOpacity>
                        )}
                        <Feather name="edit-2" size={16} color={colors.textMuted} />
                      </View>
                    }
                  />
                  </View>
                  </Swipeable>
                </React.Fragment>
              );
            })}
          </Card>
        )}

        <Card clip>
          <ListRow
            icon="user-plus"
            title="Add or create person"
            onPress={() => { setPendingIds([]); setShowAdd(true); }}
          />
        </Card>
      </ScrollView>
      )}

      {/* Add person sheet — search + multi-select existing, or create new */}
      <SheetModal visible={showAdd} onClose={() => { setShowAdd(false); setPendingIds([]); }} title="Add to group">
        <PersonPicker
          persons={allPersons}
          selected={pendingIds}
          exclude={members.map(m => m.id)}
          onToggle={togglePending}
          onCreate={async (name) => {
            const person = await insertPerson(db, name, AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
            reload(); refresh();
            return person;
          }}
          placeholder="Search or create a person…"
        />
        <PrimaryButton
          label={pendingIds.length > 0 ? `Add ${pendingIds.length} ${pendingIds.length === 1 ? 'person' : 'people'}` : 'Select people to add'}
          onPress={commitAdd}
          disabled={pendingIds.length === 0}
          style={styles.addCommit}
        />
      </SheetModal>

      {/* Rename person sheet */}
      <PersonNameSheet
        visible={!!renamePerson}
        onClose={() => setRenamePerson(null)}
        title={renamePerson?.is_me ? 'Your name' : 'Rename'}
        value={renameText}
        onChangeText={setRenameText}
        onSubmit={handleRename}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: layout.screenPaddingH, paddingBottom: space.lg },

  membersCard: { marginBottom: space.md },
  rowSurface: { backgroundColor: colors.bgCard },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  swipeAction: { backgroundColor: colors.expense, justifyContent: 'center', alignItems: 'center', width: 80, gap: space.xs },
  swipeActionText: { ...type.caption, color: colors.onAccent, fontFamily: 'Inter_600SemiBold' },

  addCommit: { marginTop: space.sm },
});
