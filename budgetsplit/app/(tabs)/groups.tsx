import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Animated, Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { useStore } from '../../src/store';
import { getAllGroups, insertGroup, getArchivedGroups, unarchiveGroup, archiveGroupSafe } from '../../src/db/queries/groups';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { getMe, getGroupMembers, getAllPersons } from '../../src/db/queries/persons';
import { getGlobalNet, getFriendBalances, type FriendBalance } from '../../src/db/queries/balances';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import { simplify } from '../../src/lib/settle';
import { formatCompact } from '../../src/lib/money';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { AmountText } from '../../src/components/ui/AmountText';
import { FAB } from '../../src/components/ui/FAB';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { FadeIn } from '../../src/components/ui/FadeIn';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { haptic } from '../../src/lib/haptics';
import { GROUP_ICONS, GROUP_COLORS, asFeather } from '../../src/constants/palette';
import type { BudgetGroup } from '../../src/db/queries/groups';

export default function GroupsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groups, setGroups } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(GROUP_ICONS[0]);
  const [color, setColor] = useState<string>(GROUP_COLORS[0]);
  const [health, setHealth] = useState<Record<string, { pct: number | null; health: 'green' | 'amber' | 'red' | 'none'; spent: number; members: number; over: number }>>({});
  const [archived, setArchived] = useState<BudgetGroup[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [loadError, setLoadError] = useState(false);
  const [bal, setBal] = useState<{ net: number; youOwe: number; youAreOwed: number; rows: Array<{ key: string; otherId: string; name: string; color: string; label: string; amount: number }> } | null>(null);
  const [friends, setFriends] = useState<FriendBalance[]>([]);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useFocusEffect(useCallback(() => {
    loadGroups();
  }, []));

  async function loadGroups() {
    try {
      const grps = await getAllGroups(db);
      setGroups(grps);
      setArchived(await getArchivedGroups(db));
      // Per-group usage + member counts in parallel rather than serially.
      const h: typeof health = {};
      await Promise.all(grps.map(async g => {
        const [analytics, mems] = await Promise.all([
          getBudgetAnalytics(db, g),
          getGroupMembers(db, g.id),
        ]);
        const pct = analytics.utilizationPct;
        const hc = pct === null ? 'none' as const : pct >= 100 ? 'red' as const : pct >= 80 ? 'amber' as const : 'green' as const;
        h[g.id] = { pct, health: hc, spent: analytics.totalSpent, members: mems.length, over: analytics.overBudget.length };
      }));
      setHealth(h);

      // Balances hero — who-owes-whom across all shared groups, from my view.
      const [net, persons, me] = await Promise.all([getGlobalNet(db), getAllPersons(db), getMe(db)]);
      if (me) {
        const pmap = new Map(persons.map(p => [p.id, p]));
        const mine = simplify(net).filter(s => s.from === me.id || s.to === me.id);
        let youOwe = 0, youAreOwed = 0;
        const rows = mine.map(s => {
          const iPay = s.from === me.id;
          if (iPay) youOwe += s.amount; else youAreOwed += s.amount;
          const otherId = iPay ? s.to : s.from;
          const other = pmap.get(otherId);
          return { key: `${s.from}-${s.to}`, otherId, name: other?.name ?? 'Someone', color: other?.avatar_color ?? colors.accent, label: iPay ? 'you owe' : 'owes you', amount: s.amount };
        });
        setBal({ net: youAreOwed - youOwe, youOwe, youAreOwed, rows });
        setFriends(await getFriendBalances(db, me.id));
      } else {
        setBal(null);
        setFriends([]);
      }
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  async function handleRestore(g: BudgetGroup) {
    await unarchiveGroup(db, g.id);
    haptic.success();
    await loadGroups();
  }

  async function handleArchive(g: BudgetGroup) {
    swipeableRefs.current.get(g.id)?.close();
    const ok = await archiveGroupSafe(db, g.id);
    if (ok) {
      haptic.warning();
      await loadGroups();
    }
  }

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      const me = await getMe(db);
      if (!me) return;
      const group = await insertGroup(db, name.trim(), icon, color, [me.id]);
      haptic.success();
      setShowCreate(false);
      setName('');
      await loadGroups();
      router.push(`/group/${group.id}`);
    } catch {
      haptic.error();
      Alert.alert('Error', 'Could not create the group. Try again.');
    }
  }

  function renderGroup({ item, index }: { item: BudgetGroup; index: number }) {
    const h = health[item.id];
    const isArchivedView = viewMode === 'archived';

    const renderRightActions = () => (
      <TouchableOpacity
        style={styles.swipeAction}
        onPress={() => isArchivedView ? handleRestore(item) : handleArchive(item)}
        accessibilityRole="button"
        accessibilityLabel={isArchivedView ? 'Restore' : 'Archive'}
      >
        <Feather name={isArchivedView ? 'rotate-ccw' : 'archive'} size={18} color="#fff" />
        <Text style={styles.swipeActionText}>{isArchivedView ? 'Restore' : 'Archive'}</Text>
      </TouchableOpacity>
    );

    return (
      <FadeIn delay={index * 55}>
        <Swipeable
          ref={(ref) => { if (ref) swipeableRefs.current.set(item.id, ref); }}
          renderRightActions={item.is_personal ? undefined : renderRightActions}
          overshootRight={false}
          friction={2}
        >
          <PressableScale
            style={[styles.groupCard, isArchivedView && styles.groupCardArchived]}
            onPress={() => isArchivedView ? handleRestore(item) : router.push(`/group/${item.id}`)}
            accessibilityLabel={item.name}
          >
            <View style={[styles.cardStripe, { backgroundColor: item.color }]} />
            <View style={[styles.groupIcon, { backgroundColor: item.color + '22' }]}>
              <Feather name={asFeather(item.icon, 'credit-card')} size={20} color={item.color} />
            </View>
            <View style={styles.groupInfo}>
              <Text style={[styles.groupName, isArchivedView && { color: colors.textSecondary }]} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.groupSub} numberOfLines={1}>
                {isArchivedView
                  ? 'Archived — tap to restore'
                  : `${formatCompact(h?.spent ?? 0)} this month${item.is_personal !== 1 && h ? ` · ${h.members} member${h.members === 1 ? '' : 's'}` : ''}`
                }
              </Text>
              {!isArchivedView && h && h.pct !== null && (
                <View style={styles.budgetRow}>
                  <View style={{ flex: 1 }}>
                    <BudgetBar pct={h.pct} health={h.health} height={5} />
                  </View>
                  <Text style={styles.budgetPct}>{h.pct}%</Text>
                  {h.over > 0 && <Text style={styles.overBadge}>{h.over} over</Text>}
                </View>
              )}
            </View>
            {!isArchivedView && <Feather name="chevron-right" size={18} color={colors.textMuted} />}
            {isArchivedView && <Feather name="rotate-ccw" size={16} color={colors.accent} />}
          </PressableScale>
        </Swipeable>
      </FadeIn>
    );
  }

  // Personal lives under the Money tab now — Groups is shared splitting only.
  const activeGroups = groups.filter(g => g.is_personal !== 1);

  function renderBalances() {
    if (!bal || bal.rows.length === 0) return null;
    const activeFriends = friends.filter(f => f.net !== 0);
    return (
      <View style={styles.balancesWrap}>
        <View style={styles.balHero}>
          <Text style={styles.balCaption}>Net balance · {bal.rows.length} {bal.rows.length === 1 ? 'person' : 'people'}</Text>
          <AmountText paise={bal.net} size="xl" forceColor={bal.net < 0 ? colors.expense : colors.income} compact />
          <View style={styles.balSplit}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balCaption}>You owe</Text>
              <AmountText paise={bal.youOwe} size="md" forceColor={colors.expense} compact />
            </View>
            <View style={styles.balDivider} />
            <View style={{ flex: 1 }}>
              <Text style={styles.balCaption}>You're owed</Text>
              <AmountText paise={bal.youAreOwed} size="md" forceColor={colors.income} compact />
            </View>
          </View>
        </View>

        {/* People section */}
        <Text style={styles.balListLabel}>
          People{activeFriends.length > 0 ? ` · ${activeFriends.length} ${activeFriends.length === 1 ? 'friend' : 'friends'}` : ''}
        </Text>
        {activeFriends.length > 0 ? (
          <View style={styles.balList}>
            {activeFriends.map((f, i) => (
              <TouchableOpacity
                key={f.personId}
                style={[styles.balRow, i < activeFriends.length - 1 && styles.balRowBorder]}
                onPress={() => router.push(`/settle?focus=${f.personId}`)}
                accessibilityRole="button"
                accessibilityLabel={`Settle with ${f.name}`}
              >
                <MemberAvatar name={f.name} color={f.avatarColor} size={36} imageUri={f.imageUri} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.balName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.balSub}>{f.net > 0 ? 'owes you' : 'you owe'} · {f.groupCount} {f.groupCount === 1 ? 'group' : 'groups'}</Text>
                </View>
                <Text style={[styles.balAmt, { color: f.net > 0 ? colors.income : colors.expense }]}>{formatCompact(Math.abs(f.net))}</Text>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.allSettled}>All settled up</Text>
        )}

        <Text style={styles.balListLabel}>Your groups</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Groups</Text>
        <TouchableOpacity style={styles.friendsBtn} onPress={() => router.push('/friends')} accessibilityRole="button" accessibilityLabel="Manage friends">
          <Feather name="users" size={18} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); loadGroups(); }} />
      ) : (
        <>
      {/* Filter chips */}
      {archived.length > 0 && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, viewMode === 'active' && styles.filterChipActive]}
            onPress={() => setViewMode('active')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'active' }}
          >
            <Text style={[styles.filterChipText, viewMode === 'active' && styles.filterChipTextActive]}>Active ({activeGroups.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, viewMode === 'archived' && styles.filterChipActive]}
            onPress={() => setViewMode('archived')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'archived' }}
          >
            <Feather name="archive" size={13} color={viewMode === 'archived' ? colors.accent : colors.textMuted} />
            <Text style={[styles.filterChipText, viewMode === 'archived' && styles.filterChipTextActive]}>Archived ({archived.length})</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={viewMode === 'active' ? activeGroups : archived}
        keyExtractor={g => g.id}
        renderItem={renderGroup}
        contentContainerStyle={styles.list}
        ListHeaderComponent={viewMode === 'active' ? renderBalances() : null}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          viewMode === 'active' ? (
            <EmptyState
              icon="users"
              title="No groups yet"
              body="Create a group to track shared expenses with friends, family or roommates."
              actionLabel="New Group"
              onAction={() => setShowCreate(true)}
            />
          ) : (
            <EmptyState
              icon="archive"
              title="No archived groups"
              body="Swipe left on a group to archive it. Archived groups are hidden but data is preserved."
              tint={colors.textSecondary}
            />
          )
        }
      />
        </>
      )}

      <FAB
        actions={[
          { label: 'New Group', icon: 'users', tint: colors.accent, description: 'Share expenses with others', onPress: () => setShowCreate(true) },
          { label: 'Expense', icon: 'minus-circle', tint: colors.expense, description: 'Record spending', onPress: () => router.push('/add/quick?kind=expense') },
        ]}
      />

      <SheetModal visible={showCreate} onClose={() => setShowCreate(false)} title="New Group">
        <TextInput
          style={styles.input}
          placeholder="Group name"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
        />

        <Text style={styles.fieldLabel}>Icon</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconRow} keyboardShouldPersistTaps="handled">
          {GROUP_ICONS.map(ic => (
            <TouchableOpacity
              key={ic}
              style={[styles.iconOption, icon === ic && styles.iconSelected]}
              onPress={() => setIcon(ic)}
              accessibilityRole="button"
              accessibilityLabel={ic}
            >
              <Feather name={ic} size={20} color={icon === ic ? colors.bg : colors.textPrimary} />
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.colorRow}>
          {GROUP_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSelected]}
              onPress={() => setColor(c)}
              accessibilityRole="button"
              accessibilityLabel={c}
            />
          ))}
        </View>

        <PrimaryButton label="Create Group" onPress={handleCreate} disabled={!name.trim()} />
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  title: { ...type.title, color: colors.textPrimary },
  friendsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: space.xs, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  filterChipText: { ...type.label, color: colors.textMuted },
  filterChipTextActive: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  list: { padding: layout.screenPaddingH, paddingBottom: 120 },
  balancesWrap: { marginBottom: space.sm },
  balHero: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, ...shadow.md },
  balCaption: { ...type.caption, color: colors.textSecondary, marginBottom: space.xs },
  balSplit: { flexDirection: 'row', marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border },
  balDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: space.md },
  balListLabel: { ...type.label, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.lg, marginBottom: space.sm },
  balList: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2 },
  balRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  balName: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  balSub: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  balAmt: { fontFamily: 'SpaceMono_400Regular', fontSize: 15 },
  allSettled: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.md },
  swipeAction: { backgroundColor: colors.expense, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', width: 80, marginLeft: space.sm, gap: 4 },
  swipeActionText: { ...type.caption, color: '#fff', fontFamily: 'Inter_600SemiBold' },
  groupCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingLeft: space.md + 4, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  groupCardArchived: { opacity: 0.65, borderStyle: 'dashed' as any },
  cardStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  groupIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  groupInfo: { flex: 1, gap: 4 },
  groupName: { ...type.subheading, color: colors.textPrimary },
  groupSub: { ...type.caption, color: colors.textSecondary },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  budgetPct: { ...type.caption, color: colors.textMuted, minWidth: 30, textAlign: 'right' },
  overBadge: { ...type.caption, color: colors.expense, fontFamily: 'Inter_600SemiBold', marginLeft: space.xs },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  iconRow: { marginBottom: space.xs },
  iconOption: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center', marginRight: space.xs },
  iconSelected: { backgroundColor: colors.accent },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSelected: { borderWidth: 3, borderColor: colors.textPrimary },
});
