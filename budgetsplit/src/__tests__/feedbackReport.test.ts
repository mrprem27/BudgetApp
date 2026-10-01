import { buildFeedbackReport } from '../lib/feedbackReport';

/** What a tester shares from Help (`U-104`): their words, and only then what explains them. */
const base = {
  appVersion: '2.0.0', platform: 'ios',
  loads: [{ path: '/reports', worst: 565, count: 2 }, { path: '/group/[id]', worst: 120, count: 1 }],
  calls: [
    { at: 2, service: 'scan' as const, what: 'Read receipt', status: 502, ms: 900, detail: 'Gemini request failed (429)' },
    { at: 1, service: 'server' as const, what: 'POST /sync/push', status: 200, ms: 100 },
  ],
};

describe('a feedback message', () => {
  it('leads with what was written, then the build, the slow screens and the failed calls', () => {
    const msg = buildFeedbackReport({ ...base, text: ' The scan failed twice. ', includeDetails: true });
    expect(msg).toBe([
      'BudgetSplit feedback', '', 'The scan failed twice.', '',
      'Build: 2.0.0 · ios',
      'Slowest screens:\n  /reports: 565 ms (2 loads)\n  /group/[id]: 120 ms (1 load)',
      'Failed calls:\n  Receipt scan · Read receipt · 502\n    Gemini request failed (429)',
    ].join('\n'));
  });

  it('is only the words when details are switched off', () => {
    const msg = buildFeedbackReport({ ...base, text: 'Looks good', includeDetails: false });
    expect(msg).toBe('BudgetSplit feedback\n\nLooks good');
    expect(msg).not.toMatch(/reports|Gemini/);
  });

  it('says so when there is nothing to attach or nothing was written', () => {
    const msg = buildFeedbackReport({ ...base, loads: [], calls: [], text: '', includeDetails: true });
    expect(msg).toContain('(nothing written)');
    expect(msg).toContain('Slowest screens: none recorded');
    expect(msg).toContain('Failed calls: none');
  });
});
