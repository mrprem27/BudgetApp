/**
 * ⚠️ TEMPORARY — MUST BE `false` BEFORE THE APP STORE UPLOAD. ⚠️
 *
 * Whether the developer storage screen (`app/storage.tsx`) can be reached.
 *
 * That screen can **replace or erase the user's entire dataset** — `loadDemoData`
 * wipes everything and writes a test fixture, `resetToEmpty` deletes every
 * transaction, group, person, budget and goal. Neither is undoable and neither
 * takes a backup first.
 *
 * It was `__DEV__`, which meant it silently did not exist in a release build.
 * Deliberately widened during the pilot so the same build that goes to testers can
 * also be reset and re-seeded, because reproducing a bug on a hand-built dataset
 * is slower than reloading a known one.
 *
 * **The whole point of it being one constant** is that turning it off is one edit
 * with nothing to hunt for. Set it to `false` and every entry point closes at
 * once: the 7-tap gesture goes inert, the on-screen hint disappears, and the
 * screen bounces back even via a deep link.
 *
 * `devToolsGate.test.ts` fails the suite while this is `true` unless
 * `RELEASE_CHECKLIST.md` still carries the matching **unchecked** blocker — so
 * this cannot quietly become permanent, and the checklist cannot quietly drift
 * from the code.
 *
 * Note it stays a build-time constant rather than an `EXPO_PUBLIC_*` env var on
 * purpose: an env var is absent from a clean checkout or an EAS build without
 * `.env`, so the same source would behave differently in two places for reasons
 * invisible in the diff. A constant is in the diff, and in code review.
 */
export const DEV_TOOLS_ENABLED = true;
