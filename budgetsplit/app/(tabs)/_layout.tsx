import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/constants/colors';
import { layout } from '../../src/constants/layout';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 10, marginTop: 0 },
        // Frosted-glass bar: translucent + blurred content behind it.
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          height: layout.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(13,18,20,0.45)' }]} />
          </View>
        ),
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
          tabBarAccessibilityLabel: 'Home',
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
          tabBarAccessibilityLabel: 'Groups',
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Money',
          tabBarIcon: ({ color }) => <Feather name="dollar-sign" size={22} color={color} />,
          tabBarAccessibilityLabel: 'Money',
        }}
      />
      {/* Reports folds into Home — reachable from the dashboard, not a tab. */}
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} />,
          tabBarAccessibilityLabel: 'Settings',
        }}
      />
    </Tabs>
  );
}
