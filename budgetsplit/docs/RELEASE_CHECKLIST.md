# BudgetSplit — Release Checklist

**The single sheet.** Everything that must happen, be verified, be decided, or be
deliberately left undone before the friend-group pilot — plus everything parked
after it, with the trigger that un-parks it.

This file replaces `V2_LAUNCH_CHECKLIST.md`, `DEBT_TRACKER.md`, `V2_FIX_PLAN.md`,
`UI_UX_SWEEP.md`, `STATUS.md`, `PILOT_READINESS_REVIEW.md` and `TAGS.md`. They are
deleted, not archived — git history has them if a decision's reasoning is ever
needed.

**Seven live documents, one question each** (2026-09-07):

| Doc | Answers |
|---|---|
| `SYSTEM.md` | **What the app is** — 53 entities, 22 invariants, 70 features, 47 screens, 54 flows, scenario ladders |
| `SCREENS.md` | What each screen looks like — layout, copy, states, sheets. Formerly `FEATURES_AND_FLOWS.md` |
| `TRACKER.md` | **What is left** — one row per item: what it is, and where it stands. Absorbed nine separate registers, including most of this file |
| `FINDINGS.md` | **Why** — the count, the cost, the blast radius and the verdict behind every tracker id |
| `SYNC-MODEL.md` | What happens when somebody else can change your numbers |
| **this file** | Can we ship |
| `AGENTS.md` | How we build. Absorbed `ARCHITECTURE.md`, which is deleted |

The dated analyses (`AUDIT*.md`, `V2_PRODUCT_REVIEW.md`, `COMPETITIVE_ANALYSIS.md`,
`PERSONAL_REDESIGN.md`, `SYNC_CONTEXT.md`) moved to `docs/history/`, each with a
frozen banner naming its live successor. They are never edited to keep a test green.

The sync pre-mortem below is **`SYNC-F1…F12`**, renamed from `F1…F12` because that
collided with `AUDIT.md`'s `F-01…F-34` in prose.

**Interactive version:** <https://claude.ai/code/artifact/c81d7ac6-60f3-4bad-b542-ed99c3eed37c>
— same content, but tickable on the phone while you walk the app, with a notes
box per screen and a "copy feedback" button that collects what you flagged.

**Rules for this file:** tick a box only when the thing is true on a device, not
when the code is written. Never delete a line — strike it and date it. Every
claim cites `file:line` or it gets deleted rather than debated.

- **Target:** limited TestFlight pilot to friends. Not a public App Store launch.
- **App version:** 2.0.0 · bundle `com.prem.budgetsplit`
- **Code state:** `feat/sync-s2` — **36 commits unpushed**, nothing backed up off
  this machine. (Pushing needs a deliberate `gh` account switch: this repo is
  personal `mrprem27` only, and `gh`'s active account is the company one.)
- **Suite:** 181 suites / 2388 tests green · `tsc --noEmit` clean in app *and* Worker.
- **Worker:** deployed 2026-09-01, version `0c1a54e0`. Migrations `0007`–`0010`
  applied to D1 — three of them had never been applied, so the friend-request
  routes had been shipped with no tables behind them.
- **Cost to date:** ₹0. Workers/D1/KV free plan, free-tier email. No card on file.

---

## 0 · What is left, in order → `TRACKER.md` §1

**Moved.** The ordered list of what is left, and what each step assumes, is in
[`TRACKER.md`](./TRACKER.md) §1. The one thing worth repeating here, because it changes what you do
next: **the paid Apple account blocks less than it looks.** A free Apple ID signs a build onto your
own phone for 7 days, which is everything the device pass in §2 needs. The paid account is only for
handing the build to somebody else. Test now, distribute later.


## 0a · The no-enumeration check — run this before every deploy

Friend requests are addressed by **email**, and this API has refused to be a
directory in three separate places, because a lookup route turns the user table
into a way to check whether an address belongs to somebody using a finance app.

A route leaks only if its **response** differs. `POST /friend-requests` must
therefore answer identically whether the address has an account or not — same
status, same headers, same body — and send one email either way. Only the email
body differs, and that reaches nobody but the inbox holder.

This cannot be a unit test: it is a property of the deployed Worker, and the
whole point is that both branches look the same from outside.

```sh
API=https://budgetsplit-api.budgetsplit.workers.dev
TOKEN=<a real session token>

curl -sD - -o /tmp/has.json -X POST "$API/friend-requests" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"email":"<an address that HAS an account>"}' > /tmp/has.head

curl -sD - -o /tmp/none.json -X POST "$API/friend-requests" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"email":"definitely-nobody-'"$RANDOM"'@example.com"}' > /tmp/none.head

# Both must be empty. `date` and `cf-ray` differ per request and are filtered.
diff <(grep -iv '^\(date\|cf-ray\|report-to\|nel\):' /tmp/has.head) \
     <(grep -iv '^\(date\|cf-ray\|report-to\|nel\):' /tmp/none.head)
diff /tmp/has.json /tmp/none.json
```

- [ ] Both diffs are empty, against the deployed Worker.
- [ ] Repeat past the rate limits (21 sends in a day, and 6 to one address): still
      `202`, still identical. A `429` here would itself be an oracle — "this
      address is worth rate-limiting" is information about the address.
- [ ] The app never renders anything derived from account existence. The only
      chips are `Invited · waiting` and `Connected`; "not on BudgetSplit yet"
      would put the oracle back in the client after the API declined to be one.

---

## 0b · Is the app actually workable? — the sync ledger

Checked against the code, not remembered. This is the answer to "does everything
a user does actually travel".

### Travels today

Everything a signed-in account owns (`DQ-93`), each row mapped column by column in
`lib/sync/rowMap.ts`, which a test holds to cover every column:

- [x] **Transactions in every group, personal included** — payments, shares, line
      items, recurring rules and skips. An edit is a new version; a stale one is
      refused as a conflict, never overwritten. A deletion is a tombstone.
- [x] **Groups, members, roles, invitations** — adding someone with an account
      invites them; accepting brings the group and its whole history.
- [x] **Approvals, rejections and disputes** — decided on the server with the
      app's own rules; a refusal outranks trust.
- [x] **Leaving and deleting a group** — tombstoned; other phones archive without
      losing their own history (SYNC-F11).
- [x] **Everything personal** — budgets, categories, goals and their movements,
      assets, the money profile, trust settings, unreviewed imports.

### Does NOT travel, and each is a deliberate line

- [ ] **Receipt photos.** Rows sync, photos never do (SYNC-F4).
- [ ] **App preferences in AsyncStorage** — feature switches, reminders, default
      pay method. Per phone, like the backup file (`OV-13`).
- [ ] **A backup file.** It is the user's own and is never uploaded.

## 1 · Hard blockers → `TRACKER.md` §1

**Moved.** Eighteen blockers — fourteen open, four closed and kept — in
[`TRACKER.md`](./TRACKER.md) §1, with the reasoning and the order of operations in
[`FINDINGS.md`](./FINDINGS.md) §1.

The closed ones are kept deliberately: three of them closed by discovering the claim was **false**
rather than by being fixed, and that is worth exactly one read to avoid rediscovering.

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
- [ ] **Onboarding, end to end** — 10 stages, 8 numbered. There is **no "Skip
      intro"**: the hero's words appear at `HERO_REVEAL_MS` (3300 ms), once the
      mark has finished, so the first tap is ~3.6 s and that is deliberate.
      The people step collects **name + optional email and creates no group**
      (`W1-08`). Confirm: the logo animation is untouched; the income step does
      not move when you type the first digit; the money step asks only for what
      you ticked; tapping a person's row does **not** delete them; the summary's
      destinations ("Recurring · Plan", "Settings · People") are findable.
- [ ] **Group recurring totals switched basis** — whole bill with "your share ₹X"
      beneath, my-share on personal surfaces.
- [ ] **Two tabs on Personal, not three.** The Recurring tab is gone: it listed
      every rule in every shared group, so it was neither personal nor different
      from Plan → Recurring. Confirm nothing is missed by its absence.
- [ ] **Personal's Budget tab now looks like the group one** — it gained the
      overview card, the bar and the three count filters it never had.
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
      *Changed:* server backup removed; the explainer copy; restore refused while signed in
      - [ ] Explainer copy changes when signed in, and reads true
      - [ ] Signed in, Restore from backup says "Sign out first" and opens Account
      - [ ] The red warnings still read as the last word on the screen

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
      - [ ] The bell badge count matches the near-due rules from demo data (there
            is no "Coming up" card on Home to check any more — `DQ-92`)
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
      - [ ] Forecast headline and chart tell the same story
      - [ ] **On a month you are NOT overspending, it still opens with an answer**
      - [ ] The bar fills with what you have *spent*, not with your budget
      - [ ] Nothing is stated twice — no overrun in both a note and a row
      - [ ] Sections open and close, and a closed one still says how much is in it

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

- [ ] **S-30 Upcoming & recurring** — `app/upcoming.tsx · plan/recurring.tsx · recurring/[id].tsx`  
      Open: Home → the bell (Upcoming); Plan → Recurring
      - [ ] Next-occurrence dates read unambiguously
      - [ ] Skip / Pause / Stop are distinguishable and look reversible
      - [ ] The monthly-equivalent total is labelled as an equivalent, not a charge
      - [ ] **Tapping a rule from Plan, from a group, and from a transaction all land
            on that same rule** — never on a list
      - [ ] A shared rule shows **your share**, with the whole bill named under it —
            the same figure Plan shows
      - [ ] A rule with a note shows the note ("Netflix"), not its category

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

## 3 · Decisions still open → `TRACKER.md` §3, and the sync failures → §5

**Moved.** The open product and business decisions are `DQ-01`–`DQ-06` in
[`TRACKER.md`](./TRACKER.md) §3; the 24 `SYNC-F` failures — the twelve written while designing and
the twelve found by tracing the built code — are in §5 of both, merged into one list with one status each.

They were merged because this section and `SYNC-MODEL.md` Part 6 tracked the same failures and
**disagreed about four of them in both directions**. Three carried a ✅ here that was correct and an
"open" there that was not; one carried a ✅ here that was wrong. A reader had no way to tell which
document was ahead, and neither reliably was.


## 3.1 · Sync — built, and what is not proven

Server sync is complete end to end (S0–S22, `DQ-93`): the phone stays offline-first
and queues every change; a signed-in phone pushes numbered mutations and pulls every
scope it can read; the server holds a readable copy and checks each write against the
app's own rules. The first, end-to-end-encrypted design was replaced and deleted in
S22. How it behaves when somebody else changes your numbers is `SYNC-MODEL.md`.

**Proven, with tests that run the phone's real queries against the real server code**
(in-process D1, nothing about the server mocked):

- a retried push applies once; a stale edit is refused and reverted, never merged
- first sign-in: upload, restore, and "this phone already has data"
- sign-out sends first, warns about what could not be sent, then empties the phone
- invite, accept, remove, leave and delete a group across two accounts
- approvals, rejections, disputes, and a deletion of an accepted entry (`DQ-31`)
- a hand-typed friend who turns out to be an account becomes one person everywhere
- deleting an account erases what was its alone and nothing that was a group's

**Not proven: it has never run on a phone.** Two installs, two accounts, one shared
group — Checkpoint E — is the gate. Before it: reset the dev D1, apply
`server/api/migrations/0001_schema.sql`, deploy the Worker, ship a build.

**The schema is one file, edited directly** while nothing is live. Numbered,
forward-only migrations start with the first real account.

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
      `automaticallyAdjustKeyboardInsets` — the fix used on Review, Categories,
      the account screen and `BudgetEditor` — is **iOS-only**. (Onboarding no
      longer uses it: `StepScaffold` is on `react-native-keyboard-controller`'s
      `KeyboardAwareScrollView` + `KeyboardStickyView`, which is the fix this
      paragraph recommends — so it is the reference, not an example of the
      hazard.) Expo
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

## 4 · Known and accepted for the pilot → `TRACKER.md` §7

**Moved.** Recorded so nobody re-discovers them as bugs: [`TRACKER.md`](./TRACKER.md) §7. These are
**decisions, not neglect** — the distinction is the reason the list is worth keeping at all.

## 5 · Open debt → `TRACKER.md` §6

**Moved.** Real, evidenced, not blocking the pilot — twelve items in
[`TRACKER.md`](./TRACKER.md) §6 and explained in [`FINDINGS.md`](./FINDINGS.md) §6, plus the restore defects that closed while sync was being designed.

The standing rule that governed this list travels with it: **an open-debt list that overstates
itself costs more than it saves.** Verify a bullet against the tree before acting on it, and delete
it the moment it lands. Five bullets were once removed from this list in a single pass; two of them
had been fixed weeks earlier and never struck.

## 6 · After the pilot → `TRACKER.md` §8

**Moved.** Everything parked, each with the trigger that un-parks it, is in
[`TRACKER.md`](./TRACKER.md) §8 — including the four entries that have since shipped and are kept
struck through, because "we decided not to, then did" is the useful half of a parked list.

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

## 8 · Standing rules → `AGENTS.md`

**Moved.** They are rules for *how to build*, not answers to *can we ship*, and they now sit in
`AGENTS.md` under **Code Quality Rules → Standing rules for changing code**.

Three of the seven were dropped on the way rather than copied — integer paise, transactional
multi-table writes, and calling `refresh()` after a write were already stated in `AGENTS.md` twice
over. A rule maintained in two places is the failure this whole reorganisation was about.

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

---

## Appendix · The asset register (Phase 13, 2026-09-01)

*Money that leaves your account without being spent.* Asked for as "transfer from
account to investment or some asset, rather than an expense".

Before this it landed in one number in `settings` called `money.investments`,
which could answer "how much is invested" and nothing else — not what the gold is
worth, not how much is in the FD, not what the flat cost. So both available
answers were wrong: log it as an **expense**, which double-counts (the cash
already moved, and the expense counts it again as consumption and eats a budget),
or log nothing and watch net worth fall by the amount invested.

**The rule:** a transfer moves money between two things you own, so net worth does
not change. Cash down and the asset up, or the reverse, both written in **one**
transaction. Transfers out are the same movement backwards and are **not income**
— counting them as earnings would inflate every income figure and ratio on the day
you sold something.

`money_profile.investments` is now **derived** — the sum of live assets — which is
what let `computeTotalMoney` and everything downstream of it (Total Money,
Safe-to-Spend's headroom, the health score) stay untouched: the field they already
read means the same thing, sourced from somewhere that can be itemised.

Three things that were nearly silent, and are the ones to re-check on a device:

1. **A restore would have lost the whole figure.** The legacy conversion was a
   keyed one-time fix, and `restoreAllTables` preserves this device's `fix_%`
   markers — so restoring a pre-register backup brought the old number back with
   an empty asset table and the fix refused to re-run. It is a launch invariant
   now: `money.investments > 0` means "not converted yet", and zeroing it is the
   idempotence.
2. **Onboarding's investments answer.** `setMoneyProfile` no longer accepts the
   field, but the call passes a variable, so TypeScript does not flag it — the
   figure would have vanished and net worth opened short by exactly that amount.
3. **The Add screen still calls it spending.** `smartCategory` maps "sip",
   "mutual fund", "zerodha" and "gold" to the `Investments / SIP` **expense**
   category, so typing "SIP 5000" lands there by itself. The screen now recognises
   that category and offers the register — a nudge, not a block, since it might
   genuinely be a brokerage fee.

**To verify on the phone:** move ₹5,000 into an asset and confirm Available drops
by ₹5,000 while net worth does not move; take it back out and confirm both return;
archive an asset and confirm net worth drops by its balance; check the Plan card
itemises each asset under Investments.

**Deliberately not built:** an asset as a destination *inside* the Add screen's
Transfer. That flow hard-types both endpoints as a `Person` and routes through
`computeTransferScopes`/`buildTransferPlans`, which refuse when the two share no
group — assets share none. Threading a non-person id through it is a bigger change
than the register, and the entry points that exist (Plan → Assets, the Total Money
card, the Add screen's nudge) cover the same need without destabilising the
most-used screen in the app.


---

## Deferred, deliberately (decided 2026-09-01)

Not "not done" — decided, with the trigger that un-parks each.

| Deferred | Why | Un-parks when |
|---|---|---|
| **An asset as a destination inside the Add screen's Transfer** | That flow hard-types both endpoints as a `Person` and routes through `computeTransferScopes`/`buildTransferPlans`, which refuse when the two share no group — assets share none. Three entry points already exist (Plan → Assets, the Total Money card, the Add screen's nudge when you type "SIP"). Threading a non-person id through the most-used screen in the app, unverified on a device, is the wrong risk to take first. | You reach for it there during the pilot and it isn't offered. |
| **22 routes over 300 lines** (§"screen thinness") <!--count-ok--> | Pure code movement across 22 files, no functional change, and every touched screen needs re-verifying by eye. Doing it before the pilot maximises what has to be re-checked for zero user-visible gain. | After pilot feedback, when you know which screens are actually changing. |
| **~17 hand-rolled chips** (§9) | Same reasoning, higher visual risk: chips carry selected state and trailing affordances, so a bad swap breaks what a control is saying. The `IconCircle` sweep was done because a tinted disc has no state to get wrong. | Same trigger as above. |

**Closed at the same time:** `StepTransition` was deleted (dead by construction — its only home was onboarding, whose hero animation is off-limits), and `AnimatedNumber` was wired to the Plan hero via `AmountText`'s new `animate` prop. An unused primitive is a claim the shelf makes about itself that isn't true; both are now either used or gone.
