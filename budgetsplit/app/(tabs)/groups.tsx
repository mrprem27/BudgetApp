import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ScrollView,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/constants/colors';
import { type } from '../../src/constants/typography';
import { space, radius, layout, shadow } from '../../src/constants/layout';
import { useStore } from '../../src/store';
import { getAllGroups, insertGroup } from '../../src/db/queries/groups';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { SheetModal } from '../../src/components/SheetModal';
import { getMe } from '../../src/db/queries/persons';
import { getBudgetUsage } from '../../src/lib/budget';
import { BudgetBar } from '../../src/components/BudgetBar';
import { FAB } from '../../src/components/FAB';
import { PressableScale } from '../../src/components/PressableScale';
import { FadeIn } from '../../src/components/FadeIn';
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
  const [icon, setIcon] = useState('wallet');
  const [color, setColor] = useState('#4F46E5');
  const [health, setHealth] = useState<Record<string, { pct: number | null; health: 'green' | 'amber' | 'red' | 'none' }>>({});

  useFocusEffect(useCallback(() => {
    loadGroups();
  }, []));

  async function loadGroups() {
    const grps = await getAllGroups(db);
    setGroups(grps);
    const h: typeof health = {};
    for (const g of grps) {
      const usage = await getBudgetUsage(db, g, 'monthly');
      h[g.id] = { pct: usage.pct, health: usage.health };
    }
    setHealth(h);
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
    return (
      <FadeIn delay={index * 55}>
        <PressableScale
          style={styles.groupCard}
          onPress={() => router.push(`/group/${item.id}`)}
          accessibilityLabel={item.name}
        >
          <View style={[styles.groupIcon, { backgroundColor: item.color + '22' }]}>
            <Feather name={item.icon as any} size={20} color={item.color} />
          </View>
          <View style={styles.groupInfo}>
            <Text style={styles.groupName} numberOfLines={1}>{item.name}</Text>
            {h && h.pct !== null && (
              <View style={styles.budgetRow}>
                <View style={{ flex: 1 }}>
                  <BudgetBar pct={h.pct} health={h.health} height={5} />
                </View>
                <Text style={styles.budgetPct}>{h.pct}%</Text>
              </View>
            )}
          </View>
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </PressableScale>
      </FadeIn>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.title}>Groups</Text>
      </View>

      <FlatList
        data={groups}
        keyExtractor={g => g.id}
        renderItem={renderGroup}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="users" size={28} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyText}>Create a group to track shared expenses with friends, family or roommates.</Text>
          </View>
        }
      />

      <FAB
        actions={[
          { label: 'New Group', icon: 'plus-square', onPress: () => setShowCreate(true) },
          { label: 'Expense', icon: 'minus-circle', onPress: () => router.push('/add/quick?kind=expense') },
          { label: 'Income',  icon: 'plus-circle',  onPress: () => router.push('/add/quick?kind=income') },
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
  header: { paddingHorizontal: layout.screenPaddingH, paddingBottom: layout.screenPaddingH },
  title: { ...type.title, color: colors.textPrimary },
  list: { padding: layout.screenPaddingH, paddingBottom: 120 },
  groupCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  groupIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  groupInfo: { flex: 1, gap: 6 },
  groupName: { ...type.subheading, color: colors.textPrimary },
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
