import { Alert } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import type * as SQLite from 'expo-sqlite';
import { insertTxnRows, softDeleteTxn, findDuplicatesAmong } from '../db/queries/transactions';
import { deletePending, restorePending, type PendingTxn } from '../db/queries/pending';
import { snapshotRow, txnInputFromPlan, type CommitPlan, type RowEdit, type SplitState } from '../lib/reviewCommit';
import { saveFailureMessage } from '../lib/dbErrors';
import { confirmDuplicates } from '../lib/confirm';
import { parseToPaise } from '../lib/money';
import { haptic } from '../lib/haptics';
import type { RecurringCandidate } from '../lib/recurringSuggest';

type Deps = {
  db: SQLite.SQLiteDatabase;
  pending: PendingTxn[];
  selected: Set<string>;
  savingId: string | null;
  setSavingId: (id: string | null) => void;
  BATCH: string;
  planCommit: (row: PendingTxn) => CommitPlan;
  eff: (row: PendingTxn) => RowEdit;
  splitState: (row: PendingTxn) => SplitState;
  refresh: () => void;
  reload: () => void;
  showUndo: (o: { message: string; onUndo: () => void }) => void;
  exitSelect: () => void;
  checkRecurringSuggestions: (done: { txnId: string; snap: PendingTxn }[]) => void;
};

/**
 * Everything Review does that WRITES: commit one, commit many, discard, and undo
 * any of them.
 *
 * Lifted out of `review.tsx` because that screen is the largest in the app and
 * sat at its ratchet ceiling — and because this is the half where a mistake costs
 * a user their data, so it deserves to be readable on its own. Pure relocation:
 * the screen still owns every piece of state and passes it in, and the existing
 * Review tests pass untouched.
 */
export function useReviewCommit(d: Deps) {
  const {
    db, pending, selected, savingId, setSavingId, BATCH, planCommit, eff, splitState,
    refresh, reload, showUndo, exitSelect, checkRecurringSuggestions,
  } = d;

// ---- commit path (per-row Confirm and batch Save) ----

/**
 * Insert a planned row and drop it from the inbox, atomically. Returns undo material.
 *
 * One transaction, deliberately. It used to be `insertTxn` (which commits its
 * own) followed by a separate `deletePending`: a failure between them left the
 * transaction saved and the row still sitting in the inbox looking unsaved, so
 * confirming again wrote a SECOND copy. `insertTxnRows` exists for exactly this
 * — `splitRecurringSeries` uses the same trick to keep two writes together.
 */
async function insertCommit(row: PendingTxn, plan: Extract<CommitPlan, { ok: true }>): Promise<{ txnId: string; snap: PendingTxn }> {
  const txnId = uuid();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await insertTxnRows(db, txnInputFromPlan(row, plan), txnId, now);
    await deletePending(db, row.id);
  });
  return { txnId, snap: plan.snap };
}

/**
 * Put back what a commit or a discard took away.
 *
 * All three Undos ran this shape inline with **no** try/catch — the only undos
 * in the app that didn't. A throw became an unhandled rejection: the toast slid
 * away, the user believed it had worked, and it hadn't. The batch case was worse
 * — a mid-loop failure left some transactions deleted and some rows restored,
 * reported to nobody.
 */
async function runUndo(work: () => Promise<void>) {
  try {
    await work();
  } catch (e) {
    haptic.error();
    const m = saveFailureMessage(e);
    Alert.alert('Could not undo', m.body);
  } finally {
    refresh();
    reload();
  }
}

/** Commit one row, with Undo. */
async function confirmRow(row: PendingTxn) {
  if (savingId) return;
  const plan = planCommit(row);
  if (!plan.ok) {
    const v = eff(row);
    Alert.alert(
      parseToPaise(v.amount) <= 0 ? 'Add an amount' : 'Balance the split',
      parseToPaise(v.amount) <= 0
        ? 'This row needs an amount above zero before it can be saved.'
        : 'Assign the full amount to the people sharing this before saving.',
    );
    return;
  }
  // Re-importing an overlapping statement is normal, so this path needs the same
  // ±24 h warning Quick Add has always had (`V2-20`).
  const dupes = await findDuplicatesAmong(db, [{ groupId: plan.groupId, kind: plan.kind, category: plan.category, total: plan.total, dateMs: row.date }]);
  if (dupes.length > 0 && !(await confirmDuplicates(1, 1))) return;

  setSavingId(row.id);
  try {
    const done = await insertCommit(row, plan);
    haptic.success();
    refresh();
    reload();
    showUndo({
      message: `Saved to ${plan.destName}`,
      onUndo: () => runUndo(async () => { await softDeleteTxn(db, done.txnId); await restorePending(db, done.snap); }),
    });
  } catch (e) {
    // Previously a bare try/finally: a failed commit became an unhandled rejection and
    // the row just sat there, indistinguishable from a button that does nothing.
    haptic.error();
    const m = saveFailureMessage(e);
    Alert.alert(m.title, m.body);
  } finally {
    setSavingId(null);
  }
}

/** Commit many rows at once (Save all / Save selected), with a batch Undo. */
async function saveMany(rows: PendingTxn[], label: string) {
  if (savingId) return;
  const ready = rows.map(r => ({ row: r, plan: planCommit(r) })).filter((x): x is { row: PendingTxn; plan: Extract<CommitPlan, { ok: true }> } => x.plan.ok);
  const skipped = rows.length - ready.length;
  if (ready.length === 0) {
    Alert.alert('Nothing ready to save', 'These rows still need an amount — a balanced split for group expenses, or who the transfer was with for group transfers.');
    return;
  }
  const dupes = await findDuplicatesAmong(db, ready.map(({ row, plan }) => ({ groupId: plan.groupId, kind: plan.kind, category: plan.category, total: plan.total, dateMs: row.date })));
  if (dupes.length > 0 && !(await confirmDuplicates(dupes.length, ready.length))) return;
  Alert.alert(
    label,
    `${ready.length} transaction${ready.length === 1 ? '' : 's'} will be saved${skipped > 0 ? `. ${skipped} skipped — they need an amount, a balanced split, or who the transfer was with.` : '.'}`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save', onPress: async () => {
          setSavingId(BATCH);
          const done: { txnId: string; snap: PendingTxn }[] = [];
          // A mid-batch failure (a full disk is the realistic one) used to abort the whole
          // block: rows 1..n-1 were already committed, but nothing refreshed, nothing was
          // said, and no Undo was offered for the ones that DID save. Keep the partial
          // success, then report what stopped it.
          let failure: unknown = null;
          try { for (const { row, plan } of ready) done.push(await insertCommit(row, plan)); }
          catch (e) { failure = e; }
          finally { setSavingId(null); }
          if (done.length > 0) {
            haptic.success();
            exitSelect();
            refresh();
            reload();
            checkRecurringSuggestions(done);
            showUndo({
              message: `Saved ${done.length} transaction${done.length === 1 ? '' : 's'}`,
              onUndo: () => runUndo(async () => { for (const d of done) { await softDeleteTxn(db, d.txnId); await restorePending(db, d.snap); } }),
            });
          }
          if (failure) {
            haptic.error();
            const m = saveFailureMessage(failure);
            Alert.alert(m.title, done.length > 0 ? `${done.length} saved before this stopped. ${m.body}` : m.body);
          }
        },
      },
    ],
  );
}

/**
 * Take rows out of the inbox — never saved anywhere — with ONE Undo for the whole lot.
 *
 * The swipe on a single row, the bulk discard and Clear all are the same operation at three
 * sizes. They were three copies, which is how their Undo behaviour drifted: the bulk one
 * would have restored only the last row. Snapshots come from `eff` rather than the DB so
 * unsaved drafts survive the round trip.
 */
async function discard(rows: PendingTxn[], message: string) {
  if (rows.length === 0) return;
  const snaps = rows.map(r => snapshotRow(r, eff(r), splitState(r)));
  try {
    for (const r of rows) await deletePending(db, r.id);
  } catch (e) {
    // A mid-loop failure used to delete some rows, leave others, and say
    // nothing — with an Undo list that no longer matched what had gone.
    haptic.error();
    const m = saveFailureMessage(e);
    Alert.alert(m.title, m.body);
    refresh();
    reload();
    return;
  }
  haptic.warning();
  refresh();
  reload();
  showUndo({
    message,
    onUndo: () => runUndo(async () => { for (const snap of snaps) await restorePending(db, snap); }),
  });
}
const deleteRow = (row: PendingTxn) => discard([row], 'Removed from review');

function deleteSelected() {
  const rows = pending.filter(r => selected.has(r.id));
  exitSelect();
  void discard(rows, `${rows.length} removed from review`);
}

function handleClearAll() {
  Alert.alert(
    'Clear all reviews?',
    `This removes all ${pending.length} pending transaction${pending.length === 1 ? '' : 's'} from Review. Nothing is saved.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all', style: 'destructive',
        onPress: () => void discard(pending, `Cleared ${pending.length} transaction${pending.length === 1 ? '' : 's'}`),
      },
    ],
  );
}

  return { insertCommit, runUndo, confirmRow, saveMany, discard, deleteRow, deleteSelected, handleClearAll };
}
