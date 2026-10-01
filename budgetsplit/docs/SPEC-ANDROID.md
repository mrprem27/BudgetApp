# SPEC — the app on Android

`Status: CODE READY 2026-10-01, never run on an Android phone · Tracker: V-07, V-04, D-03 · Guard: androidReady.test.ts`

The app is one codebase (Expo, React Native). Almost all of it was already written for both
platforms. This is what was not, what was done about it, and what is left that only a phone or a
build can answer.

## 1 · What stood in the way, and what was done

| | Was | Now |
|---|---|---|
| **A crash** | The text reader (`modules/expo-ocr`) is Apple-only and was loaded as a required native module. On Android that throws at import, so Split by items (which reaches it through the receipt reader) would not open | Loaded as optional; `ocrAvailable` says whether the phone can read text itself |
| **Receipt scan** | The button was hidden on everything but iOS | Shown wherever a receipt can be read: on the phone (iOS), or by the cloud reader when it is on (both). On Android with Cloud Receipt Scanning off there is no button, because it could only fail |
| **Attaching a photo** | iOS asked "take or choose"; Android went straight to the camera, so a receipt already in the gallery could not be attached | One chooser for both (`hooks/photoSource.ts`): the action sheet on iOS, a three-button alert on Android |
| **Font weights** | Four labels asked a loaded font for bold. Android answers by dropping the font | A weight is a font family here (`Inter_600SemiBold`); the one mono figure keeps bold on iOS only |
| **Version code** | Missing from `app.json` | `versionCode: 1` |

Checked and already right: reminders have an Android channel; the tab bar uses a flat
background on Android instead of live blur; sheets close on the hardware back button
(`onRequestClose`); no alert has more than three buttons; shadows carry `elevation`; the
keyboard goes through `react-native-keyboard-controller` on both; pay by UPI hands off through
the system's own chooser.

## 2 · Different on Android, on purpose or for now

| | iOS | Android |
|---|---|---|
| Reading a receipt | Cloud reader, falling back to the phone's own | Cloud reader only. No reader on the phone until an ML Kit module is written (`V-07`) |
| Reading a receipt with the cloud off | Works, on the phone | No scan button |
| Pay by UPI | The app lists the UPI apps you have and opens the one you pick | Android's own "open with" chooser (`V-04` is opening a chosen app directly) |
| Tab bar | Live blur | Flat |
| Hands-free voice shortcut | Was Siri; retired | None |
| Reading bank SMS | Not possible | Possible, but a Play Store review that names budgeting apps. Not built |
| Opening a CSV or PDF from another app into Import | Works (file sharing) | Not wired; pick the file from inside Import |

## 3 · What only a phone or a build can answer

Nothing below can be checked from this Mac: it has no Java and no Android SDK.

1. **A build.** Two ways, yours to pick:
   - Android Studio on this Mac, then `npx expo run:android` with a phone plugged in.
   - Expo's cloud build (`eas build -p android`): needs your Expo account and an `eas.json`,
     which the repo does not have.
2. **The keyboard** on every form (the focused field stays visible, the footer behaves).
3. **Edges**: status bar, the gesture bar at the bottom, the notch.
4. **Text**: line heights and clipping in the mono figures; the font weights above.
5. **UPI**: pay and request, end to end (`D-03` has never been run).
6. **Notifications**: the permission prompt on Android 13 and later, and a reminder arriving.
7. **Biometric lock**, the camera for QR codes, the photo picker, PDF export and sharing.

## 4 · Not started

- An ML Kit text reader, so Android can read a receipt without the cloud.
- `V-04`, opening a chosen UPI app directly.
- Play Store listing, signing key and the data-safety form.
