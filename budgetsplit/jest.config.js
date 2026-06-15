// Pure-logic test config — transpiles TS with babel-preset-expo, runs in node.
// Deliberately avoids the jest-expo RN preset (these tests touch no native code).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  transformIgnorePatterns: ['node_modules/(?!(date-fns)/)'],
};
