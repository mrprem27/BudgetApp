// In-memory stand-in for @react-native-async-storage/async-storage.
//
// The real module is a native bridge, so the AsyncStorage-backed settings stores
// (lib/settings, lib/featureFlags, lib/reviewViews) were untestable without it.
// Semantics mirror the real API where the code under test depends on them:
// a missing key resolves to `null` (not undefined), and all values are strings.
const store = new Map();

const AsyncStorage = {
  getItem: async (key) => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => { store.set(key, String(value)); },
  removeItem: async (key) => { store.delete(key); },
  clear: async () => { store.clear(); },
  getAllKeys: async () => Array.from(store.keys()),
  multiGet: async (keys) => keys.map(k => [k, store.has(k) ? store.get(k) : null]),
  multiRemove: async (keys) => { keys.forEach(k => store.delete(k)); },

  /** Test-only: synchronously reset between cases. */
  __reset: () => { store.clear(); },
  /** Test-only: force the next getItem to reject, to exercise catch paths. */
  __failNextGet: () => {
    const orig = AsyncStorage.getItem;
    AsyncStorage.getItem = async (...args) => {
      AsyncStorage.getItem = orig;
      throw new Error('storage unavailable');
    };
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
