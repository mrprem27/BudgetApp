import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SettingsRow, settingsRowDivider } from '../../ui/SettingsRow';
import { SheetModal } from '../../ui/SheetModal';
import { OptionRow } from '../../ui/OptionRow';
import { Chip } from '../../ui/Chip';
import { Card } from '../../ui/Card';
import { AmountRow } from '../../ui/AmountRow';
import { PrimaryButton } from '../../ui/PrimaryButton';
import { space } from '../../tokens';
import { useDataRefresh } from '../../system/DataRefreshProvider';
import { getMoneySettings, setMoneySettings } from '../../../lib/moneySettingsStore';
import { DEFAULT_MONEY_SETTINGS, type MoneySettings, type PayCycle, type LookAhead, type KeepAside } from '../../../lib/engine/moneySettings';
import { formatCompact, parseToPaise, paiseToInput } from '../../../lib/money';

const CYCLE: { key: PayCycle; label: string; hint?: string }[] = [
  { key: 'auto', label: 'Work it out from my income', hint: 'From the income you log as recurring' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'twice', label: 'Twice a month' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'daily', label: 'Daily' },
  { key: 'irregular', label: 'Irregular', hint: 'Looks 60 days ahead, since there is no next date' },
];
const AHEAD: { key: LookAhead; label: string }[] = [
  { key: 'payday', label: 'Until my next payday' },
  { key: '7', label: 'The next 7 days' },
  { key: '30', label: 'The next 30 days' },
  { key: 'monthEnd', label: 'Until the end of the month' },
];
const KEEP: { key: KeepAside; label: string; hint?: string }[] = [
  { key: 'week', label: 'A week of essentials', hint: 'What you usually spend on needs in 7 days' },
  { key: 'month', label: 'A month of essentials' },
  { key: 'custom', label: 'An amount I choose' },
  { key: 'none', label: 'Nothing' },
];
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function cycleValue(s: MoneySettings): string {
  if (s.payCycle === 'auto') return 'Automatic';
  if (s.payCycle === 'monthly') return `Monthly · ${s.payDay ?? 1}`;
  if (s.payCycle === 'twice') return `Twice · ${s.payDay ?? 1} & ${(s.payDay ?? 1) <= 15 ? (s.payDay ?? 1) + 15 : (s.payDay ?? 1) - 15}`;
  if (s.payCycle === 'weekly') return `Weekly · ${WEEKDAY[s.payDay ?? 1].slice(0, 3)}`;
  return CYCLE.find(c => c.key === s.payCycle)!.label;
}

type Sheet = 'cycle' | 'day' | 'ahead' | 'keep' | 'amount' | null;

/**
 * How you're paid, how far Safe to spend looks ahead, and what it keeps aside (`SPEC-ENGINE.md`
 * §10b, `U-33`). Three rows in Settings' Preferences, each one question in its own sheet. Every
 * change refreshes the screens, since Safe to spend, Afford and the low-point warning all move.
 */
export function MoneySettingsRows({ tint }: { tint: string }) {
  const { refresh } = useDataRefresh();
  const [s, setS] = useState<MoneySettings>(DEFAULT_MONEY_SETTINGS);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [amountText, setAmountText] = useState('');
  useEffect(() => { getMoneySettings().then(setS).catch(() => {}); }, []);

  async function save(patch: Partial<MoneySettings>, next: Sheet = null) {
    setS(await setMoneySettings(patch));
    setSheet(next);
    refresh();
  }

  const keepValue = s.keepAside === 'custom' ? formatCompact(s.keepAsideAmount) : KEEP.find(k => k.key === s.keepAside)!.label;

  return (
    <>
      <SettingsRow icon="calendar" label="How you're paid" tint={tint} value={cycleValue(s)} onPress={() => setSheet('cycle')} />
      <View style={settingsRowDivider} />
      <SettingsRow icon="eye" label="Safe to spend looks ahead" tint={tint} value={AHEAD.find(a => a.key === s.lookAhead)!.label.replace('Until my ', '').replace('The next ', '')} onPress={() => setSheet('ahead')} />
      <View style={settingsRowDivider} />
      <SettingsRow icon="shield" label="Keep aside" tint={tint} value={keepValue} onPress={() => setSheet('keep')} />

      <SheetModal visible={sheet === 'cycle'} onClose={() => setSheet(null)} title="How are you paid?">
        <View style={styles.list}>
          {CYCLE.map(c => (
            <OptionRow key={c.key} label={c.label} description={c.hint} selected={s.payCycle === c.key}
              onPress={() => save({ payCycle: c.key, payDay: null }, ['monthly', 'twice', 'weekly'].includes(c.key) ? 'day' : null)} />
          ))}
        </View>
      </SheetModal>

      <SheetModal visible={sheet === 'day'} onClose={() => setSheet(null)} title={s.payCycle === 'weekly' ? 'Which day of the week?' : 'Which day of the month?'}>
        {s.payCycle === 'weekly' ? (
          <View style={styles.list}>
            {WEEKDAY.map((w, i) => <OptionRow key={w} label={w} selected={(s.payDay ?? 1) === i} onPress={() => save({ payDay: i })} />)}
          </View>
        ) : (
          <View style={styles.days}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <Chip key={d} label={String(d)} selected={(s.payDay ?? 1) === d} onPress={() => save({ payDay: d })} />
            ))}
          </View>
        )}
      </SheetModal>

      <SheetModal visible={sheet === 'ahead'} onClose={() => setSheet(null)} title="Safe to spend looks ahead">
        <View style={styles.list}>
          {AHEAD.map(a => <OptionRow key={a.key} label={a.label} selected={s.lookAhead === a.key} onPress={() => save({ lookAhead: a.key })} />)}
        </View>
      </SheetModal>

      <SheetModal visible={sheet === 'keep'} onClose={() => setSheet(null)} title="Keep aside">
        <View style={styles.list}>
          {KEEP.map(k => (
            <OptionRow key={k.key} label={k.label} description={k.hint} selected={s.keepAside === k.key}
              onPress={() => {
                if (k.key === 'custom') { setAmountText(s.keepAsideAmount ? paiseToInput(s.keepAsideAmount) : ''); setSheet('amount'); }
                else save({ keepAside: k.key });
              }} />
          ))}
        </View>
      </SheetModal>

      <SheetModal visible={sheet === 'amount'} onClose={() => setSheet(null)} title="Keep aside">
        <Card clip style={styles.amount}>
          <AmountRow icon="shield" label="Amount" value={amountText} onChangeText={setAmountText} autoFocus />
        </Card>
        <PrimaryButton label="Save" disabled={parseToPaise(amountText) <= 0}
          onPress={() => save({ keepAside: 'custom', keepAsideAmount: parseToPaise(amountText) })} />
      </SheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  amount: { marginBottom: space.md },
});
