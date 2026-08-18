# BudgetSplit — Release Checklist

**The single sheet.** Everything that must happen, be verified, be decided, or be
deliberately left undone before the friend-group pilot — plus everything parked
after it, with the trigger that un-parks it.

This file replaces `V2_LAUNCH_CHECKLIST.md`, `DEBT_TRACKER.md`, `V2_FIX_PLAN.md`,
`UI_UX_SWEEP.md`, `STATUS.md`, `PILOT_READINESS_REVIEW.md` and `TAGS.md`. They are
deleted, not archived — git history has them if a decision's reasoning is ever
needed. What survives alongside this file is **reference**, not tracking:
`FEATURES_AND_FLOWS.md` (what each screen does), `ARCHITECTURE.md` (how it's
built), `AGENTS.md` (build/design rules), and the dated analyses
(`V2_PRODUCT_REVIEW.md`, `AUDIT*.md`, `COMPETITIVE_ANALYSIS.md`,
`PERSONAL_REDESIGN.md`).

**Rules for this file:** tick a box only when the thing is true on a device, not
when the code is written. Never delete a line — strike it and date it. Every
claim cites `file:line` or it gets deleted rather than debated.

- **Target:** limited TestFlight pilot to friends. Not a public App Store launch.
- **App version:** 2.0.0 · bundle `com.prem.budgetsplit`
- **Code state:** `feat/pre-pilot-consistency` (13 commits) + `feat/accounts-and-identity`
  (11 commits) — **25 commits unpushed**, nothing backed up off this machine.
- **Suite:** 97 files / 1517 tests green · `tsc --noEmit` clean in app *and* Worker.
- **Cost to date:** ₹0. Workers/D1/KV free plan, free-tier email. No card on file.

---

## 1 · Hard blockers — nothing ships until every box is ticked

- [ ] **Buy the Apple Developer Program** ($99/yr). Gate 0: TestFlight external
      testing, push, App Intents and the widget all sit behind it. This is why
      `plugins/withoutPushEntitlement.js` exists.
- [ ] **Native rebuild** — `npx expo prebuild --clean && npx expo run:ios`.
      `expo-secure-store` is a new native module; the current binary crashes at
      launch without it (degraded gracefully in `src/lib/serverApi.ts`, but the
      feature needs the rebuild). Gates the entire device pass in §2.
- [ ] **`EXPO_PUBLIC_API_URL` present wherever release builds run.** Without it
      there is no account UI at all.
- [ ] **`EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL` likewise** — otherwise Scan degrades
      **silently**. `EXPO_PUBLIC_*` bakes into the bundle at build time, so a
      clean checkout, a stale Metro cache or an EAS build without `.env` gets
      `undefined`. See `.env.example`.
- [ ] **Rehearse `category_global_v1` against a populated database.**
      `src/db/schema.ts:523` **drops and rebuilds the `category` table** and has
      never run against real data. Highest-risk migration in the app. Restore a
      real backup to a scratch device and run it there first.
- [ ] **Confirm demo/seed data is off** in release builds. `seedDemo.ts` and the
      CSV export's hardcoded demo-row signatures drift apart by design.
- [ ] **Rotate the Brevo API key.** It was pasted into a chat transcript and is a
      live credential for the deployed Worker.
- [ ] **Push all 25 commits.** Two branches, neither pushed.
- [ ] **Privacy policy + App Store listing.** Required even for external
      TestFlight, and newly sharp: a server now holds email addresses.
- [ ] **Update the store-listing copy.** In-app copy was corrected on 2026-08-17
      (`VOICE_SHORTCUT_PRIVACY`, `help.tsx`, `Onboarding.tsx`, the backup
      explainer, `FEATURES_AND_FLOWS` §19). The listing is not in this repo and
      still says "nothing leaves your device", which stopped being true when
      sign-in shipped.
- [ ] **India DPDP posture.** The moment one real user signs in, an email address
      is personal data on a server you operate. Being opt-in does not change this.
- [ ] **App icon, splash, screenshots** — never audited. Needs a real asset pass.
- [ ] **`VOICE_SHORTCUT_URL` is `null`.** Every link shared so far carried a
      blank-condition `If`, so the shortcut could only reach its Otherwise
      branch. Until it's re-minted a pilot user cannot install voice capture at
      all: rebuild → import → **open in the Shortcuts editor and read the If
      row** → share → paste the constant.
- [ ] **Device-test Pass 4** (the persona/flag work). `src/lib/featureFlags.ts:47`
      alters the tab bar itself, and that has never rendered on a phone.

---

## 2 · Device pass

Nothing below has ever rendered on a device. **Load demo data first**
(Settings → tap the version row 7× → Load demo data) — an empty app hides most
layout problems. Note the "tap 7×" hint is now `__DEV__`-only, and `app/storage.tsx`
is reachable only in a dev build.

Run it in two once-per-session passes as well: **Reduce Motion on**, and
**Hide amounts on**.

### 2.1 Changed by the pre-pilot consistency pass — highest risk, verify first

- [ ] **Home's hero now leads with Safe-to-Spend.** The single biggest visual
      change in the app. Tap-through breakdown should name every subtraction.
- [ ] **Health scores changed for everyone.** Four equal-weighted pillars
      (Spend / Save / Borrow / Plan), tiers Vulnerable / Coping / Healthy. A new
      user must see a **locked ring + unlock checklist**, never a number.
- [ ] **Onboarding, end to end** — 9 stages, "Skip intro" ~1s in, real group
      creation on the people step, honest summary at the end. Confirm the logo
      animation is untouched and the skip doesn't fight it.
- [ ] **Group recurring totals switched basis** — whole bill with "your share ₹X"
      beneath, my-share on personal surfaces.
- [ ] **Forecast will jump** for anyone with several recurring bills (it is now
      floored by committed bills).
- [ ] **A saved split containing an explicit `0`** now excludes that person where
      Review previously gave them a full share.
- [ ] **Card-bill payment** on the Plan money card — cash down and credit-used
      down, one entry. Money path, never run on a device.
- [ ] **Itemized bills capture a pay method** (the SQL layer was dropping it on
      both insert and update).
- [ ] **Skipped recurring occurrences no longer push a reminder.** Skip one,
      confirm no "renews tomorrow" for that date.
- [ ] Reminder scheduling on-device generally (jest cannot prove any of it).

### 2.2 Built, never seen on a device (accounts/identity branch)

- [ ] Account screen, linked people, invite link/QR, sign-in landing — including
      a real invite round trip **across two phones**.
- [ ] Server backup/restore rows sit with the two file rows as one card.
- [ ] Goals as three Emergency/Need/Want sections; the tag drives funding **and**
      raid order; drag reorders within a section only.
- [ ] "Can I Afford This" — verdict stays the hero; owed-to-you reads as excluded.
- [ ] Attachment reaper, bundled pdf.js (**the storage screen's pdf.js row must be
      gone**), dev-screen gate, Review banner fix, Transfer sheet move.
- [ ] Review's saved views / filters / bulk actions — built, never device-tested.

### 2.3 The full sweep

Roughly **38 screens** (`S-03` … `S-39`) in four blocks — 12 new/unverified,
6 money-critical, 7 analytics/data-in, ~13 config/utility — plus 10 house rules
checked on every screen (touch targets, empty states, card grouping, dividers,
bottom padding, pull-to-refresh, haptics, icons, spacing tokens, colour tokens).
The per-screen detail lived in `UI_UX_SWEEP.md`; walk the app screen by screen
against `AGENTS.md` §1–§12 instead.

- [ ] Block A — the 12 never-rendered screens (Settings, Account, Linked people,
      Invite landing, Sign-in callback, Backup & restore, People, Plan, Goal
      detail, Afford, Review, Quick Add).
- [ ] Block B — money-critical screens.
- [ ] Block C — analytics + data-in.
- [ ] Block D — config/utility.

### 2.4 UPI / payments — never verified where it matters

- [ ] **Android has never run the UPI path at all.** `useUpiApps` returns `null`
      there, so no per-app finding on record applies. One Android build + ₹1 per
      app. This is also the only test that could reopen the PhonePe/Paytm
      blockage, since Android intents carry the calling package.
- [ ] **Google Pay — the largest UPI app — has never been tested on iOS**
      (`gpay://` vs `tez://`).
- [ ] **5 iOS URL schemes are `provenance: 'unverified'`**
      (`src/lib/upiIntent.ts:235-282`). A wrong path drops the payee.
- [ ] **`emvQr.ts` has never been validated against a real QR** — written from
      the EMVCo spec only.
- [ ] **`detectVoiceKind` has never seen real `en-IN` dictation.** Unit-tested
      against the shapes people say; a systematic miss (e.g. "salary") matters.
- [ ] **Income and settle by voice** are built and have never run — no shortcut
      has ever sent `?kind=income`.
- [ ] **The two iCloud shortcut links on a second device.** They resolve for the
      phone that authored them; whether a shared link's *Save File* destination
      re-resolves elsewhere is untested.
- [ ] **The shortcut is named `please-log`, not `Please log`** (iOS reads the
      filename; the live link was minted from the old slugged file). Harmless if
      Siri hears two words — verify. **Do not** change `VOICE_ONE_WAY_NAME`; a
      hyphen cannot be spoken.
- [ ] **Can the system share sheet target a WhatsApp Broadcast List?** The whole
      reminder design rests on it. If not, fall back to copy-to-clipboard.
- [ ] **Smoke-test `expo-file-system/legacy`** on device. Callers left:
      `src/lib/avatar.ts`, `ocrProviders/gemini.ts`. Jest stubs the module, so the
      suite proves nothing either way. (Downgraded from blocker — the legacy API
      *is* implemented in `expo-file-system@56.0.8` — but not closed.)

---

## 3 · Decisions still open

- [ ] **Investments as a Transfer destination.** Decided in principle
      ("move money to investments" becomes a Transfer destination, crypto stays
      out) and **not implemented**. The card-repayment half of the same decision
      landed 2026-08-18.
- [ ] **Monetisation shape.** Deliberately parked until there are users — a tier
      boundary drawn before anyone uses the app is a guess. No paywall,
      entitlement check or purchase SDK exists anywhere, and that absence is
      intentional. **Feature flags are user preferences, never entitlements** —
      do not repurpose them.
- [ ] **The non-engineering cost of running a server.** DPDP obligations, a
      rewritten privacy policy, hosting, uptime, someone on call.
- [ ] **Per-app UPI payload quirks are dead on Android.** CRED receives `mode=04`
      (the parameter it is pinned to avoid) and Airtel loses the `tr` it paid
      with. Structural — the OS chooser means the target app is unknowable. Needs
      a decision, not a patch.

### 3.1 Identity / sync pre-mortem — hold these lines in S2/S3

Nine ways the design goes wrong. Only **F5 is a live defect today**; the rest are
constraints to design against.

| | Failure | The wall that stops it |
|---|---|---|
| F1 | Invite links are made to be forwarded — first stranger to tap gets linked, and gets your number | **Sender approves the claim.** Tapping creates a pending request; nothing binds until approval |
| F2 | "Stop sharing my number" cannot take it back — it's already on their device | Word it as a **disclosure** ("Shared with Rohan on 12 Aug"), never a revocable permission |
| F3 | Document-level last-write-wins silently discards a co-editor's edit, and the shares-sum-to-payments invariant still passes | Compare-and-set on `updated_at`; the server rejects stale writes. **Never silent LWW on money** |
| F4 | `attachment_uri` is a `file://` path from another device — "receipt attached" over nothing | Rows sync, photos never do; the receiving device nulls the URI |
| F5 | ⚠️ **`seed.ts` writes `is_me = 1` with a fresh `uuid()` per install** — one account can get two "me" rows, and every my-share figure silently reads one of them | Bind the local `is_me` row to `person.remote_uid` at sign-in |
| F6 | `category` has `UNIQUE(name, kind)`, so adding `is_deleted` makes delete-then-re-add "Groceries" fail | No `is_deleted` on `category`; sync through the existing `category_tombstone` |
| F7 | `settings` holds one-time migration flags (`schema.ts:771-786`) — syncing it wholesale makes a device **skip a migration and record it as done** | Explicit key allowlist. Migration flags are device state and are never synced |
| F8 | Email is the only identity and cannot be changed or merged — a typo at sign-in is a second account with none of your backups | A change-email flow; **at minimum, show the signed-in email wherever a restore is offered** (cheap, and pilot-relevant) |
| F9 | Restore replaces everything and, with sync on, propagates. Today's alert says "this device", which stops being true | Refuse restore while sync is on |

---

## 4 · Known and accepted for the pilot

Recorded so nobody re-discovers them as bugs.

- **`openDB()` re-runs ~40 `ALTER`s every launch.** Cold-start cost, accepted.
- **`PRAGMA foreign_keys` is OFF** on the live connection (ON only during
  migrations, `schema.ts:294-438`); cascades are hand-rolled. Flipping it needs
  every delete path audited first.
- **Voice auto-save has no off switch.** A confident phrase posts itself; the
  guard is Undo plus the duplicate prompt. Deliberately no flag — add one only if
  it misfires in practice.
- **Files over the ~300-line rule**: `review.tsx` (pinned at ≤750 by
  `sourceCounts.test.ts`, only ever lowered), `Onboarding.tsx`, `itemized.tsx`.
  Extraction is opportunistic policy, not a backlog.
- **Categories are stored as strings, not IDs.**
- **Dead schema columns**: `person.remote_uid`, `budget_group.limit_daily/monthly/yearly`,
  `budget_group.carry_over`.
- **A mid-phrase lone numeral is ignored; a leading one is not** — "do you have
  change" parses as ₹2. The leading rule is what makes "450 groceries" work, so
  tightening it costs more than it saves.
- **No background drain for voice captures** — filed at launch and on every
  foreground. `expo-background-task` would be sooner, at the cost of a native
  module and a silently-failing OS path.
- **Anyone who used the app before `7b597e1` saw their health score move once**,
  with no notice. Nothing to migrate; recorded rather than fixed.

---

## 5 · Open debt

Each line is real, evidenced, and not blocking the pilot.

### Blocked outside the codebase

- **GPay import** — blocked on the source export format.
- **Live email ingestion** — Google OAuth for `gmail.readonly` needs a CASA
  Tier-3 assessment. The paste path shipped as the workaround.
- **UPI hand-off refused by PhonePe / Paytm / Amazon Pay / WhatsApp.** Closed on
  our side: every payload lever was varied, HTTPS universal links are impossible
  (PhonePe serves 404 at its `apple-app-site-association` path), and the
  aggregator `sign=` is minted by the *payee's* PSP. The way round is the
  request-QR. Reopens only with merchant/TPAP registration.

### Open, small, unresolved

- **CRED's `mode` vs `tr` was never isolated** — it failed once *both* were added,
  so the payload is the cause but not which half. Both are off today, closing the
  question by avoidance. Two attempts settle it.
- **Amazon Pay and WhatsApp were both tested against the same `@kotak` handle** —
  an uncontrolled variable, and Kotak is not among WhatsApp's five PSP banks.
  Retrying against `@okhdfcbank`/`@ybl` could show it was never blocked.
- **`help.tsx` is a third collapsible**, structurally unlike the other two (bare
  header + card body, plus a nested item-level accordion). Converting to
  `SectionCard` adds card chrome — a real visual change.
- **Insights' empty state has no CTA** (`app/insights.tsx:339`), against
  `AGENTS.md` §2. Every other screen complies.
- **`TransactionRow` never displays pay method.** Captured everywhere now,
  shown only in Review and on transaction detail. A density question, not a bug.
- **~12 inline `date-fns` patterns and ~15 inlined `(x/100).toString()` calls**
  remain after `dateFormat.ts` and `paiseToInput` landed. Correct today;
  mechanical to convert.
- **45 files still import `src/constants/*` shims** instead of the canonical
  `src/theme`. Nothing is broken — the shims re-export — but two import paths for
  one token set is drift.
- **`add/quick.tsx` keeps a container `gap`**, so `SectionHeader` margins add up
  (the 40px found under Split). Patched at the header; removing the gap re-spaces
  all nine blocks and belongs in its own change.
- **`TransferBody` lives outside `finance/add/`** and mounts its own sheets,
  breaking the one-overlay-at-a-time invariant `QuickAddSheets` enforces.
- **Transfer has no `DetailChips`** — no tags, receipt, time, location or repeat;
  its note writes `transferNote`, a *different field* from every other kind's
  `note`. Consolidating means deciding which fields a settlement legitimately
  has, which is a product question.

### Schema gap: sync prerequisites

**Only `txn` carries what sync needs.** `updated_at` + `is_deleted` exist at
`src/db/schema.ts:73-75` and nowhere else. `budget_group`, `recur_skip`,
`savings_goal` and `savings_txn` have `created_at` alone; `person`,
`group_member`, `category`, `category_budget` and `settings` have neither.
Without `updated_at` last-write-wins has nothing to compare; without
`is_deleted` a delete cannot propagate, so the other device keeps the row and
pushes it back. This is a gap in the app as it stands today, not only a cost of
S2. Two carve-outs already decided: `category` uses `category_tombstone`
(its `UNIQUE(name, kind)` would block re-adding a name), and `settings` is never
synced as a table.

### Money-model gap: accounts as entities

`INCOME_LANDING` asks "Landed in ___" and **nothing reads the answer** —
`src/lib/cash.ts` branches on `PayMethod.Card` alone. Cash is one pooled figure,
so choosing Bank vs Cash only labels the transaction. Real balances would reopen
Total Money, the settlement engine and the transfer flow. Card repayment landed
without this; the rest waits for the per-method baselines pass, which touches
`moneyProfile.ts`, `cashQuery.ts`, `cash.ts`, `MoneyEditorSheet.tsx`,
`TotalMoneyCard.tsx` and the onboarding money step, and adds
`money.opening_bank` / `money.opening_wallet`.

---

## 6 · After the pilot — parked, with the trigger

| Item | Why it's parked | Un-parks when |
|---|---|---|
| **Multi-device sync (S2)** | Nine tables lack the columns sync needs, so it opens with a migration across every write path | You want it enough to spend weeks |
| **Shared groups (S3)** | Hardest rung: identity merging + multi-writer money | S2 is running and boring |
| **Per-method money baselines** | Money-correctness risk; deserves its own reviewed pass | The next money-model pass — accounts-as-entities and investments-as-transfer are waiting with it |
| **Monetisation / premium tier** | A tier boundary drawn before anyone uses the app is a guess | After the pilot. Needs a new entitlement concept; nothing existing can be repurposed |
| **Push notifications** | Only local notifications exist; `withoutPushEntitlement.js` strips the entitlement a personal team can't sign | Gate 0 clears — then delete the plugin |
| **App Intents** | True hands-free, no app launch, Siri reading results back. Native Swift target + entitlements + App Group | Gate 0 clears. Note Apple's own forums report inline parameters falling back to a prompt |
| **In-app mic capture** | On-device recognition, live partial transcript, insert on silence. **No first-party Expo speech-to-text exists** (`expo-speech` is TTS); needs a native module on the `modules/expo-ocr` precedent | You want the Shortcuts round trip gone |
| **Widget** | Scope genuinely undecided — balance? today's spend? quick-add? | You answer that **and** Gate 0 clears |
| **WhatsApp reminder composer** | Framing decided, phone field already shipped; only the compose step is left | **Any time — it's small** |
| **Goals surplus sweep** | Nothing pushes an underspent month into goals; the only automatic inflow is the fixed per-goal allocation. Must be explicit opt-in | **Any time** |
| **Scheduled reminder nudge** | Needs an overdue scan, a per-person cooldown store, notification routing, and a cadence that cannot be guessed from an empty pilot. Get it wrong and users disable notifications, losing the channel permanently | The manual composer ships first — it is a strict prerequisite |
| **Insights three-tier restructure** | One always-present headline (today it renders *only* when overspending, `insights.tsx:99`), then Fact, then Forecast. Rows 6/7/8/10 are four hand-written variants of one row | Post-pilot polish |
| **Import restructure (remainder)** | pdf.js vendoring is done; `app/import.tsx` and `paytmParse.ts` are still one long screen and one long parser | Opportunistic |
| **R2 object storage** | Needs a dashboard opt-in that can ask for a card; KV covers it today | Backups with receipt photos exceed ~25 MiB |
| **Cloudflare Email Sending** | Needs Workers Paid ($5/mo) + a domain you own; Brevo free tier works | Deliverability from the current sender becomes a problem |
| **Gmail OAuth (live email import)** | `gmail.readonly` is a restricted scope → public release needs OAuth verification + **CASA Tier-3 (~$thousands, annual)** | Phase 1 needs none of it: an OAuth client in **Testing** mode allows ≤100 manually-added test users behind an "unverified app" screen. Gate the entry point behind a beta flag |
| **Account Aggregator (AA)** | India's consent-based bank-data framework; needs a partner integration. Dropped for the pilot, not deferred | Going properly public |
| **GPay import (Phase GP)** | Parser spec is written against a real statement (`Paid to` = expense, `Received from` = income, UPI id, amount→paise); on-device PDF text extraction is the hard part | A lib spike proves PDF extraction on-device |
| **Unified `SplitEditor`** | One reusable component (member select + type toggle + per-mode inputs + remainder validation) for Quick Add, GPay review and Itemize — kills the last duplicated split UI | Lands with Phase GP |
| **Global categories, full vision** | The global catalog shipped; what's left is the multi-user half — a category becomes undeletable while shared, un-adopted ones fold into Others, and budgets become per-group-as-a-whole | Real multi-user sync exists (S3) |
| **Retire the voice Shortcuts apparatus** | When mic/App Intents land, delete `voiceDrain.ts`, `voiceShortcut.ts`, `voiceShortcutFile.ts`, `scripts/build-shortcuts.ts` and the import→share→paste round trip that has cost six passes | The replacement capture path ships |

---

## 7 · Environment and build workarounds still in place

- **`plugins/withSwiftUICoreLinkFix.js`** — `expo-camera` pulls SwiftUI in, and
  Xcode 16's *simulator* SDK ships `SwiftUICore.tbd` as a private framework only
  SwiftUI may link. The plugin adds `"$(SDKROOT)/System/Library/Frameworks"` to
  `FRAMEWORK_SEARCH_PATHS`. ⚠️ **`-Wl,-weak_framework,SwiftUICore` does NOT fix
  it** — tried on pod targets and the app target, identical failure. Don't
  re-try. Delete when a newer Xcode stops emitting the implicit link.
- **`plugins/withoutPushEntitlement.js`** — strips `aps-environment`, which a
  personal Apple team cannot sign. Deleting the plugin is the small part; moving
  to a paid team is the actual blocker.
- **`EXPO_PUBLIC_*` bakes at build time** — see §1. `.env.example` documents both.
- **KV is standing in for R2** (`/health` reports `"storage":"kv"`), capping
  backups with photos at ~25 MiB.
- **Brevo is standing in for Cloudflare Email Sending** (`"mail":"brevo"`).
- **Jest maps `expo-sqlite`** to a real in-memory implementation over
  `node:sqlite` (`__mocks__/expoSqlite.js`). It used to be an empty stub, which
  made every module in `src/db/queries/` unexecutable — no assertion about them
  could ever have failed. Use `openTestDb()` from `src/__tests__/dbHarness.ts`,
  which applies `SCHEMA` **and** `COLUMN_MIGRATIONS`; `SCHEMA` alone is months
  out of date.
- **Jest stubs `expo-file-system`**, which is exactly why the legacy-API question
  can't be settled by the suite.
- **`ReviewRowCard` must stay at module scope.** Defining it inside
  `ReviewScreen` creates a new component type per render, remounting the row and
  dropping keyboard focus mid-amount. Has regressed once.
- **New one-time schema fixes are appended, never prepended** —
  `schemaFixes.test.ts` pins that a failing fix leaves nothing marked applied.
  `openDB` applies fixes *before* `seedIfNeeded`, so a repair can complete
  against an empty DB and the broken row appear a moment later; that's why
  `fix_group_creator_roles_v2` is a new key rather than an edit to v1.
- **Editing a shortcut invalidates its link** — Apple keeps serving the shared
  version. Rebuild → import → re-share → replace the constant. That round trip
  has cost four passes; check the constant is current before believing any setup
  bug report.

---

## 8 · Standing rules

1. **A regression test is verified by reverting its fix and watching it fail.**
   Green is not evidence unless something was capable of turning red — `f9d0e9c`
   passed **1335 tests** over a save path that silently deleted budget lines.
2. **A destructive replace needs a preservation assertion**, not just a
   replacement one. Copy the shape in `txnUpdate.test.ts`.
3. **Never show one total across kinds.** Money in, money out and money moved do
   not belong in a single figure. Settlements are excluded from *analysis* and
   shown in the *ledger*.
4. **Money is always integer paise.** `parseToPaise()` in, `formatRupees()` out.
5. **Multi-table writes go inside `db.withTransactionAsync()`.** Zero partial writes.
6. **After a write, call `refresh()`** from `useDataRefresh()`.
7. **`npm run test:calendar` has a known flake** — it spawns jest 7×, and three
   times a randomly chosen suite died at *load* time (once a `SIGSEGV` with zero
   tests failing: a native runner crash, not app code). Never reproduced in
   isolation. **Re-run the single date directly before believing it.**

---

## Appendix · What the pre-pilot consistency pass changed (2026-08-18)

13 commits on `feat/pre-pilot-consistency`. The rule it ran on: *a number the app
shows must be computed from the data the app has, or not be shown.*

**Consolidated** — share math was re-implemented ~12 times with two disagreeing
fallbacks, and "the transaction's total" had four implementations (Search summed
*payments* for expenses, so it disagreed with Reports on the same row). Two split
engines disagreed on a zero: `0 shares` excluded a person in Add and gave them a
full share in Review. Four split-label vocabularies and three cadence helpers,
two of which silently dropped `recur_interval` so "every 3 months" read as
"monthly". Recurring was rendered four unsynchronised ways, two skip-blind — as
were reminders, which pushed "Rent renews tomorrow" for occurrences the user had
explicitly skipped.

**Fixed math** — afford couldn't see shared-group bills at all (it read the
personal group only, while Plan and Home looped every group) and counted one
occurrence per series, undercounting every weekly bill. The forecast ignored
recurring bills it already knew about. `recurringMonthlyEquivalent` passed
unknown cadences through unchanged, so a one-off could be summed as monthly.
Itemized bills never persisted a pay method, so card-paid bills were booked as
cash out. Import guessed categories from the seed list rather than the user's.

**Rebuilt** — the health score paid an **empty database 59/100 "Fair"** from
neutral defaults; it is now four equal-weighted pillars with a minimum-data gate
(no number below 30 days of history, one income and 10 transactions). Home leads
with **Safe-to-Spend** (`liquid − my-share bills − unfunded goal contributions −
net owed`, one assembly with two readers). Card repayment is modelled. Onboarding
was rebuilt so every answer lands somewhere visible — of eight questions, only
three used to.
