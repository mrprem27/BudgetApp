import AsyncStorage from '@react-native-async-storage/async-storage';
import { ComparisonFormat } from './money';

/**
 * User-facing display preferences that aren't feature toggles — how things are
 * *shown*, not whether they exist. Currently: whether insight comparisons read
 * as percentages ("up 40%") or multiples ("1.4×").
 */

const COMPARISON_FORMAT_KEY = 'insights_comparison_format';

export async function getComparisonFormat(): Promise<ComparisonFormat> {
  try {
    const v = await AsyncStorage.getItem(COMPARISON_FORMAT_KEY);
    return v === ComparisonFormat.Multiple ? ComparisonFormat.Multiple : ComparisonFormat.Percent;
  } catch {
    return ComparisonFormat.Percent;
  }
}

export async function setComparisonFormat(format: ComparisonFormat): Promise<void> {
  try { await AsyncStorage.setItem(COMPARISON_FORMAT_KEY, format); } catch { /* best-effort */ }
}
