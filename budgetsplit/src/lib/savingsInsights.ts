import { format } from 'date-fns';
import { formatCompact } from './money';
import { estimatedCompletion } from './savings';
import type { Priority, SavingsFrequency } from '../db/queries/savings';

export type InsightTone = 'compare' | 'progress' | 'achieve' | 'motivate' | 'warn';
/** `icon` is a Feather icon name — the app uses Feather icons everywhere, never emoji. */
export type Insight = { icon: string; text: string; tone: InsightTone; goalId?: string };

export type InsightGoal = {
  id: string; name: string; saved: number; target: number; remaining: number;
  priority: Priority; allocation: number; frequency: SavingsFrequency;
};
export type CategorySpend = { category: string; amount: number }; // last 30 days, my share
export type InsightContext = { goals: InsightGoal[]; spend: CategorySpend[] };

type Cand = Insight & { score: number };

const fmt = formatCompact;

/**
 * Generate psychological savings insights from real spending + goals. Builds a
 * candidate pool (opportunity-cost comparisons, progress, achievement,
 * projection), scores by emotional impact, jitters slightly for freshness, then
 * picks a varied set (diverse tone + goal). Pure — pass a deterministic `rng`
 * in tests. The aim is opportunity-cost awareness, never guilt.
 */
export function generateInsights(ctx: InsightContext, maxN = 3, rng: () => number = Math.random): Insight[] {
  const goals = ctx.goals.filter(g => g.target > 0);
  const topSpend = ctx.spend.filter(s => s.amount > 0).slice(0, 4);
  const cands: Cand[] = [];

  for (const g of goals) {
    if (g.remaining <= 0) {
      cands.push({ icon: 'check-circle', tone: 'achieve', goalId: g.id, score: 45, text: `You fully funded your ${g.name} goal. Time for the next one!` });
      continue;
    }
    const pct = Math.round((g.saved / g.target) * 100);

    if (pct >= 70) {
      cands.push({ icon: 'trending-up', tone: 'progress', goalId: g.id, score: 62 + (g.priority === 'high' ? 12 : 0), text: `You're closer than you think — only ${fmt(g.remaining)} left on your ${g.name} goal.` });
    } else if (pct >= 35) {
      cands.push({ icon: 'zap', tone: 'achieve', goalId: g.id, score: 36, text: `You're ${pct}% of the way to your ${g.name} goal — keep going.` });
    }

    const est = estimatedCompletion(g.remaining, g.allocation, g.frequency);
    if (est) {
      cands.push({ icon: 'calendar', tone: 'motivate', goalId: g.id, score: 40, text: `At ${fmt(g.allocation)}/${g.frequency}, you'll reach your ${g.name} goal by ${format(est.date, 'MMM yyyy')}.` });
    }

    for (const s of topSpend) {
      const pctOfGoal = Math.round((s.amount / g.target) * 100);
      if (s.amount >= g.remaining) {
        cands.push({ icon: 'target', tone: 'warn', goalId: g.id, score: 82, text: `The ${fmt(s.amount)} you spent on ${s.category} in 30 days could fully fund your ${g.name} goal.` });
      } else if (Math.floor(s.amount / 2) >= g.remaining) {
        cands.push({ icon: 'alert-circle', tone: 'warn', goalId: g.id, score: 72, text: `Skipping half your ${s.category} spend would fully fund your ${g.name} goal.` });
      } else if (pctOfGoal >= 5) {
        cands.push({ icon: 'bar-chart-2', tone: 'compare', goalId: g.id, score: 28 + Math.min(40, pctOfGoal), text: `You spent ${fmt(s.amount)} on ${s.category} in 30 days — that's ${pctOfGoal}% of your ${g.name} goal.` });
      }
    }
  }

  for (const c of cands) c.score += rng() * 6; // freshness / rarity jitter
  cands.sort((a, b) => b.score - a.score);

  // Pick with diversity: distinct tone + goal, then relax in passes.
  const picked: Insight[] = [];
  const tones = new Set<string>();
  const usedGoals = new Set<string>();
  const seen = new Set<string>();
  const take = (c: Cand) => {
    picked.push({ icon: c.icon, text: c.text, tone: c.tone, goalId: c.goalId });
    tones.add(c.tone); if (c.goalId) usedGoals.add(c.goalId); seen.add(c.text);
  };
  for (const c of cands) { if (picked.length >= maxN) break; if (!tones.has(c.tone) && !(c.goalId && usedGoals.has(c.goalId))) take(c); }
  for (const c of cands) { if (picked.length >= maxN) break; if (!seen.has(c.text) && !tones.has(c.tone)) take(c); }
  for (const c of cands) { if (picked.length >= maxN) break; if (!seen.has(c.text)) take(c); }
  return picked;
}
