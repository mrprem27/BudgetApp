// Pure-logic test config — transpiles TS with babel-preset-expo, runs in node.
// Deliberately avoids the jest-expo RN preset (these tests touch no native code).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  transformIgnorePatterns: ['node_modules/(?!(date-fns|uuid)/)'],
  // Stub native-only modules that pure-logic code imports transitively but
  // never calls in these tests (they ship ESM that we don't transform).
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/src/__tests__/__mocks__/empty.js',
    '^react-native-get-random-values$': '<rootDir>/src/__tests__/__mocks__/empty.js',
    '^expo-ocr$': '<rootDir>/src/__tests__/__mocks__/empty.js',
    '^expo-image-picker$': '<rootDir>/src/__tests__/__mocks__/empty.js',
    // Ships untransformed ESM; needs a real (empty) glyphMap, see the mock.
    '^@expo/vector-icons$': '<rootDir>/src/__tests__/__mocks__/vectorIcons.js',
    // Real in-memory implementation (not an empty stub) so the AsyncStorage-backed
    // settings stores can be tested for their get/set/default behaviour.
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__tests__/__mocks__/asyncStorage.js',
  },
};
