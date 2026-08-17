/**
 * `expo-device` ships ESM this jest config doesn't transform, and only one value
 * is ever read (the device label sent with a new session), so a fixed pair of
 * fields is the whole surface.
 */
module.exports = {
  modelName: 'Test Phone',
  osName: 'iOS',
};
