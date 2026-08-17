// Pure-logic test config — transpiles TS with babel-preset-expo, runs in node.
// Deliberately avoids the jest-expo RN preset (these tests touch no native code).
module.exports = {
  testEnvironment: 'node',
  // Only active when FAKE_TODAY is set — see jest.calendar.js and `npm run test:calendar`.
  setupFiles: ['<rootDir>/jest.calendar.js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  transformIgnorePatterns: ['node_modules/(?!(date-fns|uuid)/)'],
  // Stub native-only modules that pure-logic code imports transitively but
  // never calls in these tests (they ship ESM that we don't transform).
  moduleNameMapper: {
    // Real in-memory SQLite (node:sqlite), NOT an empty stub. The stub made every module
    // in src/db/queries unexecutable, which is how nine wrong-money bugs shipped green.
    '^expo-sqlite$': '<rootDir>/src/__tests__/__mocks__/expoSqlite.js',
    '^react-native-get-random-values$': '<rootDir>/src/__tests__/__mocks__/empty.js',
    '^expo-ocr$': '<rootDir>/src/__tests__/__mocks__/empty.js',
    '^expo/virtual/env$': '<rootDir>/src/__tests__/__mocks__/expoVirtualEnv.js',
    '^expo-image-picker$': '<rootDir>/src/__tests__/__mocks__/empty.js',
    // Ships ESM `import` syntax this config doesn't transform. Real SHA-256
    // (via Node's crypto), not an empty stub — see the mock's own comment.
    '^expo-crypto$': '<rootDir>/src/__tests__/__mocks__/expoCrypto.js',
    // Ships untransformed ESM; needs a real (empty) glyphMap, see the mock.
    '^@expo/vector-icons$': '<rootDir>/src/__tests__/__mocks__/vectorIcons.js',
    // Real in-memory implementation (not an empty stub) so the AsyncStorage-backed
    // settings stores can be tested for their get/set/default behaviour.
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__tests__/__mocks__/asyncStorage.js',
    // Same reasoning as AsyncStorage: `serverApi`'s session handling is only
    // testable if the keychain genuinely round-trips.
    '^expo-secure-store$': '<rootDir>/src/__tests__/__mocks__/expoSecureStore.js',
    '^expo-device$': '<rootDir>/src/__tests__/__mocks__/expoDevice.js',
  },
};
