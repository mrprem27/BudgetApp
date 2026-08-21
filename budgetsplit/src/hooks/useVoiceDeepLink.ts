import { useEffect, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { parseVoice, detectVoiceKind } from '../lib/voiceParse';
import { isGroupish, routeVoiceDraft, VoiceDestination } from '../lib/voiceInbox';
import { softDeleteTxn } from '../db/queries/transactions';
import { useToast } from '../components/system/Toast';
import { useDataRefresh } from '../components/system/DataRefreshProvider';
import { AddKind } from '../constants/enums';
import type { useAddTxnForm } from './useAddTxnForm';

type Form = ReturnType<typeof useAddTxnForm>;

type Opts = {
  form: Form;
  /** The dictated phrase from `?q=`. Absent on every non-voice entry. */
  phrase?: string;
  /** `?kind=` if the caller stated one — an explicit kind beats inference. */
  kindParam?: string;
  /** Open the destination picker, for a phrase that names a group or person. */
  onOpenDestination: () => void;
};

/**
 * Apply a dictated phrase handed in by a deep link —
 * `budgetsplit:///add/quick?q=four+fifty+groceries`.
 *
 * This is how ALL voice entry arrives: one Siri shortcut, no kind in the URL,
 * everything inferred here. Applied ONCE, and only once the catalogs have loaded,
 * so the trigger lands on a filled form rather than an empty one.
 *
 * Lives outside the screen because it is logic, not composition (AGENTS "screen
 * thinness") — two effects, three refs and a confidence rule that has nothing to do
 * with how the form is laid out.
 */
export function useVoiceDeepLink({ form: f, phrase, kindParam, onOpenDestination }: Opts) {
  const db = useSQLiteContext();
  const router = useRouter();
  const { showUndo } = useToast();
  const { refresh } = useDataRefresh();

  const voiceApplied = useRef(false);
  /** Set once the draft is in and the phrase looked confident; read by the save pass. */
  const autoSaveWanted = useRef(false);
  const autoSaved = useRef(false);

  // Group and person names are what `routeVoiceDraft` checks a phrase against — naming
  // either means the entry needs a decision, so it stays on the form instead of posting.
  const groupNames = f.groups.filter(g => g.is_personal !== 1).map(g => g.name);
  const personNames = f.allPersons.filter(p => p.id !== f.me?.id).map(p => p.name.trim().split(/\s+/)[0]).filter(Boolean);

  useEffect(() => {
    if (voiceApplied.current || !phrase || f.categories.length === 0) return;
    // People must load before anything else: they decide the *kind* ("paid Riya" is a
    // transfer only because Riya is someone we know) and they carry the counterparty.
    if (f.allPersons.length === 0) return;

    // The kind is inferred rather than said. An explicit `?kind=` still wins — the route
    // is a public entry point and a caller that states the kind means it.
    const detected = kindParam ? f.kind : (detectVoiceKind(phrase, { people: f.allPersons }) as AddKind);
    if (detected !== f.kind) {
      // Switching kind swaps the category catalog *asynchronously*, so the draft can't be
      // applied in the same pass — it would match against the outgoing catalog. Bail
      // without marking applied; the effect re-runs on the new kind.
      f.onSelectKind(detected);
      return;
    }

    voiceApplied.current = true;
    const draft = parseVoice(phrase, {
      categories: f.categories, learned: f.learned, nowMs: Date.now(), people: f.allPersons,
    });
    f.applyVoiceDraft(draft);

    // Confident enough to post without a human? `routeVoiceDraft` already answers exactly
    // that, so the rule is reused rather than a second one invented beside it. A transfer
    // never qualifies: which way the money went is a decision, not a confidence problem.
    autoSaveWanted.current = detected !== AddKind.Transfer
      && routeVoiceDraft(draft, phrase, groupNames, personNames, detected === AddKind.Income ? 'income' : 'expense')
        === VoiceDestination.Ledger;

    // After the draft is applied, and only for a shared-sounding phrase. Groups load
    // asynchronously, so a phrase arriving before them opens the sheet on the next pass.
    if (isGroupish(phrase) && f.pickerGroups.length > 0) onOpenDestination();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrase, f.categories.length, f.pickerGroups.length, f.allPersons.length, f.kind]);

  /**
   * Post a confident phrase and show what it wrote.
   *
   * A separate pass because `applyVoiceDraft` sets state the save depends on — `canSave`
   * is false until the amount and category have landed, so saving in the same tick would
   * either no-op or save an empty form. Waiting for `canSave` is the honest ready signal.
   *
   * `router.replace` rather than push: going back from the transaction should return you
   * to wherever you were, not to a spent Add screen that would re-run this.
   */
  useEffect(() => {
    if (!autoSaveWanted.current || autoSaved.current || !f.canSave || f.saving) return;
    autoSaved.current = true;
    void f.handleSave({
      onSaved: (txnId) => {
        router.replace(`/txn/${txnId}`);
        // The one guard auto-save needs. Nothing else on this path asks "are you sure",
        // so a misheard "four fifty" as "four fifteen" has to be one tap from gone.
        showUndo({
          message: 'Saved from voice',
          onUndo: async () => { await softDeleteTxn(db, txnId); refresh(); router.back(); },
        });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.canSave, f.saving]);
}
