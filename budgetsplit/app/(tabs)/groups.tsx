import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Animated,
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
import { getMe, getGroupMembers } from '../../src/db/queries/persons';
import { getBudgetUsage } from '../../src/lib/budget';
import { formatRupeesShort } from '../../src/lib/money';
import { BudgetBar } from '../../src/components/finance/BudgetBar';
import { FAB } from '../../src/components/ui/FAB';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { FadeIn } from '../../src/components/ui/FadeIn';
import { haptic } from '../../src/lib/haptics';
import type { BudgetGroup } from '../../src/db/queries/groups';

const GROUP_ICONS = ['credit-card', 'home', 'users', 'map', 'coffee', 'shopping-cart', 'heart', 'zap', 'star', 'briefcase'];
const GROUP_COLORS = ['#4F46E5', '#E53E3E', '#38A169', '#D69E2E', '#3182CE', '#553C9A', '#B83280', '#DD6B20', '#319795', '#2D3748'];

export default function GroupsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { groups, setGroups } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('credit-card');
  const [color, setColor] = useState('#4F46E5');
  const [health, setHealth] = useState<Record<string, { pct: number | null; health: 'green' | 'amber' | 'red' | 'none'; spent: number; members: number }>>({});
  const [archived, setArchived] = useState<BudgetGroup[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useFocusEffect(useCallback(() => {
    loadGroups();
  }, []));

  async function loadGroups() {
    const grps = await getAllGroups(db);
    setGroups(grps);
    setArchived(await getArchivedGroups(db));
    const h: typeof health = {};
    for (const g of grps) {
      const usage = await getBudgetUsage(db, g, 'monthly');
      const mems = await getGroupMembers(db, g.id);
      h[g.id] = { pct: usage.pct, health: usage.health, spent: usage.spent, members: mems.length };
    }
    setHealth(h);
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
    const me = await getMe(db);
    if (!me) return;
    const group = await insertGroup(db, name.trim(), icon, color, [me.id]);
    haptic.success();
    setShowCreate(false);
    setName('');
    await loadGroups();
    router.push(`/group/${group.id}`);
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
              <Feather name={item.icon as any} size={20} color={item.color} />
            </View>
            <View style={styles.groupInfo}>
              <Text style={[styles.groupName, isArchivedView && { color: colors.textSecondary }]} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.groupSub} numberOfLines={1}>
                {isArchivedView
                  ? 'Archived — tap to restore'
                  : `${formatRupeesShort(h?.spent ?? 0)} this month${item.is_personal !== 1 && h ? ` · ${h.members} member${h.members === 1 ? '' : 's'}` : ''}`
                }
              </Text>
              {!isArchivedView && h && h.pct !== null && (
                <View style={styles.budgetRow}>
                  <View style={{ flex: 1 }}>
                    <BudgetBar pct={h.pct} health={h.health} height={5} />
                  </View>
                  <Text style={styles.budgetPct}>{h.pct}%</Text>
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

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Groups</Text>
      </View>

      {/* Filter chips */}
      {archived.length > 0 && (
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, viewMode === 'active' && styles.filterChipActive]}
            onPress={() => setViewMode('active')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'active' }}
          >
            <Text style={[styles.filterChipText, viewMode === 'active' && styles.filterChipTextActive]}>Active ({groups.length})</Text>
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
        data={viewMode === 'active' ? groups : archived}
        keyExtractor={g => g.id}
        renderItem={renderGroup}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          viewMode === 'active' ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="users" size={28} color={colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptyText}>Create a group to track shared expenses with friends, family or roommates.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="archive" size={28} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No archived groups</Text>
              <Text style={styles.emptyText}>Swipe left on a group to archive it. Archived groups are hidden but data is preserved.</Text>
            </View>
          )
        }
      />

      <FAB
        actions={[
          { label: 'New Group', icon: 'users', tint: colors.accent, description: 'Share expenses with others', onPress: () => setShowCreate(true) },
          { label: 'Expense', icon: 'minus-circle', tint: colors.expense, description: 'Record spending', onPress: () => router.push('/add/quick?kind=expense') },
          { label: 'Income',  icon: 'plus-circle', tint: colors.income, description: 'Money you received', onPress: () => router.push('/add/income') },
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
              <Feather name={ic as any} size={20} color={icon === ic ? colors.bg : colors.textPrimary} />
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
  header: { paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  title: { ...type.title, color: colors.textPrimary },
  filterRow: { flexDirection: 'row', gap: space.xs, paddingHorizontal: layout.screenPaddingH, paddingBottom: space.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: radius.pill, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  filterChipText: { ...type.label, color: colors.textMuted },
  filterChipTextActive: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  list: { padding: layout.screenPaddingH, paddingBottom: 120 },
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
  empty: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  emptyTitle: { ...type.subheading, color: colors.textPrimary },
  emptyText: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md },
  sheetTitle: { ...type.subheading, color: colors.textPrimary },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  fieldLabel: { ...type.label, color: colors.textSecondary },
  iconRow: { marginBottom: space.xs },
  iconOption: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center', marginRight: space.xs },
  iconSelected: { backgroundColor: colors.accent },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSelected: { borderWidth: 3, borderColor: colors.textPrimary },
});
