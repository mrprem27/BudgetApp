import { Paths, File, Directory } from 'expo-file-system';
import type * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { parseVoice } from './voiceParse';
import { loadLearned } from './smartCategoryLearn';
import {
  VoiceDestination, routeVoiceDraft, resolveCaptureTime, sortCaptures, reviewReason,
  voiceFields, resolveVoiceCategory, kindFromCaptureName,
} from './voiceInbox';
import { loadFlags } from './featureFlags';
import { composeTitleNote } from './txnNote';
import { detectPayMethod } from './payMethodDetect';
import { insertTxnRows } from '../db/queries/transactions';
import { insertPending } from '../db/queries/pending';
import { getCategories } from '../db/queries/categories';
import { getAllGroups, personalGroupOf } from '../db/queries/groups';
import { getMe, getAllPersons } from '../db/queries/persons';

/**
 * ⚠️ **Legacy capture path.** The shortcuts no longer write files — they hand the phrase to
 * `add/quick.tsx` as a deep link, because a `Save File` destination is a per-device bookmark
 * that cannot survive being shared, and getting it wrong failed silently forever.
 *
 * This is kept, not dead code: captures written by the older shortcuts may still be sitting in
 * `voice-inbox` on someone's phone, and dropping the drain would lose them. It is also the only
 * path that never opens the app, so it is what App Intents would replace rather than something
 * to delete first.
 *
 * Turn phrases captured while the app was closed into real rows.
 *
 * The capture side is an iOS Shortcut — two actions: *"Hey Siri, log expense"* → you dictate →
 * the Shortcut writes the phrase into `Documents/voice-inbox/` and Siri confirms.
 * **The app never launches.** The filename is whatever Shortcuts chose; the capture time comes
 * from the file itself (`resolveCaptureTime`). This function is the other half — it runs at launch and on
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

  // Resolve each capture's time before ordering: with no timestamp in the name, the
  // filesystem's creation time is what says when the phrase was spoken.
  const drainedAt = Date.now();
  const ordered = sortCaptures(
    files.map(f => ({ name: f.name, file: f, capturedAt: resolveCaptureTime(f.name, f.creationTime, drainedAt) })),
  ).slice(0, MAX_PER_DRAIN);

  // Loaded once for the whole batch: the category catalog, who "I" am, and the
  // merchant→category corrections the user has already made by hand. Voice inherits those
  // corrections here exactly as the Add screen does — the parser supports it, and until now
  // nothing passed them in.
  let categories: { name: string }[];
  // Income has its own catalog, and matching a salary against the expense list would file it
  // under whatever happened to look similar. Loaded up front because the batch can mix kinds.
  let incomeCategories: { name: string }[];
  let learned: Awaited<ReturnType<typeof loadLearned>>;
  let meId: string;
  let personalGroupId: string;
  let smartCategoryOn: boolean;
  let groupNames: string[];
  let personNames: string[];
  /** Full records, not just names — a settlement needs the matched person's id. */
  let people: { id: string; name: string }[];
  try {
    const [cats, incomeCats, lrn, me, groups, flags] = await Promise.all([
      getCategories(db, 'expense'), getCategories(db, 'income'),
      loadLearned(), getMe(db), getAllGroups(db), loadFlags(),
    ]);
    const persons = await getAllPersons(db);
    // Turning the feature off has to stop it acting, not just hide its buttons — otherwise
    // captures keep posting from a switch the user believes is off. The files are left
    // untouched, so nothing is lost if it is switched back on.
    if (!flags.voiceEntry) return NOTHING;
    // Smart-category off means "don't guess a category from what I write". Dictating is
    // writing, so voice honours it too and files under the fallback instead.
    smartCategoryOn = flags.smartCategory;
    // A destination, not a budget scope: filing a capture somewhere beats dropping it.
    const personal = personalGroupOf(groups) ?? groups[0];
    // Without a person and a destination there is nothing to attribute a spend to. Leave
    // every file untouched rather than inventing either — this is reachable during
    // first-run, before onboarding has committed.
    if (!me || !personal) return NOTHING;
    categories = cats;
    incomeCategories = incomeCats;
    learned = lrn;
    meId = me.id;
    personalGroupId = personal.id;
    people = persons.filter(pp => pp.id !== me.id).map(pp => ({ id: pp.id, name: pp.name }));
    // Shared groups only: "Personal" appearing in a phrase means nothing, and matching it
    // would divert every capture to Review.
    groupNames = groups.filter(g => g.is_personal !== 1).map(g => g.name);
    // First names only, and never your own: "paid Prem" said by Prem is not a transfer, and
    // matching yourself would divert every capture that happens to contain your name.
    personNames = persons
      .filter(pp => pp.id !== me.id)
      .map(pp => pp.name.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch { return NOTHING; }

  const out = { saved: 0, queued: 0, deferred: 0 };

  for (const { name, file, capturedAt } of ordered) {

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

    // Which command wrote this file. Carried in the name because the kind is decided by what
    // you SAID, not by the words — inferring it would let "salary" book income from the
    // expense command.
    const kind = kindFromCaptureName(name);
    const catalog = kind === 'income' ? incomeCategories : categories;

    // Anchored to when the phrase was SPOKEN, not to now — see `resolveCaptureTime`.
    // `people` only matters to a settlement, where it supplies the counterparty; passing it
    // for every kind is harmless because nothing else reads `personId`.
    const draft = parseVoice(phrase, { categories: catalog, learned, nowMs: capturedAt, people });
    const dest = routeVoiceDraft(draft, phrase, groupNames, personNames, kind);

    // Exactly the field mapping a typed entry gets: the descriptive words become the title
    // (which is what smart-category read), anything longer spills into the note, and the two
    // are joined by the same helper the Add screen uses.
    const { title, note } = voiceFields(draft);
    const category = resolveVoiceCategory(draft, catalog, smartCategoryOn);

    try {
      if (dest === VoiceDestination.Ledger && category) {
        const amount = draft.amountPaise;
        await db.withTransactionAsync(async () => {
          await insertTxnRows(db, {
            groupId: personalGroupId,
            kind,
            entryMode: 'quick',
            date: draft.dateMs ?? capturedAt,
            category,
            // Falls back to the raw transcript when the phrase was nothing but an amount and
            // a category word — an auto-saved row must always be able to say what was heard.
            note: composeTitleNote(title, note, smartCategoryOn) ?? draft.transcript,
            source: 'voice',
            // "paid Swiggy by card" is exactly the text the detector is built
            // for — every other ingestion path already runs it. A missed method
            // stays null; a missed CARD booking mis-states the cash position.
            payMethod: detectPayMethod(draft.transcript) ?? undefined,
            payments: [{ personId: meId, amount }],
            // Income carries NO shares — money arriving is not apportioned to anyone, and
            // `useAddTxnForm` saves it the same way. Writing a share row here would make the
            // voice copy of an income differ from a typed one in the split tables.
            shares: kind === 'income' ? [] : [{ personId: meId, amount }],
          }, uuid(), Date.now());
        });
        out.saved++;
      } else {
        await insertPending(db, [{
          date: draft.dateMs ?? capturedAt,
          amount: Math.max(0, draft.amountPaise),
          description: title || draft.note || draft.transcript,
          kind,
          category: smartCategoryOn ? draft.category : null,
          // Which way the money went, as far as the kind alone can say. Income arrives; a
          // settlement's direction is the thing Review exists to confirm, so it stays unknown
          // rather than asserting one.
          direction: kind === 'income' ? 'credit' : kind === 'settlement' ? 'unknown' : 'debit',
          source: 'voice',
          pay_method: detectPayMethod(draft.transcript),
          // Pre-filled so confirming a settlement is a tap rather than a form. Null whenever
          // nobody was named, or when two people share a first name — `parseVoice` refuses to
          // pick between them, and a settlement aimed at the wrong person is worse than one
          // that asks.
          counterparty_id: kind === 'settlement' ? draft.personId : null,
          // Why it's here rather than in the ledger, plus what was said, so the Review row
          // can explain itself without the user having to guess.
          raw: [reviewReason(draft, phrase, groupNames, personNames, kind), `Said: "${draft.transcript}"`].filter(Boolean).join(' · '),
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
