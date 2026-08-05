import { Alert } from 'react-native';

/**
 * `Alert.alert` as an awaitable yes/no, so a guard can sit inline in an async commit
 * path instead of splitting it into a callback that re-enters the same function.
 *
 * Resolves `false` on cancel *and* on dismiss — a swipe-away is not consent.
 */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Continue',
  destructive = false,
): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * "N of M look like duplicates" — shared by the Review commit paths.
 *
 * Names the count rather than asking row by row: a bulk import can surface twenty
 * matches, and twenty sequential prompts trains people to tap through warnings,
 * which is worse than not warning at all.
 */
export function confirmDuplicates(dupCount: number, total: number): Promise<boolean> {
  const one = dupCount === 1;
  return confirmAsync(
    one ? 'Possible duplicate' : `${dupCount} possible duplicates`,
    total === 1
      ? 'You already logged something with this amount and category in the last day. Save it anyway?'
      : `${dupCount} of these ${total} match something you logged in the last day. Save all ${total} anyway?`,
    'Save anyway',
  );
}
