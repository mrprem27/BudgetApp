import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients } from '../../src/constants/colors';
import { layout, shadow } from '../../src/constants/layout';
import { haptic } from '../../src/lib/haptics';

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
const LEFT = ['index', 'groups'];
const RIGHT = ['savings', 'settings'];

/**
 * Custom bottom nav: five equal slots — two tabs, the add FAB (centered, half
 * above the bar, drawn on top), two tabs. The FAB lives IN the bar so it always
 * renders above the screen content.
 */
function AppTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const activeName = state.routes[state.index]?.name;

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
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,18,20,0.45)' }]} />
      </View>
      <View style={styles.row}>
        {LEFT.map(tab)}
        <View style={styles.fabSlot}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { haptic.light(); router.push('/add/quick?kind=expense'); }}
            accessibilityRole="button"
            accessibilityLabel="Add expense"
          >
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
              <Feather name="plus" size={28} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        {RIGHT.map(tab)}
      </View>
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
  fab: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    // Raise so the FAB's center sits on the nav's top line (8px row offset + 28 half-height).
    marginTop: -36,
    ...shadow.fab,
  },
});
