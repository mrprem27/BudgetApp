const { withXcodeProject } = require('expo/config-plugins');

const SDK_FRAMEWORKS = '"$(SDKROOT)/System/Library/Frameworks"';

/**
 * Let the linker resolve `SwiftUICore` from the SDK properly.
 *
 * Xcode 16's simulator SDK ships `SwiftUICore.tbd` as a private framework that only
 * SwiftUI may link. Any pod pulling SwiftUI in — `expo-camera`, needed for live QR
 * scanning — makes the linker emit an *implicit* link to it, and the build dies:
 *
 *   cannot link directly with 'SwiftUICore' because product being built is not an
 *   allowed client of it
 *
 * Adding the SDK's Frameworks directory to `FRAMEWORK_SEARCH_PATHS` lets the linker
 * resolve the real framework instead of the restricted `.tbd` stub.
 *
 * ⚠️ `-Wl,-weak_framework,SwiftUICore` does **not** fix this — it was tried first and
 * the build failed identically, on both the pod targets and the app target. Don't
 * re-try that route.
 *
 * Toolchain workaround, not a fix to our code: try deleting this whenever Xcode moves.
 * Lives as a config plugin because `ios/` is gitignored and regenerated — a hand-edit
 * survives exactly until the next `expo prebuild`.
 */
module.exports = function withSwiftUICoreLinkFix(config) {
  return withXcodeProject(config, cfg => {
    const sections = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(sections)) {
      const bs = sections[key].buildSettings;
      if (!bs || !bs.PRODUCT_NAME) continue;
      const cur = bs.FRAMEWORK_SEARCH_PATHS ?? ['"$(inherited)"'];
      const list = Array.isArray(cur) ? cur : [cur];
      if (!list.some(v => String(v).includes('SDKROOT'))) {
        bs.FRAMEWORK_SEARCH_PATHS = [...list, SDK_FRAMEWORKS];
      }
    }
    return cfg;
  });
};
