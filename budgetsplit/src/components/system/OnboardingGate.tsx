import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Onboarding } from './Onboarding';
import { BrandedLoader } from './BrandedLoader';

const KEY = 'onboarding_done';

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'onboarding' | 'done'>('loading');

  useEffect(() => {
    (async () => {
      const val = await AsyncStorage.getItem(KEY);
      setStatus(val === 'true' ? 'done' : 'onboarding');
    })();
  }, []);

  async function complete() {
    await AsyncStorage.setItem(KEY, 'true');
    setStatus('done');
  }

  if (status === 'loading') {
    return <BrandedLoader />;
  }

  if (status === 'onboarding') {
    return <Onboarding onDone={complete} />;
  }

  return <>{children}</>;
}
