import React, { createContext, useContext, useEffect, useState } from 'react';
import { settings } from '../../lib/settings';
import { Onboarding } from './Onboarding';
import { BrandedLoader } from './BrandedLoader';
import { useFeatureFlags } from './FeatureFlagsProvider';

type Props = {
  children: React.ReactNode;
  /**
   * Whether onboarding was already done, read by the root boot effect in
   * parallel with opening the DB (`app/_layout.tsx`). When given, this gate
   * starts resolved — no second AsyncStorage read, and so no second loader,
   * between the root's one loader and the first real screen. Omit it
   * (existing callers, tests) and the gate reads for itself as before.
   */
  initialDone?: boolean;
};

/** Send the app back to Welcome, as on a fresh install — after the sign-out wipe. */
const RestartContext = createContext<() => void>(() => {});
export const useRestartOnboarding = () => useContext(RestartContext);

export function OnboardingGate({ children, initialDone }: Props) {
  const [status, setStatus] = useState<'loading' | 'onboarding' | 'done'>(
    () => (initialDone === undefined ? 'loading' : initialDone ? 'done' : 'onboarding'),
  );
  const { reload: reloadFlags } = useFeatureFlags();

  useEffect(() => {
    // Already resolved from the root boot effect — nothing to do.
    if (initialDone !== undefined) return;
    (async () => {
      try {
        setStatus((await settings.onboardingDone()) ? 'done' : 'onboarding');
      } catch {
        setStatus('onboarding');
      }
    })();
  }, [initialDone]);

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

  return <RestartContext.Provider value={() => setStatus('onboarding')}>{children}</RestartContext.Provider>;
}
