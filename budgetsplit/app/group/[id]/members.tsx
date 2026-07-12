import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenData } from '../../../src/hooks/useScreenData';

import { Feather } from '@expo/vector-icons';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, shadow, layout } from '../../../src/constants/layout';
import { AVATAR_COLORS } from '../../../src/constants/categories';
import { getGroupMembers, getAllPersons, insertPerson, addMemberToGroup, removeMemberFromGroup, setPersonImage, updatePersonName } from '../../../src/db/queries/persons';
import { pickAndSaveAvatar } from '../../../src/lib/avatar';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { AppRefreshControl } from '../../../src/components/ui/AppRefreshControl';
import { useUndo } from '../../../src/components/system/UndoToast';
import { getGroupNet } from '../../../src/db/queries/balances';
import { MemberAvatar } from '../../../src/components/finance/MemberAvatar';
import { PersonPicker } from '../../../src/components/finance/PersonPicker';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { Input } from '../../../src/components/ui/Input';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { formatRupees } from '../../../src/lib/money';
import { oweView } from '../../../src/lib/owe';
import { haptic } from '../../../src/lib/haptics';
import type { Person } from '../../../src/db/queries/persons';

export default function MembersScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useUndo();
  const [showAdd, setShowAdd] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [renamePerson, setRenamePerson] = useState<Person | null>(null);
  const [renameText, setRenameText] = useState('');
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const { data, error: loadError, refreshing, onRefresh, reload } = useScreenData(async (db) => {
    const [members, allPersons, net] = await Promise.all([
      getGroupMembers(db, groupId),
      getAllPersons(db),
      getGroupNet(db, groupId),
    ]);
    return { members, allPersons, net };
  }, [groupId]);
  const members = data?.members ?? [];
  const allPersons = data?.allPersons ?? [];
  const net = data?.net ?? {};

  useEffect(() => { if (!groupId) router.back(); }, [groupId]);
  if (!groupId) return null;

  const memberIds = new Set(members.map(m => m.id));

  function togglePending(id: string) {
    setPendingIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function commitAdd() {
    if (pendingIds.length === 0) return;
    try {
      for (const pid of pendingIds) await addMemberToGroup(db, groupId, pid);
      haptic.success();
      setShowAdd(false);
      setPendingIds([]);
      await reload();
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
      await reload();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  async function handleRemove(person: Person) {
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
            await removeMemberFromGroup(db, groupId, person.id);
            await reload();
            showUndo({
              message: `Removed ${person.name}`,
              onUndo: async () => { try { await addMemberToGroup(db, groupId, person.id); await reload(); } catch { /* ignore */ } },
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
          <View style={styles.membersCard}>
            {members.map((item, index) => {
              const renderRightActions = () => (
                <TouchableOpacity
                  style={styles.swipeAction}
                  onPress={() => { swipeableRefs.current.get(item.id)?.close(); handleRemove(item); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                >
                  <Feather name="user-minus" size={16} color="#fff" />
                  <Text style={styles.swipeActionText}>Remove</Text>
                </TouchableOpacity>
              );
              return (
                <Swipeable
                  key={item.id}
                  ref={(ref) => { if (ref) swipeableRefs.current.set(item.id, ref); }}
                  renderRightActions={item.is_me ? undefined : renderRightActions}
                  overshootRight={false}
                  friction={2}
                >
                  <View style={[styles.row, index < members.length - 1 && styles.rowBorder]}>
                    <MemberAvatar
                      name={item.name}
                      color={item.avatar_color}
                      size={36}
                      imageUri={item.image_uri}
                      onPress={async () => { const uri = await pickAndSaveAvatar(item.id); if (uri) { await setPersonImage(db, item.id, uri); haptic.success(); await reload(); } }}
                    />
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => openRename(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Rename ${item.name}`}
                    >
                      <Text style={styles.name}>{item.name}{item.is_me ? ' (me)' : ''}</Text>
                      {net[item.id] !== undefined && net[item.id] !== 0 && (() => {
                        const ov = oweView(net[item.id]);
                        return (
                          <Text style={[styles.netText, { color: ov.color }]}>
                            {ov.thirdPerson} {formatRupees(ov.amount)}
                          </Text>
                        );
                      })()}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openRename(item)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`}>
                      <Feather name="edit-2" size={15} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </Swipeable>
              );
            })}
          </View>
        )}

        <View style={styles.addButtons}>
          <TouchableOpacity style={styles.addBtn} onPress={() => { setPendingIds([]); setShowAdd(true); }} accessibilityRole="button">
            <View style={styles.addBtnIcon}>
              <Feather name="user-plus" size={16} color={colors.accent} />
            </View>
            <Text style={styles.addBtnText}>Add or create person</Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
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
            reload();
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
      <SheetModal visible={!!renamePerson} onClose={() => setRenamePerson(null)} title={renamePerson?.is_me ? 'Your name' : 'Rename'}>
        <Input
          value={renameText}
          onChangeText={setRenameText}
          placeholder="Name"
          autoFocus
          autoCapitalize="words"
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={handleRename}
          style={styles.renameGap}
        />
        <PrimaryButton label="Save" onPress={handleRename} disabled={!renameText.trim()} />
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: layout.screenPaddingH },
  title: { ...type.heading, color: colors.textPrimary },
  list: { padding: layout.screenPaddingH, paddingBottom: space.lg },

  membersCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
    marginBottom: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, minHeight: 52, backgroundColor: colors.bgCard },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  netText: { ...type.caption, marginTop: 2 },
  swipeAction: { backgroundColor: colors.expense, justifyContent: 'center', alignItems: 'center', width: 80, gap: 4 },
  swipeActionText: { ...type.caption, color: '#fff', fontFamily: 'Inter_600SemiBold' },

  renameGap: { marginBottom: space.md },
  addCommit: { marginTop: space.sm },
  addButtons: { gap: space.sm },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  addBtnIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { ...type.body, color: colors.textPrimary, flex: 1 },
});
