import { joinStage, claimStage, _stageSize } from '../lib/sheetStage';

/**
 * The rule that stops the app freezing.
 *
 * Two React Native modals presented at once on iOS leaves an invisible
 * full-screen view that swallows every touch — the screen is not slow, it is
 * stuck, and only killing the app clears it. `SheetModal` kept its child mounted
 * for 240ms after closing, so every sheet-to-sheet SWAP overlapped and did
 * exactly that. Tapping "On date" inside Repeat was the reproduction.
 *
 * Nothing in the suite renders a component, which is precisely why this ordering
 * lives in a pure module: it is the layer where the bug could actually be caught.
 */
describe('one sheet on the stage', () => {
  it('evicts everyone else when a sheet claims it', () => {
    const a = jest.fn();
    const b = jest.fn();
    const leaveA = joinStage(a);
    const leaveB = joinStage(b);

    claimStage(a);
    expect(a).not.toHaveBeenCalled();   // never evicts itself
    expect(b).toHaveBeenCalledTimes(1); // ...and the other goes now

    leaveA(); leaveB();
  });

  it('lets a sheet leave without disturbing the rest', () => {
    const a = jest.fn();
    const b = jest.fn();
    const leaveA = joinStage(a);
    const leaveB = joinStage(b);

    leaveA();
    claimStage(b);
    expect(a).not.toHaveBeenCalled(); // unregistered, so never touched again
    leaveB();
  });

  it('registers and unregisters symmetrically', () => {
    // A leak here is a sheet that keeps being evicted after it has unmounted —
    // a setState on a dead component, and a warning nobody can place.
    const before = _stageSize();
    const leave = joinStage(() => {});
    expect(_stageSize()).toBe(before + 1);
    leave();
    expect(_stageSize()).toBe(before);
  });

  it('survives a listener that unregisters itself while being evicted', () => {
    /*
     * The real shape: yielding sets state, React unmounts the sheet, and its
     * cleanup removes it from the set — mid-notification. Iterating the live set
     * would skip whichever listener followed it, leaving a second modal on stage
     * and the freeze intact.
     */
    const order: string[] = [];
    let leaveB = () => {};
    const a = jest.fn(() => { order.push('a'); leaveB(); });
    const b = jest.fn(() => order.push('b'));
    const c = jest.fn(() => order.push('c'));

    const leaveA = joinStage(a);
    leaveB = joinStage(b);
    const leaveC = joinStage(c);

    const claimant = () => {};
    const leaveClaimant = joinStage(claimant);
    claimStage(claimant);

    // c must still have been told, even though a removed b mid-loop.
    expect(order).toContain('c');
    expect(c).toHaveBeenCalledTimes(1);

    leaveA(); leaveC(); leaveClaimant();
  });
});
