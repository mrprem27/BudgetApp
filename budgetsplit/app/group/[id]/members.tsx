import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, shadow, layout } from '../../../src/constants/layout';
import { AVATAR_COLORS } from '../../../src/constants/categories';
import { getGroupMembers, getAllPersons, insertPerson, addMemberToGroup, removeMemberFromGroup, setPersonImage } from '../../../src/db/queries/persons';
import { pickAndSaveAvatar } from '../../../src/lib/avatar';
import { getGroupNet } from '../../../src/db/queries/balances';
import { MemberAvatar } from '../../../src/components/finance/MemberAvatar';
import { PersonPicker } from '../../../src/components/finance/PersonPicker';
import { SheetModal } from '../../../src/components/ui/SheetModal';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { formatRupees } from '../../../src/lib/money';
import { haptic } from '../../../src/lib/haptics';
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
  const [loadError, setLoadError] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useFocusEffect(useCallback(() => { load(); }, [groupId]));

  if (!groupId) { router.back(); return null; }

  async function load() {
    try {
      const [m, all, n] = await Promise.all([
        getGroupMembers(db, groupId),
        getAllPersons(db),
        getGroupNet(db, groupId),
      ]);
      setMembers(m);
      setAllPersons(all);
      setNet(n);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  const memberIds = new Set(members.map(m => m.id));

  async function handleAdd(personId: string) {
    try {
      await addMemberToGroup(db, groupId, personId);
      setShowAdd(false);
      await load();
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
            await load();
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
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Members</Text>
      </View>

      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      ) : (
      <ScrollView contentContainerStyle={styles.list}>
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
                      onPress={async () => { const uri = await pickAndSaveAvatar(item.id); if (uri) { await setPersonImage(db, item.id, uri); haptic.success(); await load(); } }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{item.name}{item.is_me ? ' (me)' : ''}</Text>
                      {net[item.id] !== undefined && net[item.id] !== 0 && (
                        <Text style={[styles.netText, { color: net[item.id] > 0 ? colors.income : colors.expense }]}>
                          {net[item.id] > 0 ? `Owed ${formatRupees(net[item.id])}` : `Owes ${formatRupees(-net[item.id])}`}
                        </Text>
                      )}
                    </View>
                  </View>
                </Swipeable>
              );
            })}
          </View>
        )}

        <View style={styles.addButtons}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} accessibilityRole="button">
            <View style={styles.addBtnIcon}>
              <Feather name="user-plus" size={16} color={colors.accent} />
            </View>
            <Text style={styles.addBtnText}>Add or create person</Text>
            <Feather name="chevron-right" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
      )}

      {/* Add person sheet — search existing or create new */}
      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)} title="Add to group">
        <PersonPicker
          persons={allPersons}
          selected={members.map(m => m.id)}
          exclude={members.map(m => m.id)}
          onToggle={handleAdd}
          onCreate={async (name) => {
            const person = await insertPerson(db, name, AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
            await addMemberToGroup(db, groupId, person.id);
            setShowAdd(false);
            await load();
            return person;
          }}
          placeholder="Search or create a person…"
        />
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
