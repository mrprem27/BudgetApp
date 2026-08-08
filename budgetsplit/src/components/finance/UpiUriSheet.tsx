import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share, Linking, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../tokens';
import { SheetModal } from '../ui/SheetModal';
import { upiLaunchUrl, buildUpiUri, GENERIC_UPI_APP, type UpiAppSpec, type UpiRequest, type UpiLaunchOpts } from '../../lib/upiIntent';
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
 * It calls `upiLaunchUrl` — the same function the hand-off launches through — rather than
 * reconstructing the string. A preview that could disagree with what is actually sent
 * would be worse than no preview, because it would launder a guess into a reading.
 *
 * **It did disagree, and this is the fix.** The sheet used to run every app through
 * `buildUpiUri`, so it showed `paytmmp://pay?pa=…&am=…` for Paytm — a pre-filled payment —
 * while the hand-off was really sending `paytmmp://scan`. Blocked apps are deliberately
 * handed no payment (see `UpiAppSpec.blocked`), and the preview was the only thing still
 * claiming otherwise. That made an intentional design read as a broken deep link.
 *
 * Reached by long-pressing Pay, so it costs nothing on the payment path.
 */
export function UpiUriSheet({
  visible,
  onClose,
  request,
  apps,
  opts,
}: {
  visible: boolean;
  onClose: () => void;
  /** The payment as it stands — same object the Pay button would hand off. */
  request: UpiRequest | null;
  /** Installed apps; `null` on Android, where the OS chooser handles this. */
  apps: UpiAppSpec[] | null;
  /** The same options the Pay button passes, so the preview resolves the same way. */
  opts?: UpiLaunchOpts;
}) {
  if (!visible || !request) return null;

  /**
   * Fire a URI at an app and report where it went.
   *
   * `warn` is the app's own `blocked` reason, present only on the retry hatch: the
   * confirmation has to state the price *before* the switch, because after `openURL` we
   * are suspended and cannot tell the user anything.
   */
  function open(url: string, label: string, warn?: string) {
    const go = () => Linking.openURL(url).catch(() => {
      Alert.alert(`Couldn’t open ${label}`, 'The scheme may be wrong, or the app may have changed it.');
    });
    if (!warn) { go(); return; }
    Alert.alert(
      `Send the payment to ${label}?`,
      `${warn}\n\nEvery attempt so far has been refused at PIN entry, which uses one of your limited daily UPI PIN attempts. Nothing is recorded here — this is a test, not a settle-up.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Send anyway', style: 'destructive', onPress: go }],
    );
  }

  const rows = [...(apps ?? []), GENERIC_UPI_APP]
    .map(app => ({ app, launch: upiLaunchUrl(request, app, opts) }))
    .filter((r): r is { app: UpiAppSpec; launch: NonNullable<ReturnType<typeof upiLaunchUrl>> } => r.launch !== null);

  return (
    <SheetModal visible={visible} onClose={onClose} title="What we’ll send">
      {rows.length === 0 ? (
        <Text style={styles.empty}>No UPI app is installed, so there is nothing to preview.</Text>
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {rows.map(({ app, launch }) => (
            <View key={app.key} style={styles.card}>
              <View style={styles.head}>
                <Text style={styles.name}>{app.label}</Text>
                <View style={[styles.tag, TAG_STYLE[app.provenance]]}>
                  <Text style={[styles.tagText, TAG_TEXT[app.provenance]]}>{PROVENANCE[app.provenance]}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Share.share({ message: launch.url }).catch(() => {})}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Share the ${app.label} link`}
                >
                  <Feather name="share" size={15} color={colors.accent} />
                </TouchableOpacity>
              </View>
              {/* Tap to fire it. Testing a route used to cost a rebuild per candidate,
                  which is most of why so many paths stayed guesses for so long. */}
              <TouchableOpacity
                onPress={() => open(launch.url, app.label)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${app.label} with this link`}
              >
                {/* Selectable so it can be copied without a clipboard dependency. */}
                <Text style={styles.uri} selectable>{launch.url}</Text>
              </TouchableOpacity>
              {/* Says out loud that this app is opened rather than paid, so a bare URL
                  reads as the decision it is instead of a link that lost its parameters. */}
              {!launch.filled && (
                <Text style={styles.bare}>
                  No payment sent — {app.blocked ?? 'this code can’t be re-emitted'}
                </Text>
              )}
              {/* The retry hatch.
                  The Pay button deliberately never sends these apps a payment, because the
                  refusal is predictable and costs a rate-limited UPI PIN attempt. That is the
                  right default and it stays. But "we stopped trying" is a bad reason to be
                  unable to try, and re-testing shouldn't need a rebuild — so the payment URI
                  is here, one tap away, with the price stated. */}
              {!launch.filled && retryUri(request, app) && (
                <View style={styles.retry}>
                  <TouchableOpacity
                    onPress={() => open(retryUri(request, app)!, app.label, app.blocked)}
                    accessibilityRole="button"
                    accessibilityLabel={`Send the payment to ${app.label} anyway`}
                  >
                    <Text style={styles.retryLabel}>Send the payment anyway ›</Text>
                    <Text style={styles.uri} selectable>{retryUri(request, app)}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
      <Text style={styles.footnote}>
        Tap a link to open it and see where it lands. That is the only way to confirm an app’s
        route — none are published. Nothing here records an expense.
      </Text>
    </SheetModal>
  );
}

/**
 * The payment URI an app *would* get if it weren't blocked — what the retry hatch fires.
 *
 * `null` for the generic row and for a signed merchant code, where there is genuinely no
 * payment to re-emit and "try anyway" would be offering a thing that cannot exist.
 */
function retryUri(request: UpiRequest, app: UpiAppSpec): string | null {
  return app.blocked ? buildUpiUri(request, app.key) : null;
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
  bare: { ...type.caption, color: colors.textMuted, marginTop: space.xs, lineHeight: 16 },
  retry: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  retryLabel: { ...type.caption, color: colors.expense, marginBottom: space.xs },
  footnote: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.sm, lineHeight: 16 },
});
