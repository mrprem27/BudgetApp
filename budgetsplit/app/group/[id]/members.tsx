import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Pressable, ScrollView, Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, layout } from '../../../src/constants/layout';
import { AVATAR_COLORS } from '../../../src/constants/categories';
import { getGroupMembers, getAllPersons, insertPerson, addMemberToGroup, removeMemberFromGroup } from '../../../src/db/queries/persons';
import { getGroupNet } from '../../../src/db/queries/balances';
import { MemberAvatar } from '../../../src/components/MemberAvatar';
import { formatRupees } from '../../../src/lib/money';
import type { Person } from '../../../src/db/queries/persons';

export default function MembersScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [members, setMembers] = useState<Person[]>([]);
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  const [net, setNet] = useState<Record<string, number>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(AVATAR_COLORS[0]);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [m, all, n] = await Promise.all([
      getGroupMembers(db, groupId),
      getAllPersons(db),
      getGroupNet(db, groupId),
    ]);
    setMembers(m);
    setAllPersons(all);
    setNet(n);
  }

  const memberIds = new Set(members.map(m => m.id));
  const nonMembers = allPersons.filter(p => !memberIds.has(p.id));

  async function handleAdd(personId: string) {
    await addMemberToGroup(db, groupId, personId);
    setShowAdd(false);
    await load();
  }

  async function handleCreateNew() {
    if (!newName.trim()) return;
    const existing = allPersons.find(p => p.name.toLowerCase() === newName.trim().toLowerCase());
    if (existing) {
      Alert.alert('Person exists', `"${existing.name}" already exists. Add them to this group?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Add', onPress: () => handleAdd(existing.id) },
      ]);
      return;
    }
    const person = await insertPerson(db, newName.trim(), newColor);
    await addMemberToGroup(db, groupId, person.id);
    setShowNew(false);
    setNewName('');
    await load();
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
          await removeMemberFromGroup(db, groupId, person.id);
          await load();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Members</Text>
      </View>

      <FlatList
        data={members}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <MemberAvatar name={item.name} color={item.avatar_color} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}{item.is_me ? ' (me)' : ''}</Text>
              {net[item.id] !== undefined && net[item.id] !== 0 && (
                <Text style={styles.netText}>
                  {net[item.id] > 0 ? `Owed ${formatRupees(net[item.id])}` : `Owes ${formatRupees(-net[item.id])}`}
                </Text>
              )}
            </View>
            {!item.is_me && (
              <TouchableOpacity onPress={() => handleRemove(item)} accessibilityLabel={`Remove ${item.name}`}>
                <Feather name="user-minus" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListFooterComponent={
          <View style={styles.addButtons}>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} accessibilityRole="button">
              <Feather name="user-plus" size={16} color={colors.accent} />
              <Text style={styles.addBtnText}>Add existing person</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowNew(true)} accessibilityRole="button">
              <Feather name="plus" size={16} color={colors.accent} />
              <Text style={styles.addBtnText}>Create new person</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowAdd(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Add to group</Text>
            {nonMembers.length === 0
              ? <Text style={styles.emptyText}>All existing people are already in this group.</Text>
              : nonMembers.map(p => (
                <TouchableOpacity key={p.id} style={styles.personRow} onPress={() => handleAdd(p.id)} accessibilityRole="button" accessibilityLabel={p.name}>
                  <MemberAvatar name={p.name} color={p.avatar_color} size={36} />
                  <Text style={styles.personName}>{p.name}</Text>
                </TouchableOpacity>
              ))
            }
            <TouchableOpacity style={styles.newPersonLink} onPress={() => { setShowAdd(false); setShowNew(true); }} accessibilityRole="button">
              <Text style={styles.newPersonText}>+ Create new person instead</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showNew} transparent animationType="slide" onRequestClose={() => setShowNew(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowNew(false)}>
          <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>New person</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <Text style={styles.fieldLabel}>Avatar color</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.colorRow}>
                {AVATAR_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorSwatch, { backgroundColor: c }, newColor === c && styles.colorSelected]}
                    onPress={() => setNewColor(c)}
                    accessibilityRole="button"
                    accessibilityLabel={c}
                  />
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[styles.createBtn, !newName.trim() && { opacity: 0.4 }]}
              onPress={handleCreateNew}
              disabled={!newName.trim()}
              accessibilityRole="button"
            >
              <Text style={styles.createBtnText}>Create & Add</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: layout.screenPaddingH, paddingTop: space.xl },
  title: { ...type.heading, color: colors.textPrimary },
  list: { padding: layout.screenPaddingH, paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  name: { ...type.body, color: colors.textPrimary },
  netText: { ...type.caption, color: colors.textSecondary },
  sep: { height: 1, backgroundColor: colors.border },
  addButtons: { gap: space.sm, marginTop: space.lg },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: 8, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  addBtnText: { ...type.body, color: colors.accent },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md, maxHeight: '80%' },
  sheetTitle: { ...type.subheading, color: colors.textPrimary },
  emptyText: { ...type.body, color: colors.textSecondary },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  personName: { ...type.body, color: colors.textPrimary },
  newPersonLink: { paddingTop: space.sm },
  newPersonText: { ...type.label, color: colors.accent },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  colorRow: { flexDirection: 'row', gap: space.xs },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSelected: { borderWidth: 3, borderColor: colors.textPrimary },
  createBtn: { height: 52, backgroundColor: colors.accent, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { ...type.button, color: colors.bg },
});
