import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius, layout } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { HeaderIconButton } from '../../src/components/ui/HeaderIconButton';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { KeyboardForm } from '../../src/components/ui/KeyboardForm';
import { AppRefreshControl } from '../../src/components/ui/AppRefreshControl';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { SumLine } from '../../src/components/ui/SumLine';
import { AmountText } from '../../src/components/ui/AmountText';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { loadFriends, replacePersonPhoto, addFriend } from '../../src/lib/personWrites';
import { AVATAR_COLORS } from '../../src/constants/categories';
import { oweView, ledgerOrder } from '../../src/lib/owe';
import { haptic } from '../../src/lib/haptics';
import type { Person } from '../../src/db/queries/persons';
import { useScreenData } from '../../src/hooks/useScreenData';
import { usePersonEdit } from '../../src/hooks/usePersonEdit';
import { useStore } from '../../src/store';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { PersonNameSheet } from '../../src/components/finance/PersonNameSheet';
import { Card } from '../../src/components/ui/Card';
import { backOr } from '../../src/lib/nav';

export default function FriendsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const me = useStore((s) => s.me);
  const { refresh } = useDataRefresh();
  const edit = usePersonEdit();
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [query, setQuery] = useState('');

  const { data, loading, error: loadError, refreshing, onRefresh, reload } = useScreenData((db) => loadFriends(db, me?.id), [me?.id]);
  const people = data?.people ?? [];
  const balances = data?.balances ?? {};
  const invited = data?.invited ?? new Map<string, string>();
  const exposure = data?.exposure;

  const q = query.trim().toLowerCase();
  const filtered = q ? people.filter(p => p.name.toLowerCase().includes(q)) : people;
  const { open, square } = ledgerOrder(filtered, p => balances[p.id]?.net ?? 0);

  /**
   * Groups and connection, one quiet line. Two connection states only: waiting, or
   * connected. It must NEVER say anything derived from whether that address has an
   * account, or the enumeration oracle is back in the client.
   */
  function captionFor(p: Person, groupCount: number): string {
    const parts: string[] = [];
    if (groupCount > 0) parts.push(`${groupCount} ${groupCount === 1 ? 'group' : 'groups'}`);
    if (p.remote_uid) parts.push('Connected');
    else if (invited.has(p.id)) parts.push('Invited, waiting');
    return parts.join(' · ');
  }

  async function changePhoto(p: Person) {
    if (await replacePersonPhoto(db, p)) {
      haptic.success();
      refresh();
    }
  }

  async function handleAddFriend() {
    const trimmed = addName.trim();
    if (!trimmed) return;
    try {
      const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
      await addFriend(db, trimmed, color, addPhone);
      haptic.success();
      setAddName(''); setAddPhone(''); setShowAdd(false);
      refresh();
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Friends"
        onBack={() => backOr(router, '/(tabs)')}
        right={
          <HeaderIconButton icon="user-plus" label="Add person" onPress={() => { setAddName(''); setShowAdd(true); }} />
        }
      />
      {loadError ? (
        <ErrorState onRetry={reload} />
      ) : (
        // Keyboard-aware (AGENTS.md §6b): the search field sits mid-list, and the
        // matches below it must stay reachable above the keyboard.
        <KeyboardForm
          contentContainerStyle={styles.list}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/*
            * A ledger, not a stack of button rows (`U-13`): the sum first, then who is open,
            * largest first, then everyone square. Settle up and Remind live on the person's
            * own screen, one tap away, so no row carries buttons competing with its balance.
            */}
          {exposure && (exposure.owed > 0 || exposure.owe > 0) && (
            <Card clip style={[styles.card, styles.sumCard]}>
              <SumLine op="" label="Owed to you" value={exposure.owed} color={colors.income}
                hint={peopleCount(exposure.owedPeople)} />
              <SumLine op="−" label="You owe" value={exposure.owe} color={exposure.owe > 0 ? colors.expense : undefined}
                hint={peopleCount(exposure.owePeople)} />
              <SumLine op="=" label="Net with friends" value={exposure.net} total />
            </Card>
          )}

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

          {/*
            * One line, not an empty state. §2 is about EMPTY DATA; this is a filtered
            * view of data that exists, and the filter is one field away.
            */}
          {people.length > 0 && filtered.length === 0 && !loading && (
            <View style={styles.noMatchRow}>
              <Text style={styles.noMatch}>No people match “{query}”.</Text>
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button">
                <Text style={styles.noMatchClear}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {open.length > 0 && (
            <Card clip style={styles.card}>
              {open.map((p, i) => {
                const bal = balances[p.id];
                const ov = oweView(bal?.net ?? 0);
                return (
                  <FriendRow key={p.id} person={p} last={i === open.length - 1}
                    caption={captionFor(p, bal?.groupCount ?? 0)}
                    onOpen={() => router.push(`/person/${p.id}`)} onRename={() => edit.open(p)} onPhoto={() => changePhoto(p)}
                    right={
                      <View style={styles.amountCol}>
                        <AmountText paise={ov.amount} size="md" compact forceColor={ov.color} />
                        <Text style={styles.amountLabel}>{ov.label}</Text>
                      </View>
                    }
                  />
                );
              })}
            </Card>
          )}

          {square.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>ALL SQUARE · {square.length}</Text>
              <Card clip style={styles.card}>
                {square.map((p, i) => (
                  <FriendRow key={p.id} person={p} last={i === square.length - 1} quiet
                    caption={captionFor(p, balances[p.id]?.groupCount ?? 0)}
                    onOpen={() => router.push(`/person/${p.id}`)} onRename={() => edit.open(p)} onPhoto={() => changePhoto(p)} />
                ))}
              </Card>
            </>
          )}

          {/*
            * A real empty state, per §2. The footer link below is hidden with it: the
            * empty state carries the same action.
            */}
          {people.length === 0 && !loading && (
            <EmptyState
              icon="users"
              title="No one here yet"
              body="Add the people you split with. A name is enough, you can connect their account later so expenses reach their phone."
              actionLabel="Add a person"
              onAction={() => { setAddName(''); setShowAdd(true); }}
            />
          )}

          {people.length > 0 && (
            <TouchableOpacity style={styles.addLink} onPress={() => { setAddName(''); setShowAdd(true); }} accessibilityRole="button" accessibilityLabel="Add a person">
              <Feather name="plus" size={16} color={colors.accent} />
              <Text style={styles.addLinkText}>Add a person</Text>
            </TouchableOpacity>
          )}
        </KeyboardForm>
      )}

      <PersonNameSheet {...edit.sheetProps} />

      <PersonNameSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add a friend"
        value={addName}
        onChangeText={setAddName}
        onSubmit={handleAddFriend}
        placeholder="Friend's name"
        submitLabel="Add friend"
        phone={addPhone}
        onChangePhone={setAddPhone}
      />
    </View>
  );
}

function peopleCount(n: number): string | undefined {
  return n > 0 ? `${n} ${n === 1 ? 'person' : 'people'}` : undefined;
}

/**
 * One person. Tap opens what you've shared (Settle up and Remind are there); long-press
 * renames, the app's secondary-action gesture; the avatar changes their photo. A `quiet`
 * row is someone you're square with: smaller, and nothing on the right.
 */
function FriendRow({ person, caption, right, quiet, last, onOpen, onRename, onPhoto }: {
  person: Person; caption: string; right?: React.ReactNode; quiet?: boolean; last: boolean;
  onOpen: () => void; onRename: () => void; onPhoto: () => void;
}) {
  return (
    <View style={[styles.row, quiet && styles.rowQuiet, !last && styles.rowBorder]}>
      <MemberAvatar name={person.name} color={person.avatar_color} size={quiet ? 32 : 40} imageUri={person.image_uri} onPress={onPhoto} />
      <TouchableOpacity
        style={styles.rowMain}
        onPress={onOpen}
        onLongPress={onRename}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}. Long press to rename`}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, quiet && styles.nameQuiet]} numberOfLines={1}>{person.name}</Text>
          {caption ? <Text style={styles.caption} numberOfLines={1}>{caption}</Text> : null}
        </View>
        {right}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: layout.screenPaddingH, paddingBottom: space.lg },
  sectionLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginBottom: space.sm, marginTop: space.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.bgInput, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, height: 44, marginBottom: space.md },
  searchInput: { flex: 1, ...type.body, color: colors.textPrimary, padding: 0 },
  noMatchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.lg },
  noMatch: { ...type.body, color: colors.textMuted },
  noMatchClear: { ...type.body, color: colors.accent },
  card: { marginBottom: space.md },
  sumCard: { padding: space.md, gap: 6, marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, minHeight: 56 },
  rowQuiet: { paddingVertical: space.sm, minHeight: 48 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  nameQuiet: { fontFamily: 'Inter_400Regular', color: colors.textSecondary },
  caption: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  amountCol: { alignItems: 'flex-end' },
  amountLabel: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  addLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.md, minHeight: 44 },
  addLinkText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
