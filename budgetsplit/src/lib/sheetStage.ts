/**
 * Only one bottom sheet may hold the stage at a time.
 *
 * ### The freeze this exists to stop
 *
 * `SheetModal` keeps its child mounted for `SHEET_EXIT_MS + 40` after `visible`
 * clears, so the slide-out can be seen and a quick reopen reuses the sheet rather
 * than rebuilding it off-screen. That is right for closing.
 *
 * It is wrong for **swapping**. `QuickAddSheets` moves between sheets in one
 * synchronous state change — tap "On date" in Repeat and the recurring sheet goes
 * invisible while the date picker goes visible in the same commit. For ~240ms
 * both render `<Modal visible>`, and two React Native modals presented at once on
 * iOS is the classic hang: the second presentation is dropped, the first
 * dismisses, and what is left is an invisible full-screen view that swallows
 * every touch. The screen is not slow — it is **stuck**, and the only way out is
 * killing the app.
 *
 * That is a whole class of bug, not one screen: 75 components use `SheetModal`,
 * and every sheet-to-sheet swap in the app had it.
 *
 * ### The rule
 *
 * Claiming the stage evicts whoever else is on it, **immediately and without the
 * exit animation**. Losing the animation on a swap is the right trade: nobody
 * watches a sheet leave while another is arriving, and a frozen app is not a
 * trade at all. A plain close is untouched and still animates.
 *
 * Pure and framework-free so it can be tested directly — the component layer is
 * where this kind of ordering bug hides precisely because nothing renders in the
 * test suite.
 */

/** Called when another sheet takes the stage. Must unmount now, no animation. */
export type YieldStage = () => void;

const onStage = new Set<YieldStage>();

/** Register a sheet. Returns the unregister function. */
export function joinStage(yieldNow: YieldStage): () => void {
  onStage.add(yieldNow);
  return () => { onStage.delete(yieldNow); };
}

/**
 * Take the stage: every other registered sheet is told to go now.
 *
 * Iterated over a copy, because a listener that unregisters itself while being
 * notified would otherwise mutate the set mid-loop and skip its neighbour.
 */
export function claimStage(claimant: YieldStage): void {
  for (const other of [...onStage]) {
    if (other !== claimant) other();
  }
}

/** Test seam. Never called by the app. */
export function _stageSize(): number {
  return onStage.size;
}
