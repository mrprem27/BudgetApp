import { CURRENCY_MAP, DEFAULT_CURRENCY, type CurrencyCode } from '../constants/currencies';

export function formatRupees(paise: number): string {
  return '₹' + (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Rounded, no paise — for dashboard cards and summaries. e.g. 150050 → "₹1,501". */
export function formatRupeesShort(paise: number): string {
  return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
}

/** Multi-currency formatter: formats smallest unit (paise/cents) to display string */
export function formatAmount(smallestUnit: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const def = CURRENCY_MAP[currency];
  const divisor = def.decimals > 0 ? Math.pow(10, def.decimals) : 1;
  const value = smallestUnit / divisor;
  return def.symbol + value.toLocaleString(def.locale, {
    minimumFractionDigits: def.decimals,
    maximumFractionDigits: def.decimals,
  });
}

/** Short (no decimal) multi-currency format for cards/summaries */
export function formatAmountShort(smallestUnit: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const def = CURRENCY_MAP[currency];
  const divisor = def.decimals > 0 ? Math.pow(10, def.decimals) : 1;
  return def.symbol + Math.round(smallestUnit / divisor).toLocaleString(def.locale);
}

/**
 * Round to up to `decimals` places, then drop trailing zeros:
 * "1.00L"→"1L", "1.20L"→"1.2L", "1.24K" stays. K/L/Cr all use 2-decimal
 * precision so summary math stays honest (0.1L = ₹10,000), but we never show
 * padding zeros after the decimal.
 */
function compactNum(n: number, decimals: number): string {
  let s = (Math.round(n * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

/**
 * App-wide rule for a period-over-period change shown in a tight label: a plain
 * percentage up to ±100%, but past +100% it switches to a multiple of the
 * baseline because "230% more" reads worse than "3.3×". Returns only the
 * magnitude token (no "vs …" suffix) so callers append their own period label.
 *   45  → "45%"   (1.45× baseline)
 *   230 → "3.3×"  (3.3× baseline)
 *   -30 → "30%"
 * A spend can't drop below 0, so deltaPct never goes past −100 — only increases
 * cross the 100 threshold. This is the single source of truth for the %/×
 * choice (there is no user toggle).
 */
export function formatChangeMagnitude(deltaPct: number): string {
  if (!isFinite(deltaPct)) return '0%';
  if (Math.abs(deltaPct) > 100) return `${compactNum(1 + deltaPct / 100, 1)}×`;
  return `${Math.round(Math.abs(deltaPct))}%`;
}

/**
 * Sentence-form of {@link formatChangeMagnitude} for insight copy that slots
 * into "<Category> is <fragment>". Same >100%→× rule, with direction words:
 *   40   → "up 40% from last month"
 *   -30  → "down 30% from last month"
 *   230  → "3.3× last month"
 * Baseline is assumed > 0 (callers gate on that).
 */
export function formatComparison(deltaPct: number): string {
  if (Math.abs(deltaPct) > 100) return `${compactNum(1 + deltaPct / 100, 1)}× last month`;
  const up = deltaPct >= 0;
  return `${up ? 'up' : 'down'} ${Math.abs(Math.round(deltaPct))}% from last month`;
}

/**
 * Abbreviate a value already in major units (rupees / dollars) — for chart
 * axis labels (chart data is stored divided by 100) and other space-tight
 * spots. INR uses the Indian scale (K, L, Cr); every other currency uses the
 * international scale (K, M, B). Values under 1000 stay as grouped integers.
 * Negative / NaN / Infinity safe.
 */
export function formatCompactMajor(value: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const def = CURRENCY_MAP[currency];
  if (!isFinite(value)) return def.symbol + '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs < 1000) {
    return sign + def.symbol + Math.round(abs).toLocaleString(def.locale);
  }

  let body: string;
  if (currency === 'INR') {
    if (abs >= 1e7) body = compactNum(abs / 1e7, 2) + 'Cr';
    else if (abs >= 1e5) body = compactNum(abs / 1e5, 2) + 'L';
    else body = compactNum(abs / 1e3, 2) + 'K';
  } else {
    if (abs >= 1e9) body = compactNum(abs / 1e9, 2) + 'B';
    else if (abs >= 1e6) body = compactNum(abs / 1e6, 2) + 'M';
    else body = compactNum(abs / 1e3, 2) + 'K';
  }
  return sign + def.symbol + body;
}

/**
 * Abbreviate a smallest-unit amount (paise / cents). Wraps
 * {@link formatCompactMajor} after converting to major units. Use on
 * dashboard cards, legends and anywhere a full amount would overflow.
 */
export function formatCompact(smallestUnit: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const def = CURRENCY_MAP[currency];
  if (!isFinite(smallestUnit)) return def.symbol + '0';
  const divisor = def.decimals > 0 ? Math.pow(10, def.decimals) : 1;
  return formatCompactMajor(smallestUnit / divisor, currency);
}

/** Hard cap on a single amount: up to 12 integer digits of rupees. Prevents
 *  absurd/overflow values from entering the DB and blowing out compact
 *  formatting; stays well inside Number.MAX_SAFE_INTEGER even in paise. */
export const MAX_INT_DIGITS = 12;
export const MAX_PAISE = (10 ** MAX_INT_DIGITS - 1) * 100;

/** Keep only digits + a single decimal point (max 2 places), and cap the
 *  integer part to MAX_INT_DIGITS, from typed amount input. */
export function sanitizeAmountInput(text: string): string {
  let cleaned = text.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) cleaned = parts[0] + '.' + parts.slice(1).join('');
  const [intPart, decPart] = cleaned.split('.');
  const intCapped = (intPart ?? '').slice(0, MAX_INT_DIGITS);
  return decPart !== undefined ? `${intCapped}.${decPart.slice(0, 2)}` : intCapped;
}

/** Display a raw amount string as "₹10,000" (en-IN grouping), preserving an in-progress decimal. */
export function formatAmountInput(raw: string): string {
  if (!raw) return '';
  const [intPart, decPart] = raw.split('.');
  const grouped = intPart ? Number(intPart).toLocaleString('en-IN') : '0';
  return raw.includes('.') ? `₹${grouped}.${decPart ?? ''}` : `₹${grouped}`;
}

export function parseToPaise(input: string): number {
  const n = parseFloat(input.replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return 0;
  // Clamp to the app-wide max so an over-long paste can't overflow layouts/math.
  return Math.min(Math.round(n * 100), MAX_PAISE);
}

/** Compact ₹ axis/short label, e.g. ₹0, ₹450, ₹12K, ₹2L, ₹1Cr. Accepts the
 *  string gifted-charts passes to formatYLabel, or a number. */
export function formatAxisShort(v: string | number): string {
  const n = Math.round(Number(v));
  if (!isFinite(n)) return '₹0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return sign + '₹' + abs;
  if (abs < 100000) return sign + '₹' + Math.round(abs / 1000) + 'K';
  if (abs < 10000000) return sign + '₹' + Math.round(abs / 100000) + 'L';
  return sign + '₹' + Math.round(abs / 10000000) + 'Cr';
}

export function splitEqual(total: number, n: number): number[] {
  if (n === 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function splitByPercent(total: number, percentages: number[]): number[] {
  const raw = percentages.map(p => Math.floor((total * p) / 100));
  const assigned = raw.reduce((a, b) => a + b, 0);
  let remainder = total - assigned;
  return raw.map(v => {
    if (remainder > 0) { remainder--; return v + 1; }
    return v;
  });
}

export function splitByShares(total: number, ratios: number[]): number[] {
  const sum = ratios.reduce((a, b) => a + b, 0);
  if (sum === 0) return ratios.map(() => 0);
  const scaled = ratios.map(r => Math.floor((total * r) / sum));
  const assigned = scaled.reduce((a, b) => a + b, 0);
  let remainder = total - assigned;
  return scaled.map(v => {
    if (remainder > 0) { remainder--; return v + 1; }
    return v;
  });
}

/**
 * Split a total (paise) among member ids by mode → { id: paise }. The single
 * split engine reused by Quick, Itemized and the import group-split. `values`
 * holds the per-member raw input (₹ for exact, % for percent, count for shares);
 * ignored for equal. Exact reads inputs verbatim (any shortfall is the user's
 * remainder to reconcile).
 */
export function splitByMode(
  total: number,
  ids: string[],
  mode: 'equal' | 'exact' | 'percent' | 'shares',
  values: Record<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (ids.length === 0) return out;
  if (mode === 'exact') {
    ids.forEach(id => { out[id] = parseToPaise(values[id] ?? '0'); });
  } else if (mode === 'percent') {
    const pcts = ids.map(id => { const p = parseInt(values[id] ?? '0', 10); return Number.isFinite(p) ? p : 0; });
    const amts = splitByPercent(total, pcts);
    ids.forEach((id, i) => { out[id] = amts[i]; });
  } else if (mode === 'shares') {
    const rs = ids.map(id => { const r = parseInt(values[id] ?? '1', 10); return Number.isFinite(r) && r > 0 ? r : 1; });
    const amts = splitByShares(total, rs);
    ids.forEach((id, i) => { out[id] = amts[i]; });
  } else {
    const amts = splitEqual(total, ids.length);
    ids.forEach((id, i) => { out[id] = amts[i]; });
  }
  return out;
}
