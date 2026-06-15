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
