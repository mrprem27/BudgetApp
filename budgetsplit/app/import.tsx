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
  const [source, setSource] = useState<'gpay' | 'other'>('gpay');
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);

  // The source picker chooses the parser: Google Pay's block layout vs. the
  // tolerant CSV/UPI parser. (GPay is also auto-detected as a safety net.)
  function parseAny(content: string): ParseResult {
    const gpay = source === 'gpay' || isGpayStatement(content);
    return gpay ? parseGpayStatement(content) : parseStatement(content);
  }

  function handleParse() {
    haptic.selection();
    setResult(parseAny(text));
  }

  async function handlePickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const isPdf = asset.mimeType === 'application/pdf' || /\.pdf$/i.test(asset.name ?? '');
      let content = '';
      try { content = await FileSystem.readAsStringAsync(asset.uri); } catch { content = ''; }
      const parsed = parseAny(content);
      // Many PDFs store text compressed (FlateDecode) — not readable on-device
      // without a native extractor. If nothing parsed, guide the user to paste.
      if (parsed.rows.length === 0 && isPdf) {
        haptic.warning();
        Alert.alert(
          'Couldn’t read this PDF automatically',
          'Some statement PDFs keep their text compressed, which we can’t extract on-device yet. Open the statement, select all the text, and paste it below — it’ll parse the same way.',
        );
        return;
      }
      setText(content);
      setResult(parsed);
      haptic.success();
    } catch {
      haptic.error();
      Alert.alert('Could not read that file', 'Pick a PDF / CSV / text export, or paste the text below instead.');
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
            You confirm and fix each one in Review before anything is saved.
          </Text>

          {/* Source picker — tells us which format to parse. */}
          <Text style={styles.sourceLabel}>STATEMENT SOURCE</Text>
          <View style={styles.sourceRow}>
            {([['gpay', 'Google Pay'], ['other', 'Bank / UPI (CSV)']] as const).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.sourceChip, source === key && styles.sourceChipOn]}
                onPress={() => { haptic.selection(); setSource(key); setResult(null); }}
                accessibilityRole="button"
                accessibilityState={{ selected: source === key }}
              >
                <Text style={[styles.sourceChipText, source === key && styles.sourceChipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {source === 'gpay' && (
            <Text style={styles.sourceHint}>
              Open your Google Pay statement PDF → Select All → Copy → paste below. (Direct PDF upload
              works too when its text is readable.)
            </Text>
          )}

          <TouchableOpacity style={styles.fileBtn} onPress={handlePickFile} accessibilityRole="button" accessibilityLabel="Choose a PDF, CSV or text file">
            <Feather name="file-text" size={18} color={colors.accent} />
            <Text style={styles.fileBtnText}>Choose a file (.pdf / .csv / .txt)</Text>
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
  sourceLabel: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold', marginBottom: space.xs },
  sourceRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  sourceChip: { flex: 1, alignItems: 'center', paddingVertical: space.sm + 2, borderRadius: radius.md, backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: 'transparent' },
  sourceChipOn: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  sourceChipText: { ...type.label, color: colors.textSecondary },
  sourceChipTextOn: { color: colors.accent, fontFamily: 'Inter_600SemiBold' },
  sourceHint: { ...type.caption, color: colors.textMuted, marginBottom: space.md, lineHeight: 16 },
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
