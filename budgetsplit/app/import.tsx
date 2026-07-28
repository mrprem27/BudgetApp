import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../src/constants/colors';
import { type } from '../src/constants/typography';
import { space, radius, layout } from '../src/constants/layout';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { parseAnyText, parseAnyWorkbook, type DetectedParse, type PasteSource } from '../src/lib/importDetect';
import { readXlsx } from '../src/lib/xlsx';
import { detectPayMethod } from '../src/lib/payMethodDetect';
import { PdfTextExtractor } from '../src/components/system/PdfTextExtractor';
import { matchCategory } from '../src/lib/smartCategory';
import { DEFAULT_CATEGORIES, INCOME_CATEGORIES, TRANSFER_CATEGORIES, type CategoryDef } from '../src/constants/categories';
import type { TxnKind } from '../src/constants/enums';
import { insertPending } from '../src/db/queries/pending';
import { useDataRefresh } from '../src/components/system/DataRefreshProvider';
import { haptic } from '../src/lib/haptics';

const SAMPLE = '2026-06-01, Swiggy order, -450\n2026-06-02, Salary, 85000\n2026-06-03, Uber, -220';

/** Which catalog to guess an imported row's category from. */
const CATEGORIES_FOR: Record<TxnKind, CategoryDef[]> = {
  expense: DEFAULT_CATEGORIES, income: INCOME_CATEGORIES, settlement: TRANSFER_CATEGORIES,
};

export default function ImportScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useDataRefresh();
  const [source, setSource] = useState<PasteSource>('gpay');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<DetectedParse | null>(null);
  // Set when the result came from a picked file — the screen then shows a
  // summary instead of dumping the raw export into the paste box.
  const [fileName, setFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // base64 of a picked PDF while pdf.js extracts its text (off-screen WebView).
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const result = parsed?.result ?? null;

  /** Drop the current result. Touching the paste box or the picker means the
   *  user has moved off a picked file, so the file's summary goes with it. */
  function clearResult() {
    setParsed(null);
    setFileName(null);
  }

  function handleParse() {
    haptic.selection();
    setFileName(null);
    setParsed(parseAnyText(text, source));
  }

  /** Show what a picked file produced. Files are never loaded into the paste box:
   *  the format is detected, so there is nothing for the user to decide. */
  function acceptFile(name: string, d: DetectedParse) {
    if (d.result.rows.length === 0) {
      haptic.warning();
      Alert.alert(
        'No transactions in that file',
        `${name} was read as a ${d.format.toLowerCase()}, but no transactions matched. If it isn't one of the supported exports, paste its text below instead.`,
      );
      return;
    }
    setFileName(name);
    setParsed(d);
    haptic.success();
  }

  async function handlePickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf', 'text/csv', 'text/comma-separated-values', 'text/plain',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const name = asset.name ?? 'that file';
      const isPdf = asset.mimeType === 'application/pdf' || /\.pdf$/i.test(name);
      const isExcel = /\.xlsx?$/i.test(name)
        || (asset.mimeType ?? '').includes('spreadsheetml')
        || asset.mimeType === 'application/vnd.ms-excel';

      if (isPdf) {
        // Extract text via pdf.js in an off-screen WebView (handles compressed PDFs).
        const b64 = await new File(asset.uri).base64();
        setPdfFileName(name);
        setExtracting(true);
        setPdfBase64(b64);
        return;
      }
      if (isExcel) {
        const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
        acceptFile(name, parseAnyWorkbook(readXlsx(bytes)));
        return;
      }
      acceptFile(name, parseAnyText(await new File(asset.uri).text()));
    } catch {
      haptic.error();
      Alert.alert('Could not read that file', 'Pick a PDF, Excel (.xlsx), CSV or text export, or paste the text below instead.');
    }
  }

  function onPdfText(extracted: string) {
    setPdfBase64(null);
    setExtracting(false);
    const name = pdfFileName ?? 'that PDF';
    const d = parseAnyText(extracted, source);
    if (d.result.rows.length === 0) {
      haptic.warning();
      // Distinguish "extracted nothing" from "extracted text but parser found no rows".
      const chars = extracted.trim().length;
      Alert.alert(
        'No transactions found in that PDF',
        chars === 0
          ? 'pdf.js read the PDF but got 0 characters of text (it may be a scanned/image PDF). Open the statement, select all, and paste below.'
          : `Extracted ${chars} characters but no transactions matched a known statement layout. Try pasting the text instead. First 200 chars:\n\n${extracted.trim().slice(0, 200)}`,
      );
      return;
    }
    acceptFile(name, d);
  }

  function onPdfError(message: string) {
    setPdfBase64(null);
    setExtracting(false);
    haptic.warning();
    // Surface the REAL failure (from pdf.js / the WebView), not a generic message.
    Alert.alert('PDF read failed', `${message}\n\nYou can still open the statement, select all the text, and paste it below.`);
  }

  async function handleAdd() {
    if (!parsed || parsed.result.rows.length === 0) return;
    setSaving(true);
    const { result, source: rowSource } = parsed;
    try {
      await insertPending(db, result.rows.map(r => ({
        date: r.date,
        amount: r.amount,
        description: r.description,
        kind: r.kind,
        // Keep the category when the source already carries one (our own export,
        // a Paytm tag); otherwise guess it from the description, against the
        // catalog for that kind.
        category: r.category ?? matchCategory(r.description, CATEGORIES_FOR[r.kind]),
        direction: r.direction,
        source: rowSource,
        // Prefer the parser's detected method; else sniff the row's raw text. Null
        // when nothing matches — the user sets it in Review.
        pay_method: r.payMethod ?? detectPayMethod(r.raw) ?? null,
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
            Import a Paytm or Google Pay statement, a bank / UPI export, a transaction-alert email,
            or a BudgetSplit CSV export. Pick a file and the format is detected for you — you
            confirm every transaction in Review before anything is saved.
          </Text>

          <TouchableOpacity style={styles.fileBtn} onPress={handlePickFile} disabled={extracting} accessibilityRole="button" accessibilityLabel="Choose a PDF, Excel, CSV or text file">
            <Feather name={extracting ? 'loader' : 'upload'} size={18} color={colors.accent} />
            <Text style={styles.fileBtnText}>{extracting ? 'Reading PDF…' : 'Choose a file'}</Text>
          </TouchableOpacity>
          <Text style={styles.fileHint}>PDF · Excel (.xlsx) · CSV · text</Text>

          {/* Off-screen pdf.js extractor — mounted only while reading a PDF. */}
          {pdfBase64 && <PdfTextExtractor base64={pdfBase64} onText={onPdfText} onError={onPdfError} />}

          {/* What the picked file turned out to be. No format question is asked —
              detection already answered it. */}
          {fileName && parsed && result && result.rows.length > 0 && (
            <View style={styles.fileCard}>
              <View style={styles.fileCardIcon}>
                <Feather name="check" size={16} color={colors.income} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileCardTitle} numberOfLines={1}>{parsed.format}</Text>
                <Text style={styles.fileCardMeta} numberOfLines={1}>
                  {result.rows.length} transaction{result.rows.length === 1 ? '' : 's'} found
                  {result.skipped > 0 ? ` · ${result.skipped} line${result.skipped === 1 ? '' : 's'} skipped` : ''}
                </Text>
                <Text style={styles.fileCardName} numberOfLines={1}>{fileName}</Text>
              </View>
              <TouchableOpacity
                onPress={clearResult}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear the picked file"
              >
                <Feather name="x" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.orHint}>or paste the statement text</Text>

          {/* Source picker — only consulted for pasted text no detector claims. */}
          <Text style={styles.sourceLabel}>PASTED TEXT SOURCE</Text>
          <View style={styles.sourceRow}>
            {([['gpay', 'Google Pay'], ['other', 'Bank / UPI (CSV)'], ['email', 'Email alert']] as const).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.sourceChip, source === key && styles.sourceChipOn]}
                onPress={() => { haptic.selection(); setSource(key); clearResult(); }}
                accessibilityRole="button"
                accessibilityState={{ selected: source === key }}
              >
                <Text style={[styles.sourceChipText, source === key && styles.sourceChipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {source === 'gpay' && (
            <Text style={styles.sourceHint}>
              Open your Google Pay statement PDF → Select All → Copy → paste below. (Picking the PDF
              directly works too when its text is readable.)
            </Text>
          )}
          {source === 'email' && (
            <Text style={styles.sourceHint}>
              Forward or copy a bank / UPI transaction-alert email (HDFC, ICICI, GPay, PhonePe…) and
              paste it below — one alert = one transaction. You confirm it in Review.
            </Text>
          )}

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={(t) => { setText(t); clearResult(); }}
            placeholder={`Paste here, e.g.\n${SAMPLE}`}
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            accessibilityLabel="Statement text"
          />

          {/* Pasted-text outcome. A picked file reports in its own card above. */}
          {result && !fileName && (
            <Text style={styles.result}>
              {result.rows.length > 0
                ? `${parsed!.format} · found ${result.rows.length} transaction${result.rows.length === 1 ? '' : 's'}`
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
  fileHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.xs },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md,
    padding: space.md, borderRadius: radius.lg, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.income + '55',
  },
  fileCardIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.income + '22', alignItems: 'center', justifyContent: 'center' },
  fileCardTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  fileCardMeta: { ...type.caption, color: colors.income, marginTop: 1 },
  fileCardName: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  orHint: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginVertical: space.md },
  input: {
    ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: space.md, minHeight: 200, fontFamily: 'SpaceMono_400Regular', fontSize: 13,
  },
  result: { ...type.label, color: colors.textSecondary, marginTop: space.md },
});
