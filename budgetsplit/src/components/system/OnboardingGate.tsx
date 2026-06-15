import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../constants/colors';
import { Onboarding } from './Onboarding';

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
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (status === 'onboarding') {
    return <Onboarding onDone={complete} />;
  }

  return <>{children}</>;
}
