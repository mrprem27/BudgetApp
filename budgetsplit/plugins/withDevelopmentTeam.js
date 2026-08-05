const { withXcodeProject } = require('expo/config-plugins');

/** Personal Apple developer team. Change here, not in Xcode — see below. */
const TEAM_ID = '7ZKC4Q77UW';

/**
 * Pin `DEVELOPMENT_TEAM` so signing survives a regenerated project.
 *
 * `ios/` is gitignored and rebuilt by `expo prebuild`, so a team selected in Xcode's
 * Signing & Capabilities editor lives exactly until the next regeneration — after
 * which the build fails with:
 *
 *   Signing for "BudgetSplit" requires a development team. Select a development team
 *   in the Signing & Capabilities editor.
 *
 * Setting it from config makes the generated project correct every time, and puts the
 * team ID somewhere reviewable instead of in local Xcode state.
 *
 * This is a **personal (free) team**, which is also why `withoutPushEntitlement.js`
 * exists: personal teams cannot sign the Push Notifications capability.
 */
module.exports = function withDevelopmentTeam(config) {
  return withXcodeProject(config, cfg => {
    const sections = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(sections)) {
      const bs = sections[key].buildSettings;
      // Target-level configs carry PRODUCT_NAME; project-level ones don't, and
      // setting the team there does not satisfy the signing check.
      if (!bs || !bs.PRODUCT_NAME) continue;
      bs.DEVELOPMENT_TEAM = TEAM_ID;
    }
    return cfg;
  });
};
