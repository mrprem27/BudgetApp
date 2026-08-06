import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { buildUpiUri, GENERIC_UPI_APP, type UpiAppSpec, type UpiRequest } from '../../lib/upiIntent';
import { alpha } from '../../theme';

/**
 * Exactly what we would send each installed UPI app, for a payment about to be made.
 *
 * A debugging tool for a real and current problem: several apps' deep-link paths are
 * undocumented — the UPI ecosystem is Android-first, where the generic `upi://` intent
 * plus a package name is the whole story, so per-app iOS paths were never published.
 * Without this, settling each unknown app costs a full rebuild-and-test cycle, and the
 * only evidence is which app happened to break.
 *
 * It calls `buildUpiUri` directly rather than reconstructing the string. A preview that
 * could disagree with what is actually sent would be worse than no preview — it would
 * launder a guess into a reading.
 *
 * Reached by long-pressing Pay, so it costs nothing on the payment path.
 */
export function UpiUriSheet({
  visible,
  onClose,
  request,
  apps,
}: {
  visible: boolean;
  onClose: () => void;
  /** The payment as it stands — same object the Pay button would hand off. */
  request: UpiRequest | null;
  /** Installed apps; `null` on Android, where the OS chooser handles this. */
  apps: UpiAppSpec[] | null;
}) {
  if (!visible || !request) return null;

  const rows = [...(apps ?? []), GENERIC_UPI_APP]
    .map(app => ({ app, uri: buildUpiUri(request, app.key) }))
    .filter((r): r is { app: UpiAppSpec; uri: string } => r.uri !== null);

  return (
    <SheetModal visible={visible} onClose={onClose} title="What we’ll send">
      {rows.length === 0 ? (
        <Text style={styles.empty}>No UPI app is installed, so there is nothing to preview.</Text>
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {rows.map(({ app, uri }) => (
            <View key={app.key} style={styles.card}>
              <View style={styles.head}>
                <Text style={styles.name}>{app.label}</Text>
                <View style={[styles.tag, TAG_STYLE[app.provenance]]}>
                  <Text style={[styles.tagText, TAG_TEXT[app.provenance]]}>{PROVENANCE[app.provenance]}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Share.share({ message: uri }).catch(() => {})}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Share the ${app.label} link`}
                >
                  <Feather name="share" size={15} color={colors.accent} />
                </TouchableOpacity>
              </View>
              {/* Selectable so it can be copied without a clipboard dependency. */}
              <Text style={styles.uri} selectable>{uri}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      <Text style={styles.footnote}>
        Open one and tell me whether the payee and amount arrive filled in. That is the only way to
        confirm an app’s link — the paths are not published anywhere.
      </Text>
    </SheetModal>
  );
}

const PROVENANCE: Record<UpiAppSpec['provenance'], string> = {
  device: 'worked here',
  documented: 'vendor docs',
  unverified: 'unverified',
};

const TAG_STYLE: Record<UpiAppSpec['provenance'], { backgroundColor: string }> = {
  device: { backgroundColor: alpha(colors.income, 20) },
  documented: { backgroundColor: alpha(colors.accent, 20) },
  unverified: { backgroundColor: alpha(colors.textMuted, 20) },
};

const TAG_TEXT: Record<UpiAppSpec['provenance'], { color: string }> = {
  device: { color: colors.income },
  documented: { color: colors.accent },
  unverified: { color: colors.textMuted },
};

const styles = StyleSheet.create({
  list: { maxHeight: 420 },
  empty: { ...type.body, color: colors.textSecondary, paddingBottom: space.md },
  card: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: space.md, marginBottom: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  name: { ...type.body, color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
  tag: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm, flex: 1, alignSelf: 'flex-start' },
  tagText: { ...type.caption, fontSize: 11 },
  uri: { fontFamily: 'SpaceMono_400Regular', fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  footnote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, lineHeight: 16 },
});
