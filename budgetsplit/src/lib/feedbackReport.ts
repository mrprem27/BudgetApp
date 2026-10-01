import { apiFailed, apiServiceLabel, apiStatusLabel, type ApiLogEntry } from './apiLog';

/**
 * A tester's feedback as one message to share (`U-104`): what they wrote, then, if they leave it
 * on, what helps explain it — the build, the slowest screens and the calls that failed since the
 * app opened. No amounts, names or entries: screens are routes by shape (`/group/[id]`) and a
 * call is its route, status and the server's error text.
 */
export function buildFeedbackReport(input: {
  text: string;
  appVersion: string;
  platform: string;
  includeDetails: boolean;
  loads: { path: string; worst: number; count: number }[];
  calls: ApiLogEntry[];
}): string {
  const said = input.text.trim() || '(nothing written)';
  if (!input.includeDetails) return `BudgetSplit feedback\n\n${said}`;

  const slow = input.loads.slice(0, 5).map(l => `  ${l.path}: ${l.worst} ms (${l.count} ${l.count === 1 ? 'load' : 'loads'})`);
  const failed = input.calls.filter(apiFailed).slice(0, 10)
    .map(c => `  ${apiServiceLabel(c.service)} · ${c.what} · ${apiStatusLabel(c)}${c.detail ? `\n    ${c.detail.slice(0, 300)}` : ''}`);
  return [
    'BudgetSplit feedback',
    '',
    said,
    '',
    `Build: ${input.appVersion} · ${input.platform}`,
    `Slowest screens:${slow.length ? `\n${slow.join('\n')}` : ' none recorded'}`,
    `Failed calls:${failed.length ? `\n${failed.join('\n')}` : ' none'}`,
  ].join('\n');
}
