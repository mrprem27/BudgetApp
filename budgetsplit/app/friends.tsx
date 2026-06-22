import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, shadow, layout } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { EmptyState } from '../src/components/ui/EmptyState';
import { SheetModal } from '../src/components/ui/SheetModal';
import { Input } from '../src/components/ui/Input';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { MemberAvatar } from '../src/components/finance/MemberAvatar';
import { getAllPersons, updatePersonName, setPersonImage, insertPerson } from '../src/db/queries/persons';
import { getFriendBalances, type FriendBalance } from '../src/db/queries/balances';
import { getMe } from '../src/db/queries/persons';
import { AVATAR_COLORS } from '../src/constants/categories';
import { pickAndSaveAvatar } from '../src/lib/avatar';
import { formatCompact } from '../src/lib/money';
import { haptic } from '../src/lib/haptics';
import type { Person } from '../src/db/queries/persons';

export default function FriendsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [people, setPeople] = useState<Person[]>([]);
  const [balances, setBalances] = useState<Record<string, FriendBalance>>({});
  const [loadError, setLoadError] = useState(false);
  const [renamePerson, setRenamePerson] = useState<Person | null>(null);
  const [renameText, setRenameText] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    try {
      const me = await getMe(db);
      const [all, bals] = await Promise.all([
        getAllPersons(db),
        me ? getFriendBalances(db, me.id) : Promise.resolve([]),
      ]);
      setPeople(all.filter(p => !p.is_me));
      const map: Record<string, FriendBalance> = {};
      for (const b of bals) map[b.personId] = b;
      setBalances(map);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  async function changePhoto(p: Person) {
    const uri = await pickAndSaveAvatar(p.id);
    if (uri) { await setPersonImage(db, p.id, uri); haptic.success(); await load(); }
  }

  async function handleAddFriend() {
    const trimmed = addName.trim();
    if (!trimmed) return;
    try {
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      await insertPerson(db, trimmed, color);
      haptic.success();
      setAddName(''); setShowAdd(false);
      await load();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  function openRename(p: Person) {
    setRenamePerson(p);
    setRenameText(p.name);
  }

  async function handleRename() {
    const trimmed = renameText.trim();
    if (!renamePerson || !trimmed || trimmed === renamePerson.name) { setRenamePerson(null); return; }
    try {
      await updatePersonName(db, renamePerson.id, trimmed);
      haptic.success();
      setRenamePerson(null);
      await load();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Friends"
        onBack={() => router.back()}
        right={
          <TouchableOpacity onPress={() => { setAddName(''); setShowAdd(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add friend">
            <Feather name="user-plus" size={20} color={colors.accent} />
          </TouchableOpacity>
        }
      />
      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      ) : people.length === 0 ? (
        <EmptyState
          icon="users"
          title="No friends yet"
          body="Add the people you split with — or they appear automatically when you add them to a group."
          actionLabel="Add a friend"
          onAction={() => { setAddName(''); setShowAdd(true); }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.card}>
            {people.map((p, i) => {
              const bal = balances[p.id];
              const net = bal?.net ?? 0;
              return (
                <View key={p.id} style={[styles.row, i < people.length - 1 && styles.rowBorder]}>
                  <MemberAvatar name={p.name} color={p.avatar_color} size={40} imageUri={p.image_uri} onPress={() => changePhoto(p)} />
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => openRename(p)} accessibilityRole="button" accessibilityLabel={`Rename ${p.name}`}>
                    <Text style={styles.name}>{p.name}</Text>
                    {net !== 0 ? (
                      <Text style={[styles.sub, { color: net > 0 ? colors.income : colors.expense }]}>
                        {net > 0 ? `owes you ${formatCompact(net)}` : `you owe ${formatCompact(-net)}`}
                      </Text>
                    ) : (
                      <Text style={styles.subMuted}>settled up</Text>
                    )}
                  </TouchableOpacity>
                  {net !== 0 && (
                    <TouchableOpacity style={styles.settlePill} onPress={() => router.push(`/settle?focus=${p.id}`)} accessibilityRole="button" accessibilityLabel={`Settle with ${p.name}`}>
                      <Text style={styles.settlePillText}>Settle</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => openRename(p)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Edit ${p.name}`}>
                    <Feather name="edit-2" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          <Text style={styles.hint}>Tap a photo to change it · tap a name to rename.</Text>
        </ScrollView>
      )}

      <SheetModal visible={!!renamePerson} onClose={() => setRenamePerson(null)} title="Rename">
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

      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)} title="Add a friend">
        <Input
          value={addName}
          onChangeText={setAddName}
          placeholder="Friend's name"
          autoFocus
          autoCapitalize="words"
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={handleAddFriend}
          style={styles.renameGap}
        />
        <PrimaryButton label="Add friend" onPress={handleAddFriend} disabled={!addName.trim()} />
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: layout.screenPaddingH, paddingBottom: space.lg },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, minHeight: 56 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  sub: { ...type.caption, marginTop: 2 },
  subMuted: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  settlePill: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accentMuted },
  settlePillText: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  hint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md },
  renameGap: { marginBottom: space.md },
});
