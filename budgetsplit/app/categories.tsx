import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, LayoutAnimation, UIManager,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../src/constants/colors';
import { CATEGORY_KIND, type CategoryKind } from '../src/constants/enums';
import { type } from '../src/constants/typography';
import { space, radius, layout, shadow } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { ErrorState } from '../src/components/ui/ErrorState';
import { Input } from '../src/components/ui/Input';
import { getAllGroups } from '../src/db/queries/groups';
import {
  getCategoriesForGroup, insertCategory, deleteCategory, renameCategory,
} from '../src/db/queries/categories';
import { haptic } from '../src/lib/haptics';
import {
  CATEGORY_SECTIONS, INCOME_SECTIONS, categorySection, DEFAULT_CATEGORIES, INCOME_CATEGORIES,
} from '../src/constants/categories';
import {
  CATEGORY_ICON_CHOICES as ICON_CHOICES,
  CATEGORY_COLOR_CHOICES as COLOR_CHOICES,
  asFeather,
} from '../src/constants/palette';
import type { BudgetGroup } from '../src/db/queries/groups';
import type { Category } from '../src/db/queries/categories';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}


export default function CategoriesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [kindTab, setKindTab] = useState<CategoryKind>('expense');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [addingToSection, setAddingToSection] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('tag');
  const [color, setColor] = useState(COLOR_CHOICES[0]);
  const [loadError, setLoadError] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  useFocusEffect(useCallback(() => { init(); }, []));

  async function init() {
    try {
      const grps = await getAllGroups(db);
      setGroups(grps);
      const gid = groupId || grps[0]?.id || '';
      setGroupId(gid);
      if (gid) {
        const cats = await getCategoriesForGroup(db, gid, kindTab);
        setCategories(cats);
      }
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  async function switchKind(k: CategoryKind) {
    haptic.selection();
    setKindTab(k);
    setExpandedSection(null);
    setAddingToSection(null);
    if (groupId) {
      const cats = await getCategoriesForGroup(db, groupId, k);
      setCategories(cats);
    }
  }

  function toggleSection(title: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSection(prev => prev === title ? null : title);
    setAddingToSection(null);
  }

  function getCategoriesInSection(sectionTitle: string): Category[] {
    const titles = sections.map(s => s.title);
    const isLast = sectionTitle === titles[titles.length - 1];
    return categories.filter(c => {
      const sec = c.section ?? categorySection(c.name);
      if (sec === sectionTitle) return true;
      // Catch-all: a category whose stored/derived section isn't one of the
      // current kind's sections (e.g. a legacy custom income cat) lands in the
      // last section so it can never silently disappear.
      return isLast && !titles.includes(sec);
    });
  }

  async function addCategory() {
    const trimmed = name.trim();
    if (!trimmed || !groupId) return;
    try {
      const created = await insertCategory(db, groupId, trimmed, icon, color, kindTab, addingToSection);
      haptic.success();
      setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setIcon('tag');
      setColor(COLOR_CHOICES[0]);
      setAddingToSection(null);
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
  }

  function startRename(cat: Category) {
    haptic.light();
    setRenamingId(cat.id);
    setRenameText(cat.name);
    setAddingToSection(null);
  }

  async function saveRename(cat: Category) {
    const n = renameText.trim();
    if (!n || n === cat.name) { setRenamingId(null); return; }
    // Categories are keyed by name — block a collision so we never create two
    // with the same name (and never trip the budget UNIQUE constraint).
    if (categories.some(c => c.id !== cat.id && c.name.toLowerCase() === n.toLowerCase())) {
      Alert.alert('Name already used', 'Another category in this group already uses that name.');
      return;
    }
    try {
      await renameCategory(db, cat.id, n);
      haptic.success();
      setCategories(prev => prev.map(c => (c.id === cat.id ? { ...c, name: n } : c)).sort((a, b) => a.name.localeCompare(b.name)));
      setRenamingId(null);
    } catch {
      haptic.error();
      Alert.alert('Something went wrong', 'Please try again.');
    }
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
            try {
              await deleteCategory(db, cat.id);
              haptic.warning();
              setCategories(prev => prev.filter(c => c.id !== cat.id));
            } catch {
              haptic.error();
              Alert.alert('Something went wrong', 'Please try again.');
            }
          },
        },
      ],
    );
  }

  function startAdding(section: string) {
    haptic.light();
    const allSecs = kindTab === 'expense' ? CATEGORY_SECTIONS : INCOME_SECTIONS;
    const defs = kindTab === 'expense' ? DEFAULT_CATEGORIES : INCOME_CATEGORIES;
    const sectionDef = allSecs.find(s => s.title === section);
    const firstCatInSection = sectionDef
      ? defs.find(c => sectionDef.names.includes(c.name))
      : null;
    setIcon(firstCatInSection?.icon ?? 'tag');
    setColor(firstCatInSection?.color ?? COLOR_CHOICES[0]);
    setAddingToSection(section);
  }

  const sections = kindTab === 'expense' ? CATEGORY_SECTIONS : INCOME_SECTIONS;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Categories" onBack={() => router.back()} />

      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); init(); }} />
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Kind tab: Expense / Income */}
        <View style={styles.kindRow}>
          {CATEGORY_KIND.map(k => (
            <TouchableOpacity
              key={k}
              style={[styles.kindPill, kindTab === k && styles.kindPillActive]}
              onPress={() => switchKind(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: kindTab === k }}
            >
              <Text style={[styles.kindPillText, kindTab === k && styles.kindPillTextActive]}>
                {k === 'expense' ? 'Expense' : 'Income'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sections */}
        {sections.map(section => {
          const catsInSection = getCategoriesInSection(section.title);
          const isExpanded = expandedSection === section.title;
          const isAddingHere = addingToSection === section.title;

          return (
            <View key={section.title} style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.title)}
                accessibilityRole="button"
                accessibilityLabel={`${section.title} section, ${catsInSection.length} categories`}
              >
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionRight}>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{catsInSection.length}</Text>
                  </View>
                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.sectionContent}>
                  {catsInSection.map((c, i) => (
                    <View key={c.id} style={[styles.row, i < catsInSection.length - 1 && styles.rowBorder]}>
                      <View style={[styles.iconDot, { backgroundColor: (c.color ?? colors.accent) + '22' }]}>
                        <Feather name={asFeather(c.icon, 'tag')} size={16} color={c.color ?? colors.accent} />
                      </View>
                      {renamingId === c.id ? (
                        <>
                          <Input
                            value={renameText}
                            onChangeText={setRenameText}
                            autoFocus
                            autoCapitalize="words"
                            maxLength={30}
                            onSubmitEditing={() => saveRename(c)}
                            style={styles.renameInput}
                          />
                          <TouchableOpacity onPress={() => saveRename(c)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save name">
                            <Feather name="check" size={18} color={colors.accent} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setRenamingId(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel rename">
                            <Feather name="x" size={18} color={colors.textMuted} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Text style={styles.rowName}>{c.name}</Text>
                          <TouchableOpacity onPress={() => startRename(c)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Rename ${c.name}`}>
                            <Feather name="edit-2" size={15} color={colors.textMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => confirmDelete(c)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete ${c.name}`}>
                            <Feather name="trash-2" size={17} color={colors.textMuted} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  ))}

                  {catsInSection.length === 0 && (
                    <Text style={styles.empty}>No categories in this section</Text>
                  )}

                  {isAddingHere ? (
                    <View style={styles.addForm}>
                      <Input
                        placeholder="Category name"
                        value={name}
                        onChangeText={setName}
                        autoFocus
                        autoCapitalize="words"
                        maxLength={30}
                        style={styles.inputGap}
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
                            <Feather name={ic} size={18} color={icon === ic ? colors.bg : colors.textSecondary} />
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
                        <TouchableOpacity
                          style={styles.cancelBtn}
                          onPress={() => { setAddingToSection(null); setName(''); }}
                          accessibilityRole="button"
                        >
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
                      onPress={() => startAdding(section.title)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add category to ${section.title}`}
                    >
                      <Feather name="plus" size={16} color={colors.accent} />
                      <Text style={styles.addRowText}>Add to {section.title}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md, paddingBottom: space.lg },
  kindRow: { flexDirection: 'row', backgroundColor: colors.bgMuted, borderRadius: radius.pill, padding: 3 },
  kindPill: { flex: 1, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  kindPillActive: { backgroundColor: colors.accent },
  kindPillText: { ...type.label, color: colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  kindPillTextActive: { color: colors.bg },
  sectionCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: space.md },
  sectionTitle: { ...type.subheading, color: colors.textPrimary, flex: 1 },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  countBadge: { backgroundColor: colors.accentMuted, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  countText: { ...type.caption, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  sectionContent: { paddingHorizontal: space.md, paddingBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowName: { ...type.body, color: colors.textPrimary, flex: 1 },
  renameInput: { flex: 1 },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: space.md },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, marginTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  addRowText: { ...type.label, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  addForm: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  inputGap: { marginBottom: space.md },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginBottom: space.xs },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.md },
  iconOption: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: colors.accent },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  colorSwatch: { width: 28, height: 28, borderRadius: 14 },
  colorSelected: { borderWidth: 3, borderColor: colors.textPrimary },
  addActions: { flexDirection: 'row', gap: space.sm },
  cancelBtn: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...type.button, color: colors.textSecondary },
  saveBtn: { flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...type.button, color: colors.bg },
});
