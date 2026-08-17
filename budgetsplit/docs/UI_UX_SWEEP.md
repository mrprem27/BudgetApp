# UI/UX device sweep

Walk the app screen by screen and judge what you see. Every screen below is
listed with what to open, what its documented behaviour is, and a few things
specifically worth looking at — then a blank line for whatever you actually think.

**This is not a functional test.** For "does this behaviour happen at all", use
`FEATURES_AND_FLOWS.md` §26 (26 flows, with demo data pre-staged so each is one
or two taps away). This document is about how it *looks and feels*.

**Load demo data first** — Settings → tap version 7× → Load demo data. An empty
app hides most layout problems, because nothing is long enough to break.

Four blocks, ordered by risk. **Stop after any block** and you'll still have
covered what matters most.

---

## House rules — true on every screen, so listed once

Report a failure as "S-14 breaks §9" and I'll know exactly what you mean.
References are to `AGENTS.md`.

| # | Rule | What a failure looks like |
|---|---|---|
| §1 | One hero per screen | Two numbers competing to be the biggest thing |
| §2 | Empty states have **all four** parts | A bare "Nothing here" with no icon, no explanation, no button |
| §3 | Nothing floats bare on the background | A row or field sitting directly on the dark background with no card |
| §4 | Rows ≥52pt, values don't truncate | "Househol…" — a value cut off mid-word |
| §6 | Touch targets ≥44pt | A tap that needs aiming, or misses |
| §9 | Spacing comes from the scale | A gap that looks like a mistake — double, or crushed |
| §11 | Motion is polish, never the only signal | Something changed and only an animation said so |
| §12 | Card-grouped rows are contiguous | A list card sliced into separate slabs by gaps |
| — | Nothing hides under the FAB or tab bar | The last row unreachable behind the ＋ button |
| — | Nothing hides under the notch | Content painting under the clock/status bar |

Two more worth a pass each, once per session rather than per screen:

- **Reduce Motion on** (iOS Settings → Accessibility → Motion) — the app must
  still be fully usable, with nothing conveyed by animation alone.
- **Hide amounts on** (Settings → Security) — amounts mask to ••••, and nothing
  else breaks.

---

## Block A — new or changed today

**Never rendered on a device even once.** Highest chance of something plainly
wrong. This block needs `EXPO_PUBLIC_API_URL` in the build (it is) and a rebuild
(`npx expo prebuild --clean && npx expo run:ios`).

### S-06 · Settings — `app/(tabs)/settings.tsx`
**Open:** Settings tab
**States:** no loading (static list) · ErrorState+retry · no PTR
- [ ] The **Account** section appears, directly under the profile card
- [ ] Profile card subtitle reads your email when signed in, else "Offline-first · sign in to back up"
- [ ] The first section's header is not double-spaced from the profile card, and no section is crushed against the one above
- [ ] Version row shows **no** "tap 7×" hint (that's dev-only now)
**Changed today:** Account section added; section top-margin now computed rather than hardcoded
**Feedback:**

### S-36 · Account — `app/settings/account.tsx`
**Open:** Settings → Account
**States:** spinner while the session is read · inline error text, not an Alert
- [ ] Signed out: the explainer card reads as an invitation, not a warning
- [ ] The email field and CTA are comfortable one-handed; keyboard doesn't cover the button
- [ ] After sending: "Check your inbox" names the address you typed
- [ ] Signed in: avatar, name, email and "Signed in on <device>" line up as one identity block
- [ ] Sign out is visibly destructive without shouting
**Changed today:** entire screen is new
**Feedback:**

### S-38 · Linked people — `app/settings/linked.tsx`
**Open:** Settings → Account → Linked people
- [ ] Empty state explains what linking is *for*, not just that there's nothing
- [ ] "Invite someone" sheet: the QR is big enough to scan from another phone across a table
- [ ] A pending claim shows the person's name **and** email — enough to recognise them
- [ ] "Link" / "Not them" read as a real decision, not a confirm dialog
- [ ] The share-phone switch's explanation is legible at a glance and doesn't wrap oddly
**Changed today:** entire screen is new
**Feedback:**

### S-39 · Invite landing — `app/link.tsx`
**Open:** tap an invite link (make one on this device, open it on another)
- [ ] "Asked to link" reads as **success**, not as an error or a hang
- [ ] Signed-out path offers sign-in rather than dead-ending
**Changed today:** new
**Feedback:**

### S-37 · Sign-in callback — `app/auth.tsx`
**Open:** tap the link in the sign-in email
- [ ] The spinner state is brief and doesn't flash
- [ ] It lands you on Account, signed in, without a visible double-navigation
- [ ] An expired link explains what to do next
**Changed today:** new — this is the screen that showed "unmatched route" before the rebuild
**Feedback:**

### S-34 · Backup & restore — `app/settings/backup.tsx`
**Open:** Settings → Backup & restore
**States:** spinner per row while busy · every failure is an Alert
- [ ] Explainer copy changes when signed in (mentions the account) and reads true
- [ ] The two server rows sit with the two file rows as one card, not a separate slab
- [ ] "Restore from your account" sheet lists date + size legibly; the trash icon is tappable without hitting the row
- [ ] The standing red warning still reads as the last word on the screen
**Changed today:** server backup/restore rows, the sheet, and the explainer copy
**Feedback:**

### S-26 · People — `app/friends.tsx`
**Open:** Settings → People
**States:** ErrorState+retry · EmptyState · PTR ✅
- [ ] The rename sheet's three fields (name, UPI ID, phone) don't push the Save button off-screen with the keyboard up
- [ ] Phone hint reads sensibly under the field
- [ ] Balance chips still align after the sheet grew
**Changed today:** phone field added to the sheet
**Feedback:**

### S-05 · Plan — `app/(tabs)/savings.tsx`
**Open:** Plan tab
**States:** no loading · ErrorState+retry · "No savings goals yet" · PTR ✅
- [ ] Goals render as **three sections** (Emergency / Need / Want), not one flat list
- [ ] A section holding one goal shows no "hold & drag to reorder" hint
- [ ] Dragging reorders *within* a section and never across
- [ ] The section header reads as a header, not as another goal card
- [ ] The hint under each section title explains the tag without being a paragraph
**Changed today:** three-section layout, priority picker, funding/raid order
**Feedback:**

### S-17 · Goal detail — `app/savings/[id].tsx`
**Open:** Plan → any goal
- [ ] The Adjust sheet's priority picker reads as "pick exactly one"
- [ ] Changing the tag and saving moves the goal to the right section on the way back
- [ ] The card isn't busier than before (the docs already flag these as dense)
**Changed today:** priority picker in the Adjust sheet
**Feedback:**

### S-33 · Afford check — `app/afford.tsx`
**Open:** Home → Can I afford this
**States:** ErrorState — never swallowed · no PTR (it's a form)
- [ ] The "How often?" chips read as one-of-four, and Once is clearly the default
- [ ] Picking a frequency visibly changes the verdict reasoning, not just the number
- [ ] "Owed to you (not counted above)" is clearly *excluded*, not another balance
- [ ] The verdict is still the hero; the new rows didn't demote it
**Changed today:** frequency chips, owed-to-you row, real upcoming bills
**Feedback:**

### S-19 · Review — `app/review.tsx`
**Open:** Home → inbox badge → Review (needs demo data)
- [ ] The saved-view banner shows the count **and** payer even with a long view name
- [ ] Source tabs still show their counts when labels are long
- [ ] Bulk select / focus / saved views feel discoverable rather than hidden in ⋯
**Changed today:** banner badge fix. **Never device-tested at all** (checklist §5)
**Feedback:**

### S-07 · Quick Add — `app/add/quick.tsx`
**Open:** ＋ → any kind
- [ ] Spacing between form blocks is even — no doubled or crushed gaps anywhere down the screen
- [ ] Transfer: picking a person, then Pay by UPI / Show QR, opens exactly one sheet at a time
- [ ] Amount stays the hero as the form grows
- [ ] Save in the header reads as the commit action, opposite the ✕
**Changed today:** container gap → per-block margins; TransferBody moved; its two sheets now open through the shared overlay
**Feedback:**

---

## Block B — money-critical

Where a UI mistake becomes a *money* mistake.

### S-03 · Home — `app/(tabs)/index.tsx`
**Open:** Home tab
**States:** no loading (deliberate) · ErrorState+retry · first-run hero + 3 tiles · PTR ✅
- [ ] The one hero number dominates; tiles support it rather than compete
- [ ] Owe **and** owed both show when both exist, and never as one net figure
- [ ] "Coming up" shows the near-due rules from demo data
- [ ] The last card clears the FAB and the tab bar
**Feedback:**

### S-09 · Group detail — `app/group/[id].tsx`
**Open:** Groups → any group
- [ ] Tabs (Expenses / Budget / Members) don't truncate
- [ ] The balance card states who owes whom in words, not just numbers
- [ ] An all-settled group shows the check-circle state, not blankness (Office Lunch in demo data)
**Feedback:**

### S-11 · Members & settle — `app/group/[id]/members.tsx`
**Open:** Group → Members
- [ ] Each member's balance is readable at a glance and correctly signed
- [ ] Settle flow states the amount and direction before you commit
- [ ] Swipe-remove is blocked with an explanation where a balance exists (Roommates), allowed where settled (Office Lunch)
**Feedback:**

### S-10 · My Budget — `app/budget.tsx` · S-10b · Group budget — `app/group/[id]/budget.tsx`
**Open:** Settings → My Budget; Group → Budget tab
- [ ] Over / near / under states are distinguishable without relying on colour alone
- [ ] The group editor says "my share" where that's what it means
- [ ] Long category names don't truncate the amount beside them
**Feedback:**

### S-14 · Personal — `app/personal.tsx`
**Open:** Home → Personal
- [ ] Section headers space the *blocks*, and transaction rows inside a card stay contiguous
- [ ] Empty state has all four parts
- [ ] Nothing hides behind the FAB
**Feedback:**

### S-08 · Itemized bill — `app/add/itemized.tsx`
**Open:** ＋ → expense → Split by items
- [ ] Step transitions are legible — you always know which step you're on
- [ ] "Must equal total ₹X" is impossible to miss when payers don't balance
- [ ] Scanning overlay blocks input and doesn't strand you if the scan fails
**Feedback:**

### S-15 · Transaction detail — `app/txn/[id].tsx`
**Open:** any transaction
- [ ] The amount is the hero; shares and payments read as supporting detail
- [ ] Receipt thumbnail (attach one first) opens and closes cleanly
- [ ] History reads as a timeline, not a debug dump
**Feedback:**

---

## Block C — analytics and data-in

Dense and chart-heavy — where truncation and axis defects hide.

### S-20 · Reports — `app/reports.tsx`
**Open:** Settings → Reports & export
**States:** Skeleton while loading · EmptyState "Nothing to report yet" · PTR ✅
- [ ] Donut legend labels don't truncate; slices are distinguishable
- [ ] The month selector can't go past the current month
- [ ] "Top categories" and "Biggest expense" agree with the donut
**Feedback:**

### S-21 · Report transactions — `app/report-transactions.tsx`
**Open:** Reports → tap a donut category
- [ ] The filter says what it's filtering, and "All" genuinely includes transfers in the list
- [ ] No single "total" spanning income, expense and transfer
**Feedback:**

### S-22 · Insights — `app/insights.tsx`
**Open:** Home → Insights
- [ ] X-axis day labels are whole numbers, not "1…" "2…"
- [ ] The forecast hero and the chart tell the same story
- [ ] Ten cards don't read as ten equal shouts — hierarchy is visible
**Feedback:**

### S-16 · Category detail — `app/category/[name].tsx`
**Open:** Reports or Home → a category
- [ ] Skeleton appears while loading rather than a blank screen
- [ ] No dead space under the header (this screen double-applied the inset once)
**Feedback:**

### S-23 · Search — `app/search.tsx`
**Open:** Home → search
- [ ] The chip row's right-edge fade reads as "more to scroll"
- [ ] Empty state switches copy between "Search your transactions" and "No matches"
- [ ] Correctly **no** pull-to-refresh
**Feedback:**

### S-18 · Import — `app/import.tsx`
**Open:** Settings → Import transactions
- [ ] Paste gibberish → "No transactions found" is helpful, not a dead end
- [ ] A scanned/image PDF explains the 0-characters case in plain words
**Feedback:**

### S-28 · Audit log — `app/history.tsx`
**Open:** Settings → Audit log
- [ ] Coloured dots and EDIT/DEL badges are legible at row size
- [ ] "Load older" doesn't jump the scroll position
**Feedback:**

---

## Block D — config and utility

Lower risk and longer. Do it last, or in pieces.

### S-04 · Groups — `app/(tabs)/groups.tsx`
- [ ] "No groups yet" and "No archived groups" don't both show as equal-weight empties
- [ ] Group cards clear the FAB
**Feedback:**

### S-25 · Categories — `app/categories.tsx`
- [ ] Kind tabs read as one-of-three
- [ ] The Uncategorized section explains what "adopt" does
**Feedback:**

### S-24 · Feature management — `app/features.tsx`
- [ ] "Always on" pillars visibly differ from switchable modules
- [ ] Turning splitting **off** names how many balances would disappear
- [ ] Cloud Receipt Scanning row isn't dimmed when off
**Feedback:**

### S-31 · Notifications — `app/settings/notifications.tsx`
- [ ] Denied-permission banner offers Open Settings
- [ ] Test notification confirms it fired
**Feedback:**

### S-35 · Voice entry — `app/settings/voice.tsx`
- [ ] Setup steps are followable without prior context
- [ ] The privacy line reads honestly (it changed today — no longer absolute)
**Feedback:**

### S-27a · Storage — `app/settings/storage.tsx`
- [ ] Free space is the hero; the breakdown supports it
- [ ] The pdf.js row is **gone** (bundled now)
- [ ] Both reclaim actions say what they will and won't delete
**Changed today:** pdf.js row removed
**Feedback:**

### S-30 · Reminders — `app/reminders.tsx` · S-32 · Recurring — `app/plan/recurring.tsx` · S-12 · Group recurring
- [ ] Next-occurrence dates read unambiguously
- [ ] Skip / Pause / Stop are distinguishable and reversible-looking
- [ ] The monthly-equivalent total is labelled as an equivalent, not a charge
**Feedback:**

### S-13 · Edit group — `app/group/[id]/edit.tsx`
- [ ] Icon/colour pickers show the current selection clearly
- [ ] Archive vs delete are visibly different in weight
**Feedback:**

### S-29 · Help — `app/help.tsx`
- [ ] Accordion sections open smoothly; copy matches what the app now does
- [ ] "Offline by default" text reads true (it changed today)
**Changed today:** privacy copy
**Feedback:**

### S-27 · Storage (dev) — `app/storage.tsx`
- [ ] Reachable **only** in a dev build, via version ×7
- [ ] Load demo data / Erase all data are unmistakably destructive
**Changed today:** gated to `__DEV__`
**Feedback:**

---

## Reporting back

Per screen, anything is useful — "the gap under Split looks wrong", "this word is
confusing", "I expected a back button". Screenshots help most for spacing and
truncation.

I'll fix and tick as feedback lands. Where something is deliberate (§20 documents
several screens that *intentionally* have no loading state or no pull-to-refresh)
I'll say so and cite the reason rather than change it silently.
