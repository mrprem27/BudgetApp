import React, { useEffect, useRef, useState } from 'react';
import { Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DraggableSheet, SHEET_EXIT_MS } from './DraggableSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView (for long content). Default true. */
  scroll?: boolean;
  /** Optional control rendered at the right of the title row. */
  headerRight?: React.ReactNode;
};

/**
 * Inline bottom sheet for use over a normal screen (pickers, detail sheets).
 * Wraps {@link DraggableSheet} in an RN Modal so it can be toggled with `visible`.
 * For a sheet that IS a route screen, use a `transparentModal` route with
 * DraggableSheet directly (a nested Modal there breaks with the keyboard).
 *
 * ### Why the child outlives `visible`
 *
 * This used to render `{visible && <DraggableSheet …>}`, which meant every close **destroyed**
 * the sheet and every open **rebuilt** it. `DraggableSheet` starts at `translateY = SCREEN_H`
 * and springs in from a mount effect, so a rebuild painted one frame fully off-screen — and
 * with `animationType="none"` on the Modal, nothing covered it. That was the flicker.
 *
 * So the child is now kept mounted for `SHEET_EXIT_MS` after `visible` clears: long enough for
 * the slide-out to be seen, and long enough that a reopen inside that window reuses the sheet
 * that is already there instead of building a new one from off-screen.
 *
 * The Modal keeps `animationType="none"` on purpose — `DraggableSheet` owns all the motion,
 * and letting the Modal fade as well double-animates the backdrop.
 */
export function SheetModal({ visible, onClose, title, children, scroll = true, headerRight }: Props) {
  // Lags `visible` on the way down only; leads it on the way up.
  const [rendered, setRendered] = useState(visible);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (visible) { setRendered(true); return; }
    // A slightly longer wait than the animation, so the final frame has landed before the
    // native view goes away.
    timer.current = setTimeout(() => setRendered(false), SHEET_EXIT_MS + 40);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [visible]);

  return (
    <Modal visible={rendered} transparent animationType="none" onRequestClose={onClose}>
      {rendered && (
        // RN <Modal> renders in a detached native view tree, so gesture-handler
        // needs its own root inside it — without this the drag-to-dismiss gesture
        // crashes. (The app-level root in _layout doesn't reach into the Modal.)
        <GestureHandlerRootView style={{ flex: 1 }}>
          {/* `exiting` drives the slide-out for a parent-initiated close (a Done button that
              flipped `visible`, or a route change). Drag and backdrop-tap animate themselves. */}
          <DraggableSheet
            onClose={onClose}
            exiting={!visible}
            title={title}
            scroll={scroll}
            headerRight={headerRight}
          >
            {children}
          </DraggableSheet>
        </GestureHandlerRootView>
      )}
    </Modal>
  );
}
