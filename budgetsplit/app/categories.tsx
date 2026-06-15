import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { getAllGroups } from '../src/db/queries/groups';
import {
  getCategoriesForGroup, insertCategory, deleteCategory,
} from '../src/db/queries/categories';
import { haptic } from '../src/lib/haptics';
import type { BudgetGroup } from '../src/db/queries/groups';
import type { Category } from '../src/db/queries/categories';

const ICON_CHOICES = [
  'coffee', 'shopping-cart', 'home', 'zap', 'wifi', 'smartphone', 'droplet',
  'truck', 'navigation', 'map', 'heart', 'activity', 'scissors', 'shopping-bag',
  'tag', 'film', 'music', 'repeat', 'monitor', 'gift', 'book-open', 'briefcase',
  'shield', 'trending-up', 'dollar-sign', 'credit-card', 'percent', 'box',
  'file-text', 'package', 'star', 'more-horizontal',
];

const COLOR_CHOICES = [
  '#F0A500', '#3ECF8E', '#7C6AF7', '#60A5FA', '#F472B6', '#FB923C',
  '#F06060', '#A78BFA', '#34D399', '#22D3EE', '#FACC15', '#F43F5E',
  '#10B981', '#818CF8', '#E879F9', '#94A3B8',
];

export default function CategoriesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('tag');
  const [color, setColor] = useState(COLOR_CHOICES[0]);

  useFocusEffect(useCallback(() => { init(); }, []));

  async function init() {
    const grps = await getAllGroups(db);
    setGroups(grps);
    const gid = groupId || grps[0]?.id || '';
    setGroupId(gid);
    if (gid) setCategories(await getCategoriesForGroup(db, gid));
  }

  async function switchGroup(gid: string) {
    haptic.selection();
    setGroupId(gid);
    setCategories(await getCategoriesForGroup(db, gid));
  }

  async function addCategory() {
    const trimmed = name.trim();
    if (!trimmed || !groupId) return;
    const created = await insertCategory(db, groupId, trimmed, icon, color);
    haptic.success();
    setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setName('');
    setIcon('tag');
    setColor(COLOR_CHOICES[0]);
    setAdding(false);
  }

  function confirmDelete(cat: Category) {
    Alert.alert(
      `Delete “${cat.name}”?`,
      'Existing transactions keep their category label. This only removes it from the picker.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteCategory(db, cat.id);
            haptic.warning();
            setCategories(prev => prev.filter(c => c.id !== cat.id));
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Categories" onBack={() => router.back()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {groups.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupTabs}>
            <View style={styles.groupTabsRow}>
              {groups.map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupTab, groupId === g.id && styles.groupTabActive]}
                  onPress={() => switchGroup(g.id)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.groupTabText, groupId === g.id && { color: colors.bg }]}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        <View style={styles.card}>
          {categories.map((c, i) => (
            <View key={c.id} style={[styles.row, i < categories.length - 1 && styles.rowBorder]}>
              <View style={[styles.iconDot, { backgroundColor: (c.color ?? colors.accent) + '22' }]}>
                <Feather name={(c.icon ?? 'tag') as any} size={16} color={c.color ?? colors.accent} />
              </View>
              <Text style={styles.rowName}>{c.name}</Text>
              <TouchableOpacity
                onPress={() => confirmDelete(c)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${c.name}`}
              >
                <Feather name="trash-2" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
          {categories.length === 0 && (
            <Text style={styles.empty}>No categories yet</Text>
          )}
        </View>

        {adding ? (
          <View style={styles.card}>
            <Text style={styles.addTitle}>New category</Text>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoFocus
            />

            <Text style={styles.fieldLabel}>Icon</Text>
            <View style={styles.iconGrid}>
              {ICON_CHOICES.map(ic => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.iconOption, icon === ic && styles.iconSelected]}
                  onPress={() => setIcon(ic)}
                  accessibilityRole="button"
                  accessibilityLabel={ic}
                >
                  <Feather name={ic as any} size={18} color={icon === ic ? colors.bg : colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Color</Text>
            <View style={styles.colorRow}>
              {COLOR_CHOICES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSelected]}
                  onPress={() => setColor(c)}
                  accessibilityRole="button"
                  accessibilityLabel={c}
                />
              ))}
            </View>

            <View style={styles.addActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAdding(false); setName(''); }} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !name.trim() && { opacity: 0.4 }]}
                onPress={addCategory}
                disabled={!name.trim()}
                accessibilityRole="button"
              >
                <Text style={styles.saveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addRow}
            onPress={() => { haptic.light(); setAdding(true); }}
            accessibilityRole="button"
            accessibilityLabel="Add category"
          >
            <Feather name="plus" size={18} color={colors.accent} />
            <Text style={styles.addRowText}>Add category</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: 60 },
  groupTabs: { marginBottom: 0 },
  groupTabsRow: { flexDirection: 'row', gap: space.xs },
  groupTab: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  groupTabActive: { backgroundColor: colors.accent },
  groupTabText: { ...type.label, color: colors.textSecondary },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, ...shadow.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowName: { ...type.body, color: colors.textPrimary, flex: 1 },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.md },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  addRowText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  addTitle: { ...type.subheading, color: colors.textPrimary, marginBottom: space.sm },
  input: { ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.md },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.md },
  iconOption: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: colors.accent },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  colorSwatch: { width: 30, height: 30, borderRadius: 15 },
  colorSelected: { borderWidth: 3, borderColor: colors.textPrimary },
  addActions: { flexDirection: 'row', gap: space.sm },
  cancelBtn: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...type.button, color: colors.textSecondary },
  saveBtn: { flex: 1, height: 48, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...type.button, color: colors.bg },
});
