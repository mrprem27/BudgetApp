# Dev build + local reminders — setup guide

The reminder features (renewal reminders, daily log nudge) use **local
notifications**. These don't run in **Expo Go** — you need a one-time **dev
build** of the app. This works on a **free Apple ID** (no $99 needed); the only
catch is a free-account app **expires after ~7 days**, so you re-run one command
to reinstall.

> Everything here is on-device. No push server, no account, nothing leaves your
> phone — consistent with the app's offline promise.

## One-time setup (~25–35 min, mostly waiting)

Prereqs: a **Mac with Xcode** installed, your iPhone, and a USB cable.

1. **Generate the native project**
   ```sh
   cd budgetsplit
   npx expo prebuild --platform ios
   ```
   This creates an `ios/` folder from `app.json` (includes the notifications config).

2. **Open it in Xcode once to sign it**
   ```sh
   open ios/*.xcworkspace
   ```
   - Select the app target → **Signing & Capabilities**
   - **Team:** pick your personal Apple ID ("Add an Account…" with your Apple ID if needed → it appears as *Your Name (Personal Team)*)
   - **Bundle Identifier:** make it unique, e.g. `com.yourname.budgetsplit`

3. **Prepare your iPhone**
   - Plug it in, **Trust** the computer when prompted
   - iOS 16+: Settings → Privacy & Security → **Developer Mode** → On (the phone restarts)

4. **Build & install onto the phone**
   ```sh
   npx expo run:ios --device
   ```
   Pick your iPhone when prompted. First build compiles for ~10–20 min. After it
   installs, on the phone go to **Settings → General → VPN & Device Management**
   and **Trust** your developer certificate, then open the app.

5. **Turn on reminders**
   In the app: **Settings → Reminders** → toggle *Renewal reminders* / *Daily log
   reminder* → tap **Allow** when iOS asks for notification permission. You can
   set **how many days before** a charge to start (1–7) and the **exact time**
   for each (defaults: 9 AM, 1 day before · 8 PM daily). Tap **Send a test
   reminder** to see one fire in ~5 seconds.

## Every ~7 days (free account only)

The app stops launching after ~7 days on a free account. To refresh it:
```sh
npx expo run:ios --device
```
(With a paid Apple Developer account, $99/yr, this stretches to ~1 year and also
unlocks push + the home-screen widget.)

## Day-to-day

- Keep using **Expo Go** (`npx expo start`) for normal JS work — fast and easy.
- Use the **dev build** only when you want to test notifications.
- Reminders rebuild automatically on app open / when you change a recurring rule.

## What works on free vs paid Apple account

| | Free Apple ID | Paid ($99/yr) |
|---|---|---|
| Run on your own phone | ✅ (re-install ~weekly) | ✅ (~yearly) |
| **Local** reminders (this feature) | ✅ | ✅ |
| Push (remote) notifications | ❌ | ✅ |
| Home-screen widget (App Groups) | ❌ | ✅ |
| TestFlight / App Store | ❌ | ✅ |

## If you want to undo all of this

This work lives on the `feat/dev-build-notifications` branch. To abandon it:
```sh
git checkout main
git branch -D feat/dev-build-notifications
```
`main` stays exactly as it was before.
