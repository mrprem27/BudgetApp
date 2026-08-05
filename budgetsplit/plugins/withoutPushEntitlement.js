const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Strip `aps-environment` from the iOS entitlements.
 *
 * The `expo-notifications` plugin adds it unconditionally, which turns on the Push
 * Notifications capability. That breaks signing on a **personal (free) Apple
 * developer team** — those cannot create a provisioning profile with Push
 * Notifications, so a Release build fails with three errors before it starts:
 *
 *   Cannot create a iOS App Development provisioning profile for "com.prem.budgetsplit".
 *   Personal development teams do not support the Push Notifications capability.
 *
 * This app never uses remote push. Every notification is scheduled locally
 * (`scheduleNotificationAsync` with DATE/DAILY triggers in `src/lib/notifications.ts`),
 * and local notifications need neither the capability nor the entitlement. There is no
 * `getExpoPushToken`, `getDevicePushToken` or push-token listener anywhere in the app.
 *
 * ⚠️ **Must be registered BEFORE `expo-notifications` in app.json.** Expo composes
 * mods by wrapping, so the *last* registered mod runs *first* — the intuitive order
 * is backwards here, and getting it wrong fails silently: prebuild succeeds and the
 * key is simply still there. Verified by deleting the generated `.entitlements` and
 * re-running prebuild; the file must come back as an empty `<dict/>`.
 *
 * Editing the generated `.entitlements` by hand would work until the next
 * `expo prebuild` silently put it back — `ios/` is gitignored and regenerated.
 *
 * If remote push is ever added, delete this plugin AND move to a paid Apple developer
 * team — the entitlement is not the blocker, the free team is.
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, cfg => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
