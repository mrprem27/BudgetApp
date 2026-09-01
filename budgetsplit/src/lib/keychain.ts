/**
 * The one lazy accessor for `expo-secure-store`.
 *
 * ## Why it is lazy, and why that is not optional
 *
 * `expo-secure-store` is a **native** module, and the files that use it are
 * imported by routes — which expo-router loads eagerly at startup. A top-level
 * `import * as SecureStore` therefore meant that a JS bundle running on a native
 * build without the module (an OTA update ahead of its binary, or a stale dev
 * client) **crashed the whole app on launch**, not just the screen that wanted it:
 *
 *     Error: Cannot find native module 'ExpoSecureStore'
 *
 * A local-first app must not die because an optional feature's dependency is
 * absent. Required lazily and cached, so a missing module degrades to "no account
 * UI" — which is exactly what an unconfigured build already looks like.
 *
 * ## Why it is one file
 *
 * This was implemented verbatim three times — `serverApi`, `deviceKey`,
 * `syncSnapshot` — and the two newer copies' own comments admitted they were
 * copies. Three copies of a launch-crash guard is three chances for one to drift,
 * and the symptom of drift is an app that will not open at all.
 *
 * `undefined` = not yet attempted, `null` = attempted and unavailable.
 */
export type SecureStoreModule = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

let secureStore: SecureStoreModule | null | undefined;

export function keychain(): SecureStoreModule | null {
  if (secureStore !== undefined) return secureStore;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    secureStore = require('expo-secure-store') as SecureStoreModule;
  } catch {
    secureStore = null;
  }
  return secureStore;
}

/** There is nowhere safe to keep a credential, so the feature that needs one stays off. */
export const secureStorageAvailable = (): boolean => keychain() !== null;
