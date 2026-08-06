const { withXcodeProject } = require('expo/config-plugins');

/**
 * Personal Apple developer team. Change here, not in Xcode — see below.
 *
 * Do NOT read this off `security find-identity`, which prints only the certificate's
 * common name — "Apple Development: 917734998963 (7ZKC4Q77UW)". The parenthesised
 * value there is the certificate identifier, *not* the team; the team is the subject's
 * OU. Mistaking one for the other fails with "No Account for Team", because no Apple
 * ID owns the team you named.
 *
 *   security find-certificate -c "Apple Development" -p | openssl x509 -noout -subject
 *   #=> ... (7ZKC4Q77UW), OU=Q85DBJ88R8, ...   <- OU is the team
 *
 * Cross-check against `IDEProvisioningTeamByIdentifier` in `defaults read com.apple.dt.Xcode`,
 * which lists the teams whose Apple ID is actually signed in.
 */
const TEAM_ID = 'Q85DBJ88R8';

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
