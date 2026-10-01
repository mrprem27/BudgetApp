import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, type, space, radius, layout } from '../../tokens';
import { ListRow } from '../../ui/ListRow';
import { SettingsRow, settingsRowDivider } from '../../ui/SettingsRow';
import { SheetModal } from '../../ui/SheetModal';
import { PayMethodDisc } from '../pay/PayMethodGlyph';
import { PayMethodSelector } from '../PayMethodSelector';
import { MoneySettingsRows } from './MoneySettingsRows';
import { settings } from '../../../lib/settings';
import { asBudgetCadence, asPayMethod, PayMethod, PAY_METHOD_LABEL } from '../../../constants/enums';
import type { BudgetCadence } from '../../../db/queries/categoryBudgets';

const CADENCE_LABELS: Record<BudgetCadence, string> = { daily: 'Daily', monthly: 'Monthly', yearly: 'Yearly' };
const CADENCE_KEYS = Object.keys(CADENCE_LABELS) as BudgetCadence[];

/**
 * How your money works, as rows: where you usually pay from, the cadence a new budget starts
 * on, how you are paid, how far Safe to spend looks, what to keep aside. Lives on Insights
 * (`U-86`), beside the forecasts these answers drive; it was Settings' Preferences section,
 * a screen away from anything it changes.
 */
export function MoneyPreferences({ tint = colors.accent }: { tint?: string }) {
  const [defaultCadence, setDefaultCadence] = useState<BudgetCadence>('monthly');
  const [defaultPay, setDefaultPay] = useState<PayMethod>(PayMethod.Bank);
  const [showPayMethod, setShowPayMethod] = useState(false);
  const [showCadence, setShowCadence] = useState(false);

  // Device preferences, not the database: re-read on focus so a change made elsewhere shows.
  useFocusEffect(useCallback(() => {
    (async () => {
      // Narrowed, not cast: a database written before `once` was removed still
      // holds it here, and an unknown key would index CADENCE_LABELS to undefined.
      const dc = await settings.defaultCadence();
      if (dc) setDefaultCadence(asBudgetCadence(dc));
      setDefaultPay(asPayMethod(await settings.defaultPayMethod()));
    })().catch(() => {});
  }, []));

  async function pickPayMethod(m: PayMethod) {
    setDefaultPay(m);
    setShowPayMethod(false);
    await settings.setDefaultPayMethod(m);
  }

  async function pickCadence(c: BudgetCadence) {
    setDefaultCadence(c);
    setShowCadence(false);
    await settings.setDefaultCadence(c);
  }

  return (
    <>
      <ListRow
        leading={<PayMethodDisc method={defaultPay} size={layout.iconCircle} color={tint} />}
        title="Usually paid from"
        value={PAY_METHOD_LABEL[defaultPay]}
        onPress={() => setShowPayMethod(true)}
        accessibilityLabel="Usually paid from"
      />
      <View style={settingsRowDivider} />
      <SettingsRow icon="repeat" label="Default budget cadence" tint={tint} value={CADENCE_LABELS[defaultCadence]} onPress={() => setShowCadence(true)} />
      <View style={settingsRowDivider} />
      <MoneySettingsRows tint={tint} />

      {/* Reuses the Add screen's own picker, so the tiles here are the tiles the
          preference actually seeds — not a second list that could drift from it. */}
      <SheetModal visible={showPayMethod} onClose={() => setShowPayMethod(false)} title="Where do you usually pay from?" scroll={false}>
        <PayMethodSelector value={defaultPay} onChange={pickPayMethod} />
      </SheetModal>

      <SheetModal visible={showCadence} onClose={() => setShowCadence(false)} title="Default budget cadence" scroll={false}>
        {CADENCE_KEYS.map(c => (
          <TouchableOpacity key={c} style={[styles.cadOption, defaultCadence === c && styles.cadOptionActive]} accessibilityState={{ selected: defaultCadence === c }} onPress={() => pickCadence(c)} accessibilityRole="button">
            <Text style={[styles.cadOptionText, defaultCadence === c && { color: colors.accent, fontFamily: 'Inter_600SemiBold' }]}>{CADENCE_LABELS[c]}</Text>
            {defaultCadence === c && <Feather name="check" size={18} color={colors.accent} />}
          </TouchableOpacity>
        ))}
      </SheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  cadOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  cadOptionActive: { backgroundColor: colors.accentMuted },
  cadOptionText: { ...type.body, color: colors.textPrimary },
});
