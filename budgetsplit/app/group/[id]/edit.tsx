import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../../src/constants/colors';
import { type } from '../../../src/constants/typography';
import { space, radius, layout } from '../../../src/constants/layout';
import { ScreenHeader } from '../../../src/components/ui/ScreenHeader';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { PrimaryButton } from '../../../src/components/ui/PrimaryButton';
import { Input } from '../../../src/components/ui/Input';
import { getGroupById, updateGroup } from '../../../src/db/queries/groups';
import { haptic } from '../../../src/lib/haptics';
import { GROUP_ICONS, GROUP_COLORS, asFeather } from '../../../src/constants/palette';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('credit-card');
  const [color, setColor] = useState(GROUP_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const g = await getGroupById(db, id);
      if (!g) { Alert.alert('Group not found', 'This group may have been deleted.'); router.back(); return; }
      setName(g.name); setIcon(g.icon); setColor(g.color);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (!id) { router.back(); return null; }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateGroup(db, id, name.trim(), icon, color);
      haptic.success();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Edit Group" onBack={() => router.back()} />
      {loadError ? (
        <ErrorState onRetry={() => { setLoadError(false); load(); }} />
      ) : (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.previewRow}>
          <View style={[styles.previewIcon, { backgroundColor: color + '22' }]}>
            <Feather name={asFeather(icon, 'credit-card')} size={26} color={color} />
          </View>
          <Text style={styles.previewName} numberOfLines={1}>{name || 'Group name'}</Text>
        </View>

        <Text style={styles.fieldLabel}>Name</Text>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          accessibilityLabel="Group name"
          autoCapitalize="words"
          maxLength={40}
        />

        <Text style={styles.fieldLabel}>Icon</Text>
        <View style={styles.grid}>
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
        </View>

        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.grid}>
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

        <View style={{ height: space.lg }} />
        <PrimaryButton label="Save Changes" onPress={handleSave} disabled={!name.trim()} loading={saving} />
      </ScrollView>
      </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.sm },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.md },
  previewIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  previewName: { ...type.subheading, color: colors.textPrimary, flex: 1 },
  fieldLabel: { ...type.label, color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  iconOption: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.bgMuted, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: colors.accent },
  colorSwatch: { width: 36, height: 36, borderRadius: 18 },
  colorSelected: { borderWidth: 3, borderColor: colors.textPrimary },
});
