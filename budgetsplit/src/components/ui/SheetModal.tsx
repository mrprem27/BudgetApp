import React from 'react';
import { Modal } from 'react-native';
import { DraggableSheet } from './DraggableSheet';

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
 */
export function SheetModal({ visible, onClose, title, children, scroll = true, headerRight }: Props) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {visible && (
        <DraggableSheet onClose={onClose} title={title} scroll={scroll} headerRight={headerRight}>
          {children}
        </DraggableSheet>
      )}
    </Modal>
  );
}
