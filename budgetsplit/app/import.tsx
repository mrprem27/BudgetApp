import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { parseStatement, type ParseResult } from '../src/lib/importParse';
import { isGpayStatement, parseGpayStatement } from '../src/lib/gpayParse';
import { matchCategory } from '../src/lib/smartCategory';
import { DEFAULT_CATEGORIES, INCOME_CATEGORIES } from '../src/constants/categories';
import { insertPending } from '../src/db/queries/pending';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { haptic } from '../src/lib/haptics';

const SAMPLE = '2026-06-01, Swiggy order, -450\n2026-06-02, Salary, 85000\n2026-06-03, Uber, -220';

export default function ImportScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useDataRefresh();
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Google Pay statements have a distinct block layout — use the dedicated
  // parser for those, and the tolerant CSV/UPI parser for everything else.
  function parseAny(content: string): ParseResult {
    return isGpayStatement(content) ? parseGpayStatement(content) : parseStatement(content);
  }

  function handleParse() {
    haptic.selection();
    setResult(parseAny(text));
  }

  async function handlePickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri);
      setText(content);
      setResult(parseAny(content));
      haptic.success();
    } catch {
      haptic.error();
      Alert.alert('Could not read that file', 'Pick a .csv or .txt export, or paste the text below instead.');
    }
  }

  async function handleAdd() {
    if (!result || result.rows.length === 0) return;
    setSaving(true);
    try {
      await insertPending(db, result.rows.map(r => ({
        date: r.date,
        amount: r.amount,
        description: r.description,
        kind: r.kind,
        category: matchCategory(r.description, r.kind === 'income' ? INCOME_CATEGORIES : DEFAULT_CATEGORIES),
        direction: r.direction,
        raw: r.raw,
      })));
      haptic.success();
      refresh();
      router.replace('/review' as any);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Import transactions" onBack={() => router.back()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Import a Google Pay statement (or a bank / UPI export) — pick a file or paste the rows.
            Google Pay statements are auto-detected. We'll do our best to read them; you confirm and
            fix each one in Review before anything is saved.
          </Text>

          <TouchableOpacity style={styles.fileBtn} onPress={handlePickFile} accessibilityRole="button" accessibilityLabel="Choose a CSV or text file">
            <Feather name="file-text" size={18} color={colors.accent} />
            <Text style={styles.fileBtnText}>Choose a file (.csv / .txt)</Text>
          </TouchableOpacity>
          <Text style={styles.orHint}>or paste below</Text>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={(t) => { setText(t); setResult(null); }}
            placeholder={`Paste here, e.g.\n${SAMPLE}`}
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            accessibilityLabel="Statement text"
          />

          {result && (
            <Text style={styles.result}>
              {result.rows.length > 0
                ? `Found ${result.rows.length} transaction${result.rows.length === 1 ? '' : 's'}`
                : 'No transactions found'}
              {result.skipped > 0 ? ` · ${result.skipped} line${result.skipped === 1 ? '' : 's'} skipped` : ''}
            </Text>
          )}

          {result && result.rows.length > 0 ? (
            <PrimaryButton label={`Add ${result.rows.length} to review`} onPress={handleAdd} loading={saving} style={{ marginTop: space.md }} />
          ) : (
            <PrimaryButton label="Parse" onPress={handleParse} disabled={!text.trim()} style={{ marginTop: space.md }} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH },
  intro: { ...type.body, color: colors.textSecondary, marginBottom: space.md, lineHeight: 20 },
  fileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentMuted },
  fileBtnText: { ...type.body, color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  orHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginVertical: space.sm },
  input: {
    ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: space.md, minHeight: 200, fontFamily: 'SpaceMono_400Regular', fontSize: 13,
  },
  result: { ...type.label, color: colors.textSecondary, marginTop: space.md },
});
