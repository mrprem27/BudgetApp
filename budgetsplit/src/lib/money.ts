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
 * Round to `decimals` and drop trailing zeros: "1.00L"→"1L", "1.50L"→"1.5L",
 * "1.45L" stays. Larger units carry more decimals because one decimal there is
 * too coarse (0.1L = ₹10,000) — keeps summary math honest.
 */
function compactNum(n: number, decimals: number): string {
  let s = (Math.round(n * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
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
    else body = compactNum(abs / 1e3, 1) + 'K';
  } else {
    if (abs >= 1e9) body = compactNum(abs / 1e9, 2) + 'B';
    else if (abs >= 1e6) body = compactNum(abs / 1e6, 2) + 'M';
    else body = compactNum(abs / 1e3, 1) + 'K';
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

export function parseToPaise(input: string): number {
  const n = parseFloat(input.replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
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
