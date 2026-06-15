import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, shadow, layout } from '../../../src/constants/layout';
import { AVATAR_COLORS } from '../../../src/constants/categories';
import { getGroupMembers, getAllPersons, insertPerson, addMemberToGroup, removeMemberFromGroup } from '../../../src/db/queries/persons';
import { getGroupNet } from '../../../src/db/queries/balances';
import { MemberAvatar } from '../../../src/components/MemberAvatar';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { SheetModal } from '../../../src/components/SheetModal';
import { formatRupees } from '../../../src/lib/money';
import type { Person } from '../../../src/db/queries/persons';

export default function MembersScreen() {
  const { id: groupId } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Members</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {members.length > 0 && (
          <View style={styles.membersCard}>
            {members.map((item, index) => (
              <View key={item.id} style={[styles.row, index < members.length - 1 && styles.rowBorder]}>
                <MemberAvatar name={item.name} color={item.avatar_color} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}{item.is_me ? ' (me)' : ''}</Text>
                  {net[item.id] !== undefined && net[item.id] !== 0 && (
                    <Text style={[styles.netText, { color: net[item.id] > 0 ? colors.income : colors.expense }]}>
                      {net[item.id] > 0 ? `Owed ${formatRupees(net[item.id])}` : `Owes ${formatRupees(-net[item.id])}`}
                    </Text>
                  )}
                </View>
                {!item.is_me && (
                  <TouchableOpacity onPress={() => handleRemove(item)} hitSlop={10} accessibilityLabel={`Remove ${item.name}`}>
                    <Feather name="user-minus" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.addButtons}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} accessibilityRole="button">
            <View style={styles.addBtnIcon}>
              <Feather name="user-plus" size={16} color={colors.accent} />
            </View>
            <Text style={styles.addBtnText}>Add existing person</Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowNew(true)} accessibilityRole="button">
            <View style={styles.addBtnIcon}>
              <Feather name="user" size={16} color={colors.accent} />
            </View>
            <Text style={styles.addBtnText}>Create new person</Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add existing person sheet */}
      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)} title="Add to group">
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
      </SheetModal>

      {/* Create new person sheet */}
      <SheetModal visible={showNew} onClose={() => setShowNew(false)} title="New person">
        <TextInput
          style={styles.input}
          placeholder="Name"
          placeholderTextColor={colors.textMuted}
          value={newName}
          onChangeText={setNewName}
          autoFocus
        />
        <Text style={styles.fieldLabel}>Avatar color</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
        <PrimaryButton label="Create & Add" onPress={handleCreateNew} disabled={!newName.trim()} />
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: layout.screenPaddingH, paddingBottom: layout.screenPaddingH },
  title: { ...type.heading, color: colors.textPrimary },
  list: { padding: layout.screenPaddingH, paddingBottom: 60 },

  membersCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
    marginBottom: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  netText: { ...type.caption, marginTop: 2 },

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

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md, maxHeight: '80%' },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space.sm },
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
});
