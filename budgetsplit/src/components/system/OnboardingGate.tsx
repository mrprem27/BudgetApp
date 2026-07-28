import React, { useEffect, useState } from 'react';
import { settings } from '../../lib/settings';
import { Onboarding } from './Onboarding';
import { BrandedLoader } from './BrandedLoader';
import { useFeatureFlags } from './FeatureFlagsProvider';

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'onboarding' | 'done'>('loading');
  const { reload: reloadFlags } = useFeatureFlags();

  useEffect(() => {
    (async () => {
      try {
        setStatus((await settings.onboardingDone()) ? 'done' : 'onboarding');
      } catch {
        setStatus('onboarding');
      }
    })();
  }, []);

  async function complete() {
    try {
      // Pick up the flags the persona just wrote. This provider sits above the gate,
      // so it loaded before the questionnaire ran — without this the first session
      // would ignore the answer. Best-effort: never block the gate from opening.
      await reloadFlags();
    } catch { /* fall through */ }
    try {
      await settings.setOnboardingDone(true);
    } finally {
      setStatus('done');
    }
  }

  if (status === 'loading') {
    return <BrandedLoader />;
  }

  if (status === 'onboarding') {
    return <Onboarding onDone={complete} />;
  }

  return <>{children}</>;
}
