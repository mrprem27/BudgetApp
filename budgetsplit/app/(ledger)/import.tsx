import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { KeyboardForm } from '../../src/components/ui/KeyboardForm';
import { saveFailureMessage } from '../../src/lib/dbErrors';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type, space, radius, layout, alpha } from '../../src/theme';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { parseAnyText, parseAnyWorkbook, type DetectedParse, type PasteSource } from '../../src/lib/importDetect';
import { readXlsx } from '../../src/lib/xlsx';
import { PdfTextExtractor } from '../../src/components/system/PdfTextExtractor';
import { queueImportedRows } from '../../src/lib/importCommit';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { haptic } from '../../src/lib/haptics';
import { IconCircle } from '../../src/components/ui/IconCircle';
import { TabPills } from '../../src/components/ui/TabPills';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { backOr } from '../../src/lib/nav';

const SAMPLE = '2026-06-01, Swiggy order, -450\n2026-06-02, Salary, 85000\n2026-06-03, Uber, -220';


export default function ImportScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useDataRefresh();
  const [mode, setMode] = useState<'file' | 'paste'>('file');
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
        `${name} was read as a ${d.format.toLowerCase()}, but no transactions matched. If it isn't one of the supported exports, copy its text and use Paste text instead.`,
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
    try {
      await queueImportedRows(db, parsed);
      haptic.success();
      refresh();
      router.replace('/review');
    } catch (e) {
      // Was a bare try/finally, so a failed insert became an unhandled rejection:
      // the spinner stopped, nothing was imported, nothing was said, and the
      // button looked broken. This is the exact bug already fixed in review.tsx —
      // and `saveFailureMessage` exists because "could not save, try again" is a
      // lie twice over on a full disk, which is the realistic cause here.
      haptic.error();
      const m = saveFailureMessage(e);
      Alert.alert(m.title, m.body);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Import transactions" onBack={() => backOr(router, '/(tabs)')} />
      <KeyboardForm contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xl }]}>
          {/* One line, one way in at a time (`U-43`): this was a paragraph, then a file button,
              then a paste form with its own chips and hints, all on screen at once. */}
          <Text style={styles.intro}>Everything you bring in waits in Review until you confirm it.</Text>

          <TabPills
            tabs={[{ key: 'file', label: 'From a file' }, { key: 'paste', label: 'Paste text' }]}
            active={mode}
            onChange={k => { setMode(k as 'file' | 'paste'); clearResult(); }}
          />

          {/* Off-screen pdf.js extractor — mounted only while reading a PDF. */}
          {pdfBase64 && <PdfTextExtractor base64={pdfBase64} onText={onPdfText} onError={onPdfError} />}

          {mode === 'file' ? (
            fileName && parsed && result && result.rows.length > 0 ? (
              // What the picked file turned out to be. No format question is asked —
              // detection already answered it.
              <View style={styles.fileCard}>
                <IconCircle icon="check" size={40} iconSize={18} color={colors.income} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileCardTitle} numberOfLines={1}>{result.rows.length} transaction{result.rows.length === 1 ? '' : 's'} found</Text>
                  <Text style={styles.fileCardMeta} numberOfLines={1}>
                    {parsed.format}{result.skipped > 0 ? ` · ${result.skipped} line${result.skipped === 1 ? '' : 's'} skipped` : ''}
                  </Text>
                  <Text style={styles.fileCardName} numberOfLines={1}>{fileName}</Text>
                </View>
                <TouchableOpacity onPress={clearResult} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the picked file">
                  <Feather name="x" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <PressableScale style={styles.dropZone} onPress={handlePickFile} disabled={extracting} accessibilityLabel="Choose a PDF, Excel, CSV or text file">
                <IconCircle icon={extracting ? 'loader' : 'upload'} size={56} iconSize={24} color={colors.accent} bg={colors.accentMuted} />
                <Text style={styles.dropTitle}>{extracting ? 'Reading PDF…' : 'Choose a file'}</Text>
                <Text style={styles.dropSub}>Paytm, Google Pay, bank or UPI statements · PDF, Excel, CSV</Text>
              </PressableScale>
            )
          ) : (
            <>
              {/* Only consulted for pasted text no detector claims. */}
              <TabPills
                tabs={[{ key: 'gpay', label: 'Google Pay' }, { key: 'other', label: 'Bank / UPI' }, { key: 'email', label: 'Email alert' }]}
                active={source}
                onChange={k => { setSource(k as PasteSource); clearResult(); }}
                size="sm"
              />
              <Text style={styles.sourceHint}>
                {source === 'gpay' ? 'Open the statement PDF, select all, copy, paste below.'
                  : source === 'email' ? 'One alert email is one transaction.'
                  : 'One transaction per line: date, description, amount.'}
              </Text>
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
              {result && (
                <Text style={[styles.result, result.rows.length === 0 && { color: colors.expense }]}>
                  {result.rows.length > 0
                    ? `${parsed!.format} · ${result.rows.length} transaction${result.rows.length === 1 ? '' : 's'} found`
                    : 'No transactions found in that text'}
                  {result.skipped > 0 ? ` · ${result.skipped} line${result.skipped === 1 ? '' : 's'} skipped` : ''}
                </Text>
              )}
            </>
          )}

          {result && result.rows.length > 0 ? (
            <PrimaryButton label={`Add ${result.rows.length} to review`} onPress={handleAdd} loading={saving} />
          ) : mode === 'paste' ? (
            <PrimaryButton label="Find transactions" onPress={handleParse} disabled={!text.trim()} />
          ) : null}
        </KeyboardForm>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, gap: space.md },
  intro: { ...type.caption, color: colors.textSecondary },
  sourceHint: { ...type.caption, color: colors.textMuted },
  dropZone: {
    alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg,
    borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: alpha(colors.accent, 40),
    backgroundColor: colors.bgCard,
  },
  dropTitle: { ...type.subheading, color: colors.textPrimary },
  dropSub: { ...type.caption, color: colors.textMuted, textAlign: 'center' },
  fileCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    padding: space.md, borderRadius: radius.lg, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: alpha(colors.income, 33),
  },
  fileCardTitle: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  fileCardMeta: { ...type.caption, color: colors.income, marginTop: 1 },
  fileCardName: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  input: {
    ...type.body, color: colors.textPrimary, backgroundColor: colors.bgInput,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: space.md, minHeight: 180, fontFamily: 'SpaceMono_400Regular', fontSize: 13,
  },
  result: { ...type.label, color: colors.textSecondary },
});
