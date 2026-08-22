import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { settings } from '../src/lib/settings';
import { getAllGroups } from '../src/db/queries/groups';
import { getMe } from '../src/db/queries/persons';
import { getMyExposure } from '../src/db/queries/balances';
import { formatRupees } from '../src/lib/money';
import { colors, type, space, radius, layout, shadow, alpha } from '../src/theme';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { useFeatureFlags } from '../src/components/system/FeatureFlagsProvider';
import { SheetModal } from '../src/components/ui/SheetModal';
import { IconCircle } from '../src/components/ui/IconCircle';
import { FEATURE_KEYS } from '../src/lib/featureFlags';
import { applyPersona, asIntent, PERSONA_OPTIONS, type OnboardingIntent } from '../src/lib/personaDefaults';
import { haptic } from '../src/lib/haptics';

// The pillar is always on — the app's reason to exist. It shows a "Core" badge
// instead of a toggle so users understand they can't switch off the basics.
//
// Two modules used to sit here and no longer do. "Group Splitting" left when the
// onboarding persona gained the power to switch it off, and "Insights" left when it
// gained a real flag of its own — a Core badge above the same module's live switch
// lower down the screen is a straight contradiction, and the badge is the half
// that's lying. Anything genuinely toggleable belongs in the list, not here.
const CORES: { icon: keyof typeof Feather.glyphMap; tint: string; label: string; caption: string }[] = [
  { icon: 'dollar-sign', tint: colors.accent, label: 'Personal Finance', caption: 'Transactions, categories, budgets and history' },
];


export default function FeaturesScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { flags, setFlag } = useFeatureFlags();
  const [saveLocation, setSaveLocation] = useState(false);
  const [intent, setIntent] = useState<OnboardingIntent | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Receipt-scan provider, as a boolean: on = 'gemini' (cloud), off = 'device'.
  // Unset means 'gemini' (see settings.ocrProvider), so default the switch to on.
  const [cloudOcr, setCloudOcr] = useState(true);

  useEffect(() => {
    (async () => {
      setSaveLocation(await settings.saveLocation());
      setCloudOcr((await settings.ocrProvider()) !== 'device');
      setIntent(asIntent(await settings.onboardingIntent()));
    })();
  }, []);

  /**
   * Re-pick the onboarding persona without re-running onboarding.
   *
   * This writes EVERY flag, not just the persona's deviations (see `applyPersona`),
   * so it undoes hand-toggles too — which is why it confirms first. Nothing else is
   * touched: no data, no groups, and `onboarding_done` stays set.
   */
  function changeSetup(next: OnboardingIntent) {
    const opt = PERSONA_OPTIONS.find(o => o.key === next);
    setPickerOpen(false);
    if (next === intent) return;
    Alert.alert(
      `Set up for “${opt?.label}”?`,
      'This resets every switch below to that setup. Your transactions, groups and goals are untouched, and you can change any switch back.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: async () => {
            haptic.success();
            await applyPersona(next, FEATURE_KEYS);
            setIntent(next);
          },
        },
      ],
    );
  }

  /**
   * Location tagging is deliberately NOT a feature flag, even though it sits in
   * the same switch list.
   *
   * A feature flag is a display preference: `setFlag` is optimistic,
   * fire-and-forget, and cannot fail. This toggle can be *refused* by the OS, so
   * it has to await a permission result and then decline to turn on. Folding it
   * into `FeatureKey` would mean adding async validation to the flag API to serve
   * this one case, making every other flag more complicated. It lives in
   * `settings` (AsyncStorage) instead, and that split is intentional — see
   * AUDIT F-30 / DEBT-04, where it was filed as an inconsistency.
   */
  async function toggleSaveLocation(v: boolean) {
    haptic.selection();
    // Turning it ON asks for OS location permission first; if denied, leave it off.
    if (v) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location off', 'Allow location access for BudgetSplit in your phone’s Settings to tag where you spend.');
        return;
      }
    }
    setSaveLocation(v);
    await settings.setSaveLocation(v);
  }

  /**
   * Receipt scanning always works; this picks *where* the reading happens, which is
   * the only setting in the app that changes whether user content leaves the device.
   * On = `gemini` (photo goes to a vision model via our proxy, much better on
   * two-line item layouts). Off = `device` (Apple Vision + regex, fully offline).
   *
   * Neither direction warns. Off is the private choice and needs no defence, and On
   * is already the default — an "are you sure?" on returning to the default would be
   * theatre. The caption carries the fact instead, because that's what a user
   * deciding this actually needs to read.
   *
   * Like Location Tagging above, this is a `settings` pref rather than a `FeatureKey`:
   * it isn't a boolean "show this surface", it's a choice between two implementations.
   */
  async function toggleCloudOcr(v: boolean) {
    haptic.selection();
    setCloudOcr(v);
    await settings.setOcrProvider(v ? 'gemini' : 'device');
  }

  /**
   * Turning splitting OFF hides the Groups tab, the owe/owed strip and the Transfer
   * kind. Nothing is deleted — but a user with unsettled balances would watch money
   * they're owed vanish from every screen with no explanation, so the count and the
   * outstanding amount are named before it happens. Turning it back ON is silent.
   */
  async function toggleSplitting(v: boolean) {
    haptic.selection();
    if (v) { setFlag('splitting', true); return; }

    let shared = 0;
    let outstanding = 0;
    try {
      const [grps, me] = await Promise.all([getAllGroups(db), getMe(db)]);
      shared = grps.filter(g => g.is_personal !== 1).length;
      if (me) {
        const exp = await getMyExposure(db, me.id);
        outstanding = exp.owe + exp.owed;
      }
    } catch { /* fall through to the plain confirm */ }

    if (shared === 0 && outstanding === 0) { setFlag('splitting', false); return; }

    const parts = [
      shared > 0 ? `${shared} shared group${shared > 1 ? 's' : ''}` : null,
      outstanding > 0 ? `${formatRupees(outstanding)} still unsettled` : null,
    ].filter(Boolean).join(' and ');

    Alert.alert(
      'Hide group splitting?',
      `You have ${parts}. Hiding this removes the Groups tab and the owe/owed strip. Nothing is deleted — turn it back on any time to get everything back.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Hide', style: 'destructive', onPress: () => setFlag('splitting', false) },
      ],
    );
  }

  // Optional modules, grouped into clear sections. Each maps to the flag (or
  // store) that actually gates it. Two rows aren't flags at all and live in
  // `settings` instead: "Location Tagging" (needs an OS grant) and "Cloud Receipt
  // Scanning" (picks an implementation, not a surface).
  // `dimWhenOff: false` for a row where "off" isn't "this feature is disabled" but
  // "the other mode is selected" — dimming it would imply scanning had been switched
  // off, which it hasn't.
  type Module = {
    icon: keyof typeof Feather.glyphMap; label: string; caption: string;
    value: boolean; onChange: (v: boolean) => void; dimWhenOff?: boolean;
  };
  const MODULE_SECTIONS: { title: string; items: Module[] }[] = [
    {
      title: 'Splitting & people',
      items: [
        { icon: 'users', label: 'Group Splitting', caption: 'Groups tab, shared bills, settle up, the owe/owed strip on Home', value: flags.splitting, onChange: toggleSplitting },
        { icon: 'list', label: 'Itemized Bills', caption: 'Split a bill line by line, with tax, tip and discounts', value: flags.itemized, onChange: v => setFlag('itemized', v) },
        { icon: 'smartphone', label: 'Settle via UPI', caption: 'Pay from your UPI app, or show a QR to get paid', value: flags.upiSettle, onChange: v => setFlag('upiSettle', v) },
      ],
    },
    {
      title: 'Insights & reports',
      items: [
        { icon: 'activity', label: 'Financial Health Score', caption: 'A wellness score for your money habits', value: flags.healthScore, onChange: v => setFlag('healthScore', v) },
        { icon: 'bar-chart-2', label: 'Insights', caption: 'Spending velocity, month-end forecast, what-if and nudges', value: flags.insights, onChange: v => setFlag('insights', v) },
        { icon: 'pie-chart', label: 'Reports', caption: 'Monthly history, charts and CSV/PDF export', value: flags.reports, onChange: v => setFlag('reports', v) },
      ],
    },
    {
      title: 'Money tools',
      items: [
        { icon: 'target', label: 'Savings Goals', caption: 'Track goals and fund them directly from cash', value: flags.savingsGoals, onChange: v => setFlag('savingsGoals', v) },
        { icon: 'refresh-cw', label: 'Recurring', caption: 'Track repeating bills & charges', value: flags.recurring, onChange: v => setFlag('recurring', v) },
        { icon: 'help-circle', label: 'Afford Check', caption: 'Weighs cash, your habits, the month ahead and your goals before a buy', value: flags.affordCheck, onChange: v => setFlag('affordCheck', v) },
        { icon: 'bell', label: 'Reminders', caption: 'Nudges before bills and settle-up deadlines', value: flags.reminders, onChange: v => setFlag('reminders', v) },
        { icon: 'award', label: 'Tracking Streak', caption: 'A daily-logging streak on Home (shows at 3+ days)', value: flags.streak, onChange: v => setFlag('streak', v) },
      ],
    },
    {
      title: 'Smart capture',
      items: [
        { icon: 'mic', label: 'Voice Entry', caption: 'Say "four fifty groceries" and have it filled in — uses your keyboard\'s dictation, nothing leaves the device', value: flags.voiceEntry, onChange: v => setFlag('voiceEntry', v) },
        { icon: 'cpu', label: 'Smart Categories', caption: 'Auto-suggest a category as you type the note', value: flags.smartCategory, onChange: v => setFlag('smartCategory', v) },
        { icon: 'repeat', label: 'Recurring Suggestions', caption: 'Flag imported transactions that look like a recurring bill', value: flags.recurringSuggest, onChange: v => setFlag('recurringSuggest', v) },
        { icon: 'map-pin', label: 'Location Tagging', caption: 'Tag transactions with where you spent', value: saveLocation, onChange: toggleSaveLocation },
        { icon: 'camera', label: 'Receipt Scanning', caption: 'Read line items straight off a photographed receipt', value: flags.receiptScan, onChange: v => setFlag('receiptScan', v) },
        { icon: 'upload', label: 'Import & Review', caption: 'Bring in statements, then confirm each row before it counts', value: flags.importReview, onChange: v => setFlag('importReview', v) },
        // Availability is `receiptScan` above; this row only picks the provider.
        {
          icon: 'camera', label: 'Cloud Receipt Scanning',
          caption: cloudOcr
            ? 'Reads receipts far more accurately. The photo is sent to a cloud OCR service for that one request — turn this off to scan on-device instead.'
            : 'Receipts are read entirely on this device. Nothing is uploaded, but line items on cramped receipts are missed more often.',
          value: cloudOcr, onChange: toggleCloudOcr, dimWhenOff: false,
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Feature Management" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* This used to read "Off by default keeps the app clean", which stopped
            being true when the flags were reworked: everything except the streak
            now starts on, and your setup decides what you actually see. */}
        <Text style={styles.intro}>Your setup below switches these on and off together. Change any one whenever you like — nothing is deleted either way.</Text>

        {/* YOUR SETUP — the persona that chose the switches below */}
        {intent && (() => {
          const opt = PERSONA_OPTIONS.find(o => o.key === intent);
          return (
            <>
              <Text style={styles.sectionTitle}>Your setup</Text>
              <View style={styles.card}>
                <TouchableOpacity style={styles.row} onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel="Change my setup">
                  <IconCircle icon={opt?.icon ?? 'layers'} size={32} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{opt?.label}</Text>
                    <Text style={styles.caption}>Sets the switches below. Change any one after.</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          );
        })()}

        {/* ALWAYS ON — the three pillars, no toggle */}
        <Text style={styles.sectionTitle}>Always on</Text>
        <View style={styles.card}>
          {CORES.map((c, i) => (
            <View key={c.label}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <View style={[styles.iconDot, { backgroundColor: alpha(c.tint, 13) }]}>
                  <Feather name={c.icon} size={16} color={c.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{c.label}</Text>
                  <Text style={styles.caption}>{c.caption}</Text>
                </View>
                <View style={[styles.coreBadge, { backgroundColor: alpha(c.tint, 10), borderColor: c.tint }]}>
                  <Text style={[styles.coreBadgeText, { color: c.tint }]}>Core</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* OPTIONAL MODULES — grouped into sections */}
        {MODULE_SECTIONS.map(section => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.items.map((m, i) => (
                <View key={m.label}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={[styles.row, !m.value && m.dimWhenOff !== false && styles.rowOff]}>
                    <View style={styles.iconDot}><Feather name={m.icon} size={16} color={colors.accent} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>{m.label}</Text>
                      <Text style={styles.caption}>{m.caption}</Text>
                    </View>
                    <Switch value={m.value} onValueChange={m.onChange} trackColor={{ true: colors.accent, false: colors.bgMuted }} thumbColor={colors.textPrimary} accessibilityLabel={m.label} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer}>Enabled sections appear in their natural home.{'\n'}Nothing is deleted when a section is off.</Text>
      </ScrollView>

      <SheetModal visible={pickerOpen} onClose={() => setPickerOpen(false)} title="What are you using BudgetSplit for?">
        <View style={styles.card}>
          {PERSONA_OPTIONS.map((o, i) => (
            <View key={o.key}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity style={styles.row} onPress={() => changeSetup(o.key)} accessibilityRole="button" accessibilityLabel={o.label}>
                <IconCircle icon={o.icon} size={32} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{o.label}</Text>
                  <Text style={styles.caption}>{o.desc}</Text>
                </View>
                {o.key === intent && <Feather name="check" size={18} color={colors.accent} />}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPaddingH, paddingBottom: space.lg, gap: space.xs },
  intro: { ...type.body, color: colors.textSecondary, marginBottom: space.sm, lineHeight: 20 },
  sectionTitle: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Inter_600SemiBold', marginTop: space.md, marginBottom: space.xs, marginLeft: space.xs },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, ...shadow.sm },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: space.xl + space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.smd, minHeight: 56 },
  rowOff: { opacity: 0.7 },
  iconDot: { width: 32, height: 32, borderRadius: radius.lg, backgroundColor: colors.accentMuted, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.body, color: colors.textPrimary },
  caption: { ...type.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  coreBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: space.xs, borderWidth: 1 },
  coreBadgeText: { ...type.caption, fontFamily: 'Inter_600SemiBold' },
  footer: { ...type.caption, color: colors.textMuted, textAlign: 'center', marginTop: space.md, lineHeight: 18 },
});
