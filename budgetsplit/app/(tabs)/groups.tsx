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
import { useReloadOnDataChange } from '../../src/hooks/useReloadOnDataChange';
import { getAllGroups, insertGroup, getArchivedGroups, unarchiveGroup, archiveGroupSafe, type SplitMode } from '../../src/db/queries/groups';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SheetModal } from '../../src/components/ui/SheetModal';
import { getMe, getGroupMembers, getAllPersons, type Person } from '../../src/db/queries/persons';
import { getGroupNet, getMyExposure, type FriendBalance } from '../../src/db/queries/balances';
import { getBudgetAnalytics } from '../../src/lib/analytics';
import { formatCompact } from '../../src/lib/money';
import { oweView } from '../../src/lib/owe';
import { utilLabel } from '../../src/lib/budget';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { MemberAvatar } from '../../src/components/finance/MemberAvatar';
import { AvatarStack } from '../../src/components/finance/AvatarStack';
import { BalanceChip } from '../../src/components/ui/BalanceChip';
import { AmountText } from '../../src/components/ui/AmountText';
import { AppRefreshControl, useRefresh } from '../../src/components/ui/AppRefreshControl';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { FadeIn } from '../../src/components/ui/FadeIn';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorState } from '../../src/components/ui/ErrorState';
import { haptic } from '../../src/lib/haptics';
import { GROUP_ICONS, GROUP_COLORS, asFeather } from '../../src/constants/palette';
import { GroupForm, GROUP_TYPES } from '../../src/components/finance/GroupForm';
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
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [defaultSplit, setDefaultSplit] = useState<SplitMode>('equal');
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  const [health, setHealth] = useState<Record<string, { pct: number | null; health: 'green' | 'amber' | 'red' | 'none'; spent: number; members: number; over: number; net: number }>>({});
  const [archived, setArchived] = useState<BudgetGroup[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [friends, setFriends] = useState<FriendBalance[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, Person[]>>({});
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());
  const { refreshing, onRefresh } = useRefresh(() => loadGroups());

  useFocusEffect(useCallback(() => {
    loadGroups();
  }, []));
  useReloadOnDataChange(loadGroups);

  async function loadGroups() {
    try {
      const grps = await getAllGroups(db);
      setGroups(grps);
      setArchived(await getArchivedGroups(db));
      const me = await getMe(db);
      // Per-group usage + member counts + my net balance, in parallel.
      const h: typeof health = {};
      const mm: Record<string, Person[]> = {};
      await Promise.all(grps.map(async g => {
        const [analytics, mems, gnet] = await Promise.all([
          getBudgetAnalytics(db, g),
          getGroupMembers(db, g.id),
          getGroupNet(db, g.id),
        ]);
        const pct = analytics.utilizationPct;
        const hc = pct === null ? 'none' as const : pct >= 100 ? 'red' as const : pct >= 80 ? 'amber' as const : 'green' as const;
        h[g.id] = { pct, health: hc, spent: analytics.totalSpent, members: mems.length, over: analytics.overBudget.length, net: me ? (gnet[me.id] ?? 0) : 0 };
        mm[g.id] = mems;
      }));
      setHealth(h);
      setMemberMap(mm);

      // People balances — who-owes-whom across all groups, from my view.
      // Single source of truth: getMyExposure (per-person, after all settlements).
      const persons = await getAllPersons(db);
      setAllPersons(persons.filter(p => !p.is_me));
      setFriends(me ? (await getMyExposure(db, me.id)).perPerson : []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
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

  function openCreate() {
    setName('');
    setIcon(GROUP_TYPES[0].icon);
    setColor(GROUP_TYPES[0].color);
    setGroupMembers([]);
    setDefaultSplit('equal');
    setShowCreate(true);
  }

  function toggleMember(id: string) {
    setGroupMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      const me = await getMe(db);
      if (!me) return;
      const group = await insertGroup(db, name.trim(), icon, color, [me.id, ...groupMembers], defaultSplit);
      haptic.success();
      setShowCreate(false);
      setName('');
      setGroupMembers([]);
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
      <FadeIn delay={Math.min(index, 6) * 55}>
        <Swipeable
          ref={(ref) => { if (ref) swipeableRefs.current.set(item.id, ref); }}
          renderRightActions={item.is_personal ? undefined : renderRightActions}
          overshootRight={false}
          friction={2}
        >
          <PressableScale
            style={[styles.groupCard, isArchivedView && styles.groupCardArchived]}
            onPress={() => isArchivedView ? handleRestore(item) : router.push((item.is_personal === 1 ? '/personal' : `/group/${item.id}`) as any)}
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
                  : item.is_personal === 1
                  ? `Everything involving you · ${formatCompact(h?.spent ?? 0)}/mo`
                  : `${h?.members ?? 0} ${(h?.members ?? 0) === 1 ? 'member' : 'members'} · ${formatCompact(h?.spent ?? 0)} this month`
                }
              </Text>
              {!isArchivedView && item.is_personal !== 1 && (memberMap[item.id]?.length ?? 0) > 0 && (
                <View style={styles.stackRow}>
                  <AvatarStack people={memberMap[item.id] ?? []} size={22} max={3} />
                </View>
              )}
              {!isArchivedView && h && h.pct !== null && (
                <View style={styles.budgetRow}>
                  <View style={{ flex: 1 }}>
                    <BudgetBar pct={h.pct} health={h.health} height={5} />
                  </View>
                  <Text style={[styles.budgetPct, (h.pct ?? 0) > 100 && { color: colors.expense }]}>{utilLabel(h.pct)}</Text>
                  {h.over > 0 && <Text style={styles.overBadge}>{h.over} over</Text>}
                </View>
              )}
            </View>
            {isArchivedView ? (
              <Feather name="rotate-ccw" size={16} color={colors.accent} />
            ) : (h?.net ?? 0) !== 0 ? (
              <BalanceChip net={h?.net ?? 0} />
            ) : (
              <Feather name="chevron-right" size={18} color={colors.textMuted} />
            )}
          </PressableScale>
        </Swipeable>
      </FadeIn>
    );
  }

  // Personal ("Just you") pinned on top, then the shared groups (design Screens 2).
  const sharedGroups = groups.filter(g => g.is_personal !== 1);
  const personalGroup = groups.find(g => g.is_personal === 1);
  const activeGroups = personalGroup ? [personalGroup, ...sharedGroups] : sharedGroups;

  function renderBalances() {
    const activeFriends = friends.filter(f => f.net !== 0);
    if (activeFriends.length === 0) return null;
    return (
      <View style={styles.balancesWrap}>
        <Text style={styles.balListLabel}>People</Text>
        <View style={styles.balList}>
          {activeFriends.map((f, i) => (
            <View
              key={f.personId}
              style={[styles.balRow, i < activeFriends.length - 1 && styles.balRowBorder]}
            >
              <MemberAvatar name={f.name} color={f.avatarColor} size={36} imageUri={f.imageUri} />
              <View style={{ flex: 1 }}>
                <Text style={styles.balName} numberOfLines={1}>{f.name}</Text>
                {(() => {
                  const ov = oweView(f.net);
                  return (
                    <Text style={[styles.balSub, { color: ov.color }]}>
                      {ov.label} {formatCompact(ov.amount)}
                    </Text>
                  );
                })()}
              </View>
              <TouchableOpacity
                style={styles.settleChip}
                onPress={() => router.push(`/add/quick?kind=transfer&to=${f.personId}`)}
                accessibilityRole="button"
                accessibilityLabel={`Settle with ${f.name}`}
              >
                <Text style={styles.settleChipText}>Settle</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>{viewMode === 'archived' ? 'Archived' : 'Groups'}</Text>
        <View style={styles.headerActions}>
          {(archived.length > 0 || viewMode === 'archived') && (
            <TouchableOpacity
              style={styles.headerAdd}
              onPress={() => setViewMode(v => (v === 'active' ? 'archived' : 'active'))}
              accessibilityRole="button"
              accessibilityLabel={viewMode === 'archived' ? 'Back to active groups' : 'View archived groups'}
            >
              <Feather name={viewMode === 'archived' ? 'arrow-left' : 'archive'} size={18} color={viewMode === 'archived' ? colors.accent : colors.textSecondary} />
            </TouchableOpacity>
          )}
          {viewMode === 'active' && (
            <TouchableOpacity style={styles.headerAdd} onPress={openCreate} accessibilityRole="button" accessibilityLabel="New group">
              <Feather name="plus" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); loadGroups(); }} />
      ) : (
        <>
      <FlatList
          data={viewMode === 'active' ? activeGroups : archived}
          keyExtractor={g => g.id}
          renderItem={renderGroup}
          contentContainerStyle={styles.list}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={9}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={viewMode === 'active' ? <Text style={[styles.balListLabel, { marginTop: 0 }]}>My groups</Text> : null}
          ListFooterComponent={viewMode === 'active' ? renderBalances() : null}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          ListEmptyComponent={
            !loaded ? null : viewMode === 'active' ? (
              <EmptyState
                icon="users"
                title="No groups yet"
                body="Create a group to track shared expenses with friends, family or roommates."
                actionLabel="New Group"
                onAction={openCreate}
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

      {/* FAB now lives in the custom tab bar; New Group is the header + button. */}

      <SheetModal visible={showCreate} onClose={() => setShowCreate(false)} title="New Group">
        <GroupForm
          values={{ name, icon, color, members: groupMembers, defaultSplit }}
          onChange={(patch) => {
            if (patch.name !== undefined) setName(patch.name);
            if (patch.icon !== undefined) setIcon(patch.icon);
            if (patch.color !== undefined) setColor(patch.color);
            if (patch.members !== undefined) setGroupMembers(patch.members);
            if (patch.defaultSplit !== undefined) setDefaultSplit(patch.defaultSplit);
          }}
          allPersons={allPersons}
          autoFocusName
        />
        <PrimaryButton label="Create Group" onPress={handleCreate} disabled={!name.trim()} style={{ marginTop: space.md }} />
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { ...type.title, color: colors.textPrimary },
  friendsBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  headerAdd: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
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
  swipeAction: { backgroundColor: colors.expense, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', width: 80, marginLeft: space.sm, gap: space.xs },
  swipeActionText: { ...type.caption, color: '#fff', fontFamily: 'Inter_600SemiBold' },
  groupCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, paddingLeft: space.md + 4, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  groupCardArchived: { opacity: 0.65, borderStyle: 'dashed' as any },
  cardStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  groupIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  groupInfo: { flex: 1, gap: space.xs },
  groupName: { ...type.subheading, color: colors.textPrimary },
  groupSub: { ...type.caption, color: colors.textSecondary },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  budgetPct: { ...type.caption, color: colors.textMuted, minWidth: 30, textAlign: 'right' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.bgMuted },
  headerIconBtnActive: { backgroundColor: colors.accentMuted },
  overBadge: { ...type.caption, color: colors.expense, fontFamily: 'Inter_600SemiBold', marginLeft: space.xs },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  typeChip: { paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.border },
  typeChipText: { ...type.label, color: colors.textSecondary },
  memberRow: { gap: space.md, paddingVertical: space.xs, paddingRight: space.md },
  memberPick: { alignItems: 'center', gap: space.xs, width: 52 },
  memberAvatarWrap: { borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  memberAvatarOn: { borderColor: colors.accent },
  memberCheck: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgCard },
  memberPickName: { ...type.caption, color: colors.textSecondary, fontSize: 10 },
  iconRow: { marginBottom: space.xs },
  iconOption: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center', marginRight: space.xs },
  iconSelected: { backgroundColor: colors.accent },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  colorSwatch: { width: 32, height: 32, borderRadius: radius.lg },
  colorSelected: { borderWidth: 3, borderColor: colors.textPrimary },
  stackRow: { marginTop: space.xs },
  settleChip: { backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 5, borderWidth: 1, borderColor: colors.accent + '44' },
  settleChipText: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
});
