/**
 * In-memory stand-in for `expo-secure-store` — a real implementation, not an
 * empty stub, for the same reason `asyncStorage.js` is: `serverApi`'s whole
 * session lifecycle (store on verify, read on every authed call, clear on 401
 * and on sign-out) is only testable if get/set/delete genuinely round-trip.
 *
 * The Keychain's *security* isn't modelled — nothing here is encrypted, and a
 * test asserting that would be asserting about the mock.
 */
const store = new Map();

module.exports = {
  async getItemAsync(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async setItemAsync(key, value) {
    store.set(key, String(value));
  },
  async deleteItemAsync(key) {
    store.delete(key);
  },
  /** Test-only: reset between cases. Not part of the real module's surface. */
  __reset() {
    store.clear();
  },
};
