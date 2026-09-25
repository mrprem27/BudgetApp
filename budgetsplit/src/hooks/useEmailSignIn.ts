import { useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { EMAIL_RE } from '../lib/email';
import { haptic } from '../lib/haptics';
import {
  requestMagicLink, verifyMagicLink, extractAuthToken, signOut, getStoredSession, type ServerUser,
} from '../lib/serverApi';
import { decideFirstSignInNow, restoreNow, uploadNow, type Account } from '../lib/sync';
import { useDataRefresh } from '../components/system/DataRefreshProvider';

/** How the first sign-in ended (SPEC-SERVER.md §4). `restored`: the phone now holds the account's data. */
export type SignInOutcome = { restored: boolean };
/** `failed` has already been put in `error`. */
export type SignInResult = 'signed-in' | 'not-now' | 'failed';

/**
 * Email → code → account, as one hook, shared by onboarding's sign-in step and
 * `settings/account.tsx` so the two can't drift on what a valid address is, what
 * the server errors say, or how a phone meets an account.
 *
 * **Code, not the emailed link, is the primary path here** — deliberately.
 * The link opens `budgetsplit:///auth?token=…`, which `app/auth.tsx` handles
 * as a Stack route; `OnboardingGate` renders `Onboarding` *instead of* the
 * Stack until onboarding is done, so a tap on that link during onboarding has
 * nowhere to land.
 *
 * After the code is accepted, the first sign-in decides what happens to the data
 * (`lib/sync/firstSignIn`): upload this phone, restore the account onto it, or
 * — when both hold data — ask. `onVerified` fires once that is settled, with
 * whether the phone was replaced; "Not now" signs out and never fires it.
 */
export function useEmailSignIn({ onVerified }: {
  onVerified?: (user: ServerUser, outcome: SignInOutcome) => void | Promise<void>;
} = {}) {
  const db = useSQLiteContext();
  const { refresh } = useDataRefresh();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  /** 0–1 through restoring the account onto this phone; null when not restoring. */
  const [restoring, setRestoring] = useState<number | null>(null);
  /** Both hold data: the screen shows `FirstSignInStep kind="ask"` until `answer` is called. */
  const [asking, setAsking] = useState(false);
  const answerRef = useRef<((choice: 'use-my-account' | 'not-now') => void) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

  async function sendLink() {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) { setError('That doesn’t look like an email address.'); return; }
    setSending(true);
    setError(null);
    try {
      await requestMagicLink(address);
      setSentTo(address);
      setCode('');
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(message(e));
    } finally {
      setSending(false);
    }
  }

  async function restore(account: Account, exportFirst: boolean): Promise<void> {
    setRestoring(0);
    try {
      await restoreNow(db, account, { exportFirst, onProgress: setRestoring });
    } finally {
      setRestoring(null);
    }
  }

  /**
   * Both hold data (`DQ-94`): wait for the person to choose on the full-screen
   * step. Resolves with the outcome, or null for "Not now" (signed out).
   */
  async function ask(account: Account): Promise<SignInOutcome | null> {
    setAsking(true);
    const choice = await new Promise<'use-my-account' | 'not-now'>(resolve => { answerRef.current = resolve; });
    answerRef.current = null;
    setAsking(false);
    if (choice === 'not-now') { await signOut(); return null; }
    await restore(account, true);
    return { restored: true };
  }

  /** The two buttons of the "both have data" step. */
  function answer(choice: 'use-my-account' | 'not-now') {
    answerRef.current?.(choice);
  }

  async function settle(user: ServerUser): Promise<SignInOutcome | null> {
    const account: Account = { userId: user.id, email: user.email, name: user.name };
    const kase = await decideFirstSignInNow(db, user.id);
    if (kase === 'restore') { await restore(account, false); return { restored: true }; }
    if (kase === 'ask') return ask(account);
    if (kase === 'upload') await uploadNow(db, account, refresh);
    return { restored: false };
  }

  function verifyCode(): Promise<SignInResult> {
    const token = extractAuthToken(code);
    if (!token) { setError('That code doesn’t look right. Copy the whole code from the email.'); return Promise.resolve('failed'); }
    return signInWithToken(token);
  }

  /**
   * The one way in, for a typed code and a tapped link (`app/auth.tsx`) alike, so
   * neither can skip the first-sign-in decision.
   */
  async function signInWithToken(token: string): Promise<SignInResult> {
    setVerifying(true);
    setError(null);
    try {
      const { user } = await verifyMagicLink(token);
      // Signed in but never settled is a state sync can't leave — so a failure
      // here undoes the sign-in too. `settle` already put the phone back.
      return await finish(user, { signOutOnFailure: true });
    } catch (e) {
      haptic.error();
      setError(message(e));
      return 'failed';
    } finally {
      setVerifying(false);
    }
  }

  /**
   * Settle the first sign-in for the account that is ALREADY signed in — someone
   * who signed in on a build older than the first-sign-in step, whose phone was
   * never joined to the account (the status line's "Connect"). A failure leaves
   * them signed in, as they were.
   */
  async function connect(): Promise<SignInResult> {
    const session = await getStoredSession();
    if (!session) return 'failed';
    setVerifying(true);
    setError(null);
    try {
      return await finish(session.user, { signOutOnFailure: false });
    } catch (e) {
      haptic.error();
      setError(message(e));
      return 'failed';
    } finally {
      setVerifying(false);
    }
  }

  async function finish(user: ServerUser, opts: { signOutOnFailure: boolean }): Promise<SignInResult> {
    const outcome = await settle(user).catch(async (e: unknown) => {
      if (opts.signOutOnFailure) await signOut();
      throw e;
    });
    setSentTo(null);
    setCode('');
    if (!outcome) return 'not-now';   // signed out, nothing changed
    if (outcome.restored) refresh();
    await onVerified?.(user, outcome);
    haptic.success();
    return 'signed-in';
  }

  function useDifferentEmail() {
    setSentTo(null);
    setCode('');
    setError(null);
  }

  return {
    email, setEmail, sentTo, code, setCode, sending, verifying, restoring, asking, error, setError,
    sendLink, verifyCode, signInWithToken, connect, answer, useDifferentEmail,
  };
}
