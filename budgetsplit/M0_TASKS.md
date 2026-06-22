# M0: Environment & Spike — Detailed Tasks

**Milestone:** M0 (Environment & Spike)  
**Duration:** 5–7 days  
**Risk Level:** CRITICAL (project blocker)  
**Goal:** Prove that iOS dev environment works and SQLite persists data.

---

## M0-1: iOS Environment Setup

### 1.1: Install Xcode
- [ ] Download Xcode from App Store (15+ GB, 30+ min)
- [ ] Launch Xcode at least once (accepts license, finalizes setup)
- [ ] Verify command line tools: `xcode-select --version` → prints version
- [ ] Verify `xcrun` available: `xcrun --version`

**Blocker:** If Xcode fails to install or command-line tools don't activate, project cannot proceed. May need:
- Free up 20+ GB disk space
- Restart after install
- Run `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`

### 1.2: Configure Apple ID & Development Team
- [ ] Open Xcode → Preferences → Accounts
- [ ] Add Apple ID (can be free, but signing may have limits)
- [ ] Select team (should auto-create personal team if free account)
- [ ] Verify team appears in "Your Teams"

**Common issue:** Free Apple IDs sometimes can't sideload to devices. If stuck:
- Try paid developer account (optional, but reliable)
- Or use simulator first (doesn't require device signing)

### 1.3: Verify Device or Simulator
- [ ] **Device path:** Connect iPhone via USB → Xcode → Devices & Simulators → verify device appears
  - OR
- [ ] **Simulator path:** Launch iOS Simulator (`open -a Simulator`) → Xcode → Product → Destination → select simulator

**Recommendation:** Start with simulator (no device signing needed). Once working, test on device.

### 1.4: Test Xcode with Simple RN Project
- [ ] `npx create-expo-app TestApp`
- [ ] `cd TestApp && npx expo prebuild --platform ios --no-install`
- [ ] Open `ios/TestApp.xcworkspace` in Xcode
- [ ] Product → Build for → Running (Cmd+B)
  - Should complete without error
- [ ] If build succeeds, remove TestApp (cleanup)

**Expected time:** 1–2 days depending on download speed and account setup friction.

**Success signal:** Build completes. If it fails, debug the error before moving on.

---

## M0-2: Database Spike (SQLite + expo-sqlite)

### 2.1: Initialize Expo Project
- [ ] `cd /home/user/BudgetApp && npx create-expo-app budgetsplit`
  - Or clone from branch (if starting from this repo structure)
- [ ] `cd budgetsplit && npm install` (dependencies)
- [ ] Verify `npx expo --version` works

### 2.2: Install SQLite Package
- [ ] `npx expo install expo-sqlite`
- [ ] Verify package.json includes `"expo-sqlite": "^14.0.0"` (or latest v56-compatible version)

### 2.3: Create Database Module
**File:** `src/db/init.ts`

```typescript
import * as SQLite from 'expo-sqlite';

export async function initDatabase() {
  const db = await SQLite.openDatabaseAsync('budgetsplit.db');
  
  // Test: create simple table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS test (
      id INTEGER PRIMARY KEY,
      message TEXT
    );
  `);
  
  return db;
}

export async function testWrite() {
  const db = await SQLite.openDatabaseAsync('budgetsplit.db');
  await db.runAsync('INSERT INTO test (message) VALUES (?)', ['Hello SQLite']);
  const result = await db.getFirstAsync('SELECT * FROM test');
  console.log('Test result:', result);
  return result;
}
```

### 2.4: Test in App
**File:** `app/(tabs)/index.tsx` (temporary test code)

```typescript
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { testWrite } from '../../src/db/init';

export default function HomeScreen() {
  const [dbTest, setDbTest] = useState('Loading...');

  useEffect(() => {
    testWrite().then(result => {
      setDbTest(JSON.stringify(result));
    }).catch(err => {
      setDbTest(`Error: ${err.message}`);
    });
  }, []);

  return (
    <View>
      <Text>DB Test Result:</Text>
      <Text>{dbTest}</Text>
    </View>
  );
}
```

### 2.5: Build & Test
- [ ] `npx expo prebuild --platform ios --no-install` (create native project)
- [ ] Open `ios/budgetsplit.xcworkspace` in Xcode
- [ ] Product → Build (Cmd+B) → wait for success
- [ ] Product → Run (Cmd+R) on simulator or device
- [ ] App launches → check console (Xcode console or Metro bundler)
- [ ] Screen shows `DB Test Result: {id: 1, message: "Hello SQLite"}`

**Success signal:** Data appears on screen. If error:
- Check console for `expo-sqlite` load error
- Verify dev build is running (not Expo Go)
- Try `npx expo run:ios` instead of manual Xcode build

### 2.6: Test Persistence
- [ ] Stop app (background or kill in Xcode)
- [ ] Relaunch app (Cmd+R in Xcode)
- [ ] Verify same data appears (not "Loading..." forever)
- [ ] This proves SQLite persists across app kills

**Expected time:** 2–3 days.

---

## M0-3: Navigation Spike (expo-router setup)

### 3.1: Install Router
- [ ] `npx expo install expo-router react-native-safe-area-context expo-linking expo-constants`
- [ ] Verify package.json includes all dependencies

### 3.2: Create Basic Routes
**Structure:**
```
app/
├─ _layout.tsx          (root layout with tab bar)
├─ (tabs)/
│  ├─ _layout.tsx       (tab bar definition)
│  ├─ index.tsx         (Home tab)
│  ├─ reports.tsx       (Reports tab, stub for v1)
│  └─ settings.tsx      (Settings tab)
├─ add/
│  ├─ _layout.tsx       (modal layout)
│  ├─ expense.tsx       (Add Expense)
│  └─ income.tsx        (Add Income)
└─ group/
   └─ [id].tsx          (Group detail)
```

### 3.3: Root Layout
**File:** `app/_layout.tsx`

```typescript
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="add"
        options={{
          presentation: 'modal',
          title: 'Add Transaction',
        }}
      />
      <Stack.Screen name="group" options={{ title: 'Group' }} />
    </Stack>
  );
}
```

### 3.4: Tab Bar Layout
**File:** `app/(tabs)/_layout.tsx`

```typescript
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../src/components/tokens';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color }) => (
            <Feather name="bar-chart-2" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Feather name="settings" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

### 3.5: Stub Screens
**File:** `app/(tabs)/index.tsx`

```typescript
import { View, Text } from 'react-native';
import { colors, type } from '../../src/components/tokens';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Text style={{ ...type.title, color: colors.textPrimary }}>
        Home
      </Text>
      <Text style={{ color: colors.textSecondary }}>
        DB test passed, navigation working
      </Text>
    </View>
  );
}
```

Repeat for `reports.tsx` and `settings.tsx`.

### 3.6: FAB Navigation
**File:** `src/components/finance/FAB.tsx`

```typescript
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../tokens';

export default function FAB() {
  const router = useRouter();

  return (
    <View style={{ position: 'absolute', bottom: 20, right: 20 }}>
      <Pressable
        onPress={() => router.push('/add/expense')}
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="plus" size={32} color="white" />
      </Pressable>
    </View>
  );
}
```

### 3.7: Test Navigation
- [ ] App loads → Home screen visible
- [ ] Tap Reports tab → Reports screen appears
- [ ] Tap Settings tab → Settings screen appears
- [ ] Tap Home tab → back to Home
- [ ] Tap FAB → Add Expense modal slides up
- [ ] Tap "back" in modal → modal closes, back to Home

**Expected time:** 1–2 days.

---

## M0 Completion Checklist

- [ ] Xcode installed and command-line tools active
- [ ] Apple ID configured in Xcode
- [ ] Simulator or device working
- [ ] Expo app created and built
- [ ] SQLite: data written and persists across app reload
- [ ] expo-router: 3-tab layout + FAB + modal routing works
- [ ] No TypeScript errors in provided code
- [ ] App runs without console errors (warnings OK)

**Success signal:** App launches, shows Home screen with "DB test passed, navigation working" message.

---

## Troubleshooting Guide

### Xcode Build Fails with "Command line tools not found"
```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcode-select --reset
```

### SQLite Module Not Found
```bash
# Make sure dev build exists, not Expo Go
npx expo run:ios --device  # Forces dev build
```

### "Device not found" in Xcode
- Unplug iPhone, plug back in
- Trust the computer on phone if prompted
- Restart Xcode

### Navigation Routes Not Found
- Verify file structure matches file-based routing (files in `app/` folder)
- Run `npx expo prebuild --platform ios --clean` to regenerate native files
- Clear Metro bundler cache: `npx expo start --clear`

### TypeScript Errors in Components
- Install types: `npm install --save-dev @types/react-native`
- Verify `tsconfig.json` exists in root

---

## Next Steps (After M0)

Once M0 passes all checks:
1. Remove test code from `app/(tabs)/index.tsx`
2. Create stub screens for all routes
3. Move to M1: Full database schema
4. Start M1-1: Define all tables (person, budget_group, transaction, etc.)

