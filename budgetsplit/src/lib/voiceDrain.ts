import { Paths, File, Directory } from 'expo-file-system';
import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { parseVoice } from './voiceParse';
import { loadLearned } from './smartCategoryLearn';
import {
  VoiceDestination, routeVoiceDraft, captureTimeFromName, sortCaptureNames, reviewReason,
} from './voiceInbox';
import { insertTxnRows } from '../db/queries/transactions';
import { insertPending } from '../db/queries/pending';
import { getCategories } from '../db/queries/categories';
import { getAllGroups } from '../db/queries/groups';
import { getMe } from '../db/queries/persons';

/**
 * Turn phrases captured while the app was closed into real rows.
 *
 * The capture side is an iOS Shortcut: *"Hey Siri, log expense"* → you dictate → the
 * Shortcut writes the phrase to `Documents/voice-inbox/<epoch-ms>.txt` and Siri confirms.
 * **The app never launches.** This function is the other half — it runs at launch and on
 * every foreground, reads whatever is waiting, and files it.
 *
 * All the judgement lives in `voiceInbox.ts`, which is pure and tested. This module is the
 * IO: read a file, write a row, delete the file — in that order, which is the whole point.
 *
 * ### The rule that makes a full disk survivable
 *
 * **A capture file is deleted only after its row has committed.** If the write fails — and a
 * full disk is the realistic way that happens — the file is left exactly as it was and the
 * next drain retries it. That turns "no room on the device" into a delay rather than a
 * silent loss, which matters more here than anywhere else in the app: Siri already told the
 * user it was saved, and they have no reason to check.
 *
 * Per file, not per batch, so one unwritable capture can't strand the ones behind it.
 */

const INBOX_DIR_NAME = 'voice-inbox';

/**
 * How many captures one drain will process.
 *
 * This runs during app launch, before the first screen paints, so it is bounded. Anything
 * beyond the cap simply waits for the next drain — the files are not touched, so nothing is
 * lost by stopping early.
 */
const MAX_PER_DRAIN = 50;

export type DrainResult = {
  /** Posted straight to the ledger. */
  saved: number;
  /** Parked in the Review inbox for a decision. */
  queued: number;
  /** Files left behind because a write failed (almost always a full disk). */
  deferred: number;
};

const NOTHING: DrainResult = { saved: 0, queued: 0, deferred: 0 };

/**
 * The folder the Shortcut writes into.
 *
 * Created eagerly so it already exists when the user picks it during setup — Shortcuts'
 * folder picker can only choose a folder that is there.
 */
export function voiceInboxDir(): Directory {
  return new Directory(Paths.document, INBOX_DIR_NAME);
}

/** Make sure the folder exists, so setup has something to point at. Never throws. */
export function ensureVoiceInbox(): void {
  try {
    const dir = voiceInboxDir();
    if (!dir.exists) dir.create({ intermediates: true });
  } catch { /* best-effort: a missing folder means no captures, not a broken app */ }
}

/** How many captures are waiting. Cheap enough for a settings screen to show. */
export function pendingCaptureCount(): number {
  try {
    const dir = voiceInboxDir();
    if (!dir.exists) return 0;
    return dir.list().filter(e => e instanceof File).length;
  } catch { return 0; }
}

/**
 * Read, file and clear the voice inbox.
 *
 * Returns counts so the caller can decide whether to `refresh()` — the pattern
 * `confirmPayment.askAboutPendingPayment` already uses, because a non-React module can't
 * reach `useDataRefresh`.
 */
export async function drainVoiceInbox(db: SQLite.SQLiteDatabase): Promise<DrainResult> {
  let files: File[];
  try {
    const dir = voiceInboxDir();
    if (!dir.exists) return NOTHING;
    files = dir.list().filter((e): e is File => e instanceof File);
  } catch { return NOTHING; }

  if (files.length === 0) return NOTHING;

  const byName = new Map(files.map(f => [f.name, f]));
  const ordered = sortCaptureNames([...byName.keys()]).slice(0, MAX_PER_DRAIN);

  // Loaded once for the whole batch: the category catalog, who "I" am, and the
  // merchant→category corrections the user has already made by hand. Voice inherits those
  // corrections here exactly as the Add screen does — the parser supports it, and until now
  // nothing passed them in.
  let categories: { name: string }[];
  let learned: Awaited<ReturnType<typeof loadLearned>>;
  let meId: string;
  let personalGroupId: string;
  try {
    const [cats, lrn, me, groups] = await Promise.all([
      getCategories(db, 'expense'), loadLearned(), getMe(db), getAllGroups(db),
    ]);
    const personal = groups.find(g => g.is_personal === 1) ?? groups[0];
    // Without a person and a destination there is nothing to attribute a spend to. Leave
    // every file untouched rather than inventing either — this is reachable during
    // first-run, before onboarding has committed.
    if (!me || !personal) return NOTHING;
    categories = cats;
    learned = lrn;
    meId = me.id;
    personalGroupId = personal.id;
  } catch { return NOTHING; }

  const out = { saved: 0, queued: 0, deferred: 0 };

  for (const name of ordered) {
    const file = byName.get(name)!;

    // A capture we can't read is a capture we can't file. Drop it rather than retrying
    // forever — leaving it would block every later drain on the same unreadable byte.
    let phrase: string;
    try {
      phrase = (await file.text()).trim();
    } catch {
      try { file.delete(); } catch { /* nothing more to try */ }
      continue;
    }
    if (!phrase) {
      try { file.delete(); } catch { /* ignore */ }
      continue;
    }

    // Anchored to when the phrase was SPOKEN, not to now — see `captureTimeFromName`.
    const capturedAt = captureTimeFromName(name, Date.now());
    const draft = parseVoice(phrase, { categories, learned, nowMs: capturedAt });
    const dest = routeVoiceDraft(draft, phrase);

    try {
      if (dest === VoiceDestination.Ledger) {
        const amount = draft.amountPaise;
        await db.withTransactionAsync(async () => {
          await insertTxnRows(db, {
            groupId: personalGroupId,
            kind: 'expense',
            entryMode: 'quick',
            date: draft.dateMs ?? capturedAt,
            category: draft.category!,   // routeVoiceDraft guarantees this for Ledger
            // The verbatim phrase, so an auto-saved row is always explainable. This is the
            // only record of what was actually heard.
            note: draft.transcript,
            source: 'voice',
            payments: [{ personId: meId, amount }],
            shares: [{ personId: meId, amount }],
          }, uuid(), Date.now());
        });
        out.saved++;
      } else {
        await insertPending(db, [{
          date: draft.dateMs ?? capturedAt,
          amount: Math.max(0, draft.amountPaise),
          description: draft.note || draft.transcript,
          kind: 'expense',
          category: draft.category,
          direction: 'debit',
          source: 'voice',
          pay_method: null,
          // Why it's here rather than in the ledger, plus what was said, so the Review row
          // can explain itself without the user having to guess.
          raw: [reviewReason(draft, phrase), `Said: "${draft.transcript}"`].filter(Boolean).join(' · '),
        }]);
        out.queued++;
      }
    } catch {
      // The write failed. Leave this file AND everything after it — order matters, and a
      // full disk won't clear itself mid-loop.
      out.deferred = ordered.length - (out.saved + out.queued);
      return out;
    }

    // Committed. Only now is it safe to forget the capture — and forgetting it is not
    // optional: a surviving file would be drained again next launch and post the same spend
    // twice. So if the delete fails, blank the file instead; an empty capture is skipped and
    // cleaned up by the guard above. If even that fails, stop, so the blast radius is one
    // possible duplicate rather than every remaining capture.
    if (!forget(file)) {
      out.deferred = ordered.length - (out.saved + out.queued);
      return out;
    }
  }

  return out;
}

/**
 * Retire a capture that has been filed. Returns false only when the file could neither be
 * deleted nor emptied — the one state where a re-drain could duplicate a transaction.
 */
function forget(file: File): boolean {
  try { file.delete(); return true; } catch { /* fall through to blanking */ }
  try { file.write(''); return true; } catch { return false; }
}
