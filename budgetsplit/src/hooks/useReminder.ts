import { useCallback } from 'react';
import { Alert, Linking, Share } from 'react-native';
import { useStore } from '../store';
import { reminderText, whatsappUrl } from '../lib/whatsappReminder';
import { buildUpiRequestUri } from '../lib/upiIntent';
import { haptic } from '../lib/haptics';

/**
 * Nudge someone who owes you, over WhatsApp — the one place that does it.
 *
 * Person, Upcoming and Friends each need the same button, and the send has real
 * judgement in it (a stored number without a country code cannot be opened in
 * WhatsApp, and losing the reminder over that would be worse than letting you pick the
 * app), so it lives here rather than being copied per screen.
 *
 * Whether to *offer* it is `canRemind` (`lib/whatsappReminder`): only when they owe you
 * and a number is stored. This only sends. It is a message and never a request — a
 * `upi://pay` link they may choose to open, never a collect (AGENTS §13).
 */
export type Remindee = { name: string; mobile: string | null };

export function useReminder() {
  const me = useStore(s => s.me);

  return useCallback(async (
    person: Remindee,
    /** What they owe me, in paise. */
    amountPaise: number,
    /** Optional per-group breakdown, so the message says what it is for. */
    groups?: Array<{ name: string; amount: number }>,
  ) => {
    if (!person.mobile) return;
    const text = reminderText({
      name: person.name,
      amountPaise,
      groups,
      payLink: me?.upi_vpa ? buildUpiRequestUri(me.upi_vpa, me.name, amountPaise) : null,
    });
    const url = whatsappUrl(person.mobile, text);
    try {
      if (url && await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await Share.share({ message: text });
    } catch {
      haptic.error();
      Alert.alert('Could not open WhatsApp', 'You can copy the message and send it yourself.');
    }
  }, [me]);
}
