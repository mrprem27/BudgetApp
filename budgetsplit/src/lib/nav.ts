/**
 * Just the three methods used, rather than expo-router's `ImperativeRouter` —
 * which is not exported under a public name, so typing against it means reaching
 * into `expo-router/build/`. Structural also keeps this file free of React and
 * RN, so it is unit-testable like everything else in `src/lib`.
 */
export type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: never) => void;
};

/**
 * Go back, or go somewhere sensible when there is no back to go to.
 *
 * `router.back()` on an empty stack does nothing at all — no error, no movement,
 * just a Back button that does not work. That is not a hypothetical: several
 * screens here are reachable from OUTSIDE the app, and arrive as the first and
 * only route in the stack.
 *
 * - A tapped reminder cold-starts straight into `/plan/recurring`, `/add/quick`
 *   or `/reports` (`lib/notificationRoutes`).
 * - The voice shortcut deep-links into `/add/quick?q=…`
 *   (`VOICE_DEEP_LINK`).
 * - A sign-in or invite link lands on `/auth` or `/link`.
 *
 * In every one of those the header's ✕ or ‹ was dead, and the only way out was
 * to kill the app. The fallback is where the screen *belongs* in the hierarchy,
 * which is also what the user would have pressed Back to reach — so a warm start
 * and a cold start end up in the same place.
 *
 * `replace`, not `push`: the stranded route should not stay behind the fallback,
 * or Back from the fallback returns to the screen the user just left.
 */
export function backOr(router: BackRouter, fallback: string): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
