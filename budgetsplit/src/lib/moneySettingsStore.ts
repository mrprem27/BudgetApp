import { bumpPrefs } from './prefsVersion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_MONEY_SETTINGS, type MoneySettings, type PayCycle, type LookAhead, type KeepAside } from './engine/moneySettings';

/**
 * Where your money settings live (§10b, `U-33`): on this phone. They are about you, not a ledger,
 * and syncing them would need a server column — worth it once they have been used, not before.
 */
const KEY = 'money_settings_v1';

const CYCLES: PayCycle[] = ['auto', 'monthly', 'twice', 'weekly', 'daily', 'irregular'];
const AHEAD: LookAhead[] = ['payday', '7', '30', 'monthEnd'];
const KEEP: KeepAside[] = ['week', 'none', 'month', 'custom'];

/** A stored value that no longer parses falls back per field, never throws. */
export async function getMoneySettings(): Promise<MoneySettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_MONEY_SETTINGS;
    const p = JSON.parse(raw) as Partial<MoneySettings>;
    return {
      payCycle: CYCLES.includes(p.payCycle as PayCycle) ? p.payCycle! : DEFAULT_MONEY_SETTINGS.payCycle,
      payDay: typeof p.payDay === 'number' ? p.payDay : null,
      lookAhead: AHEAD.includes(p.lookAhead as LookAhead) ? p.lookAhead! : DEFAULT_MONEY_SETTINGS.lookAhead,
      keepAside: KEEP.includes(p.keepAside as KeepAside) ? p.keepAside! : DEFAULT_MONEY_SETTINGS.keepAside,
      keepAsideAmount: typeof p.keepAsideAmount === 'number' && p.keepAsideAmount >= 0 ? p.keepAsideAmount : 0,
    };
  } catch {
    return DEFAULT_MONEY_SETTINGS;
  }
}

export async function setMoneySettings(patch: Partial<MoneySettings>): Promise<MoneySettings> {
  const next = { ...(await getMoneySettings()), ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  bumpPrefs();
  return next;
}
