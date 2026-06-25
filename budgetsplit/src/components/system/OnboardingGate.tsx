import React, { useEffect, useState } from 'react';
import { settings } from '../../lib/settings';
import { Onboarding } from './Onboarding';
import { BrandedLoader } from './BrandedLoader';

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'onboarding' | 'done'>('loading');

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
