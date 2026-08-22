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

**Interactive version:** <https://claude.ai/code/artifact/c81d7ac6-60f3-4bad-b542-ed99c3eed37c>
— same content, but tickable on the phone while you walk the app, with a notes
box per screen and a "copy feedback" button that collects what you flagged.

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

- [x] **`KDF_ITERATIONS`, and getting the cost off the drawing thread.** ✅ Both
      halves done. 50,000 rounds, and `lib/pbkdf2.ts` unrolls the loop so it yields
      to the event loop rather than holding the thread for the whole derivation —
      backup and restore now show a moving percentage instead of freezing. Output
      is byte-identical to `CryptoJS.PBKDF2`, asserted against CryptoJS itself
      rather than a fixture, because a one-byte difference would make every backup
      already written permanently unopenable.
- [ ] **Set `DEV_TOOLS_ENABLED` to `false`** (`src/constants/devTools.ts`) before
      the App Store upload. It is deliberately `true` for the pilot so a tester
      build can be erased and re-seeded, which means the shipped app currently
      contains a screen that **deletes every transaction, group, person, budget
      and goal** with no backup and no undo, reachable by tapping the version 7×
      in Settings → About. One edit closes every entry point.
      `devToolsGate.test.ts` fails the suite if this line and the constant ever
      disagree, so neither can drift — but the *decision* is still yours to make.

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
- [x] ~~**Rehearse `category_global_v1` against a populated database.**~~
      **Closed 2026-08-19 — the rehearsal exists as a test.**
      `src/__tests__/categoryGlobalMigration.test.ts` builds the *actual*
      pre-migration shape a real device has on disk (per-group rows,
      `group_id NOT NULL`, no `UNIQUE(name, kind)`) and runs the real migration SQL
      against it via `node:sqlite`, covering dedupe by `(name, kind)`, kind
      separation, idempotency on a second launch, a safe no-op on an
      already-migrated DB, and data left intact when the migration throws
      mid-flight. That is stronger than a one-off scratch-device run, because it
      re-runs on every commit. Note also that pilot users install fresh, so this
      migration never executes against their data at all.
- [ ] **Confirm demo/seed data is off** in release builds. `seedDemo.ts` and the
      CSV export's hardcoded demo-row signatures drift apart by design.
- [ ] **Rotate the Brevo API key.** It was pasted into a chat transcript and is a
      live credential for the deployed Worker.
- [x] ~~**Push all 25 commits.** Two branches, neither pushed.~~
      **Closed — the claim was false.** `HEAD` is level with `origin`, and both
      named branches are ancestors of it, so their commits are on the remote too.
      The only unpushed commits are three merge commits on an unrelated `Test`
      branch. Verified with `git log --branches --not --remotes`.
- [ ] **Privacy policy + App Store listing.** Required even for external
      TestFlight, and newly sharp: a server now holds email addresses.
- [x] **Update the store-listing copy.** ✅ Draft rewritten in `STORE_LISTING.md`
      now that sync ships: it distinguishes personal data (which genuinely never
      leaves the device) from shared groups (which do, sealed, with no key on the
      server), which is both the honest version and the selling point. The last
      flat "nothing leaves your phone" in the tree — `SETUP_DEVBUILD.md` — is
      corrected too. **Still yours to do: paste it into App Store Connect and
      confirm the privacy answers.** Original note: Draft ready to paste at
      [`STORE_LISTING.md`](./STORE_LISTING.md), including the privacy-questionnaire
      answers — receipt photos count as collected because they leave the device,
      and they are ON by default. An undeclared data type is a rejection.
      Original note: In-app copy was corrected on 2026-08-17
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

- [ ] **Home's hero leads with spend again; Safe-to-Spend moved to a strip above
      it, relabelled "yours to spend".** It briefly *was* the hero, and that put
      three time bases in one card — a horizon-scoped headline over a
      period-scoped spend figure over a `spent ÷ budget` bar, with the
      Today/Month/Year pills that drive two of the three sitting *below* the card.
      **Switch Today → Month → Year and watch:** everything inside the card must
      move together, and the strip above must not. Card height must not jump.
      Tap-through breakdown should still name every subtraction.
- [ ] **Safe-to-Spend subtracts two more things.** Card balance to repay (card
      spend never lowered cash, so nothing claimed it before) and everyday
      spending ahead (a trimmed daily rate × days left). Expect the figure to
      **drop**, sometimes below zero — that is the correction, not a bug. Horizon
      is now a rolling 30 days, not month-end, so a bill early next month is
      already visible late this month.
- [ ] **A toast after logging an expense** says what it left behind. Fires after
      the Add screen dismisses; must never appear on income or a transfer, and a
      failure to compute it must never look like a failed save.
- [ ] **Settle-up now asks "did that payment go through?"** on return from the UPI
      app, the same prompt Scan & Pay has always had. Verify: settle via UPI →
      background → return, the prompt appears **once**; *no* writes nothing; *yes*
      writes exactly one settlement per group with the right direction and scope.
      Return after 6 h → no prompt. Bounce straight back (under 5 s) → no prompt.
      Then the double-write guard: settle via UPI, return, and tap **Save** by hand
      — exactly one settlement should exist, not two.
- [ ] **Dates render identically everywhere now.** The sweep replaced inline
      patterns that *contradicted* `dateFormat.ts` — "04 Jun 2026" vs "4 Jun 2026",
      "Jun 2026" vs "June 2026", and a datetime that used a comma on the backup
      screens and a middot on transaction detail. Spot-check transaction detail,
      backup, audit log, goal cards and group recurring.
- [ ] **44 files moved from the `src/constants/*` shims to `src/theme`.** No visual
      change intended — if anything looks mis-tinted or mis-spaced, this is why.
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

### 2.3 The full sweep — 36 screens, 106 checks

Blocks run in order of risk: **stop after any block and you have still covered
what matters most.** There is an interactive version of exactly this list (with
a per-screen notes box and a "copy feedback" button) linked at the top of this
file.

| | House rule — true on every screen |
|---|---|
| `§1` | One hero per screen — two numbers competing to be biggest is a failure |
| `§2` | Empty states have all four parts: icon, title, explanation, button |
| `§3` | Nothing floats bare on the background — rows and fields live in a card |
| `§4` | Rows ≥52pt, and values don't truncate (“Househol…”) |
| `§6` | Touch targets ≥44pt — no tap that needs aiming |
| `§9` | Spacing comes from the scale — no gap that looks like a mistake |
| `§11` | Motion is polish, never the only signal that something changed |
| `§12` | Card-grouped rows stay contiguous — no list sliced into slabs |
| `—` | Nothing hides under the FAB, the tab bar, or the notch |

#### Block A — New or changed today (never seen on device)

Needs the rebuild: npx expo prebuild --clean && npx expo run:ios

- [ ] **S-06 Settings** — `app/(tabs)/settings.tsx`  
      Open: Settings tab  
      *Changed:* Account section added; section spacing now computed, not hardcoded
      - [ ] Account section appears, directly under the profile card
      - [ ] Profile subtitle shows your email when signed in, else “Offline-first · sign in to back up”
      - [ ] First section isn't double-spaced from the profile card; none is crushed
      - [ ] Version row shows NO “tap 7×” hint — that's dev-only now

- [ ] **S-36 Account** — `app/settings/account.tsx`  
      Open: Settings → Account  
      *Changed:* Entire screen is new
      - [ ] Signed out: the card reads as an invitation, not a warning
      - [ ] Keyboard doesn't cover the “Email me a sign-in link” button
      - [ ] After sending, “Check your inbox” names the address you typed
      - [ ] Signed in: avatar, name, email and device line read as one identity block
      - [ ] Sign out looks destructive without shouting

- [ ] **S-38 Linked people** — `app/settings/linked.tsx`  
      Open: Settings → Account → Linked people  
      *Changed:* Entire screen is new
      - [ ] Empty state explains what linking is FOR, not just that there's nothing
      - [ ] The QR is big enough to scan from another phone across a table
      - [ ] A pending claim shows name AND email — enough to recognise someone
      - [ ] “Link” / “Not them” read as a real decision, not a confirm dialog
      - [ ] The share-my-number explanation is legible and doesn't wrap oddly

- [ ] **S-39 Invite landing** — `app/link.tsx`  
      Open: Tap an invite link  
      *Changed:* New
      - [ ] “Asked to link” reads as success, not as an error or a hang
      - [ ] Signed-out path offers sign-in instead of dead-ending

- [ ] **S-37 Sign-in callback** — `app/auth.tsx`  
      Open: Tap the link in the sign-in email  
      *Changed:* New — this is the screen that showed “unmatched route” before the rebuild
      - [ ] The spinner is brief and doesn't flash
      - [ ] Lands on Account, signed in, with no visible double-navigation
      - [ ] An expired link explains what to do next

- [ ] **S-34 Backup & restore** — `app/settings/backup.tsx`  
      Open: Settings → Backup & restore  
      *Changed:* Server backup/restore rows, the picker sheet, the explainer copy
      - [ ] Explainer copy changes when signed in, and reads true
      - [ ] The two server rows sit in the same card as the file rows, not a separate slab
      - [ ] Restore sheet: date + size legible; trash icon tappable without hitting the row
      - [ ] The red warning still reads as the last word on the screen

- [ ] **S-26 People** — `app/friends.tsx`  
      Open: Settings → People  
      *Changed:* Phone field added to the rename sheet
      - [ ] Three fields (name, UPI ID, phone) don't push Save off-screen with the keyboard up
      - [ ] The phone hint reads sensibly under the field
      - [ ] Balance chips still align now the sheet is taller

- [ ] **S-05 Plan** — `app/(tabs)/savings.tsx`  
      Open: Plan tab  
      *Changed:* Three-section layout, priority picker, funding and raid order
      - [ ] Goals render as THREE sections (Emergency / Need / Want), not one flat list
      - [ ] A section with one goal shows no “hold & drag” hint
      - [ ] Dragging reorders within a section and never across
      - [ ] The section header reads as a header, not another goal card
      - [ ] The hint under each title explains the tag without being a paragraph

- [ ] **S-17 Goal detail** — `app/savings/[id].tsx`  
      Open: Plan → any goal  
      *Changed:* Priority picker in the Adjust sheet
      - [ ] The Adjust sheet's priority picker reads as “pick exactly one”
      - [ ] Changing the tag moves the goal to the right section on the way back
      - [ ] The card isn't busier than before

- [ ] **S-33 Afford check** — `app/afford.tsx`  
      Open: Home → Can I afford this  
      *Changed:* Frequency chips, owed-to-you row, real upcoming bills
      - [ ] “How often?” chips read as one-of-four, with Once clearly the default
      - [ ] Picking a frequency changes the reasoning, not just the number
      - [ ] “Owed to you (not counted above)” is clearly excluded, not another balance
      - [ ] The verdict is still the hero — the new rows didn't demote it

- [ ] **S-19 Review** — `app/review.tsx`  
      Open: Home → inbox badge → Review  
      *Changed:* Banner badge fix. Never device-tested at all
      - [ ] Saved-view banner shows the count AND payer even with a long view name
      - [ ] Source tabs still show counts when labels are long
      - [ ] Bulk select / focus / saved views feel discoverable, not buried in ⋯

- [ ] **S-07 Quick Add** — `app/add/quick.tsx`  
      Open: ＋ → any kind  
      *Changed:* Container gap → per-block margins; TransferBody moved; its sheets now open through the shared overlay
      - [ ] Spacing between form blocks is even — no doubled or crushed gaps
      - [ ] Transfer → Pay by UPI / Show QR opens exactly one sheet at a time
      - [ ] Amount stays the hero as the form grows
      - [ ] Save in the header reads as the commit action, opposite the ✕

#### Block B — Money-critical (a UI slip becomes a money slip)

- [ ] **S-03 Home** — `app/(tabs)/index.tsx`  
      Open: Home tab
      - [ ] One hero number dominates; tiles support rather than compete
      - [ ] Owe AND owed both show when both exist — never as one net figure
      - [ ] “Coming up” shows the near-due rules from demo data
      - [ ] The last card clears the FAB and the tab bar

- [ ] **S-09 Group detail** — `app/group/[id].tsx`  
      Open: Groups → any group
      - [ ] Tabs (Expenses / Budget / Members) don't truncate
      - [ ] The balance card says who owes whom in words, not just numbers
      - [ ] A settled group shows the check-circle state, not blankness

- [ ] **S-11 Members & settle** — `app/group/[id]/members.tsx`  
      Open: Group → Members
      - [ ] Each balance is readable at a glance and correctly signed
      - [ ] Settle states amount and direction before you commit
      - [ ] Swipe-remove blocked with a reason where a balance exists

- [ ] **S-10 Budgets (mine + group)** — `app/budget.tsx · group/[id]/budget.tsx`  
      Open: Settings → My Budget; Group → Budget
      - [ ] Over / near / under differ without relying on colour alone
      - [ ] The group editor says “my share” where that's what it means
      - [ ] Long category names don't truncate the amount beside them

- [ ] **S-14 Personal** — `app/personal.tsx`  
      Open: Home → Personal
      - [ ] Section headers space the blocks; rows inside a card stay contiguous
      - [ ] Empty state has all four parts
      - [ ] Nothing hides behind the FAB

- [ ] **S-08 Itemized bill** — `app/add/itemized.tsx`  
      Open: ＋ → expense → Split by items
      - [ ] You always know which step you're on
      - [ ] “Must equal total ₹X” is impossible to miss when payers don't balance
      - [ ] A failed scan doesn't strand you

- [ ] **S-15 Transaction detail** — `app/txn/[id].tsx`  
      Open: Any transaction
      - [ ] Amount is the hero; shares and payments read as supporting detail
      - [ ] Receipt thumbnail opens and closes cleanly
      - [ ] History reads as a timeline, not a debug dump

#### Block C — Analytics and data-in (dense — where truncation hides)

- [ ] **S-20 Reports** — `app/reports.tsx`  
      Open: Settings → Reports & export
      - [ ] Donut legend labels don't truncate; slices are distinguishable
      - [ ] Month selector can't go past the current month
      - [ ] “Top categories” and “Biggest expense” agree with the donut

- [ ] **S-21 Report transactions** — `app/report-transactions.tsx`  
      Open: Reports → tap a donut slice
      - [ ] The filter says what it filters, and “All” really includes transfers
      - [ ] No single “total” spanning income, expense and transfer

- [ ] **S-22 Insights** — `app/insights.tsx`  
      Open: Home → Insights
      - [ ] X-axis day labels are whole numbers, not “1…” “2…”
      - [ ] Forecast hero and chart tell the same story
      - [ ] Ten cards don't read as ten equal shouts

- [ ] **S-16 Category detail** — `app/category/[name].tsx`  
      Open: Reports or Home → a category
      - [ ] Skeleton appears while loading, not a blank screen
      - [ ] No dead space under the header

- [ ] **S-23 Search** — `app/search.tsx`  
      Open: Home → search
      - [ ] The chip row's edge fade reads as “more to scroll”
      - [ ] Empty copy switches between “Search your transactions” and “No matches”

- [ ] **S-18 Import** — `app/import.tsx`  
      Open: Settings → Import transactions
      - [ ] Gibberish → “No transactions found” is helpful, not a dead end
      - [ ] A scanned PDF explains the 0-characters case in plain words

- [ ] **S-28 Audit log** — `app/history.tsx`  
      Open: Settings → Audit log
      - [ ] Dots and EDIT/DEL badges are legible at row size
      - [ ] “Load older” doesn't jump the scroll position

#### Block D — Config and utility (lower risk — do it last)

- [ ] **S-04 Groups** — `app/(tabs)/groups.tsx`  
      Open: Groups tab
      - [ ] “No groups yet” and “No archived groups” aren't equal-weight empties
      - [ ] Group cards clear the FAB

- [ ] **S-25 Categories** — `app/categories.tsx`  
      Open: Settings → Categories
      - [ ] Kind tabs read as one-of-three
      - [ ] The Uncategorized section explains what “adopt” does

- [ ] **S-24 Feature management** — `app/features.tsx`  
      Open: Settings → Feature management
      - [ ] “Always on” pillars visibly differ from switchable modules
      - [ ] Turning splitting off names how many balances would disappear
      - [ ] Cloud Receipt Scanning row isn't dimmed when off

- [ ] **S-31 Notifications** — `app/settings/notifications.tsx`  
      Open: Settings → Notifications
      - [ ] Denied-permission banner offers Open Settings
      - [ ] Test notification confirms it fired

- [ ] **S-35 Voice entry** — `app/settings/voice.tsx`  
      Open: Settings → Voice entry  
      *Changed:* Privacy copy no longer absolute
      - [ ] Setup steps are followable without prior context
      - [ ] The privacy line reads honestly — it changed today

- [ ] **S-27a Storage** — `app/settings/storage.tsx`  
      Open: Settings → Storage  
      *Changed:* pdf.js row removed
      - [ ] Free space is the hero; the breakdown supports it
      - [ ] The pdf.js row is GONE — it's bundled now
      - [ ] Both reclaim actions say what they will and won't delete

- [ ] **S-30 Reminders & recurring** — `app/reminders.tsx · plan/recurring.tsx`  
      Open: Home → Coming up; Plan → Recurring
      - [ ] Next-occurrence dates read unambiguously
      - [ ] Skip / Pause / Stop are distinguishable and look reversible
      - [ ] The monthly-equivalent total is labelled as an equivalent, not a charge

- [ ] **S-13 Edit group** — `app/group/[id]/edit.tsx`  
      Open: Group → ⋯ → Edit
      - [ ] Icon and colour pickers show the current selection clearly
      - [ ] Archive vs delete differ in weight

- [ ] **S-29 Help** — `app/help.tsx`  
      Open: Settings → Help & Feedback  
      *Changed:* Privacy copy
      - [ ] Accordions open smoothly; copy matches what the app now does
      - [ ] “Offline by default” reads true — it changed today

- [ ] **S-27 Storage (dev)** — `app/storage.tsx`  
      Open: Settings → version ×7  
      *Changed:* Gated to __DEV__
      - [ ] Reachable ONLY in a dev build
      - [ ] Load demo data / Erase all data are unmistakably destructive


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

- [x] ~~**Investments as a Transfer destination.**~~ **Shipped as `moveToInvestments`** —
      a personal-group settlement with `shares: []`, mirroring `payCardBill`, rather
      than an Add-screen destination (`TransferBody` hard-types both endpoints as a
      Person). Buying an SIP was logged as an *expense*, so net worth fell by the
      amount when it should have stayed flat.
- [ ] **Monetisation shape.** Deliberately parked until there are users — a tier
      boundary drawn before anyone uses the app is a guess. No paywall,
      entitlement check or purchase SDK exists anywhere, and that absence is
      intentional. **Feature flags are user preferences, never entitlements** —
      do not repurpose them.
- [ ] **"Safe to Spend" is a trademark — check it before any public launch.**
      Simple Bank registered it and enforced it (cease-and-desist to Monzo, then
      Mondo, in 2015). Simple was shut down by PNC in 2021, so the mark may have
      lapsed through non-use — **that is an assumption, not a finding.** Irrelevant
      for a closed pilot. The visible copy is now "yours to spend"; the internal
      identifiers (`safeToSpend.ts`, `SafeToSpend`, `sts`) still use the term.
- [ ] **Ad-supported or aggregate use of spend data.** Raised, not decided. The
      app is local-first with no account required, which is the pitch competitors
      in this space use verbatim — and it is currently true of this codebase.
      Ad targeting or aggregate resale would need explicit opt-in, a rewritten
      privacy policy, and a story for demo rows, and would spend the credibility
      the derived numbers depend on. Decide deliberately, not by drift.
- [ ] **The non-engineering cost of running a server.** DPDP obligations, a
      rewritten privacy policy, hosting, uptime, someone on call.
- [ ] **Per-app UPI payload quirks do not survive the Android port.** Corrected
      2026-08-19 — the previous wording had this backwards. **Every per-app result
      on record is iOS** (`upiIntent.ts:20-23`): on Android `useUpiApps` returns
      null, so `spec` is always null and no per-app prefix or `blocked` flag is ever
      reached. PhonePe there gets the generic `upi://pay` through the OS chooser and
      **has never been tested.** So the quirks are not "dead on Android", they are
      *unreachable* there, and the whole per-app table is untested on the platform
      the pilot is heading to. Also corrected: Airtel did not lose `tr` — it **paid**
      with `mode` and `tr` both present (`upiIntent.ts:277-280`) and is the only app
      that gets `tr` on a P2P transfer. CRED is the one pinned to no `mode` at all.
      Needs a device pass on Android, not a patch.

### 3.1 Identity / sync pre-mortem — hold these lines in S2/S3

Nine ways the design goes wrong. Only **F5 is a live defect today**; the rest are
constraints to design against.

| | Failure | The wall that stops it |
|---|---|---|
| F1 | Invite links are made to be forwarded — first stranger to tap gets linked, and gets your number | **Sender approves the claim.** Tapping creates a pending request; nothing binds until approval |
| F2 | "Stop sharing my number" cannot take it back — it's already on their device | Word it as a **disclosure** ("Shared with Rohan on 12 Aug"), never a revocable permission |
| F3 ✅ | Document-level last-write-wins silently discards a co-editor's edit, and the shares-sum-to-payments invariant still passes | **Built.** Compare-and-set on `txn.sync_version`; `PUT /sync/entries` refuses a stale push with 409 and the current row attached. Never silent LWW on money — and never an auto-merge either |
| F4 | `attachment_uri` is a `file://` path from another device — "receipt attached" over nothing | Rows sync, photos never do; the receiving device nulls the URI |
| F5 | ⚠️ **`seed.ts` writes `is_me = 1` with a fresh `uuid()` per install** — one account can get two "me" rows, and every my-share figure silently reads one of them | Bind the local `is_me` row to `person.remote_uid` at sign-in |
| F6 | `category` has `UNIQUE(name, kind)`, so adding `is_deleted` makes delete-then-re-add "Groceries" fail | No `is_deleted` on `category`; sync through the existing `category_tombstone` |
| F7 | `settings` holds one-time migration flags (`schema.ts:771-786`) — syncing it wholesale makes a device **skip a migration and record it as done** | Explicit key allowlist. Migration flags are device state and are never synced |
| F8 ⚠️ | Email is the only identity and cannot be changed or merged — a typo at sign-in is a second account with none of your backups | A change-email flow; **at minimum, show the signed-in email wherever a restore is offered** (cheap, and pilot-relevant) |
| F9 | ~~Restore replaces everything and, with sync on, propagates. Today's alert says "this device", which stops being true~~ | **Closed.** `confirmRestore` refuses outright while `settings.syncEnabled()` is on, and offers the Sync screen. A refusal rather than a warning because the damage lands on other people's phones — where the person causing it cannot see it and the people suffering it cannot undo it |
| F10 | **Rejecting an entry diverges the two devices.** Reject soft-deletes locally; their copy survives, so their group balance stops matching mine and neither is told | Named, not solved. The honest fix is a rejection that travels back as a *dispute* the author sees — sync-phase work. Until then, the reject copy says plainly that it stays on theirs |
| F11 ⚠️ | **Deleting a shared group hard-deletes every transaction in it** (`groups.ts` `deleteGroup`), which under sync would either destroy shared history or diverge silently | Under sync, deleting a group you did not create becomes **leave**, locally. Only the creator can delete, and only for everyone |
| F12 ✅ | **Losing the per-group key loses that group's history** — the same class of loss as a forgotten backup passphrase, but it takes the group down with you | **Built.** The key is wrapped once per DEVICE and stored server-side, so any member who still holds it can reissue a wrap. It is never derived from one device's secret — which is also why reinstalling mints a new device key rather than resurrecting the old one |

---

## 3.1 · Sync — built, and what is not proven

Shared-group sync is complete end to end: device identity, per-group keys, the
outbox, the server, the transport, and sharing a group. What follows is a plain
account of which parts are proven and which are not, because the honest answer
differs by layer and a single "done" would misrepresent both halves.

**The shape.** A device mints a secret into the keychain. A shared group gets a
256-bit key, wrapped once per member DEVICE — per device, because a key wrapped to
a *person* cannot be opened by their second phone, and because losing one phone
should drop one wrap rather than rotate every group. Entries are sealed on the
device with that key and pushed to a server that stores wraps and blobs and holds
no key at all. `{group_id, entry_id, version}` is bound into the GCM AAD, so a
sealed entry cannot be replayed under another id or rolled back to an older
version. Only shared groups travel; personal spending, income, goals, budgets and
net worth are never sent.

**Proven, with tests that run:**

- device key mint, reuse, and total forget
- group key wrap → unwrap, and a wrap for one device failing on another
- AAD binding refusing an entry replayed under another id, version, or group
- the full round trip minus the HTTP — read → seal → open → resolve → ingest,
  across two databases with different person ids for the same humans
- version compare: an edit replaces in place, a stale copy is refused, an edit
  re-opens an approval already given, and a trusted author cannot edit over a
  rejection
- the outbox never queueing personal data or anything awaiting my approval

**Not proven, and it needs a deployed Worker and two phones:**

- every route in `server/api` under `/sync` — none has run against a live D1
- the push, the pull, and the 409 in practice
- publishing and adopting a group, and accepting an invitation
- migration `0004_sync.sql` applying cleanly

**Still open, and named rather than implied to be handled:**

- ✅ `PUT /sync/entries` is rate limited: 500 entries per account per hour, on top
  of the 64 KiB per-request cap.
- ✅ Wrapping is real **X25519**, ephemeral-static. Done while there were no users,
  which is the only moment a re-wrap costs nothing.
- ⚠️ F11, partly. `deleteGroup` is already **creator-only** (`canDeleteGroup =
  isCreator`), so "deleting a group you did not create becomes leave" is enforced
  by refusal. What is still open is the creator deleting a *published* group: their
  history goes, other members keep theirs, and nothing propagates the deletion — a
  silent divergence needing a group tombstone on the server. The queue and cursor
  are at least cleaned up now, so no dangling rows are left behind.
- ✅ F10 closed: a rejection reaches the author as an objection on the entry, and
  withdrawing it travels too.
- ✅ Sharing has a UI: group → Members → Share with a member, and invitations are
  answered at the top of Settings → Sync.

**Migrations remain forward-only, applied by hand, with no rollback and no
staging.** `0004_sync.sql` is strictly additive and readable by the currently
deployed Worker, because `deploy` and `migrate` are separate manual commands and
nothing orders them.

---

## 3.2 Market and platform — decided 2026-08-19

**India is the pilot market.** The two markets want opposite things and one feature
set serving both is second-best in each, so the not-doing list is explicit:
**parked deliberately** are bank sync (Plaid has no meaningful India coverage, and a
broken link is the top churn cause anyway), couples with two logins and
yours/mine/ours labelling, multi-currency at 150+ with FX rates, one-number "flex"
budgeting (it contradicts the granular category charts India asks for), and
investment/net-worth depth. **Sync survives on both sides** — India wants it as the
family view, the US as couples — and is the only parked item whose cost is a schema
migration rather than a feature (§5, "Schema gap: sync prerequisites").

The audience is **young urban India**: Gen Z, working professionals, students,
couples and friends settling in cities — which is precisely the Splitwise use case.
Not rural, not traditional-household. `src/constants/categories.ts:9-15` already
says it targets this persona and does; **the category list needs no reseed.**

**Launch order:** finish features → port to Android → buy the developer account →
build assistant + developer-facing features → publish.

- [ ] **Android has NO keyboard handling at all — not one screen moves.** This is a
      blocker, not polish: the app is unusable in portrait with a keyboard up. Three
      causes stack. `app.json` sets no `softwareKeyboardLayoutMode`. Every
      `KeyboardAvoidingView` in the app passes
      `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — i.e. on Android a
      KAV is a plain `View` and does nothing (the one exception, `add/quick.tsx`,
      uses `'height'`, the jankiest RN behavior, with a magic 24pt offset). And
      `automaticallyAdjustKeyboardInsets` — the fix used on onboarding, Review,
      Categories, the account screen and `BudgetEditor` — is **iOS-only**. Expo
      SDK 54+ also makes edge-to-edge mandatory, under which `adjustResize` no longer
      resizes the window, so the platform fallback is a no-op too.
      Worst case: `DraggableSheet` is the single KAV behind ~24 sheets that contain a
      text field, **10 of which `autoFocus`** — so on Android those open with their
      own field already focused and invisible. `ScanPaySheet` is one of them and is
      reachable from every tab. Fix is `react-native-keyboard-controller` (one code
      path, both platforms, edge-to-edge aware) plus a native rebuild; a
      `softwareKeyboardLayoutMode: "pan"` config flag is the cheaper partial and needs
      verifying against edge-to-edge before it is trusted.
- [ ] **Android port: budget a new OCR native module.** `modules/expo-ocr` declares
      `"platforms": ["apple"]` with no Android source, and the entry point is gated
      `Platform.OS === 'ios'` (`app/add/itemized.tsx:90`). `receiptScan` defaults on,
      so the feature *looks* shipped — on Android it will not exist. ML Kit Text
      Recognition is the counterpart. Competitors lead their marketing with this.
- [ ] **Android capture: pick one route and argue it well.** Both are Play-gated and
      doing both doubles the review surface rather than giving a fallback. SMS is
      restricted to default handlers plus a fixed exception list and the spyware
      clause **names budgeting apps by category** (tightened again 2026-07-15).
      Notification listening is arguably harder — flagged as high-risk for financial
      fraud, Play Protect blocks sideloaded apps declaring it, and Play wants a
      "genuine core function". Either way the **Financial features declaration** is
      required, and Google has taken enforcement action against 3,500 lending apps in
      India. Submit early enough to survive one rejection round. Today `sms` and
      `notification` exist as `TxnSource` values and **nowhere else**.
- [ ] **Do not plan Siri and "Hey Google" as one task.** App Intents are shippable
      (behind Gate 0). Google began removing Assistant from phones **2026-09-04**,
      Gemini does not invoke the old `shortcuts.xml` App Actions, and the successor
      **AppFunctions** was private-preview as of May 2026. Ship iOS; park Android on
      AppFunctions going public. **App Intents are not capture** — they are faster
      manual entry. iOS has no automatic capture route at all.

---

## 4 · Known and accepted for the pilot

Recorded so nobody re-discovers them as bugs.

- **Three red surfaces stack on every Home open** — the Safe-to-Spend strip
  ("over-committed"), the pace row ("₹4,200 over") and the health ring. Retention
  research names a "guilt cycle": two or three months of red and users conclude they
  are bad at budgeting and leave. The 2026-08-19 pass gave each one a next action and
  renamed the band that judged the person ("Vulnerable" → "Stretched thin"), but
  deliberately **did not** move any threshold or de-duplicate the three. Whether
  three at once is too many is a question only real users can settle.

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
- **`TransactionRow` never displays pay method.** Captured everywhere now,
  shown only in Review and on transaction detail. A density question, not a bug.
- **`budget_group.limit_daily/monthly/yearly` still exist as columns.** Removed
  from the `BudgetGroup` type on 2026-08-19 — nothing ever wrote them, so the type
  was advertising a group-level budget the app does not have. The physical columns
  stay: dropping one in SQLite needs a table rebuild, which is not worth a
  migration for three fields nobody reads. `person.remote_uid` is **not** dead —
  §3.1 F5 reserves it for the duplicate-`is_me` fix.
- **Transfer has no `DetailChips`** — no tags, receipt, time, location or repeat;
  its note writes `transferNote`, a *different field* from every other kind's
  `note`. Consolidating means deciding which fields a settlement legitimately
  has, which is a product question.

> **Five bullets were deleted from this list on 2026-08-19.** Two were already
> fixed and never struck: `TransferBody` living outside `finance/add/` and
> `add/quick.tsx`'s container `gap`, both closed by commit `3955c36` (17 Aug),
> which updated the §2.1 entry and left these behind. Three were closed by the
> 2026-08-19 pass: Insights' empty-state CTA, the inline `date-fns` patterns, and
> the 44 `src/constants/*` shim importers.
> An open-debt list that overstates itself costs more than it saves: **verify
> a bullet against the tree before acting on it, and delete it the moment it lands.**

### Schema gap: sync prerequisites

> **Narrowed 2026-08-22.** The paragraph below assumed **row-level** sync. The
> decided design is **document-level**: the unit that travels is an *entry* — a
> `txn` plus its payments, shares and line items — versioned by `txn.updated_at`.
> That holds because those child tables are never mutated apart from their parent
> (every mutation is an insert beside a new `txn`, a rewrite of the whole set
> inside `updateTxn`, or a group cascade). It is also the only correct unit for
> money, since shares-summing-to-payments is a property of the whole document —
> row-level sync could transmit a half-valid state that passes every check.
>
> With that, and with sync scoped to **shared-group data only**, the gap is **two
> tables and four columns**, not nine tables: `budget_group` and `group_member`
> each need `updated_at` + `deleted_at`, because both are hard-deleted today and a
> hard delete cannot propagate. **Both landed on `feat/peer-trust-and-approval`.**
> `person` rows never travel at all — a friend is a local record, and only the
> account id (`remote_uid`) bridges devices.

> **Superseded — read the note, not the paragraph below.** This section described
> nine tables needing sync columns, which assumed ROW-level sync. The entry is the
> unit: `txn_share` / `txn_payment` / `line_item` are never mutated apart from their
> parent (every mutation is an insert with a new `txn` id, a rewrite of the whole set
> inside `updateTxn`, or a group cascade), so they sync as part of the parent
> document and need no columns of their own. That left **two** tables — `budget_group`
> and `group_member` — and both have since gained `updated_at` + `deleted_at`.
> The paragraph below is kept because it explains *why* the columns are needed.

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

### Two live restore defects, found while designing sync

Neither is caused by the sync work; both were found by tracing what `BACKUP_TABLES`
actually carries.

- [x] **Restore resurrects every category the user deleted.** ✅ `category_tombstone`
      is in `BACKUP_TABLES` (index 4, right after `category`; the table has no FKs
      so the position is safe) and in `OPTIONAL_BACKUP_TABLES`, so an older file
      restores it empty instead of being rejected. `seedGlobalCategories` still runs
      after the transaction commits, which is what makes the fix work — the
      tombstones are readable by the time the seeder checks them. Covered by
      `backupQueries.test.ts`.
- [x] **Restore carries one-time migration flags between devices.** ✅ Closed in both
      directions: the delete side skips `fix_%`, the insert side skips them too, and
      `category_global_v1` is named alongside. Implemented as a **prefix rule**
      rather than the allowlist this item prescribed — strictly safer, because a new
      `fix_*` cannot be forgotten.
- [x] **Restore refused every backup this build wrote.** ✅ The pick-time version
      guard in `settings/backup.tsx` hardcoded "v1 only" and was not updated when
      `encryptPayload` moved to v2, so both the file and server paths answered "made
      by a newer version" to files the app had just made. The passphrase sheet never
      opened. Now one exported `canReadCipher` used by the decryptor and both
      guards, with a test asserting the app can always read what it writes.
- [x] **A restore left the sync outbox pointing at deleted rows.** ✅ `sync_outbox`
      is excluded from backups (a delivery queue is device state) but was never
      cleared either, so every queued row survived pointing at a `txn` that had just
      been deleted. Cleared with the rest now.
- [x] **Restoring stamped `lastBackupAt = now`.** ✅ Restoring is not backing up.
      Settings read "Backed up just now" when the newest backup might be six months
      old. Stamped with the backup's own date, so the nudge fires straight away
      after restoring something old — which is the right moment for it.
- [x] **F9 — restore while sync is on.** ✅ Refused, with the Sync screen one tap
      away. A restore is wipe-and-replace, so under sync it would push a snapshot
      other people were never part of over their copies.

### Sweep has to know *where from*, and give it back to the same place

A surplus sweep moves money **out of a specific asset** — bank, cash, wallet — and
a later withdrawal has to return it **to that same one**. Sweeping ₹5,000 out of a
bank account and handing it back as "cash" is not a round trip; it silently
rewrites where the user's money is, and every figure built on that is then wrong.
The same applies to a manual withdrawal from a goal: it is not a generic credit,
it goes back where it came from.

That means the sweep cannot be built on today's model, where **cash is one pooled
figure** and the "landed in" answer is stored and never read (below). The sweep
logic itself is small; the prerequisite is not. So it is parked *behind* the
per-method baselines pass, not beside it — building it first would bake the pooled
assumption into the savings ledger, which is the hardest place to unpick it.

Concretely, when it is built: `savings_txn` needs the source asset on the row, a
withdrawal must default to that asset and be unable to silently pick another, and
an auto-sweep must refuse rather than guess when the source is ambiguous.

### Money-model gap: accounts as entities

> **Half closed.** Cash is now three buckets — bank / cash / wallet — with real
> per-bucket balances (`assetOf`, `BUCKET_FLOWS_SQL`, `openingTotal`), and
> `INCOME_LANDING`'s answer is finally read. `savings_txn.source_asset` means a
> goal remembers which bucket funded it and a withdrawal is capped by that bucket.
>
> What is still open is **named** accounts ("HDFC", "Paytm") with their own
> balances, which is what bank sync would eventually need. The paragraph below
> describes the world before the buckets landed.

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
| **Multi-device sync (S2)** | The schema prep has landed (see §5's superseded note — two tables, four columns, not nine). What is left is the engine: transport, outbox, conflict handling, and an E2E crypto swap off `crypto-js` | You want it enough to spend weeks |
| **Shared groups (S3)** | Hardest rung: identity merging + multi-writer money | S2 is running and boring |
| **Per-method money baselines** | Money-correctness risk; deserves its own reviewed pass | The next money-model pass — accounts-as-entities and investments-as-transfer are waiting with it |
| **Monetisation / premium tier** | A tier boundary drawn before anyone uses the app is a guess | After the pilot. Needs a new entitlement concept; nothing existing can be repurposed |
| **Push notifications** | Only local notifications exist; `withoutPushEntitlement.js` strips the entitlement a personal team can't sign | Gate 0 clears — then delete the plugin |
| **App Intents** | True hands-free, no app launch, Siri reading results back. Native Swift target + entitlements + App Group | Gate 0 clears. Note Apple's own forums report inline parameters falling back to a prompt |
| **In-app mic capture** | On-device recognition, live partial transcript, insert on silence. **No first-party Expo speech-to-text exists** (`expo-speech` is TTS); needs a native module on the `modules/expo-ocr` precedent | You want the Shortcuts round trip gone |
| **Widget** | Scope genuinely undecided — balance? today's spend? quick-add? | You answer that **and** Gate 0 clears |
| ~~**WhatsApp reminder composer**~~ | **Shipped.** Pure builder in `lib/whatsappReminder.ts`, button on the person screen, share-sheet fallback when the number has no country code. Push only — never a collect request | — |
| **Repayment likelihood → expected recovery** | Per-person "how likely is this to come back", turning owed-to-me from a face value into an expected one, and ordering who to chase first. Three constraints decided up front: it stays **out of Safe-to-Spend** (every term there is certain money, and a probabilistic one makes the headline a guess); the maths is **Σ(amount × probability)**, not an average or median of probabilities — a median discards the amounts, so a 20%-likely ₹40,000 would rank below a 90%-likely ₹200; and the rating **never syncs**, because at S3 it could reach the person being rated | The WhatsApp composer ships — this is what gives it an order |
| ~~**Goals surplus sweep**~~ | **Shipped.** `planSurplusSweep` (pure, refuses rather than guesses) + `runSurplusSweep`, opt-in via `settings.autoSweep`, off by default. Records the bucket it drew from, so a withdrawal returns there | — |
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
(no number below 30 days of history, one income and 10 transactions).
**Safe-to-Spend** (`liquid − bills − card − goals − owed − everyday`, one assembly
with two readers) leads a quiet strip above Home's hero; the hero itself stays on
period spend, because a horizon-scoped headline inside a card the period pills
drive contradicted its own control. Card repayment is modelled. Onboarding was
rebuilt so every answer lands somewhere visible — of eight questions, only three
used to.
