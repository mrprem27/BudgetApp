import React from 'react';
import { Banner } from '../../ui/Banner';

/** Dismissible banner surfaced after a batch Save finds transactions that look
 *  recurring — never auto-created, always a tap-through to confirm. */
export function RecurringSuggestionBanner({ count, onPress, onDismiss }: { count: number; onPress: () => void; onDismiss: () => void }) {
  return (
    <Banner
      icon="repeat"
      text={`${count} of these look recurring — review?`}
      onPress={onPress}
      onDismiss={onDismiss}
    />
  );
}
