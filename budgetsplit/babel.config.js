module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin powers Reanimated v4 worklets and MUST be the
    // last plugin. (Before this file the project used Expo's default transform;
    // we keep babel-preset-expo so nothing else changes.)
    plugins: ['react-native-worklets/plugin'],
  };
};
