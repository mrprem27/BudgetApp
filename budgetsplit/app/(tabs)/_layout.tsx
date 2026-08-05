import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, AppState } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSQLiteContext } from 'expo-sqlite';
import { ScanPaySheet } from '../../src/components/finance/ScanPaySheet';
import { setPendingPayment } from '../../src/lib/pendingPayment';
import { askAboutPendingPayment } from '../../src/lib/confirmPayment';
import { settings } from '../../src/lib/settings';
import { useDataRefresh } from '../../src/components/system/DataRefreshProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients } from '../../src/constants/colors';
import { layout, shadow, space, radius } from '../../src/constants/layout';
import { type } from '../../src/constants/typography';
import { haptic } from '../../src/lib/haptics';
import { useFeatureFlags } from '../../src/components/system/FeatureFlagsProvider';

const TAB_ICON: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  index: 'home',
  groups: 'users',
  savings: 'bar-chart-2',
  settings: 'settings',
};
const TAB_LABEL: Record<string, string> = {
  index: 'Home', groups: 'Groups', savings: 'Plan', settings: 'Settings',
};
// Order around the centered FAB: Home · Groups · [FAB] · Plan · Settings.
// The second slot is Groups or Personal depending on `flags.splitting` — see AppTabBar.
const RIGHT = ['savings', 'settings'];

/**
 * Custom bottom nav: five equal slots — two tabs, the add FAB (centered, half
 * above the bar, drawn on top), two tabs. The FAB lives IN the bar so it always
 * renders above the screen content.
 */
// expo-router does not export the tab-bar render props (BottomTabBarProps is
// react-navigation's and doesn't match what's passed here). Untyped
// third-party surface — permitted by AGENTS.md.
function AppTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { flags } = useFeatureFlags();
  const { refresh } = useDataRefresh();
  const db = useSQLiteContext();
  const [scanPay, setScanPay] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const activeName = state.routes[state.index]?.name;

  // Back from a UPI app after a Scan & Pay hand-off: ask once, then file it.
  // Lives here rather than in the root layout because that sits ABOVE
  // DataRefreshProvider and so cannot signal the screens to reload.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      askAboutPendingPayment(db).then(filed => { if (filed) refresh(); }).catch(() => {});
    });
    return () => sub.remove();
  }, [db, refresh]);

  // Teach the long-press once. Dismissed by using it, or by tapping the FAB at all.
  useEffect(() => { settings.scanPayHintSeen().then(seen => setShowHint(!seen)).catch(() => {}); }, []);
  function setHintSeen() {
    if (!showHint) return;
    setShowHint(false);
    settings.setScanPayHintSeen(true).catch(() => {});
  }

  const tab = (name: string) => {
    const focused = activeName === name;
    const color = focused ? colors.accent : colors.textMuted;
    return (
      <TouchableOpacity
        key={name}
        style={styles.slot}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: state.routes.find((r: any) => r.name === name)?.key ?? '', canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(name as never);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={TAB_LABEL[name]}
      >
        <Feather name={TAB_ICON[name]} size={22} color={color} />
        <Text style={[styles.label, { color }]}>{TAB_LABEL[name]}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.bar, { height: layout.tabBarHeight + insets.bottom, paddingBottom: insets.bottom }]}>
      <View style={StyleSheet.absoluteFill}>
        {/* iOS gets a live blur; on Android BlurView must recomposite the scrolling
            content behind it every frame (scroll jank), so use a near-opaque fill
            that reads the same over the dark background. */}
        {Platform.OS === 'ios' ? (
          <>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,18,20,0.45)' }]} />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,18,20,0.94)' }]} />
        )}
      </View>
      <View style={styles.row}>
        {tab('index')}
        {/* Slot 2 depends on whether this user splits with anyone. With splitting off
            there are no groups to list, so the slot goes straight to the Personal
            ledger — which is that user's whole app. It pushes rather than switching
            tabs (`/personal` is a root route, not a tab), so it never reads as
            focused; that's the deliberate cost of not duplicating the screen into
            the tab group. */}
        {flags.splitting ? tab('groups') : (
          <TouchableOpacity
            key="personal"
            style={styles.slot}
            onPress={() => router.push('/personal')}
            accessibilityRole="button"
            accessibilityLabel="Personal"
          >
            <Feather name="user" size={22} color={colors.textMuted} />
            <Text style={[styles.label, { color: colors.textMuted }]}>Personal</Text>
          </TouchableOpacity>
        )}
        <View style={styles.fabSlot}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { haptic.light(); setHintSeen(); router.push('/add/quick?kind=expense'); }}
            // Long-press pays by QR (`Scan & Pay`). A hidden gesture needs teaching,
            // hence the one-time coach mark below — the mistake V2-08 and the afford
            // screen both made was shipping a good surface nobody could find.
            onLongPress={() => { haptic.light(); setHintSeen(); setScanPay(true); }}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel="Add expense. Long press to scan and pay a UPI QR."
          >
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
              <Feather name="plus" size={28} color={colors.onAccent} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {RIGHT.map(tab)}
      </View>

      {showHint && (
        <View style={styles.hintBubble} pointerEvents="none">
          <Feather name="maximize" size={12} color={colors.accent} />
          <Text style={styles.hintText}>Hold to scan &amp; pay a UPI QR — it records the expense for you</Text>
        </View>
      )}

      <ScanPaySheet
        visible={scanPay}
        onClose={() => setScanPay(false)}
        onHandoff={p => { setPendingPayment({ ...p, startedAt: Date.now() }).catch(() => {}); }}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="groups" />
      <Tabs.Screen name="savings" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: 8,
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 3, paddingTop: 2 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  // Center slot is a touch wider so the FAB gets breathing room.
  fabSlot: { flex: 1.2, alignItems: 'center', justifyContent: 'flex-start' },
  hintBubble: {
    position: 'absolute', left: space.lg, right: space.lg, bottom: '100%',
    // Clear the FAB, which protrudes above the bar by half its height (+8px row
    // offset). Without this the bubble sits on top of the FAB and the tab labels —
    // FAB overlap is a bug this app has already fixed once (commit 04fa6ad).
    marginBottom: layout.fabHeight / 2 + space.xl,
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  hintText: { ...type.caption, color: colors.textSecondary, flex: 1, lineHeight: 15 },
  fab: {
    width: layout.fabHeight, height: layout.fabHeight, borderRadius: layout.fabHeight / 2,
    alignItems: 'center', justifyContent: 'center',
    // Raise so the FAB's center sits on the nav's top line (8px row offset + half-height).
    marginTop: -(8 + layout.fabHeight / 2),
    ...shadow.fab,
  },
});
