import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
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
import { AVATAR_COLORS } from '../src/constants/categories';
import { pickAndSaveAvatar } from '../src/lib/avatar';
import { formatCompact } from '../src/lib/money';
import { oweView } from '../src/lib/owe';
import { haptic } from '../src/lib/haptics';
import type { Person } from '../src/db/queries/persons';
import { useScreenData } from '../src/hooks/useScreenData';
import { useStore } from '../src/store';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';

export default function FriendsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const me = useStore((s) => s.me);
  const { refresh } = useDataRefresh();
  const [renamePerson, setRenamePerson] = useState<Person | null>(null);
  const [renameText, setRenameText] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [query, setQuery] = useState('');

  const { data, error: loadError, reload } = useScreenData(async (db) => {
    const [all, bals] = await Promise.all([
      getAllPersons(db),
      me ? getFriendBalances(db, me.id) : Promise.resolve([] as FriendBalance[]),
    ]);
    const balances: Record<string, FriendBalance> = {};
    for (const b of bals) balances[b.personId] = b;
    return { people: all.filter(p => !p.is_me), balances };
  }, [me?.id]);
  const people = data?.people ?? [];
  const balances = data?.balances ?? {};

  const q = query.trim().toLowerCase();
  const filtered = q ? people.filter(p => p.name.toLowerCase().includes(q)) : people;

  async function changePhoto(p: Person) {
    const uri = await pickAndSaveAvatar(p.id);
    if (uri) { await setPersonImage(db, p.id, uri); haptic.success(); refresh(); }
  }

  async function handleAddFriend() {
    const trimmed = addName.trim();
    if (!trimmed) return;
    try {
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      await insertPerson(db, trimmed, color);
      haptic.success();
      setAddName(''); setShowAdd(false);
      refresh();
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
      refresh();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="People"
        onBack={() => router.back()}
        right={
          <TouchableOpacity style={styles.addPill} onPress={() => { setAddName(''); setShowAdd(true); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add person">
            <Feather name="plus" size={13} color={colors.bg} />
            <Text style={styles.addPillText}>Add</Text>
          </TouchableOpacity>
        }
      />
      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.intro}>People you split with. No account needed — names only.</Text>

          {/* YOU */}
          {me && (
            <>
              <Text style={styles.sectionLabel}>YOU</Text>
              <View style={[styles.card, styles.youCard]}>
                <MemberAvatar name={me.name} color={me.avatar_color} size={46} imageUri={me.image_uri} onPress={() => changePhoto(me)} />
                <TouchableOpacity style={{ flex: 1 }} onPress={() => openRename(me)} accessibilityRole="button" accessibilityLabel="Rename yourself">
                  <Text style={styles.name}>{me.name}<Text style={styles.youTag}> (you)</Text></Text>
                  {me.email ? <Text style={styles.subMuted}>{me.email}</Text> : <Text style={styles.subMuted}>Tap to rename</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openRename(me)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit your name">
                  <Feather name="edit-2" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* CONTACTS */}
          {people.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>CONTACTS · {people.length}</Text>
              {people.length > 4 && (
                <View style={styles.searchRow}>
                  <Feather name="search" size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search people…"
                    placeholderTextColor={colors.textMuted}
                    autoCorrect={false}
                    accessibilityLabel="Search people"
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                      <Feather name="x" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={styles.card}>
                {filtered.length === 0 && <Text style={styles.noMatch}>No people match “{query}”.</Text>}
                {filtered.map((p, i) => {
                  const bal = balances[p.id];
                  const net = bal?.net ?? 0;
                  const groupCount = bal?.groupCount ?? 0;
                  return (
                    <View key={p.id} style={[styles.row, i < people.length - 1 && styles.rowBorder]}>
                      <MemberAvatar name={p.name} color={p.avatar_color} size={46} imageUri={p.image_uri} onPress={() => changePhoto(p)} />
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => openRename(p)} accessibilityRole="button" accessibilityLabel={`Rename ${p.name}`}>
                        <Text style={styles.name}>{p.name}</Text>
                        <View style={styles.chipRow}>
                          {(() => {
                            const ov = oweView(net);
                            const settled = ov.direction === 'settled';
                            return (
                              <View style={[styles.balChip, { backgroundColor: settled ? colors.bgMuted : ov.color + '1A' }]}>
                                <Text style={[styles.balChipText, { color: settled ? colors.textSecondary : ov.color }]}>
                                  {settled ? ov.label : `${ov.label} ${formatCompact(ov.amount)}`}
                                </Text>
                              </View>
                            );
                          })()}
                          {groupCount > 0 && <Text style={styles.groupsCount}>{groupCount} {groupCount === 1 ? 'group' : 'groups'}</Text>}
                        </View>
                      </TouchableOpacity>
                      {net !== 0 && (
                        <TouchableOpacity style={styles.settlePill} onPress={() => router.push(`/add/quick?kind=transfer&to=${p.id}`)} accessibilityRole="button" accessibilityLabel={`Settle with ${p.name}`}>
                          <Text style={styles.settlePillText}>Settle</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Add a person — dashed tile */}
          <TouchableOpacity style={styles.addTile} onPress={() => { setAddName(''); setShowAdd(true); }} accessibilityRole="button" accessibilityLabel="Add a person">
            <View style={styles.addTileCircle}><Feather name="plus" size={18} color={colors.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addTileTitle}>Add a person</Text>
              <Text style={styles.addTileSub}>Just a name is enough to start splitting</Text>
            </View>
          </TouchableOpacity>
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
  intro: { ...type.label, color: colors.textMuted, lineHeight: 19, marginBottom: space.md },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm, marginTop: space.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, height: 44, marginBottom: space.sm },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, padding: 0 },
  noMatch: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.lg },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: space.md, ...shadow.sm },
  youCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  youTag: { ...type.caption, color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, minHeight: 56 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  sub: { ...type.caption, marginTop: 2 },
  subMuted: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4, flexWrap: 'wrap' },
  balChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  balChipText: { ...type.caption, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  groupsCount: { ...type.caption, fontSize: 10, color: colors.textMuted },
  settlePill: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accentMuted },
  settlePillText: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  addPillText: { ...type.label, color: colors.bg, fontFamily: 'Inter_600SemiBold' },
  addTile: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.accentMuted, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', padding: space.md },
  addTileCircle: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addTileTitle: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  addTileSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  renameGap: { marginBottom: space.md },
});
