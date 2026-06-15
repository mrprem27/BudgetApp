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
  },
};
