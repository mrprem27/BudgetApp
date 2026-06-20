/**
 * Subscription detection — pure, on-device. Spots likely recurring charges the
 * user logs manually (same category + amount repeating at a regular cadence) so
 * we can surface "looks like a subscription". Already-recurring entries (with a
 * parent rule) should be filtered out by the caller. No network, no ML.
 */
export type DetectTxn = { category: string; amount: number; date: number };

export type DetectedSub = {
  category: string;
  amount: number;        // per-charge amount (paise)
  count: number;         // how many times seen
  cadence: 'weekly' | 'fortnightly' | 'monthly';
  lastDate: number;
  monthlyEquivalent: number; // normalized monthly cost (paise)
};

const DAY = 24 * 60 * 60 * 1000;
const MIN_OCCURRENCES = 3;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function cadenceFromGap(days: number): DetectedSub['cadence'] | null {
  if (days >= 6 && days <= 9) return 'weekly';
  if (days >= 12 && days <= 18) return 'fortnightly';
  if (days >= 25 && days <= 35) return 'monthly';
  return null;
}

const MONTHLY_FACTOR: Record<DetectedSub['cadence'], number> = { weekly: 4.345, fortnightly: 2.173, monthly: 1 };

/** Detect likely subscriptions from a flat list of expense transactions. */
export function detectSubscriptions(txns: DetectTxn[]): DetectedSub[] {
  const groups = new Map<string, DetectTxn[]>();
  for (const t of txns) {
    if (t.amount <= 0) continue;
    const key = `${t.category}|${t.amount}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const out: DetectedSub[] = [];
  for (const arr of groups.values()) {
    if (arr.length < MIN_OCCURRENCES) continue;
    const dates = arr.map(t => t.date).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / DAY);
    const med = median(gaps);
    // Require regularity: every gap must sit within ±40% of the median, so
    // two wildly different gaps (e.g. 3 and 47 days) aren't read as "monthly".
    const maxDev = Math.max(...gaps.map(g => Math.abs(g - med)));
    if (med <= 0 || maxDev > med * 0.4) continue;
    const cadence = cadenceFromGap(med);
    if (!cadence) continue;
    out.push({
      category: arr[0].category,
      amount: arr[0].amount,
      count: arr.length,
      cadence,
      lastDate: dates[dates.length - 1],
      monthlyEquivalent: Math.round(arr[0].amount * MONTHLY_FACTOR[cadence]),
    });
  }
  return out.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}
