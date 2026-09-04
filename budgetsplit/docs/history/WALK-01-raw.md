# BudgetSplit — the walkthrough

Generated 2026-09-04 from `docs/SYSTEM.md`.
55 booklets · 180 stops · 2 answered.
Estimated 20 hours in total — a rough figure, worked out from
how much each stop asks of you.

Every screen, task, component, rule, known problem and open question in the app appears
here exactly once. Blockquotes are what was found while walking it.

---

## First run and empty states (1/2)

_Erase everything and start from nothing. The only way to see first run, and the only way to see an empty state — demo data can never show you one._

`wipe first` · about 17 min · 1/1 walked

> In Empty States In persona l grouop or so nd akk the icons and all are changing Postion in For example in Activity thae Emtpy STate Icome COming ABove a bit while in buttdet a little Lowerthings changes shiould feels kmooth or so

### First run  `FL-01`

**Why** Opening the app for the first time.

**You need** empty — Storage → Erase all data, then relaunch. This is the ONLY way to see first run, and the only way to see any empty state.

**Start from**
1. OnboardingGate, when settings.onboardingDone() is false or errors

**Do this**
1. hero
2. intent
3. name
4. income
5. money
6. pay
7. budget
8. people (skipped for the personal persona)
9. permissions + summary

**Should happen** A person row with is_me, the money profile, a sparse flag patch from the persona, budget_target, onboardingDone. The navigator mounts for the first time. No back-stack — onboarding *replaces* the navigator rather than sitting in it.

**Check the numbers**
- nothing exists yet. Every list should be a designed empty state with something to tap, never a zero or a blank
- the figures you type here become the opening balances every later number is built on — get them wrong and everything downstream is

**Watch out for**
1. a read error on the done-flag is treated as "not done", so a storage fault re-runs onboarding rather than skipping it
2. declining notifications silently disables FE-50's value

**Also try**
- refuse the notification permission and check the app still works
- pick the personal-only persona and confirm the Groups tab is gone
- replay the tour from Settings — it needs an app restart, which is a known rough edge worth seeing for yourself

**If it went wrong** "Replay welcome tour" clears the flag but **requires an app restart** — the gate cannot be re-entered live. A known rough edge. —

> Did the numbers come out right? **skip** · Does it look right? **broken** · Did it do what it said? **off** · Is the data right afterwards? **wrong**
> 
> And Why The Income I added Is haaventot comes as A recurring Transaction or o or like that and Income things can have a Dropdown Options or like that asaying Addtiona Income Basically a smaller version of Add Income or so or like that But Interqactive or so and aklk

---

## First run and empty states (2/2)

_Erase everything and start from nothing. The only way to see first run, and the only way to see an empty state — demo data can never show you one._

`wipe first` · about 35 min · 1/1 walked

### Every empty state  `EMPTY`

**With the app wiped, open everything.** Every list is empty right now, and this is
the only time you will see that.

> Does it look right? **off**

---

## Recording money · the screens (1/2)

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 29 min · 0/4 walked

### /add/quick  `SC-07`

**Open** `/add/quick` — 24 ways in

**What it is for** **The** form: expense / income / transfer, edit, rule-edit

**The pieces on it**
- `AddHeader`
- `AmountCalculatorSheet`
- `AmountField`
- `BudgetNudge`
- `CategoryDatePills`
- `DestinationSheet`
- `DetailChips`
- `NoteSheet`
- `PayersSheet`
- `QuickAddSheets`
- `RecurringControls`
- `RecurringSheet`
- `ScopeSheet`
- `SplitSheet`
- `SplitSummary`
- `TagSheet`
- `TransferBody`
- `TransferSlotSheet`
- `VoiceEntrySheet`

**Popups it can raise** (7)
- "Couldn’t attach the photo"
- "End date is before the start"
- "No shared group"
- "Nothing left to change"
- "Photo couldn’t be saved"
- "Possible duplicate"
- "Split doesn’t add up"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** fullScreenModal. 11 params. `OV-08`

### /add/itemized  `SC-08`

**Open** `/add/itemized` — one way in

**What it is for** 4-step itemized wizard

**The pieces on it**
- `CategoryPicker`
- `PayMethodSheet`
- `ReceiptScanSheet`
- `ScanningOverlay`
- `SplitEditor`

**Popups it can raise** (1)
- "Scan failed"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** fullScreenModal

### /personal  `SC-14`

**Open** `/personal` — 2 ways in

**What it is for** The personal ledger: Activity · Budget

**The pieces on it**
- `BudgetCategoryRow`
- `BudgetList`

**Popups it can raise** (3)
- "Export failed"
- "Nothing to export"
- "Saved"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** A stack route in a tab slot. `OV-15`

### /txn/[id]  `SC-15`

**Open** `/txn/[id]` — 5 ways in

**What it is for** Transaction detail

**Popups it can raise** (5)
- "Delete transaction?"
- "Low on storage"
- "Photo couldnu2019t be saved"
- "Remove receipt?"
- "Something went wrong"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

---

## Recording money · the screens (2/2)

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 13 min · 0/4 walked

### /category/[name]  `SC-16`

**Open** `/category/[name]` — 2 ways in

**What it is for** One category across day/month/year

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Heaviest single read in the app

### /search  `SC-23`

**Open** `/search` — one way in

**What it is for** 3-year search, month-sectioned

**The pieces on it**
- `TransactionRow`
- `TxnCell`

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** A **ledger**, not an analysis surface

### /categories  `SC-25`

**Open** `/categories` — one way in

**What it is for** The global catalog

**Popups it can raise** (3)
- "Delete “${cat.name}”?"
- "Name already used"
- "Something went wrong"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /settings/voice  `SC-35`

**Open** `/settings/voice` — one way in

**Popups it can raise** (1)
- "Couldn't open Shortcuts"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

---

## Recording money · logging it (1/4)

_Getting a transaction into the app — typed, spoken, scanned or split by item — and everything that describes it afterwards: category, receipt, note, the ledger you find it in again._

`changes things` · about 24 min · 0/1 walked

### Add an expense  `FL-04`

**Why** "I spent money."

**You need** demo or yours — Roommates holds you, Aarav and Priya, so a three-way split is one tap away.

**Start from**
1. 24 in-app call sites, plus 3 external. The full list:
1. tab-bar FAB (tabs)/_layout.tsx:350
2. Home banner CTA (tabs)/index.tsx:117
3. Home empty-state CTA (tabs)/index.tsx:258
4. Home balance-strip Settle (tabs)/index.tsx:346
5. Groups friends-strip Settle (tabs)/groups.tsx:290
6. group balance card Settle group/[id].tsx:238
7. group FAB group/[id].tsx:261
8. group members pair Settle group/[id].tsx:294
9. group Expenses tab add group/[id].tsx:310
10. group Recurring tab add group/[id].tsx:316
11. members screen Settle group/[id]/members.tsx:179
12. Personal FAB personal.tsx:262
13. Personal empty CTA personal.tsx:304
14. person Settle person/[id].tsx:235
15. person Add expense person/[id].tsx:248
16. friends Settle friends.tsx:338
17. reminders "Log payment" reminders.tsx:144
18. recurring list add plan/recurring.tsx:157
19. rule action → log this one hooks/useRecurringActions.ts:73
20. insights CTA insights.tsx:143
21. reports CTA reports.tsx:325
22. afford "Log it" / "Buy anyway" afford.tsx:380
23. category detail add category/[name].tsx:383
24. txn detail → Edit txn/[id].tsx:126 .X1 daily_log notification .X2 Siri VOICE_DEEP_LINK .X3 deep link

**Do this**
1. amount
2. destination group
3. category
4. title/note
5. date
6. pay method
7. payers
8. split
9. save All but
1. and
9. have defaults. The median real path is 2 steps.

**Should happen** One withTransactionAsync: the txn, its payments, its shares, its line items if any, and an outbox row if the group is shared. IV-03. Dismisses the fullScreenModal back to wherever it came from. Uses backOr, so a cold-started deep link does not get a dead ✕.

**Check the numbers**
- **the check that matters most in this app.** Log ₹300 in Roommates split three ways: Home's month total rises by **₹100, not ₹300**. Your share is your spending, whoever fronted the cash (IV-08)
- the group balance moves by the other ₹200, owed to you
- **cash drops by ₹300 only if you paid.** If Aarav paid, your cash does not move at all (IV-20)
- Reports and the category's budget bar move by ₹100, not ₹300

**Watch out for**
1. amount unparseable → inline validation, haptic.error
2. duplicate within ±24 h → a warning, never a block
3. storage full at attachment write → the txn still saves
4. the destination group was deleted while the sheet was open
5. shares stop summing to payments after a member is removed mid-edit

**Also try**
- log one where **someone else paid** and confirm your cash is untouched while your spending still rose
- backdate one into last month and check it lands in last month's budget, not this one
- ₹0
- a negative amount
- `12.345`
- `1,2,3`
- log into a category already over budget and watch the nudge fire

**If it went wrong** Undo toast for 5 s, then soft-delete from SC-15. An entry someone else wrote cannot be deleted by you — dispute it instead (FL-28). OV-08 (11 params, 24 entries) · OV-02 (if kind=transfer) · OV-27

---

## Recording money · logging it (2/4)

_Getting a transaction into the app — typed, spoken, scanned or split by item — and everything that describes it afterwards: category, receipt, note, the ledger you find it in again._

`changes things` · about 29 min · 0/2 walked

### Split a bill by items  `FL-05`

**Why** "We ordered separately and the bill is one number."

**You need** demo — the Goa Trip seafood dinner is already itemized, and mixes percent and shares splits on one bill.

**Start from**
1. SC-07 → "Split by items" (flag: itemized)

**Do this**
1. items (typed, or scanned — FL-18)
2. assign each line
3. adjustments: tax, tip, discount, service
4. payers
5. review
6. save

**Should happen** One transaction: the txn with adjustments as JSON, its line items, and the payments and shares derived from the assignment. Dismisses to the caller.

**Check the numbers**
- the line items, plus tax and tip, minus the discount, must equal the bill total shown at the top
- **your share is the sum of the items assigned to you** — not the bill divided by the number of people
- a line nobody is assigned splits across everyone

**Watch out for**
1. items summing to less than the bill leaves a remainder that must land somewhere deterministic (IV-02)
2. OCR returns nothing useful → falls back to manual entry

**Also try**
- open the demo's seafood dinner and **add the four items up by hand**, then apply 5% GST, 10% tip and the ₹200 coupon
- leave a line unassigned and see where its cost goes
- make the items sum to less than the bill and find where the remainder lands — it has to land somewhere deterministic

**If it went wrong** As FL-04. **Line items do not sync.** A peer receives a single expense: the money is right, the breakdown is gone. Nothing on screen says so.

### Add income  `FL-12`

**Why** "I got paid."

**You need** demo — three months of ₹85,000 salary, a freelance gig, and interest.

**Start from**
1. SC-07 Income pill
2. Home CTA with kind=income
3. review commit

**Do this**
1. amount
2. income category
3. landing bucket
4. date
5. save

**Should happen** One txn, one payment row for me, and **zero shares** — income is never grouped, because grouping it carries no meaning (IV-16). Dismisses.

**Check the numbers**
- income raises cash and **never** appears in a spending total
- it lands in the bucket you pick — bank by default, and the Plan screen's three buckets must add up afterwards
- **income is never split.** It writes one payment and zero shares, because splitting income means nothing (IV-16)

**Watch out for**
1. logged into a shared group, where it means nothing

**Also try**
- log income **into a shared group** and see whether the app lets you, and what it does with it
- land some in Cash instead of Bank and check the buckets on Plan
- check Reports shows income separately, never mixed into spending

**If it went wrong** As FL-04. INCOME_LANDING is a view over PAY_METHOD rather than a real account concept — deliberately, and DQ-14 is where that gets revisited.

---

## Recording money · logging it (3/4)

_Getting a transaction into the app — typed, spoken, scanned or split by item — and everything that describes it afterwards: category, receipt, note, the ledger you find it in again._

`changes things` · about 28 min · 0/2 walked

### Edit a transaction  `FL-13`

**Why** "That was wrong."

**You need** demo — any transaction. Aarav's electricity is a peer entry, which behaves differently.

**Start from**
1. SC-15 header Edit
2. group ledger row
3. Personal row
4. person ledger row
5. search / report drill-down → SC-15 → Edit

**Do this**
1. open
2. change
3. save

**Should happen** **Payments, shares and line items are DELETEd and re-INSERTed wholesale.** This is why approval state can never live on them (IV-12). sync_version increments; a stale write is a 409, never silent LWW. Back to SC-15, or to the ledger.

**Check the numbers**
- change ₹300 to ₹600 in a three-way split and your total rises by **₹100, not ₹300** — the same rule as adding
- every surface must move together: Home, the balance, the budget bar, Reports. **A figure that moves while the others do not is worse than all of them moving**

**Watch out for**
1. 409 on push after an offline edit
2. an edit that makes someone else worse off needs their approval (IV-09)

**Also try**
- edit an amount and then check **four screens agree**
- edit a peer entry — Aarav's — and see whether it is allowed
- change who paid, without changing the amount, and watch cash move while your spending does not
- edit a **materialized recurring occurrence** and confirm it opens the rule rather than a dead end

**If it went wrong** The previous values are not kept. Undo covers deletion, not edits. The prop is called onEditTxn/editRef everywhere and it opens a *detail* screen — the naming and the behaviour disagree.

### Delete a transaction  `FL-14`

**Why** "That shouldn't be there."

**You need** demo — there is a row labelled **"Delete me — tests the Undo toast"** seeded for exactly this, and one already soft-deleted.

**Start from**
1. group ledger swipe
2. Personal swipe
3. person ledger swipe
4. SC-15 Delete

**Do this**
1. swipe or tap
2. confirm
3. undo toast, 5 s

**Should happen** Soft delete only. Children stay. Stays; the list reloads.

**Check the numbers**
- deleting reverses everything adding did, on every surface
- **undo must restore all of it**, not just the row
- a soft-deleted row must vanish from every total while still being recoverable

**Watch out for**
1. undo after the toast expires → use SC-15's restore

**Also try**
- **delete the "Delete me" row and press Undo** — then check Home's total is back to what it was
- let the toast expire, then restore from the entry instead
- delete a recurring **rule** and choose "keep what it logged", then do it again choosing "remove them too"
- try to delete Aarav's entry — a peer's entry is refused, and it should say so plainly rather than failing quietly

**If it went wrong** Yes, both by toast and by restore. —

---

## Recording money · logging it (4/4)

_Getting a transaction into the app — typed, spoken, scanned or split by item — and everything that describes it afterwards: category, receipt, note, the ledger you find it in again._

`changes things` · about 14 min · 0/1 walked

### Search  `FL-40`

**Why** "Where was that dinner?"

**You need** demo — three months of history to search.

**Start from**
1. SC-03's magnifier

**Do this**
1. tap search
2. type
3. results appear by month
4. filter by kind
5. tap through to the entry

**Should happen** Nothing. Tapping a row opens the entry.

**Check the numbers**
- **on "All" there is deliberately no total.** One figure across money-in, money-out and money-moved answers no question (IV-17)
- pick a single kind and a total appears
- it is a **ledger**, so settlements are listed here even though Reports excludes them

**Watch out for**
1. a query matching nothing
2. deliberately **no pull-to-refresh** — the list is the query

**Also try**
- search "Prawns" — it is a line item inside an itemized bill
- search a rupee amount
- **check "All" shows no total, then pick Expenses and check one appears.** This shipped as a bug twice
- search something that only matches a soft-deleted row

**If it went wrong** Nothing written. —

---

## Recording money · capture (1/2)

_Getting a transaction into the app — typed, spoken, scanned or split by item — and everything that describes it afterwards: category, receipt, note, the ledger you find it in again._

`changes things` · about 28 min · 0/2 walked

### Voice capture  `FL-17`

**Why** "Two hundred rupees, chai" said out loud.

**You need** any, on a real device — the keyboard's own dictation, so nothing to install and no permission to grant.

**Start from**
1. SC-07 mic disc
2. the Siri Shortcut, drained at cold start

**Do this**
1. speak
2. voiceParse extracts amount, category, note, person
3. the form is prefilled
4. review
5. save

**Should happen** Either straight to a transaction, or into the review inbox, depending on VoiceDestination. Dismisses.

**Check the numbers**
- what it fills in must be what you said, and nothing more — a wrong amount here is a wrong ledger
- it is a prefilled form, not a save: **nothing is written until you confirm**, so a bad parse costs a tap

**Watch out for**
1. the phrase does not parse → the raw text becomes the note
2. the one-tap Shortcut install is dead: VOICE_SHORTCUT_URL is null, so only the four-step manual setup works (DQ-22)

**Also try**
- say "two hundred rupees chai" and check every field it filled
- say something it cannot parse and confirm the words survive as a note rather than being thrown away
- say a person's name and see whether it routes to a split
- check the Siri setup screen — the one-tap install is dead today, so only the four manual steps work, and that should be evident

**If it went wrong** As FL-04. Voice auto-save has no off switch, deliberately (DQ-20). The whole Shortcuts apparatus is slated for deletion when App Intents land.

### Scan a receipt  `FL-18`

**Why** "Here's the bill, do the typing."

**You need** any, on a real iPhone with a real receipt. **iOS only.**

**Start from**
1. SC-08 "Scan receipt" (flag: receiptScan, iOS only)

**Do this**
1. capture
2. OCR
3. lines proposed
4. correct
5. continue FL-05

**Should happen** Nothing until FL-05 saves. Returns into the itemized wizard.

**Check the numbers**
- the scanned total must match the paper in your hand
- **nothing is written until you finish the bill**, so a bad scan costs corrections, not data
- the items must sum to the total, the same as any itemized bill

**Watch out for**
1. permission denied *after* Scan was tapped
2. OCR returns nothing usable → manual entry, nothing lost
3. iOS only; the Android port needs an ML Kit rewrite

**Also try**
- scan a real receipt and count how many lines it got right
- scan something that is not a receipt at all
- deny the camera permission **after** tapping Scan
- switch the provider to on-device in Settings and scan the same receipt again — offline, and the results should be comparable

**If it went wrong** Nothing is written until the bill is saved. A Mistral fallback is documented in ocrProviders/index.ts and was never built — deliberately abandoned, since device solves it offline.

---

## Recording money · capture (2/2)

_Getting a transaction into the app — typed, spoken, scanned or split by item — and everything that describes it afterwards: category, receipt, note, the ledger you find it in again._

`changes things` · about 26 min · 0/2 walked

### Manage categories  `FL-41`

**Why** "I want a category for the dog."

**You need** demo — **`Poker Night` is sitting uncategorised**, because Aarav used a category you do not have.

**Start from**
1. SC-06 → SC-25
2. SC-07, created inline while adding

**Do this**
1. open Categories
2. add, rename, or delete
3. or adopt an uncategorised name
4. confirm

**Should happen** A rename **rewrites every referencing row by name**, because the reference is a string and not an id (OV-06). A delete writes a tombstone, or the next launch would resurrect it. Stays on Categories.

**Check the numbers**
- renaming moves no money — every total should be identical after
- **deleting does not recategorise anything.** Old transactions keep the name as an orphan string and fold into `Others`
- adopting `Poker Night` should move ₹400 out of `Others` and into a category of its own

**Watch out for**
1. deleting a category that has a budget — the budget goes with it
2. `Other` and `Others` are one character apart and mean entirely different things (OV-18)

**Also try**
- **adopt `Poker Night` and watch `Others` shrink by ₹400**
- rename Groceries and check the budget still applies
- delete a category you have spent in, then look at Reports

**If it went wrong** Recreate it; the tombstone is removed. OV-06 · OV-18 · DQ-16.

### Adopt an uncategorised name  `FL-53`

**Why** "What is this `Poker Night` thing in my breakdown?"

**You need** demo — **`Poker Night` is there waiting**, from Aarav's game night in Roommates. ₹400 of it is yours.

**Start from**
1. SC-25

**Do this**
1. open Categories
2. find the uncategorised section
3. adopt it, or leave it
4. pick an icon and colour

**Should happen** Turns a name that only exists on transactions into a real category. Stays.

**Check the numbers**
- **before adopting, your ₹400 is inside `Others`**
- after adopting, `Others` drops by ₹400 and `Poker Night` appears with ₹400 — the month total must not move

**Watch out for**
1. confusing `Others` (the fold) with `Other` (a real category one character away, OV-18)

**Also try**
- **note the `Others` figure, adopt `Poker Night`, check `Others` dropped by exactly ₹400 and the month total did not move**
- adopt it and then set a budget on it

**If it went wrong** Delete the category again; it returns to the fold. OV-18 · DQ-16.

---

## Splitting and settling · the screens (1/2)

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 26 min · 0/4 walked

### /groups  `SC-04`

**Open** `/groups` — 5 ways in

**What it is for** Group list (Personal pinned) + friends balance chips

**The pieces on it**
- `AvatarStack`

**Popups it can raise** (1)
- "Error"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** `active` / `archived`

### /group/[id]  `SC-09`

**Open** `/group/[id]` — one way in

**What it is for** Group hub: Expenses · Recurring · Budget · Members

**The pieces on it**
- `BalanceRow`
- `BudgetTab`
- `GroupBalanceCard`
- `GroupHero`
- `MembersTab`
- `RebalanceSheet`
- `RecurringRow`
- `RecurringTab`
- `TransactionsTab`

**Popups it can raise** (6)
- "Archive group?"
- "Couldn't change this"
- "Couldn't re-plan"
- "Export failed"
- "Nothing to export"
- "Saved"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Redirects to `/personal` for the personal group

### /group/[id]/members  `SC-11`

**Open** `/group/[id]/members` — one way in

**What it is for** Add / invite / remove

**The pieces on it**
- `PersonPicker`
- `ShareGroupRow`
- `Toast`

**Popups it can raise** (7)
- "Can't remove ${person.name}"
- "Could not share"
- "Couldn't add them"
- "Couldn't remove ${person.name}"
- "Invitation sent"
- "Remove ${person.name}?"
- "Something went wrong"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /group/[id]/edit  `SC-13`

**Open** `/group/[id]/edit` — one way in

**What it is for** Rename, recolour, share, leave, delete

**The pieces on it**
- `GroupForm`

**Popups it can raise** (8)
- "Archive this group?"
- "Can’t delete"
- "Can’t leave"
- "Couldn’t delete"
- "Couldn’t save changes"
- "Delete for everyone?"
- "Group not found"
- "Leave this group?"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Shares `GroupForm` with the create sheet

---

## Splitting and settling · the screens (2/2)

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 11 min · 0/2 walked

### /friends  `SC-26`

**Open** `/friends` — 2 ways in

**What it is for** People

**The pieces on it**
- `PersonNameSheet`
- `UpiQrScanner`

**Popups it can raise** (4)
- "Can't remove ${person.name}"
- "Remove ${person.name}?"
- "Saved, but the invite didn’t go"
- "Something went wrong"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /person/[id]  `SC-26a`

**Open** `/person/[id]` — 2 ways in

**What it is for** One person, across every group

**The pieces on it**
- `TrustSheet`

**Popups it can raise** (4)
- "Can't delete this"
- "Could not open WhatsApp"
- "Delete recurring rule?"
- "Delete transaction?"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

---

## Splitting and settling · groups and people (1/2)

_Groups, the people in them, who owes whom, and paying each other back. Balances are never stored — they are recomputed from payments and shares every time you look._

`changes things` · about 27 min · 0/2 walked

### Create a group  `FL-22`

**Why** "We need to split things — flatmates, a trip, a team lunch."

**You need** any. On empty this is the first thing worth doing.

**Start from**
1. SC-04, the "+" sheet

**Do this**
1. name it
2. pick an icon and colour
3. add people
4. choose the default split
5. create

**Should happen** The group, your membership with role `admin`, and `created_by` = you. `insertGroup` also seeds the group's categories. Pushes SC-09, the new group's hub.

**Check the numbers**
- a new group contributes ₹0 to everything until it has an expense
- it appears on Groups immediately, and on Home's people strip only once a balance exists

**Watch out for**
1. a group with no creator and no admin can never have its budget edited by anyone, permanently — which is why
5. writes both
2. an empty name

**Also try**
- create one with no other members, then add someone later
- two groups with the same name
- a very long name, and an emoji in it

**If it went wrong** Archive it, or delete it if you created it (FL-26). OV-26 — creating is a sheet, editing the same thing is a full screen.

### Add or remove members  `FL-23`

**Why** "Priya moved in" / "Vikram moved out."

**You need** demo — Roommates has you, Aarav and Priya.

**Start from**
1. SC-09 Members tab
2. SC-11

**Do this**
1. open Members
2. add an existing person, or type a new name
3. to remove, swipe the row
4. confirm

**Should happen** Adding inserts a membership row. **Removing is a soft delete** — `deleted_at` is set and the row stays, because a departed member's past shares still have to resolve (IV-21). Stays on Members; the list reloads.

**Check the numbers**
- removing someone does **not** change any past expense or any balance — their old shares still count, and still show
- what changes is only who future expenses can be split with

**Watch out for**
1. a non-admin sees no add or remove control
2. removing someone who is owed money — allowed, and the balance survives, which surprises people

**Also try**
- remove someone mid-settlement and watch the balance
- remove yourself (you cannot — leaving is FL-26)
- add a person whose name matches one already there

**If it went wrong** Undo toast on remove; otherwise add them again. —

---

## Splitting and settling · groups and people (2/2)

_Groups, the people in them, who owes whom, and paying each other back. Balances are never stored — they are recomputed from payments and shares every time you look._

`changes things` · about 26 min · 0/2 walked

### Leave, archive or delete a group  `FL-26`

**Why** "This is over" — and which of the three you mean matters.

**You need** demo — Old Flat is already archived; Weekend Plans is empty and safe to delete.

**Start from**
1. SC-13 Archive
2. SC-13 Leave
3. SC-13 Delete

**Do this**
1. open the group
2. ⋯ → Edit
3. pick one
4. confirm

**Should happen** **Three genuinely different things** (OV-11): archive → `is_archived`, still yours, fully reversible leave → announce the exit, **then** stop syncing. The other order leaves nothing able to publish the departure delete → creator only, and a **tombstone, not a wipe**: `deleted_at` + `is_archived` are set and **every entry survives** All three `dismissTo` SC-04.

**Check the numbers**
- **archiving changes no figure at all** — the group's past spending still counts toward your months, because it happened
- **deleting changes no figure either.** It used to hard-delete every transaction, which silently rewrote months you had already closed and made decisions on
- leaving stops future entries reaching you; your history stays

**Watch out for**
1. a creator trying to leave → refused, told to delete instead
2. leaving with an unsettled balance → allowed, and it says so

**Also try**
- archive Old Flat's sibling and check Home's totals do not move
- delete Weekend Plans (it is empty on purpose) and confirm your month total is unchanged
- try to leave a group you created

**If it went wrong** Archive yes. Leave and delete, no. OV-11 — three end states, and the UI words for them are not distinct enough. Two other documents still describe delete as destroying data.

### Merge two people  `FL-52`

**Why** "There are two Aaravs."

**You need** demo, plus creating a duplicate person by hand first.

**Start from**
1. the merge alert, from the tab bar's sync chain

**Do this**
1. create a second "Aarav" in People
2. give them an expense
3. the merge prompt appears
4. pick which survives
5. confirm

**Should happen** Every reference across **eight tables** is moved, then the loser is deleted. This is the real answer to "delete a person" — a plain delete is refused for anyone referenced anywhere. Stays.

**Check the numbers**
- **the merged person's balance must equal the sum of the two**
- no expense may be lost, and no total may change

**Watch out for**
1. a reference the merge misses would be a dangling id, and foreign keys are off, so nothing else would catch it (DQ-19)

**Also try**
- make a duplicate, split an expense with each, merge, and **check the balance is the sum**
- check the group member list shows one of them afterwards, not two

**If it went wrong** **No.** DQ-19.

---

## Splitting and settling · settling up (1/4)

_Groups, the people in them, who owes whom, and paying each other back. Balances are never stored — they are recomputed from payments and shares every time you look._

`changes things` · about 18 min · 0/1 walked

### Settle up  `FL-06`

**Why** "We're square" / "I paid them back".

**You need** demo — Aarav and Priya part-settled in Roommates, Office Lunch is fully settled, Family is one you owe. **Goa has simplify OFF**, so every debt there stays separate.

**Start from**
1. Home balance strip
2. Groups friends strip
3. group balance card
4. group members pair
5. members screen
6. person detail
7. friends list
8. reminders "Settle now" All eight land on SC-07 with kind=transfer and varying params — which is why a missing groupId here is a real bug class (OV-08).

**Do this**
1. pick the person
2. pick the scope: this group, or all groups
3. amount (defaults to the full net)
4. direction
5. method: cash, or hand off to UPI (FL-20)
6. confirm

**Should happen** One settlement row per group the plan touches — so settling one global figure can write three rows, none of them the figure shown. Back to the caller. The balance recomputes; nothing is cached.

**Check the numbers**
- **your month spending must NOT change.** Settling is not spending — the purchase already counted (IV-06)
- **Reports must not change either**
- cash drops by exactly what you handed over
- the balance with that person goes to zero, or to the remainder

**Watch out for**
1. they settle simultaneously → two settlements, balance overshoots
2. the counterparty has no remote_uid → nothing reaches them
3. an entry awaiting approval is inside the amount being settled
4. Android: useUpiApps returns null, the whole hand-off is unreachable

**Also try**
- **settle half** and check the remainder is right
- **settle more than you owe** and watch the direction flip
- Office Lunch is already at zero — check it says so rather than offering you a settle-up of ₹0
- you share more than one group with Rohan: settle "all groups" and then check **which group each row landed in**. There is a real open question here, and it is the best find in this document

**If it went wrong** Soft-delete the settlement, which reopens the debt. OV-02 (kind=settlement means four things) · DQ-13 · DQ-11 (Android)

---

## Splitting and settling · settling up (2/4)

_Groups, the people in them, who owes whom, and paying each other back. Balances are never stored — they are recomputed from payments and shares every time you look._

`changes things` · about 30 min · 0/2 walked

### Scan & Pay  `FL-19`

**Why** A QR code on a counter.

**You need** any, with a real UPI QR to point at. **The only way in is a 350 ms long-press on the FAB** — worth checking you can find it.

**Start from**
1. tab-bar FAB **long-press**, 350 ms — a hidden gesture taught once by a coach mark, and the only way in

**Do this**
1. long-press
2. scan any UPI or EMV QR
3. confirm the payee
4. hand off to a UPI app
5. return
6. "did that go through?"
7. record it

**Should happen** The hand-off writes only E-84. The confirmation writes a pending row. Back to wherever the FAB was pressed.

**Check the numbers**
- **nothing is written when you hand off.** The app cannot know whether the payment succeeded — only you can
- confirming afterwards writes a pending row, not a transaction, so it still goes through Review
- declining the confirmation must leave no trace at all

**Watch out for**
1. UPI gives no reliable callback — **only the human knows**, which is the entire reason E-84 exists
2. a tampered QR: the code's `pn` is written by whoever made it, so the VPA leads and the name is labelled unverified (IV-19)

**Also try**
- **long-press the FAB and see whether the gesture is discoverable** without being told
- scan a QR, come back **without paying**, and decline — check nothing was recorded
- check the sheet leads with the **VPA**, not the name printed in the code. A code's name is written by whoever made the code, and over 70% of Indian UPI fraud in 2025 was exactly this (IV-19)

**If it went wrong** Nothing is written until confirmed. Over 70% of Indian digital-payment fraud in 2025 was QR tampering or collect-request manipulation. IV-18 and IV-19 are the defences and they are enforced by review only.

### Hand off to UPI to settle  `FL-20`

**Why** "Pay them now, from my UPI app."

**You need** demo, on a real device with a UPI app installed. **iOS — on Android this silently does nothing.**

**Start from**
1. SC-07 Transfer → "Pay ₹X via UPI" (flag: upiSettle)

**Do this**
1. pick the app
2. an intent is built
3. hand off
4. return
5. confirm
6. the settlement is written

**Should happen** Straight to the ledger on confirmation — **not** to the review inbox, which is the one difference from FL-19's sibling path. Back to the caller.

**Check the numbers**
- the amount handed to the UPI app must match the balance shown
- confirming writes the settlement **straight to the ledger**, not to Review — the one difference from Scan & Pay
- then the same checks as settling: spending unchanged, cash down

**Watch out for**
1. the app returns without confirming anything
2. **Android: useUpiApps returns null**, so the entire per-app payload table is unreachable, not merely dead (DQ-11)

**Also try**
- hand off, come back **without paying**, and decline the prompt
- check which apps are offered — PhonePe, Paytm, Amazon Pay and WhatsApp all refuse this hand-off, and that is closed on our side
- if you have an Android device, try it there and watch nothing happen at all. That is a known untested hole, not a surprise

**If it went wrong** Soft-delete the settlement. OV-02 · OV-21 (E-84 and E-85 are near-identical siblings)

---

## Splitting and settling · settling up (3/4)

_Groups, the people in them, who owes whom, and paying each other back. Balances are never stored — they are recomputed from payments and shares every time you look._

`changes things` · about 25 min · 0/2 walked

### Request money by QR  `FL-21`

**Why** "Pay me back" — without asking them to type your handle.

**You need** demo — you need your own UPI id set first (Settings → Getting paid).

**Start from**
1. SC-07 Transfer → "Show QR to get ₹X" (flag: upiSettle)

**Do this**
1. open Transfer
2. pick the person and amount
3. tap Show QR
4. they scan it with their own UPI app
5. they pay
6. you record the settlement yourself (FL-06)

**Should happen** **Nothing.** The QR is a picture. The money moving and the ledger recording it are two separate events, and only you can join them. Closes the sheet, back to Add.

**Check the numbers**
- no figure moves at this step — not your balance, not your cash
- the balance only moves when you record the settlement afterwards

**Watch out for**
1. no VPA set → the button is absent, with no explanation
2. they pay and you forget to record it → the balance stays wrong, and nothing in the app knows

**Also try**
- scan your own QR with a UPI app and check the amount is prefilled
- request ₹0, and a negative amount
- check it is a **push** QR: your app must never send them a collect request — NPCI banned P2P collect outright from 1 Oct 2025 (IV-18)

**If it went wrong** Nothing to reverse. The gap between paying and recording is unguarded, by design — see FL-19's E-84 for the version that does prompt you.

### Write off a receivable  `FL-46`

**Why** "Sneha is never paying me back, and I am done tracking it."

**You need** demo — several people owe you across Goa and Manali.

**Start from**
1. SC-26a

**Do this**
1. open the person
2. write it off
3. confirm

**Should happen** **The only stored fact about a debt in the entire app.** Everything else about a balance is computed on the spot (E-50). Stays.

**Check the numbers**
- the amount leaves your "owed to you" total on Home
- **no transaction is deleted** — the group ledger is unchanged, and opening the group still shows every expense
- your past spending does not change: your share was always yours

**Watch out for**
1. writing off, then them paying anyway

**Also try**
- **write one off, then open the group and confirm every expense is still there.** This is the difference between forgiving a debt and deleting history
- check Home's owed total dropped by exactly that amount
- undo it and check the figure comes back

**If it went wrong** Yes, by setting it back to expected. —

---

## Splitting and settling · settling up (4/4)

_Groups, the people in them, who owes whom, and paying each other back. Balances are never stored — they are recomputed from payments and shares every time you look._

`changes things` · about 12 min · 0/1 walked

### WhatsApp reminder  `FL-47`

**Why** "Nudge Rohan about the Goa money."

**You need** demo — Rohan owes you in Goa Trip.

**Start from**
1. SC-26a

**Do this**
1. open the person
2. tap the reminder
3. WhatsApp opens with a drafted message
4. **you** send it, or do not

**Should happen** Nothing. Ever. Leaves the app.

**Check the numbers**
- the amount in the draft must match the balance on screen
- nothing changes in the app whether you send it or not

**Watch out for**
1. the draft naming the wrong scope — the global net rather than this group's, or the other way round

**Also try**
- **check the drafted amount against the balance the screen shows**
- back out without sending and confirm nothing was recorded
- try it for someone you owe, rather than someone who owes you

**If it went wrong** Nothing written. The app drafts; it never sends. That is deliberate — it is not a debt collector.

---

## Budgets and insight · the screens

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 26 min · 0/7 walked

### /  `SC-03`

**Open** `/` — 2 ways in

**What it is for** Home: period hero, health ring, category ranks, forecast, streak, owe/owed strip

**The pieces on it**
- `BalanceStrip`
- `ForecastCard`
- `ForecastCard`
- `HealthSheet`
- `HeroCard`
- `StreakCard`
- `StsSheet`
- `StsStrip`

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Tabs `Today · Month · Year`

### /budget  `SC-10`

**Open** `/budget` — 5 ways in

**What it is for** **My Budget**, global. Takes no group id, deliberately

**The pieces on it**
- `BudgetAmountRow`
- `BudgetEditor`
- `OwnBudgetSheet`

**Popups it can raise** (1)
- "Couldn't save"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** 22-line wrapper over `BudgetEditor`

### /group/[id]/budget  `SC-10b`

**Open** `/group/[id]/budget` — one way in

**What it is for** A group's default + your override

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Forwards to `SC-10` for the personal group

### /reports  `SC-20`

**Open** `/reports` — 2 ways in

**What it is for** Factual monthly history, CSV + PDF

**The pieces on it**
- `BudgetBar`
- `CategoryDonut`
- `CategoryRankList`
- `TrendBars`

**Popups it can raise** (2)
- "Export failed"
- "Saved"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Cannot advance past the current month

### /report-transactions  `SC-21`

**Open** `/report-transactions` — one way in

**What it is for** Month-scoped drill-down

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Tabs `All · Expenses · Income · Transfers`

### /insights  `SC-22`

**Open** `/insights` — 3 ways in

**What it is for** The single narrative home

**The pieces on it**
- `InsightText`
- `SampleNote`

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /afford  `SC-33`

**Open** `/afford` — one way in

**What it is for** Can I afford this

**The pieces on it**
- `CategoryChip`

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Sole entry is an unlabeled icon. `OV-16`

---

## Budgets and insight · setting them (1/3)

_What you meant to spend, what you actually spent, and what the month is going to look like. Every figure here is your share of a bill, never the whole bill._

`changes things` · about 28 min · 0/2 walked

### View the dashboard  `FL-07`

**Why** Opening the app.

**You need** demo — seeded so every card has something to show.

**Start from**
1. the (tabs) default route

**Do this**
1. pick a period: Today · Month · Year
2. read
3. tap through

**Should happen** None. Stays. Tapping through goes to SC-22, SC-16, SC-07, SC-40, SC-19, SC-23, SC-30, SC-06, SC-28, SC-27a, SC-10, SC-04, SC-26.

**Check the numbers**
- **the hero total must equal the sum of the category rows below it**
- the month-end projection here must be the **same number** Insights shows. Two screens, one figure
- owe and owed are **two figures, never netted into one** — ₹5,000 out and ₹5,000 in is not zero
- switching Today / Month / Year changes the window, not the maths

**Watch out for**
1. three red surfaces can stack on one open — deliberately not de-duplicated, because whether that is too many is a question only real users settle (DQ-12)

**Also try**
- **add the category rows up and check they equal the hero**
- check the health ring refuses to score when there is too little data, rather than showing a misleading zero
- look for three red things at once — whether that is too many is a live open question, and your opinion is the answer

**If it went wrong** n/a — read-only. OV-14 (E-50 recomputed per render)

### Set and track a budget  `FL-09`

**Why** "I want to spend less on X."

**You need** demo — Groceries is **over** (₹9,000 of ₹8,000), Eating Out is **near** (₹2,700 of ₹3,000), Fuel is **under**. Daily and yearly cadences are both set, so every bar state exists already.

**Start from**
1. SC-06
2. Home get-started tile
3. SC-14
4. SC-22
5. SC-16
6. SC-10b's redirect for the personal group

**Do this**
1. choose the level
2. pick categories
3. set amounts
4. pick a cadence
5. save

**Should happen** One category_budget row per line, at one of two levels. router.back().

**Check the numbers**
- a budget is measured against **your share**, never the whole bill (IV-08). The Roommates groceries were ₹4,500 and ₹1,500 is yours
- the bar colour must match the arithmetic: over red, near amber, under green
- a **blank** override means "keep following the group", not zero — this is the one most likely to be wrong
- a daily line and a monthly line are the same money at different rates; the yearly one only counts on the Year view

**Watch out for**
1. a category renamed after a budget is set — the reference is a name, so the rename rewrites it (OV-06)
2. a budget set on a category later deleted becomes unreachable

**Also try**
- **check Groceries reads ₹9,000 of ₹8,000** and the bar is red
- set a group default, then override one category for yourself and leave another blank — confirm the blank one still follows
- rename a category that has a budget and check the budget follows
- set a budget, then delete the category, and see what happens

**If it went wrong** Clear the amount. OV-07 (three concepts, two levels, plus two dead and one stray) OV-19 (period vs cadence) · the path from Home is 3 hops, from a group up to 5 with a mid-flight redirect

---

## Budgets and insight · setting them (2/3)

_What you meant to spend, what you actually spent, and what the month is going to look like. Every figure here is your share of a bill, never the whole bill._

`changes things` · about 25 min · 0/2 walked

### Rebalance a budget  `FL-38`

**Why** "I am over on groceries and there are two weeks left."

**You need** demo — Groceries over, Fuel well under. A donor exists.

**Start from**
1. SC-03's over-budget state
2. SC-09 Budget tab

**Do this**
1. tap the over-budget prompt
2. read which lines would give
3. accept, or adjust
4. save

**Should happen** New amounts on the budget lines. Nothing about your spending changes. Back where you came from.

**Check the numbers**
- **the total across all lines should stay the same** — this moves an allowance, it does not create one
- the over line's bar should go from red toward amber or green
- the donor line's headroom shrinks by exactly what it gave

**Watch out for**
1. every line already over

**Also try**
- rebalance, then add the totals by hand and check they match
- try it when Fuel is the only line with room

**If it went wrong** Edit the amounts back. —

### Afford check  `FL-39`

**Why** "Can I buy this?"

**You need** demo — realistic cash, bills and goals make the answer meaningful.

**Start from**
1. SC-33
2. SC-07's inline BudgetNudge, same engine

**Do this**
1. open Plan → the "Can I afford?" icon
2. amount
3. optionally a category
4. optionally Need / Want / Can wait
5. read the verdict and the reasons

**Should happen** **Nothing.** It is a question, not an action. Stays, or "Log it" hands you to Add with the amount prefilled.

**Check the numbers**
- seven axes: cash, buffer, category budget, category norm, income share, month projection, basket size
- **only cash produces a hard No.** Everything else can make it Tight, never impossible
- marking something a Need softens the **buffer axis alone** and must never override the cash answer

**Watch out for**
1. nobody finds this screen — its only route in is an unlabeled icon, and the flag file says so out loud (OV-16)

**Also try**
- ask about ₹500, then ₹50,000, then ₹5,00,000 and watch the verdict and the reasons change
- ask about ₹3,000 of Groceries — already over budget — and check the category axis fires
- mark a large amount as a Need and confirm it does **not** flip a cash No into a yes

**If it went wrong** Nothing written. OV-16.

---

## Budgets and insight · setting them (3/3)

_What you meant to spend, what you actually spent, and what the month is going to look like. Every figure here is your share of a bill, never the whole bill._

`changes things` · about 24 min · 0/2 walked

### Reports and export  `FL-42`

**Why** "What did last month look like?"

**You need** demo — three months of history, so the trend has three points.

**Start from**
1. SC-06
2. SC-05's rail .X1 the backup-nudge notification

**Do this**
1. open Reports
2. pick a month
3. read the donut and trend
4. tap a slice to drill in
5. export CSV or PDF

**Should happen** Nothing, until you export — and that goes to the share sheet. A slice opens the drill-down; a row opens the entry.

**Check the numbers**
- **settlements are excluded here** (IV-06). Demo has settlements in Roommates and Office Lunch; none of them may appear in the donut
- every figure is **your share**, not the bill (IV-08). The Goa hotel was ₹40,000 and ₹10,000 of it is yours
- the donut's slices must sum to the month total shown above it
- the month selector **cannot advance past this month**

**Watch out for**
1. a month with no data
2. export cancelled at the share sheet

**Also try**
- **add the donut slices by hand and check they equal the total**
- compare this month with last: demo puts Eating Out at ₹2,700 against ₹1,500, an ~80% jump the insights should notice
- try to move the month selector into the future

**If it went wrong** Nothing written. —

### Insights  `FL-43`

**Why** "Tell me something I do not already know."

**You need** demo — deliberately seeded so every section has something to say.

**Start from**
1. SC-05's rail
2. SC-03's pace tap
3. SC-03's forecast card

**Do this**
1. open Insights
2. read the headline
3. expand each section

**Should happen** Nothing. Sections link to Add, Budget and category detail.

**Check the numbers**
- the headline's spend-vs-budget figure must match Home's
- the month-end projection must match Home's forecast card — **two screens, one number, and they must agree**
- "changed vs last month" should surface Eating Out, which demo moved from ₹1,500 to ₹2,700

**Watch out for**
1. too little data → sections should self-hide, not show zeroes

**Also try**
- **open Insights and Home side by side and check the projection is the same number on both**
- check no section shows a settlement as spending
- look for a section with nothing to say and confirm it is hidden rather than empty

**If it went wrong** Nothing written. —

---

## Savings and assets · the screens

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 15 min · 0/3 walked

### /savings  `SC-05`

**Open** `/savings` — 2 ways in

**What it is for** **Plan** — total money, assets, goals, upcoming

**The pieces on it**
- `ComingUpList`
- `GoalCard`
- `MoneyEditorSheet`
- `MoveToInvestmentsSheet`
- `PayCardBillSheet`
- `TotalMoneyCard`

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Four flag-gated header icons

### /savings/[id]  `SC-17`

**Open** `/savings/[id]` — 3 ways in

**What it is for** One goal

**The pieces on it**
- `GoalCelebration`
- `LockExplainerSheet`

**Popups it can raise** (3)
- "Delete goal?"
- "More than that bucket holds"
- "Something went wrong"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /assets  `SC-42`

**Open** `/assets` — 3 ways in

**What it is for** The asset register

**The pieces on it**
- `AssetSheet`

**Popups it can raise** (4)
- "Couldn’t do that"
- "Delete ${asset.name}?"
- "Keep this one"
- "Stop counting ${asset.name}?"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** **New ID.** Undocumented until now

---

## Savings and assets · money and assets (1/2)

_Money set aside and things you own. Buying gold or funding an SIP is a transfer, not an expense: the cash moved, nothing was consumed, and net worth must not change._

`changes things` · about 29 min · 0/2 walked

### Buy or sell an asset  `FL-33`

**Why** "I bought gold" / "I put ₹20,000 into the index fund."

**You need** demo — index funds ₹95,000, gold ₹40,000, an FD ₹15,000.

**Start from**
1. SC-42
2. SC-05 TotalMoneyCard
3. SC-07's transfer banner

**Do this**
1. open Assets
2. pick one, or add
3. put in, or take out
4. amount
5. confirm

**Should happen** **Both halves in ONE transaction** (IV-03). A half-written one drops net worth by the amount invested and leaves a ledger row that looks entirely correct — the worst kind of wrong. Back to Assets.

**Check the numbers**
- **net worth must not change.** Cash goes down ₹20,000, the asset goes up ₹20,000, and the total on Plan is the same number
- **your month spending must not change either** — buying an asset is not consuming anything (IV-06)
- taking money out is **not income**: you already owned it, it only changed shape

**Watch out for**
1. deleting an asset with history is refused — archive instead
2. a negative balance is not allowed

**Also try**
- **write down Plan's net worth, buy ₹10,000 of gold, check it is the same number.** This is the whole point of the asset register
- check the ledger row appears in Personal but **not** in Reports
- archive the FD and watch net worth drop by exactly ₹15,000

**If it went wrong** Take the money back out. Archiving is reversible. OV-02 — this writes `kind='settlement'`, the same value a debt settle-up uses, so the settle-up suggester can offer to "settle" it. Shipped 2026-09-01, never run on a device.

### Pay the card bill  `FL-34`

**Why** "The card bill is due."

**You need** demo — ₹10,000 used of a ₹60,000 limit.

**Start from**
1. SC-05 → PayCardBill

**Do this**
1. open Plan
2. tap the credit line
3. amount
4. confirm

**Should happen** A settlement carrying `pay_method='card'` — the second of the four meanings that value has (OV-02). Back to Plan.

**Check the numbers**
- credit used goes **down** by what you paid
- cash goes **down** by the same amount
- **net worth does not change** — you moved a debt, not spent
- your month spending does not change either

**Watch out for**
1. paying with money you do not have

**Also try**
- pay ₹4,000 and check credit available rises to ₹54,000
- check Reports does not move
- pay the full ₹10,000 and see what the card row looks like at zero

**If it went wrong** Delete the settlement row. OV-02.

---

## Savings and assets · money and assets (2/2)

_Money set aside and things you own. Buying gold or funding an SIP is a transfer, not an expense: the cash moved, nothing was consumed, and net worth must not change._

`changes things` · about 27 min · 0/2 walked

### Move money to investments  `FL-35`

**Why** "Move ₹5,000 from cash into the index fund."

**You need** demo — three assets already exist.

**Start from**
1. SC-05 → MoveToInvestments

**Do this**
1. open Plan
2. tap investments
3. pick the asset
4. amount
5. confirm

**Should happen** As FL-33 — both halves, one transaction. Back to Plan.

**Check the numbers**
- `money.investments` is **derived from live assets and nothing writes it** (IV-14). If you ever see it change without an asset changing, that is a bug
- net worth unchanged; cash down; the asset up

**Watch out for**
1. no asset yet → you are sent to create one first

**Also try**
- move money in, then check the Assets screen shows the new balance
- confirm the investments figure equals the sum of live assets

**If it went wrong** Move it back. OV-20 — five near-identical spellings of "investment" across the app.

### Set the money profile  `FL-45`

**Why** "The app does not know how much I actually have."

**You need** demo — bank ₹2,10,000 · cash ₹45,000 · wallet ₹45,000 · ₹10,000 used of ₹60,000 credit.

**Start from**
1. SC-05 MoneyEditorSheet
2. onboarding

**Do this**
1. open Plan
2. tap the money card
3. set the three buckets
4. set the credit limit and what is used
5. save

**Should happen** Opening balances only. Every later figure is those plus the ledger. Closes the sheet; Plan reloads.

**Check the numbers**
- **investments is not editable here, deliberately** — it is derived from live assets and nothing writes it (IV-14). If you find a way to type into it, that is a bug
- changing the opening bank balance should move total money by exactly that difference, and nothing else
- cash available = the three buckets ± every transaction you paid for

**Watch out for**
1. negative values
2. credit used above the limit

**Also try**
- **note total money, add ₹1,000 to the wallet opening, check the total rose by exactly ₹1,000**
- look for any field that lets you type an investments figure
- set credit used above the limit and see what happens

**If it went wrong** Edit again. DQ-14 — buckets are not named accounts, and never will be until that is decided.

---

## Savings and assets · goals (1/2)

_Money set aside and things you own. Buying gold or funding an SIP is a transfer, not an expense: the cash moved, nothing was consumed, and net worth must not change._

`changes things` · about 18 min · 0/1 walked

### Fund a savings goal  `FL-10`

**Why** "I want to put money aside."

**You need** demo — eight goals covering every state: **Weekend Getaway sits at 97.5%, so ₹500 finishes it and fires the celebration.** Emergency Fund is locked, Tax Payment's deadline has passed, New Phone is 0%, Anniversary Gift is 120% overfunded.

**Start from**
1. SC-05 goal card
2. SC-17
3. SC-16 related goals

**Do this**
1. open the goal
2. amount
3. source bucket
4. confirm

**Should happen** A savings_txn row. The goal's saved total is derived from them. Stays on SC-17.

**Check the numbers**
- **funding a goal does not change net worth** — the money moved from cash into a goal, and both are yours
- **it is not spending either.** Your month total must not move
- the goal's ring and its rupee figure must agree
- funding order is drag rank **within** a priority tag, not the tag alone — the two are easy to confuse

**Watch out for**
1. funding more than you hold → refused against E-54
2. the source bucket round trip is only partly built (DQ-15)

**Also try**
- **add ₹500 to Weekend Getaway and watch the celebration fire**
- try to fund more than you hold
- withdraw from Europe Vacation and check the history shows both the deposits and the withdrawal, netting to ₹3,000
- look at Anniversary Gift at 120% — an overfunded goal is allowed
- look at Tax Payment, whose deadline is already past

**If it went wrong** Withdraw, which writes the opposite row. Raids have explicit undo. priority vs sort_order is a standing confusion: priority protects from a raid, drag rank decides funding order. Two orderings, one word.

---

## Savings and assets · goals (2/2)

_Money set aside and things you own. Buying gold or funding an SIP is a transfer, not an expense: the cash moved, nothing was consumed, and net worth must not change._

`changes things` · about 26 min · 0/2 walked

### Overspend raid  `FL-36`

**Why** You are over for the month and something has to give.

**You need** demo — Groceries is ₹9,000 against ₹8,000, so the prompt is live.

**Start from**
1. SC-05, offered when you are over

**Do this**
1. open Plan
2. read the proposal — which goals, how much
3. accept, or decline
4. undo if you change your mind

**Should happen** Withdrawals from goals, in raid order. **It asks first** — this moves real money. Stays on Plan.

**Check the numbers**
- the goals named lose exactly what the proposal said
- **`emergency`-tagged and locked goals are never touched** — demo's Emergency Fund is both, so it must be absent from every proposal
- `want` goals are raided before `need` ones
- the raid **nets what friends owe you first**, which safe-to-spend deliberately does not — a receivable is not spendable, but it *is* a reason not to break open savings. Do not expect the two figures to agree; they answer different questions

**Watch out for**
1. not enough in unlocked goals to cover the overspend

**Also try**
- check New Phone (0% funded, `want`, last in rank) is proposed first
- check Emergency Fund is never proposed
- accept, then undo, then verify all eight goals are back to where they were

**If it went wrong** **Explicit undo**, and it must restore every goal exactly. —

### Surplus sweep  `FL-37`

**Why** Nothing. It runs itself, if you turned it on.

**You need** demo, **plus** turning on `auto_sweep_enabled` in Settings → Features.

**Start from**
1. .X1 launch maintenance

**Do this**
1. turn it on
2. restart the app
3. look at your goals

**Should happen** Deposits into goals, in funding order, from what is left over. Nothing visible. You find out by looking.

**Check the numbers**
- money leaves cash and appears in goals — net worth unchanged
- funding order is drag rank within a priority tag, not the tag alone

**Watch out for**
1. it runs while you are mid-edit somewhere else
2. you do not notice it ran

**Also try**
- turn it on, note your cash, restart, and see if anything moved
- turn it off again — this is the one switch that spends money without asking, and it is worth knowing where it is

**If it went wrong** Withdraw from the goal. DQ-15 — where the money came from is only approximately tracked.

---

## Recurring and reminders · the screens

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 13 min · 0/4 walked

### /reminders  `SC-30`

**Open** `/reminders` — one way in

**The pieces on it**
- `MemberAvatar`

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Read-only "what's coming"

### /settings/notifications  `SC-31`

**Open** `/settings/notifications` — 2 ways in

**Popups it can raise** (2)
- "Couldn’t send the test"
- "Notifications are off"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /plan/recurring  `SC-32`

**Open** `/plan/recurring` — 2 ways in

**What it is for** Every active rule, by next occurrence

**Popups it can raise** (4)
- "No skips to undo"
- "Nothing to skip"
- "Something went wrong"
- "Stop this recurring transaction?"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** No per-row actions — it taps through

### /recurring/[id]  `SC-41`

**Open** `/recurring/[id]` — 5 ways in

**What it is for** **One** rule, with all the actions

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Replaced `group/[id]/recurring`

---

## Recurring and reminders · rules and reminders (1/2)

_Things that happen every month, and being told about them. A recurring rule lives in the same table as a transaction — it is a row that has never happened, and every money query has to exclude it._

`changes things` · about 29 min · 0/2 walked

### Create a recurring rule  `FL-15`

**Why** "This happens every month."

**You need** demo — Netflix, Spotify, rent, a weekly clean and a 90-day custom interval already exist. **Prime Video repeats un-ruled**, waiting to be detected.

**Start from**
1. SC-07 Repeat chip
2. FE-24's suggestion after a Review commit

**Do this**
1. the ordinary Add fields
2. frequency
3. interval
4. end: never / date / count
5. mode: auto or remind
6. save

**Should happen** One txn row that is a rule. It must never count as spending; every money statement carries `recur_freq IS NULL` (IV-04). Dismisses.

**Check the numbers**
- **a rule is not a transaction.** Creating one must move **no** figure — not Home, not the budget, not Reports (IV-04)
- it appears under "coming up", which is a forecast, not a total
- only when an occurrence actually fires does anything count

**Watch out for**
1. an end date before the start date
2. a rule created in a group you then leave

**Also try**
- **create a rule and check Home's month total does not move**
- set it to a past start date and see whether occurrences appear
- set an end date before the start date
- create one in a shared group and check whose share it counts as

**If it went wrong** Pause, end, or delete — FL-16. OV-03 — a rule and a transaction are the same table, which is the single most load-bearing piece of knowledge in this document.

### Manage a rule  `FL-16`

**Why** "Skip this month" / "cancel it" / "pause it".

**You need** demo — **Gym is paused, the old prepaid plan is ended**, and three rules fall due within three days.

**Start from**
1. SC-32
2. SC-09 Recurring tab
3. SC-16
4. SC-15 (parent link)
5. the renew_* notification

**Do this**
1. open SC-41
2. pick an action
3. confirm

**Should happen** A skip writes one recur_skip row; pause/resume/end update the rule. Stays, or `replace`s to SC-32 after a delete.

**Check the numbers**
- pausing stops future occurrences and **changes no past figure**
- a skipped occurrence removes exactly one, and the monthly-equivalent total should drop for that month only
- ending is not deleting: what it already logged stays

**Watch out for**
1. a skip is local and does not travel — two devices can disagree about one occurrence

**Also try**
- **find the paused Gym rule and the ended prepaid one** and check they look different from active ones, and from each other
- skip the next occurrence of the weekly newspaper, then undo it
- check the same rule looks the same in all three places that list recurring things — Plan, the group tab, and Home's "coming up"

**If it went wrong** Skips undo. Pause resumes. Stop is an end state. Three renderings of overlapping recurring data — SC-32, the group's Recurring tab, and Home's "coming up". Two earlier ones were already deleted for this reason.

---

## Recurring and reminders · rules and reminders (2/2)

_Things that happen every month, and being told about them. A recurring rule lives in the same table as a transaction — it is a row that has never happened, and every money query has to exclude it._

`changes things` · about 15 min · 0/1 walked

### Reminders  `FL-44`

**Why** "Tell me before the rent goes out."

**You need** demo — three rules fall due within 3 days, so there is something to be reminded about. **Needs a dev build for real notifications.**

**Start from**
1. SC-06 → SC-31
2. SC-30, which is read-only

**Do this**
1. open Notifications
2. turn on renewals, daily log, backup
3. grant the OS permission
4. send a test
5. tap the test

**Should happen** Preferences here; the OS holds the actual schedule, and it is **regenerated at every cold start** because the two can drift. Stays. A tapped notification routes: a renewal opens the rule, the daily nudge opens Add, the backup nudge opens Reports.

**Check the numbers**
- nothing financial moves
- SC-30 should list the same bills as Plan's "upcoming", and the same ones Home shows under "coming up" — three surfaces, one set

**Watch out for**
1. **jest cannot prove any of this.** It is device-only
2. the OS schedule drifting from the rules that made it

**Also try**
- send a test, background the app, and tap the notification — check it lands on the right screen and not just Home
- compare SC-30's list against Plan's upcoming section
- deny the permission and see what the screen says

**If it went wrong** Turn them off. Needs a dev build. DQ-80 gates real push entirely.

---

## Importing and review · the screens

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 21 min · 0/2 walked

### /import  `SC-18`

**Open** `/import` — 2 ways in

**What it is for** File or paste → parse → `E-17`

**The pieces on it**
- `DataRefreshProvider`
- `PdfTextExtractor`

**Popups it can raise** (4)
- "Could not read that file"
- "No transactions found in that PDF"
- "No transactions in that file"
- "PDF read failed"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** `replace`s to `SC-19` on success

### /review  `SC-19`

**Open** `/review` — 2 ways in

**What it is for** The staging inbox

**The pieces on it**
- `BulkActionsSheet`
- `BulkGroupSheet`
- `CounterpartySheet`
- `DestOption`
- `FChip`
- `FilterForm`
- `RecurringSuggestionBanner`
- `RecurringSuggestionsSheet`
- `ReviewBulkSheets`
- `ReviewDestSheet`
- `ReviewList`
- `ReviewListHeader`
- `ReviewOverflowSheet`
- `ReviewRowCard`
- `ReviewRowSheets`
- `ReviewSourceTabs`
- `SaveViewForm`
- `SavedViewsSheet`

**Popups it can raise** (8)
- "Apply to similar?"
- "Assign group?"
- "Category set"
- "Clear all reviews?"
- "Could not undo"
- "Kind changed"
- "Nothing ready to save"
- "Payment method set"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Largest screen; 12 sheet states. `OV-24`

---

## Importing and review · inbox and export (1/2)

_Statements, exports and pasted alerts, parsed into a staging inbox you edit in place before anything reaches the ledger. Nothing commits until you say so._

`changes things` · about 17 min · 0/1 walked

### Import a statement → Review → commit  `FL-08`

**Why** "I have a statement / a Paytm export / a pile of alerts."

**You need** demo — **9 rows are already waiting** in Review: 6 from Google Pay, 3 from email alerts, some pre-categorised and some not.

**Start from**
1. SC-06 → SC-18
2. SC-19's empty state → SC-18

**Do this**
1. pick a file or paste
2. format auto-detected
3. parsed rows land in E-17
4. replace() to SC-19
5. edit in place, per row
6. bulk-apply where wanted
7. commit

**Should happen** Parsing writes pending rows. The commit is ONE transaction per batch: it lands or it does not (IV-03). SC-18 `replace`s to SC-19, so Back does not return to the picker.

**Check the numbers**
- **nothing in the inbox counts anywhere until you commit.** Note Home's total before and after opening Review — it must not move
- after committing all 9, your month total rises by exactly their sum, and the badge goes away
- a row you route into a group and split counts only your share

**Watch out for**
1. format not recognised → the raw text is kept, nothing is lost
2. a row's destination group is deleted → dest_group_id, split_draft and counterparty are reset so the row stays committable
3. duplicates against existing txns are flagged, not blocked

**Also try**
- open Review and **check Home's badge count matches the row count**
- edit a row's category in place, leave, come back — the draft should still be there
- commit one row, then re-import the same file and check the duplicate warning fires
- discard everything and confirm no transaction was created

**If it went wrong** Undo per commit. Discard per row. Clear all. OV-24 (12 sheet states) · OV-21 · FE-48 has never been device-tested

---

## Importing and review · inbox and export (2/2)

_Statements, exports and pasted alerts, parsed into a staging inbox you edit in place before anything reaches the ledger. Nothing commits until you say so._

`changes things` · about 16 min · 0/1 walked

### CSV export and re-import  `FL-48`

**Why** "Get my data out" / "put it back."

**You need** demo — plenty to export.

**Start from**
1. SC-14
2. SC-20
3. SC-06 → Export all data

**Do this**
1. export
2. the share sheet opens
3. save the file
4. Settings → Import
5. pick the same file
6. review
7. commit

**Should happen** Export writes nothing. Re-import goes through the Review inbox, so nothing lands unseen. Export leaves to the share sheet; import lands on Review.

**Check the numbers**
- **round-trip test:** export, re-import, commit, and your month total should be **exactly doubled** — every row is now there twice
- which also means the duplicate warning should fire on all of them

**Watch out for**
1. demo rows are filtered by hardcoded signatures that can fall out of step with `seedDemo.ts` — a known drift risk
2. a file edited in a spreadsheet and re-saved

**Also try**
- **export and re-import without committing** — check the duplicate warning fires on every row
- open the CSV in a spreadsheet and check the amounts are readable rupees, not paise
- export a single group rather than everything

**If it went wrong** Discard on the Review screen before committing. The demo-row filter and `seedDemo.ts` are edited independently.

---

## Accounts, sync and backup · the screens (1/2)

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 29 min · 0/7 walked

### /settings/backup  `SC-34`

**Open** `/settings/backup` — 3 ways in

**The pieces on it**
- `PassphraseSheet`
- `ServerBackupSheet`

**Popups it can raise** (14)
- "Backed up to your account"
- "Backup failed"
- "Could not read that file"
- "Delete this backup?"
- "Did you save it?"
- "Made by a newer version"
- "Not a valid backup file"
- "Restore failed"
- "Restore this backup?"
- "Restored"
- "Saved"
- "This backup looks corrupted"
- "Too large for your account"
- "Turn off sync first"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /settings/account  `SC-36`

**Open** `/settings/account` — 6 ways in

**Popups it can raise** (3)
- "Delete your account?"
- "Sign out?"
- "This cannot be undone"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Server builds only

### /auth  `SC-37`

**Open** `/auth` — deep link only

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Deep link only, by design

### /settings/linked  `SC-38`

**Open** `/settings/linked` — 2 ways in

**The pieces on it**
- `AppErrorBoundary`

**Popups it can raise** (1)
- "Unlink ${who}?"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Own `ErrorBoundary`

### /link  `SC-39`

**Open** `/link` — deep link only

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Deep link only, by design

### /approvals  `SC-40`

**Open** `/approvals` — 2 ways in

**What it is for** Entries waiting on you

**The pieces on it**
- `ApprovalCard`
- `PayMethodSelector`

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** **Reachable** — the old doc said otherwise

### /settings/sync  `SC-43`

**Open** `/settings/sync` — 3 ways in

**The pieces on it**
- `RecoveryCodeSheet`

**Popups it can raise** (6)
- "Cannot store the code"
- "Could not accept"
- "Joined"
- "Stopped"
- "Sync paused"
- "Turn on sync?"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** **New ID**

---

## Accounts, sync and backup · the screens (2/2)

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 4 min · 0/1 walked

### /settings/sync-log  `SC-44`

**Open** `/settings/sync-log` — 2 ways in

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** **New ID**

---

## Accounts, sync and backup · when someone else is involved (1/2)

_The optional half. An account buys off-device backup and shared-group sync and nothing else. Built end to end, encrypted per group — and no part of it has run on a phone._

`changes things` · about 25 min · 0/2 walked

### Approve or reject a peer entry  `FL-27`

**Why** Someone added something that touches your money.

**You need** demo — **Priya's ₹3,600 groceries is waiting**, and Aarav's electricity already applied because he is trusted. Both in Roommates.

**Start from**
1. SC-40, from the Home badge
2. SC-15, on the entry itself

**Do this**
1. open Waiting for you
2. read the entry
3. Approve, or "Not mine"
4. optionally, trust the person from here

**Should happen** Approving clears the exclusion and the entry starts counting. Rejecting soft-deletes it **for you** and sends an objection back. Back to the queue, one item shorter.

**Check the numbers**
- **this is the check worth doing.** Before approving, note Home's month total and the Roommates balance. A waiting entry must move **neither** (IV-05)
- after approving Priya's ₹3,600 split three ways, your month total rises by **₹1,200, not ₹3,600** (IV-08)
- the group balance moves by the other ₹2,400

**Watch out for**
1. rejecting leaves the two devices holding different rows. The objection travels, so it is visible, but nothing reconciles them

**Also try**
- approve Aarav's transfer and watch cash, not just the balance
- reject Priya's and check the Roommates balance goes back
- compare Priya's entry with Aarav's — same shape, different landing, and the only difference is who wrote it

**If it went wrong** Reopen the approval. —

### Dispute an entry  `FL-28`

**Why** "That split is wrong" — about an entry you did not write, or one someone is objecting to that you did.

**You need** demo — **Rohan disputes your ₹2,800 airport cab** in Goa Trip. Open it and look for the red banner.

**Start from**
1. SC-15

**Do this**
1. open the entry
2. read the banner
3. raise or withdraw

**Should happen** An objection, keyed on their **account** id rather than a local person — it can arrive before any person mapping exists. Stays on the entry.

**Check the numbers**
- a dispute **changes no figure on your side**. It is a message, not a correction
- the two devices' balances stay different until someone edits or deletes the entry

**Watch out for**
1. nothing reconciles the rows themselves — only the humans do

**Also try**
- open the disputed Goa cab and check the banner is **red**, and visibly unlike the amber "waiting for you" one — they mean opposite things
- check your Goa balance still includes the disputed amount

**If it went wrong** Withdraw it. —

---

## Accounts, sync and backup · when someone else is involved (2/2)

_The optional half. An account buys off-device backup and shared-group sync and nothing else. Built end to end, encrypted per group — and no part of it has run on a phone._

`changes things` · about 14 min · 0/1 walked

### Set trust  `FL-29`

**Why** "I do not need to check everything Aarav adds."

**You need** demo — **Aarav is trusted, Priya is on review**, and that single difference is why their entries land differently.

**Start from**
1. SC-26a TrustSheet
2. SC-40 "Trust <name>"

**Do this**
1. open the person
2. Trust
3. pick trusted or on review
4. optionally override for one group only

**Should happen** Trust is **per person, never per group** (IV-10). The per-group override is still keyed on a human, which is why it is allowed. Closes the sheet.

**Check the numbers**
- changing trust moves no figure retroactively — entries already waiting stay waiting
- it only decides where their **next** entry lands

**Watch out for**
1. a person with no account — the control should say why it does nothing, and this is worth checking on screen

**Also try**
- trust Priya, then look at her waiting entry — it should still wait
- set a per-group override on Aarav for Roommates only
- check the override is clearable, or "trusted except here" is a one-way door

**If it went wrong** Fully, both directions. —

---

## Accounts, sync and backup · accounts and sync (1/4)

_The optional half. An account buys off-device backup and shared-group sync and nothing else. Built end to end, encrypted per group — and no part of it has run on a phone._

`needs 2 phones` · about 26 min · 0/2 walked

### Back up and restore  `FL-11`

**Why** "Don't lose my data" / "I have a new phone."

**You need** demo — plenty to back up. **Do this before any destructive test.**

**Start from**
1. SC-06 → SC-34
2. the restore-offer alert on launch
3. SC-36 → SC-34

**Do this**
1. set a passphrase
2. the DB + photos are encrypted (PBKDF2 50k)
3. out to the share sheet, or up to the account
4. to restore: pick the file
5. passphrase
6. confirm REPLACE ALL

**Should happen** A restore **replaces all data**. E-18 is deliberately excluded, and E-80's AsyncStorage preferences are not in the backup at all — so a restore does not return you to exactly where you were. Back, or a forced reload after a restore.

**Check the numbers**
- after restoring, every figure must match what it was at backup time, exactly — Home's total, every balance, every goal
- **your app preferences will not come back.** They live in a different store that is not in the backup, and nothing on screen warns you

**Watch out for**
1. wrong passphrase → refused, nothing touched
2. **a restore is refused outright while sync is on** (restoreGuard, SYNC-F9) — restoring an old state into a shared group would re-publish it
3. a backup over ~25 MiB is capped by KV standing in for R2 (DQ-85)

**Also try**
- back up, change three things, restore, and check all three reverted
- **check whether your feature switches survived** — they should not, and knowing that is the point
- try a wrong passphrase and confirm nothing was touched
- check the confirmation makes "this replaces everything" unmissable

**If it went wrong** No. A restore is not undoable, which is why .S6 is explicit. The restore path has **never run on a device** — RELEASE §0.4.

### Share a group  `FL-24`

**Why** "Put this group on Aarav's phone too."

**You need** **needs a second device and an account.** Not walkable solo.

**Start from**
1. SC-13 → Share
2. SC-09 overflow

**Do this**
1. open the group
2. Share
3. pick who
4. confirm

**Should happen** The group's key is wrapped once per recipient device and the roster is published. This is the moment a local group becomes a synced one. Back to the group.

**Check the numbers**
- nothing changes on your side — no balance, no total
- on theirs, the whole group's history appears at once

**Watch out for**
1. no server configured → the option does not exist
2. **none of this has ever run on a phone**

**Also try**
- nothing solo. Park this until there are two devices.

**If it went wrong** Stop syncing the group; the other side keeps what it has. Built end to end, never run on a phone.

---

## Accounts, sync and backup · accounts and sync (2/4)

_The optional half. An account buys off-device backup and shared-group sync and nothing else. Built end to end, encrypted per group — and no part of it has run on a phone._

`needs 2 phones` · about 23 min · 0/2 walked

### Accept an invite  `FL-25`

**Why** Someone sent you a link.

**You need** **needs a second device.** Not walkable solo.

**Start from**
1. SC-39, from a `budgetsplit:///link?token=…` deep link only

**Do this**
1. tap the link
2. the app opens on SC-39
3. claim
4. **the sender confirms on their phone**
5. the group appears

**Should happen** Claiming **asks**. Nothing is linked until the sender approves — a forwarded link must not be enough to join. `replace`s to the group, or to Settings if it is only a person link.

**Check the numbers**
- after adoption, their whole group history lands at once, and your owe/owed figures move by your share of all of it

**Watch out for**
1. a forwarded link claimed by a stranger — stopped at
2. .S4
2. a spent token

**Also try**
- nothing solo.

**If it went wrong** Leave the group (FL-26). Never run on a phone.

### Sign in  `FL-30`

**Why** "Back up off this phone" / "put this on my other phone."

**You need** **needs a real email and a server build.** Never seen on a device.

**Start from**
1. SC-06 → Account
2. SC-34
3. SC-43
4. the restore offer

**Do this**
1. type your email
2. send the link
3. open the mail
4. tap it — the app opens on SC-37
5. the token is spent once
6. SC-37 replaces itself with the account screen

**Should happen** An account keyed on the email, and a session. No password anywhere. `replace`s to SC-36, or Home.

**Check the numbers**
- signing in changes no financial figure. It buys backup and sync, nothing else

**Watch out for**
1. **a typo in the email makes a second account holding none of your backups**, and email is the only identity — it cannot be changed or merged (DQ-08)
2. a link opened twice — the token is spent

**Also try**
- sign in, then check that Settings shows **which email** you used — this is the cheap fix for DQ-08 nobody has taken
- open the magic link on a different phone

**If it went wrong** Sign out. The account itself is deletable. DQ-08. Never seen on a device.

---

## Accounts, sync and backup · accounts and sync (3/4)

_The optional half. An account buys off-device backup and shared-group sync and nothing else. Built end to end, encrypted per group — and no part of it has run on a phone._

`needs 2 phones` · about 24 min · 0/2 walked

### Link a person to an account  `FL-31`

**Why** "This Aarav in my list is that Aarav who just signed up."

**You need** **needs a second account.** Demo fakes the result: Aarav, Priya and Rohan already carry account ids.

**Start from**
1. SC-38 Linked people

**Do this**
1. open Linked people
2. pick the incoming account
3. match it to a person in your list
4. confirm

**Should happen** The thread between an account and a local person. Stays.

**Check the numbers**
- no figure moves. This is identity, not money

**Watch out for**
1. matching the wrong person — their entries would then reach the wrong name in your ledger

**Also try**
- check that a person with no account cannot be trusted meaningfully
- look at Aarav in demo data: he has an account id, which is why his trust setting does anything at all

**If it went wrong** Unmatch. Never run on a phone.

### Sync push and pull  `FL-32`

**Why** Nothing. It runs itself when the tab bar mounts — there is no button.

**You need** **needs a second device.** Demo fakes the results, not the transport.

**Start from**
1. .X1 app launch, from the tab bar

**Do this**
1. the outbox is drained, oldest first
2. each entry is sealed with the group key
3. pushed
4. the server's changes are pulled
5. each arriving entry goes through `ingestPeerTxn`
6. trust decides: land it, or hold it for approval

**Should happen** Compare-and-set on `sync_version`. A stale push is a **409**, never a silent last-write-wins. Nothing visible. SC-43 says when it last ran and why it did nothing.

**Check the numbers**
- **the promise to check:** an entry waiting for approval must move **no figure of yours** — not Home, not the balance, not Reports
- once approved, every figure moves at once and they agree

**Watch out for**
1. 409 on push after an offline edit
2. entries this device cannot decrypt
3. **no part of this has run on a phone**

**Also try**
- open Settings → Sync and read what it says about the last run — that screen is the only window into any of this
- nothing else, solo

**If it went wrong** n/a. Built end to end, never run on a phone.

---

## Accounts, sync and backup · accounts and sync (4/4)

_The optional half. An account buys off-device backup and shared-group sync and nothing else. Built end to end, encrypted per group — and no part of it has run on a phone._

`needs 2 phones` · about 14 min · 0/1 walked

### Server backup and restore  `FL-49`

**Why** "Keep a copy somewhere that is not this phone."

**You need** **needs an account and a server build.** Restore has never run on a device.

**Start from**
1. SC-34

**Do this**
1. open Backup
2. set a passphrase
3. back up to the account
4. to restore: pick it
5. passphrase
6. confirm **replace all**

**Should happen** Encrypted before it leaves. The server cannot read it. A restore forces a reload.

**Check the numbers**
- after a restore every figure should match what you had at backup time, exactly
- **but your app preferences will not come back** — they live in a different store that is not in the backup, and nothing says so

**Watch out for**
1. **a restore is refused outright while sync is on**, because it would re-publish an old state. Check the refusal, not the warning
2. backups above about 25 MiB — KV is standing in for R2 (DQ-85)

**Also try**
- back up, change something, restore, and check the change is gone
- **check whether your feature switches survived the restore**

**If it went wrong** **No.** A restore is not undoable, which is why it asks twice. Restore never run on a device. RELEASE §0.4.

---

## The app itself · the screens (1/2)

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 26 min · 0/4 walked

### app/_layout.tsx  `SC-01`

**Open** `app/_layout.tsx` — null ways in

**The pieces on it**
- `LockGate`
- `LogoAssembly`
- `MoneyRow`
- `Onboarding`
- `OnboardingGate`
- `PrivacyScreen`
- `StepAmountField`
- `StepBack`
- `StepFooter`
- `StepProgress`
- `StepScaffold`
- `StoreHydrator`
- `SummaryStage`

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### app/(tabs)/_layout.tsx  `SC-02`

**Open** `app/(tabs)/_layout.tsx` — null ways in

**The pieces on it**
- `PickQrFromPhotos`
- `ScanPaySheet`
- `UpiUriSheet`

**Popups it can raise** (8)
- "Couldn't merge them"
- "Couldn’t open ${label}"
- "Couldn’t save that"
- "No UPI app found"
- "Send the payment to ${label}?"
- "Two people called ${next.name}"
- "Used BudgetSplit before?"
- "Welcome back"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /settings  `SC-06`

**Open** `/settings` — one way in

**What it is for** Everything, grouped. Version ×7 → `SC-27`

**The pieces on it**
- `RequestQrSheet`

**Popups it can raise** (6)
- "App lock is still on"
- "Export failed"
- "Nothing to export"
- "Saved"
- "That doesn’t look like a UPI ID"
- "Welcome tour reset"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /features  `SC-24`

**Open** `/features` — one way in

**The pieces on it**
- `BrandedLoader`
- `FeatureFlagsProvider`

**Popups it can raise** (3)
- "Hide group splitting?"
- "Location off"
- "Set up for “${opt?.label}”?"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** 16 flags + 3 non-flag prefs

---

## The app itself · the screens (2/2)

_Open each one and look at it properly — the pieces on it, the states it can be in, whether it reads right._

`demo data` · about 14 min · 0/4 walked

### /storage  `SC-27`

**Open** `/storage` — one way in

**Popups it can raise** (8)
- "Couldn’t erase data"
- "Couldn’t load demo data"
- "Data erased"
- "Delete all attachments?"
- "Demo data loaded"
- "Erase all data?"
- "Load demo data?"
- "Something went wrong"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Dev only: demo data, **erase all**. Live in release (`DQ-21`)

### /settings/storage  `SC-27a`

**Open** `/settings/storage` — 5 ways in

**Popups it can raise** (2)
- "Delete all receipt photos?"
- "Something went wrong"

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** Safe. Nothing here can lose a transaction

### /history  `SC-28`

**Open** `/history` — 4 ways in

**What it is for** Audit log

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

### /help  `SC-29`

**Open** `/help` — one way in

**Look for**
- the empty state — designed, or a blank?
- anything cut off, overlapping, or too small to tap
- the back button — does it go where you expect?

**Known** A third collapsible pattern (`DQ-17`)

---

## The app itself · settings and safety (1/3)

_First run, settings, feature switches, the lock screen, storage and the history log — plus the navigation shell everything else sits inside._

`changes things` · about 21 min · 0/2 walked

### Turn a feature on or off  `FL-02`

**Why** "I don't want this part of the app", or "where did X go".

**You need** any.

**Start from**
1. SC-06 → SC-24

**Do this**
1. open SC-24
2. toggle a switch
3. the surface appears/vanishes

**Should happen** One AsyncStorage key. Optimistic; setFlag cannot fail. Stays on SC-24.

**Check the numbers**
- turning a switch off **hides a surface, it never deletes data**. Turn it back on and everything should still be there
- turning off splitting with money outstanding: the balances survive untouched, they just stop being shown

**Watch out for**
1. turning off a flag whose data still exists hides the data, never deletes it — but nothing says so on screen

**Also try**
- turn off splitting and count how much of the app changes shape — the tab bar, Home's strip, and the Transfer kind all go
- re-apply a persona and check it warns you first: it overwrites **every** switch, including ones you set by hand
- toggle location and watch it ask the OS rather than just flipping

**If it went wrong** Fully, instantly. —

### Premium upgrade  `FL-03`

**Why** Nothing. There is nothing to trigger.

**You need** any — the point is that you will not find this anywhere.

**Do this**
1. look for a paywall, an upgrade prompt, a locked feature, a "Pro" badge or a price. There is none, in any state.

**Should happen** Nothing exists to write. No paywall, no IAP, no entitlement, no SDK.

**Check the numbers**
- no figure anywhere is gated. Every feature is on for everyone
- **feature switches are preferences, not a paywall in disguise.** If you ever find one that reads as "upgrade to unlock", that is the bug this entry exists to catch

**Also try**
- turn off several switches and confirm nothing offers to sell them back to you
- search Settings for any mention of price, plan, upgrade or Pro

**If it went wrong** DQ-01 — what monetisation would even be is genuinely undecided, and this entry is here so the answer is not accidentally "the flags".

---

## The app itself · settings and safety (2/3)

_First run, settings, feature switches, the lock screen, storage and the history log — plus the navigation shell everything else sits inside._

`changes things` · about 26 min · 0/2 walked

### Load demo data or erase everything  `FL-50`

**Why** Starting a test sweep, or clearing up after one.

**You need** any. **This task is how you change state.**

**Start from**
1. SC-27, reached by tapping the version seven times in Settings

**Do this**
1. Settings
2. tap the version 7×
3. Storage opens
4. Load demo data, or Erase all data
5. confirm

**Should happen** Both **wipe the database**. Loading demo preserves only your name and avatar. Stays on Storage.

**Check the numbers**
- after loading demo you should see 5 people, 8 groups and 8 goals, and the confirmation toast says the counts it actually wrote
- after erasing, every figure is zero and every list is an empty state — which is the only way to see those

**Watch out for**
1. **neither is undoable and neither takes a backup first**
2. running it on real data

**Also try**
- erase, then walk the first-run task and every empty state
- load demo and check the toast's counts against what you see

**If it went wrong** No. DQ-21 — this ships in release builds today, on purpose, so testers can reset the build they were given. It is also what makes this whole walkthrough possible.

### Lock and privacy  `FL-51`

**Why** "Do not show my money to whoever picks up my phone."

**You need** any.

**Start from**
1. SC-06

**Do this**
1. Settings
2. turn on the lock
3. background the app
4. come back
5. authenticate

**Should happen** Preferences only. Stays.

**Check the numbers**
- hide-amounts must blank **every** figure, not only the hero — the category rows, the balances, the goal amounts
- nothing is actually changed; this is presentation

**Watch out for**
1. biometrics unavailable or refused
2. a figure that escapes hide-amounts somewhere

**Also try**
- turn on hide amounts and **hunt for a number that still shows**
- background and reopen with the lock on
- check the task switcher preview is covered

**If it went wrong** Turn it off. All off by default.

---

## The app itself · settings and safety (3/3)

_First run, settings, feature switches, the lock screen, storage and the history log — plus the navigation shell everything else sits inside._

`changes things` · about 15 min · 0/1 walked

### Storage cleanup  `FL-54`

**Why** "The phone says it is full."

**You need** demo — there are attachment rows, though not real files.

**Start from**
1. SC-06
2. SC-03's low-disk banner
3. SC-07

**Do this**
1. open Storage
2. read what the app is using
3. clear cached exports, or delete receipt photos
4. confirm

**Should happen** Files only. **Nothing here can lose a transaction** — that is the entire reason this screen is separate from the developer one. Stays.

**Check the numbers**
- the reclaimed figure should match what the row promised
- **no financial figure may change at all**
- a transaction whose photo you deleted stays, and loses its image

**Watch out for**
1. a URI left pointing at a file that is gone — there is a reaper for exactly this, run at cold start

**Also try**
- delete all receipt photos, then **open a transaction that had one** and check the entry survived
- check your month total is untouched
- confirm this screen has no way to erase data — that is `SC-27`

**If it went wrong** No, but nothing important is lost. Deliberately separate from SC-27, so the two destructive actions are never one tap from Settings.

---

## Rules that must hold (1/3)

_Twenty-two things that must never be false. Nine have a test behind them; the rest are held by people remembering, which is exactly why they are worth checking by hand._

`demo data` · about 29 min · 0/9 walked

### money is integer paise  `IV-01`

**The rule** Money is integer paise. `parseToPaise` in, `formatRupees` out, never a float.

**Who holds it** `money.test.ts`

### a transaction's shares sum to its payments, e…  `IV-02`

**The rule** A transaction's shares sum to its payments, exactly. Rounding lands somewhere deterministic.

**Who holds it** `splitExactness.test.ts`

### multi-table writes happen inside withtransact…  `IV-03`

**The rule** Multi-table writes happen inside `withTransactionAsync`. Zero partial writes.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

### a recurring rule is not a transaction  `IV-04`

**The rule** A recurring rule is not a transaction. Every money statement over `txn` carries `recur_freq IS NULL`.

**Who holds it** **`txnInvariant.test.ts`** — reads the real SQL

### an entry awaiting approval is shown in the le…  `IV-05`

**The rule** An entry awaiting approval is shown in the ledger and excluded from every money figure, via the one constant `NOT_AWAITING_APPROVAL`.

**Who holds it** **`approvalInvariant.test.ts`** — fails when a new statement over `txn` neither carries it nor says why

### settlements are excluded from analysis and sh…  `IV-06`

**The rule** Settlements are excluded from analysis and shown in the ledger. Settling a debt is not consumption; the purchase was already booked. `lib/cash.ts` is the deliberate exception, because cash genuinely moved.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

### a balance is never shown without its scope be…  `IV-07`

**The rule** A balance is never shown without its scope being determinate.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

### your share is your spending, the moment it ha…  `IV-08`

**The rule** **Your share is your spending**, the moment it happens. Who fronted the cash is irrelevant. Implemented in `myShareOf` and nowhere else.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

### an entry takes effect immediately for whoever…  `IV-09`

**The rule** An entry takes effect immediately for whoever created it and waits for approval from everyone else it touches. **You can always make yourself worse off, never someone else.**

**Who holds it** `peerApproval.test.ts`

---

## Rules that must hold (2/3)

_Twenty-two things that must never be false. Nine have a test behind them; the rest are held by people remembering, which is exactly why they are worth checking by hand._

`demo data` · about 29 min · 0/9 walked

### trust is per person, never per group  `IV-10`

**The rule** Trust is per person, never per group. A group is only a set of humans, so a group-level switch would silently extend trust to whoever is added next. The per-group *override* is still keyed on a human, which is why it is allowed.

**Who holds it** `trust.test.ts`

### a person with no remote_uid has no write path…  `IV-11`

**The rule** A person with no `remote_uid` has no write path, so their trust value is inert. That check runs first.

**Who holds it** `trust.test.ts`

### approval state never lives on txn_share / txn…  `IV-12`

**The rule** Approval state never lives on `txn_share` / `txn_payment` — both are deleted and re-inserted wholesale on every edit, so a decision stored there would be silently erased.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

### enforce the pending exclusion at the loader…  `IV-13`

**The rule** Enforce the pending exclusion at the loader, not inside `myShareOf`. That function has no row id, and threading a pending set through its thirteen callers recreates the problem the rule exists to prevent.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

### money.investments is derived from live assets…  `IV-14`

**The rule** `money.investments` is derived from live assets and never written.

**Who holds it** `moveToInvestments.test.ts`

### an archived asset stops counting, because arc…  `IV-15`

**The rule** An archived asset stops counting, because archiving is how you say you no longer own it.

**Who holds it** `assetRegister.test.ts`

### income is never grouped  `IV-16`

**The rule** Income is never grouped. It writes `[{me, total}]` and zero shares, because grouping it carries no meaning.

**Who holds it** `splitMath.test.ts`

### never one total across kinds  `IV-17`

**The rule** **Never one total across kinds.** Money in, money out and money moved do not belong in a single figure. Sum per kind and label it, or show a two-sided figure. Shipped as a bug twice.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

### never a p2p collect request  `IV-18`

**The rule** **Never a P2P collect request.** NPCI banned them outright from 1 Oct 2025. Every request-money path is push: a QR the payer scans with their own app.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

---

## Rules that must hold (3/3)

_Twenty-two things that must never be false. Nine have a test behind them; the rest are held by people remembering, which is exactly why they are worth checking by hand._

`demo data` · about 14 min · 0/4 walked

### never present a qr-supplied name as who you a…  `IV-19`

**The rule** **Never present a QR-supplied name as who you are paying.** A code's `pn` is written by whoever made the code; lead with the VPA and label the name unverified.

**Who holds it** Nothing does. Held by people remembering, which is why it is here.

### cash moves only on payments where person_id =…  `IV-20`

**The rule** Cash moves only on payments where `person_id = me`. Another person's expense, income or share moves your cash by zero.

**Who holds it** `cashSql.test.ts`

### a removed group member is soft-deleted, and m…  `IV-21`

**The rule** A removed group member is soft-deleted, and `memberActive()` is the one condition every statement uses.

**Who holds it** **`memberInvariant.test.ts`**

### only entries you authored enter the outbox.  `IV-22`

**The rule** Only entries you authored enter the outbox.

**Who holds it** **`outboxAuthorInvariant.test.ts`**

---

## Known problems (1/3)

_Twenty-seven findings already written down. Confirm each is still real, still this bad, and still worth the verdict it carries._

`demo data` · about 30 min · 0/11 walked

### A route referenced from three screens that does not exist  `OV-12`

**The finding** A route referenced from three screens that does not exist

**What it costs today** Tapping Edit on a materialized recurring row was a dead end, silently, from three ledgers. Not mentioned in any document.

**Verdict** fix it — — **done 2026-09-01**, with deadRouteRef.test.ts to hold it.

### Tab routes pushed onto the stack  `OV-09`

**The finding** Tab routes pushed onto the stack

**What it costs today** Pushing a tab stacks a second copy of the tab navigator; Back then returned to where you came from instead of leaving.

**Verdict** fix it — — **done 2026-09-01**.

**What would fix it** navigate() between tabs; dismissTo() from a pushed screen back to one.

### A sheet pattern documented twice and used never  `OV-25`

**The finding** A sheet pattern documented twice and used never

**What it costs today** Two files instruct the next person to build something the codebase has already decided against. Guidance that is wrong is worse than none.

**Verdict** fix it — 

### Three buttons to one destination on one screen  `OV-27`

**The finding** Three buttons to one destination on one screen

**What it costs today** Three affordances competing for the same tap, and the Recurring tab's add is actively misleading: it looks like "add a rule" and adds an expense.

**Verdict** fix it — 

### kind='settlement' means four different things  `OV-02`

**The finding** kind='settlement' means four different things

**What it costs today** SN-06.T4a — the suggester offers to "settle" an SIP purchase. The analysis exclusion (IV-06) is right for 1 and 2 and wrong for 3.

**Verdict** after the pilot — 

**What would fix it** txn.settle_kind TEXT ('debt'|'card'|'asset'|'transfer'), defaulted to 'debt'; make BALANCE_TXN_FILTER and the suggester select on it.

### Budget is three concepts, two levels, and three strays  `OV-07`

**The finding** Budget is three concepts, two levels, and three strays

**What it costs today** Five answers to "what is my budget", in three storage locations, two of which nothing reconciles. SN-09.T4b is the case where 5 and 1 disagree.

**Verdict** after the pilot — 

### /add/quick: 11 params, 24 entry points  `OV-08`

**The finding** /add/quick: 11 params, 24 entry points

**What it costs today** The single highest-fan-in screen in the app, and effectively a mini-app. Every settle-up, every "log it", the daily-log notification and the Siri shortcut all land here. A missing groupId is a whole bug class (SN-04.T3j), because the destination silently falls back to Personal.

**Verdict** after the pilot — 

### The tab bar owns sync, alerts, reconciliation and snapshots  `OV-17`

**The finding** The tab bar owns sync, alerts, reconciliation and snapshots

**What it costs today** The navigator is the busiest file in the app, and none of what makes it busy is navigation. Every one of those behaviours is untestable, since the suite never renders a component.

**Verdict** after the pilot — 

### SC-19 owns twelve sheet states  `OV-24`

**The finding** SC-19 owns twelve sheet states

**What it costs today** The largest screen in the repo, and the one feature that has never been device-tested. Twelve independent booleans is twelve times the state space of one discriminated union.

**Verdict** after the pilot — 

### Nine names for one row  `OV-01`

**The finding** Nine names for one row

**Verdict** just a rename — Keep **entry** in user-facing copy and **txn** in code. "Expense" means kind=expense only. "Item" and "line" belong to E-08.

### Seven names over four shapes for a balance  `OV-04`

**The finding** Seven names over four shapes for a balance

**Verdict** just a rename — with one rule attached: **a balance is never named without its scope** (IV-07). "Net" alone should not appear anywhere.

---

## Known problems (2/3)

_Twenty-seven findings already written down. Confirm each is still real, still this bad, and still worth the verdict it carries._

`demo data` · about 30 min · 0/11 walked

### Person, friend, member, roster member, contact  `OV-05`

**The finding** Person, friend, member, roster member, contact

**Verdict** just a rename — **Person** everywhere in code. "Friend" only in UI copy, and only where retaining departed people is intended.

### `Other` and `Others`, one character apart  `OV-18`

**The finding** `Other` and `Others`, one character apart

**Verdict** just a rename — Rename the fold to **"Everything else"**. One string.

### Five near-identical investment identifiers  `OV-20`

**The finding** Five near-identical investment identifiers

**Verdict** just a rename — and worth doing because these mean genuinely opposite things: one is money consumed, one is money moved.

### Six vocabularies over daily/weekly/monthly/yearly  `OV-22`

**The finding** Six vocabularies over daily/weekly/monthly/yearly

**Verdict** just a rename — for four of them; OV-19 handles the two that are storage. They are genuinely different domains — a budget cadence and a recurrence frequency are not the same idea — so unifying the TYPES would be wrong. Unify the WORDS.

### A group has three end states that get conflated  `OV-11`

**The finding** A group has three end states that get conflated

**Verdict** just a rename — The three states are right; the UI words for them are not.

### Create-as-sheet, edit-as-route  `OV-26`

**The finding** Create-as-sheet, edit-as-route

**Verdict** just a rename — — meaning: write the rule down rather than churn the UI. The rule the codebase actually follows is "a sheet for one field, a route for a form". SC-10 vs OwnBudgetSheet is the one real violation.

### A recurring rule and a transaction share a table  `OV-03`

**The finding** A recurring rule and a transaction share a table

**Verdict** fine as it is — This entry is the fix.

**What would fix it** A separate table would need every column txn has, plus a join on every ledger read, and the occurrences would still be txns. The exclusion is ONE condition, and txnInvariant.test.ts reads the real SQL and fails when a new statement over txn omits it. That is a stronger guarantee than a second table would give.

### Two key-value stores both called "settings"  `OV-13`

**The finding** Two key-value stores both called "settings"

**Verdict** fine as it is — plus one line of UI copy on the restore screen.

**What would fix it** They have genuinely different lifetimes and different backup semantics. Merging them would put device preferences into a backup that is restored onto a DIFFERENT device, which is wrong.

### Four things called "pending"  `OV-21`

**The finding** Four things called "pending"

**Verdict** fine as it is — Rename the AsyncStorage pair to "handoff" — that much is free — and leave the architecture alone.

**What would fix it** The reversal is load-bearing and hard-won: pending_txn CANNOT carry a peer entry, because it has no share or payment rows and no source group, so a split expense routed through it loses its split. E-84 and E-85 are siblings with different destinations on purpose.

### Four features behind unlabeled icons  `OV-16`

**The finding** Four features behind unlabeled icons

**Verdict** fine as it is — → **NEEDS-DECISION**, because whether to spend Plan's vertical space on labels is a layout question, not a correctness one. Deferred to you: see the note at the end of this section.

### Categories are referenced by NAME, not by id  `OV-06`

**The finding** Categories are referenced by NAME, not by id

**Verdict** needs a decision — 

**What would fix it** Whether categories become global-and-undeletable-once-shared, which is a product decision, not a schema one. → DQ-16

---

## Known problems (3/3)

_Twenty-seven findings already written down. Confirm each is still real, still this bad, and still worth the verdict it carries._

`demo data` · about 15 min · 0/5 walked

### backOr is used in 5 of 44 route files  `OV-10`

**The finding** backOr is used in 5 of 44 route files

**Verdict** needs a decision — Cheap to fix mechanically; the question is which 40.

**What would fix it** Which screens become deep-link targets, which follows from the widget and App Intents decisions. → DQ-06

### E-50 is recomputed on every read, with no memo boundary  `OV-14`

**The finding** E-50 is recomputed on every read, with no memo boundary

**Verdict** needs a decision — Do not optimise this before measuring it.

**What would fix it** Whether it is actually slow, which needs a device and real data.

### /personal is a stack route pretending to be a tab  `OV-15`

**The finding** /personal is a stack route pretending to be a tab

**Verdict** needs a decision — 

**What would fix it** Whether splitting-off is a supported configuration for the pilot at all, or just a persona artefact. → DQ-01

### category_budget.period AND .cadence  `OV-19`

**The finding** category_budget.period AND .cadence

**Verdict** needs a decision — → sequence behind OV-07.

**What would fix it** Dropping `period` means rebuilding the table and both partial indexes, which is the same migration OV-07 wants. Do them together.

### Dead and near-dead columns  `OV-23`

**The finding** Dead and near-dead columns

**Verdict** needs a decision — The honest default is to leave them and keep this list.

**What would fix it** Currency is not dead, it is PARKED — a multi-currency pilot would want it. Dropping columns is irreversible; leaving them costs bytes.

---

## Open questions (1/3)

_Thirty things nobody has decided. Your opinion is the answer to most of them — that is not a figure of speech, it is why they are still open._

`demo data` · about 30 min · 0/14 walked

### **What is the monetisation shape?** No paywall, entitlement, IAP or SDK exists anywhere, and flags are preferences that must never be repurposed as gates.  `DQ-01`

**The question** **What is the monetisation shape?** No paywall, entitlement, IAP or SDK exists anywhere, and flags are preferences that must never be repurposed as gates.

**If nobody decides** Free forever, funded by nobody.

**What would force it** Real users, or a server bill that stops being trivial.

### **"Safe to Spend" as a name.** Simple Bank registered it and enforced it (C&D to Monzo, 2015). Simple shut in 2021, so it may have lapsed — *that is an assumption, not a finding.*  `DQ-02`

**The question** **"Safe to Spend" as a name.** Simple Bank registered it and enforced it (C&D to Monzo, 2015). Simple shut in 2021, so it may have lapsed — *that is an assumption, not a finding.*

**If nobody decides** Visible copy stays "yours to spend"; identifiers keep saying `safeToSpend`.

**What would force it** Any public listing, or a lawyer's five minutes.

### **Aggregate use of spend data.** Raised, never decided. Would need opt-in, a rewritten privacy policy, and a story for demo rows.  `DQ-03`

**The question** **Aggregate use of spend data.** Raised, never decided. Would need opt-in, a rewritten privacy policy, and a story for demo rows.

**If nobody decides** Never done. Nothing leaves the device that is not listed in §1.

**What would force it** A monetisation decision (`DQ-01`).

### **The non-engineering cost of running a server**: DPDP obligations, a privacy policy, hosting, uptime, on-call.  `DQ-04`

**The question** **The non-engineering cost of running a server**: DPDP obligations, a privacy policy, hosting, uptime, on-call.

**If nobody decides** Absorbed personally, unpriced.

**What would force it** The first outage with a real user on it.

### **India DPDP posture.** The moment one real user signs in, an email address is personal data on a server you operate.  `DQ-05`

**The question** **India DPDP posture.** The moment one real user signs in, an email address is personal data on a server you operate.

**If nobody decides** Unaddressed.

**What would force it** The first non-you sign-in.

### **Widget scope** — balance? today's spend? quick-add? Genuinely undecided.  `DQ-06`

**The question** **Widget scope** — balance? today's spend? quick-add? Genuinely undecided.

**If nobody decides** No widget.

**What would force it** `DQ-80` (a paid Apple account) unblocking.

### ~~**Rejecting a peer entry diverges the two devices silently.**~~ **Closed 2026-08.** A rejection now travels back to the author as an objection on the entry (`E-22`), and withdrawing it travels too — `pushSyncDispute` on push, `recordDispute` on pull, round-tripped in `peerApproval.test.ts`. The two devices still hold different rows; the difference is now **visible to both**, which was the actual defect.  `DQ-07`

**The question** ~~**Rejecting a peer entry diverges the two devices silently.**~~ **Closed 2026-08.** A rejection now travels back to the author as an objection on the entry (`E-22`), and withdrawing it travels too — `pushSyncDispute` on push, `recordDispute` on pull, round-tripped in `peerApproval.test.ts`. The two devices still hold different rows; the difference is now **visible to both**, which was the actual defect.

**If nobody decides** —

**What would force it** —

### **Email is the only identity**, unchangeable and unmergeable. A typo at sign-in creates a second account holding none of your backups.  `DQ-08`

**The question** **Email is the only identity**, unchangeable and unmergeable. A typo at sign-in creates a second account holding none of your backups.

**If nobody decides** The typo wins.

**What would force it** The first support message that starts "I can't find my backup".

### **CRED's `mode` vs `tr`** was never isolated — it failed once with both added and both are off today, which closes the question by avoidance. Two attempts would settle it.  `DQ-09`

**The question** **CRED's `mode` vs `tr`** was never isolated — it failed once with both added and both are off today, which closes the question by avoidance. Two attempts would settle it.

**If nobody decides** Both stay off.

**What would force it** An hour with a CRED account.

### **Amazon Pay and WhatsApp were tested against the same `@kotak` handle** — an uncontrolled variable, and Kotak is not among WhatsApp's five PSP banks.  `DQ-10`

**The question** **Amazon Pay and WhatsApp were tested against the same `@kotak` handle** — an uncontrolled variable, and Kotak is not among WhatsApp's five PSP banks.

**If nobody decides** Recorded as "refused" on possibly-wrong evidence.

**What would force it** Retest against `@okhdfcbank` or `@ybl`.

### **Android UPI is entirely untested.** `useUpiApps` returns null there, so the per-app payload table is *unreachable*, not merely dead. Needs a device pass, not a patch.  `DQ-11`

**The question** **Android UPI is entirely untested.** `useUpiApps` returns null there, so the per-app payload table is *unreachable*, not merely dead. Needs a device pass, not a patch.

**If nobody decides** The whole feature silently does nothing on Android.

**What would force it** The Android port.

### **Three red surfaces can stack on one Home open.** Thresholds deliberately not moved or de-duplicated.  `DQ-12`

**The question** **Three red surfaces can stack on one Home open.** Thresholds deliberately not moved or de-duplicated.

**If nobody decides** Three at once.

**What would force it** Real users saying so.

### **Transfer has no `DetailChips`** and writes `transferNote`, a different field from every other kind's `note`. Consolidating means deciding which fields a settlement legitimately has — a product question.  `DQ-13`

**The question** **Transfer has no `DetailChips`** and writes `transferNote`, a different field from every other kind's `note`. Consolidating means deciding which fields a settlement legitimately has — a product question.

**If nobody decides** Two note fields.

**What would force it** `OV-02`'s collapse, which touches the same rows.

### **Named accounts as entities** ("HDFC", "Paytm") with their own balances. Half-closed: three buckets shipped. Bank sync would need the rest.  `DQ-14`

**The question** **Named accounts as entities** ("HDFC", "Paytm") with their own balances. Half-closed: three buckets shipped. Bank sync would need the rest.

**If nobody decides** Buckets forever; `INCOME_LANDING` stays a view over `PAY_METHOD`.

**What would force it** `DQ-83`, or the first "which account?" complaint.

---

## Open questions (2/3)

_Thirty things nobody has decided. Your opinion is the answer to most of them — that is not a figure of speech, it is why they are still open._

`demo data` · about 30 min · 0/14 walked

### **The sweep's source-asset round trip** is decided and only partly built — parked *behind* the per-method baselines pass, not beside it.  `DQ-15`

**The question** **The sweep's source-asset round trip** is decided and only partly built — parked *behind* the per-method baselines pass, not beside it.

**If nobody decides** The sweep works; where the money came from is approximate.

**What would force it** Turning `auto_sweep_enabled` on for anyone.

### **Global categories, undeletable once shared.** Phase GC made them global; whether a shared category can ever be deleted is unanswered, and `OV-06` (reference by name) is blocked behind it.  `DQ-16`

**The question** **Global categories, undeletable once shared.** Phase GC made them global; whether a shared category can ever be deleted is unanswered, and `OV-06` (reference by name) is blocked behind it.

**If nobody decides** Categories stay deletable and references stay strings.

**What would force it** The first shared group where one person deletes a category the other is using.

### **`help.tsx` is a third collapsible pattern.** Converting to `SectionCard` is a real visual change.  `DQ-17`

**The question** **`help.tsx` is a third collapsible pattern.** Converting to `SectionCard` is a real visual change.

**If nobody decides** Three patterns.

**What would force it** Any Help rewrite.

### **`TransactionRow` never displays pay method.** A density question, not a bug.  `DQ-18`

**The question** **`TransactionRow` never displays pay method.** A density question, not a bug.

**If nobody decides** Not shown.

**What would force it** Real users asking "which card was that".

### **`PRAGMA foreign_keys` is OFF** on the live connection. Every `REFERENCES` clause is documentation. Flipping it needs every delete path audited first — `deletePerson` already hand-rolls a ten-column check *because* of this.  `DQ-19`

**The question** **`PRAGMA foreign_keys` is OFF** on the live connection. Every `REFERENCES` clause is documentation. Flipping it needs every delete path audited first — `deletePerson` already hand-rolls a ten-column check *because* of this.

**If nobody decides** Off. Referential integrity is a convention.

**What would force it** Any dangling-id bug in the wild.

### **Voice auto-save has no off switch**, deliberately — "add one only if it misfires in practice".  `DQ-20`

**The question** **Voice auto-save has no off switch**, deliberately — "add one only if it misfires in practice".

**If nobody decides** No switch.

**What would force it** It misfiring.

### **`DEV_TOOLS_ENABLED = true`** ships a load-demo-data / erase-everything screen in a release build. This is **deliberate for the pilot** so testers can reset the same build they were given, and `devToolsGate.test.ts` fails the suite while it is true unless `RELEASE_CHECKLIST` carries the matching unchecked blocker.  `DQ-21`

**The question** **`DEV_TOOLS_ENABLED = true`** ships a load-demo-data / erase-everything screen in a release build. This is **deliberate for the pilot** so testers can reset the same build they were given, and `devToolsGate.test.ts` fails the suite while it is true unless `RELEASE_CHECKLIST` carries the matching unchecked blocker.

**If nobody decides** It stays true and the guard keeps complaining, which is the design.

**What would force it** App Store upload. Flip one constant.

### **`VOICE_SHORTCUT_URL` is `null`**, so a flagged-on feature's one-tap install is dead and only the four-step manual setup works. This needs a *hosted file*, not a code change.  `DQ-22`

**The question** **`VOICE_SHORTCUT_URL` is `null`**, so a flagged-on feature's one-tap install is dead and only the four-step manual setup works. This needs a *hosted file*, not a code change.

**If nobody decides** Manual setup only, for a feature most people will not find.

**What would force it** Hosting the `.shortcut`, or App Intents making the whole apparatus deletable.

### **`expo-file-system` legacy API** — the suite proves nothing either way, because jest stubs it. Downgraded from a blocker, not closed.  `DQ-23`

**The question** **`expo-file-system` legacy API** — the suite proves nothing either way, because jest stubs it. Downgraded from a blocker, not closed.

**If nobody decides** Keep using it until it breaks.

**What would force it** An Expo upgrade that removes it.

### Paid Apple Developer account, $99/yr  `DQ-80`

**The question** Paid Apple Developer account, $99/yr

**Waiting on** Apple

**Effect today** Gates TestFlight, the friend pilot, push, App Intents and the widget. A free Apple ID covers the first four steps of `RELEASE §0`. Deferred 2026-09-01.

### Google OAuth **CASA Tier-3** for `gmail.readonly`  `DQ-81`

**The question** Google OAuth **CASA Tier-3** for `gmail.readonly`

**Waiting on** Google

**Effect today** Blocks live email ingestion. A workaround exists: an OAuth client in Testing mode, ≤100 manual test users, behind a beta flag.

### The GPay export format  `DQ-82`

**The question** The GPay export format

**Waiting on** Google

**Effect today** `FE-46` parses pasted text only. The parser spec is written against a real statement; on-device PDF extraction is the hard part.

### An Account Aggregator partner integration  `DQ-83`

**The question** An Account Aggregator partner integration

**Waiting on** A partner

**Effect today** **Dropped for the pilot, not deferred.** No bank feed exists and none is planned for v1.

### UPI hand-off refused by PhonePe, Paytm, Amazon Pay, WhatsApp  `DQ-84`

**The question** UPI hand-off refused by PhonePe, Paytm, Amazon Pay, WhatsApp

**Waiting on** TPAPs / NPCI

**Effect today** **Closed on our side** — every payload lever was varied, HTTPS universal links are impossible (PhonePe serves 404 at its AASA path), and the aggregator `sign=` is minted by the payee's PSP. The route round is `FE-18`. Reopens only with merchant or TPAP registration.

---

## Open questions (3/3)

_Thirty things nobody has decided. Your opinion is the answer to most of them — that is not a figure of speech, it is why they are still open._

`demo data` · about 6 min · 0/2 walked

### R2 object storage  `DQ-85`

**The question** R2 object storage

**Waiting on** A Cloudflare dashboard opt-in that asks for a card

**Effect today** KV stands in, capping backups around 25 MiB.

### Cloudflare Email Sending  `DQ-86`

**The question** Cloudflare Email Sending

**Waiting on** Workers Paid $5/mo + an owned domain

**Effect today** Brevo's free tier stands in.

---

## Individual screens and pieces

- **hero** — broken — The Name and Tag is coming way before the Animation Near Compleet or so   _(First run — step 1)_
- **name** — broken — name Field is Coming Uncder Keyboard (basically center of screen) we can make the Field Little Upper or so or like that  _(First run — step 3)_
- **income** — broken — When Do you get paid Should be a simple Date Sleector Not Speceidfic Options or So....Payment Date with All the Recurrign Options As Collapsed that if user Require He can do it From and If Does not get Paid Monthly then we can skip it or so Basically We can have a Question Before Everyt SSensbilble Input Screen Like Income,What Assets Currently You have or so and Next Screen Exact Those Fields Which he have Selected basically making it real simple interactive and addting Compelxity when required opr so  _(First run — step 4)_
- **money** — broken — WHY THERE HOW DO YOU [PAY MOST WITH SECTION OR SO AND There are not all the options or so and also the bottom Continue Skip have too much Bottom Spacing marging or so feels weiredthat screen is suddenly Cutoff  _(First run — step 5)_
- **budget** — broken — Basic Suggestion of Income IS fine if they have selected Otehr wise blank or or like that  _(First run — step 7)_
- **people (skipped for the personal persona)** — broken — Dont Give Options TO Create Group With Those Fireidls It Can be  addtional Step IF they want to here just add people you generally trnact with or so....Here name and email if they want to link to a real otehr exising user or so and And Later In seetings A Friend Can have all other informations Like Account Number Other IDetifiers(unique only) if requiref dor make sense to Identify Transactions in Future or Detect as a fucntion in laqter fuction can be noted addtionaly  _(First run — step 8)_
- **permissions + summary** — broken — I think We Can Remove The ShortCut things as soon I will Integrate Siri Intent or so and all and Summary Should Be More Sensbike aand akk and I said Skip after adding Friends still asking me to Create a cgroup in summary(auto)  _(First run — step 9)_
- **SC-04** — broken — In perosnal I can see Recurring Shopuld it have??? Recurring inCOme  and I thinK the Basica Concept of Expense,Income,Transfer,Invest I lost Invest or so and all  I think i forgot that or so and all need to think a bit   _(Every empty state)_
- **SC-05** — broken — Proper Flow Of Assets aand Invemtments and In Account or so aif anything Means Nedds tbe To BlE ClearlY Denined on a single Shout Plans Feels too Complex  _(Every empty state)_
- **SC-07** — broken — The Option Opening IN Add Like Notes Tags Onr In split is not faste enough The COmponent go then Keyboard is going or like thatother wise Mpotly Fine Just the Catgory The Awwroe in that compionent can be in complete right abnd Year Selctor Can be given IN Select Date From Top ofClick year or buttom or like that I dont KNow How IOS Gives or so If I selecta. adate INcaladar it goes Back The Add Exapense COmponent is NO bottom Black Screen broken  or reduced or so  and The Calculator Needs to feels Imple or so Curretly Feels Too COmplex Calcualtor Can be bemade too Easy for any one will do in last and  and Every Month is not getting Off once opened(basically Repeat or so  and Tags can be saved or so So later it can be Used faster oor so Most used ones or like that or based on Catgory or IN genrall Inlegence can be added later or so  How and Ehern We can have the repeat in last (in the 3) and AUto Pay is not how...BasicallY how is Through Wht Asset BASICALLY SO WE CAN REDUCE FROM THAT OR SO ...REPEAT IS AUTO PAY AUTOMATICALYY(CHHOSEN AUTO DEDUCT INSIDE IT) AND I THINK TIME CAN A PART OF THE TOP RIGHT TODAQY OR DATE TIME AND IN TRANSFER WHY Even Chaning Arrow is allowed until Bo0th Person are not Selected and No abalance between them does this required if nothing exist or so and all...and Try to make it like Consistent why Component Plcainfg Coming and Goig n A ine or or section and changinf Sizes feels UI Broken and all So IN stransfer ONce time thing will be added in Date thing Component or SO Bsically a Date Time COmponent(dynamic wikl be there with Year and Month Selector ) Options and all and Then how will be the main thin tansfer and Income ahve bottom line otehr s dont Feels weired and Based On Auto Catgory or so Select How or so if possible (as a later v ersiuon if not sposisble today just note it)How Was it Paid Selcct Component Cna be vertical and betetr rather than Horixozn Scroll or so   _(Every empty state)_
- **SC-09** — broken — In a normal Group EMpty Sates ICon Feels Fine and akkl Member looks Too COmplex and SOme BUnch of rows Should Be proeprlY Designed always or so   _(Every empty state)_
- **SC-11** — broken — Issue smNtione dBaove  _(Every empty state)_
- **SC-13** — broken — Dind Liek Group Edit Add ALl Bunch Rows and Boxeds =No proepr UI UIx at all or so   _(Every empty state)_
- **SC-14** — broken — Mentione dissues already Rwcccurign Related and EMpty State related or so and all  _(Every empty state)_
- **SC-20** — broken  _(Every empty state)_
- **SC-22** — broken — Graph Removed I think Make it work BCak with solid and Dashabed Line or o and A yellow B ad UI UX line Warning Coming Can be betetr and SHould not come at all when 0 transaactions os so (exopense or so)  _(Every empty state)_
- **SC-18** — broken — UI UX Can be alot better betetr colors View or Potion or so  _(Every empty state)_
- **SC-19** — broken — It doent COme If nothing to review  _(Every empty state)_
- **SC-26** — broken — Not ABle to Remove Sanvika Why even when evything is Settloeed Up or so or like that...Can Be Archived or so???  _(Every empty state)_
- **SC-40** — broken — UI UX Needs to Improved For Adeded Data RIght Now Its Not IN View Thats It becusse EMpty Data  _(Every empty state)_
- **intent** — fine — Intent Feels Fine For Now but we need to Adjust Features Design based ON Intent Better Feature menaganemnt should be there  _(First run — step 2)_
- **pay** — fine — Yes the lst THInfg Fucked Up this one make sens e but we need to have otehr ways If possible or so and Better color dterministic Icons or so  _(First run — step 6)_
- **cold-1** — noted — In Empty States In persona l grouop or so nd akk the icons and all are changing Postion in For example in Activity thae Emtpy STate Icome COming ABove a bit while in buttdet a little Lowerthings changes shiould feels kmooth or so  _(Every empty state)_
- **SC-03** — fine — Mostly Fine  _(Every empty state)_
- **SC-06** — fine — Mostly Feels Fine As A Option But Segreegation of Options and Clarirty Between Options can be better  _(Every empty state)_
- **SC-08** — fine — Mostly Nice Edit of lIne Items UI UX can be cleaner or so and all othejr wise   _(Every empty state)_
- **SC-10** — fine — Mostly Fine But too Much Text But NEeds to have aClarity or Sections Whats AN Expense Budget and Whats N Investment Or Such Budget or as All paymkent are not Expense or so or like that...I dont Even KNow wshould we even Consider that In Budget or so I hink we should or so and all and We should have Expenable Income As a tag Like All Income is Growth of Asset is Not Alwasy Exoandable oir needs Clkarity opver thi or so and Too Much Descripotion or so Collapsed ON Screen of Budhet Any where too Much Static OCmntext Can be added a top "?" ehlp or giuide kiund of thing...at top We can show the default Choosencadence and below in 3 colorsw we can show Daily,Mongthly,Yearly and iN monthly mentioned (daoily added) and IN yearly Daily and Monthly Added)  _(Every empty state)_
- **SC-10b** — fine — Empty Is Fine Explained ABove  _(Every empty state)_
- **SC-16** — fine — No Catgories Coming UNtil I dont Spend Or we can show Any Top 3 Until some one expens in that Not a Priority thing but still for later or so   _(Every empty state)_
- **SC-17** — fine — No Goal AExist if datat is empty or so  _(Every empty state)_
- **SC-21** — fine — Data Not Present No Docnus or aso and IN Reporrts the Groups can be collapsed by Deafult and can be segregated as group or so   _(Every empty state)_
- **SC-32** — fine  _(Every empty state)_
- **SC-33** — fine  _(Every empty state)_
- **SC-41** — fine  _(Every empty state)_
- **SC-42** — fine — UI UX Wise fine otehr wise needs a proepr Outline Clarity or so   _(Every empty state)_
- **SC-15** — fine — No Existy or so  _(Every empty state)_
- **SC-23** — fine — Filter UI UX can a little better or so  _(Every empty state)_
- **SC-25** — fine — Here the Same Section Cn be done Like We were thing ABout In Budget As SOme things Might Not be Expense Like  INvestment and SIP or so or like that Clarity baseically needed It willa uto Cascade to Budget and Asset or Add OPnc ecome  _(Every empty state)_
- **SC-26a** — fine — Emptu Doent Come  _(Every empty state)_
- **SC-28** — fine — Fine I think Mpstly Copvered  _(Every empty state)_
- **SC-38** — fine — Empty State Doent Exist  _(Every empty state)_

---

<!-- Paste this whole file back into the walkthrough (Markdown → Restore) to
     put these answers into another browser. Everything below is machine-read. -->

```bsw-state
{"v":2,"ans":{"FL-01":{"numbers":"skip","look":"broken","behave":"off","data":"wrong","note":"And Why The Income I added Is haaventot comes as A recurring Transaction or o or like that and Income things can have a Dropdown Options or like that asaying Addtiona Income Basically a smaller version of Add Income or so or like that But Interqactive or so and aklk"},"EMPTY::SC-35":{"look":""},"FL:FL-01::S1":{"look":"broken","note":"The Name and Tag is coming way before the Animation Near Compleet or so "},"FL:FL-01::S2":{"look":"fine","note":"Intent Feels Fine For Now but we need to Adjust Features Design based ON Intent Better Feature menaganemnt should be there"},"FL:FL-01::S3":{"look":"broken","note":"name Field is Coming Uncder Keyboard (basically center of screen) we can make the Field Little Upper or so or like that"},"FL:FL-01::S4":{"look":"broken","note":"When Do you get paid Should be a simple Date Sleector Not Speceidfic Options or So....Payment Date with All the Recurrign Options As Collapsed that if user Require He can do it From and If Does not get Paid Monthly then we can skip it or so Basically We can have a Question Before Everyt SSensbilble Input Screen Like Income,What Assets Currently You have or so and Next Screen Exact Those Fields Which he have Selected basically making it real simple interactive and addting Compelxity when required opr so"},"FL:FL-01::S5":{"look":"broken","note":"WHY THERE HOW DO YOU [PAY MOST WITH SECTION OR SO AND There are not all the options or so and also the bottom Continue Skip have too much Bottom Spacing marging or so feels weiredthat screen is suddenly Cutoff"},"FL:FL-01::S6":{"look":"fine","note":"Yes the lst THInfg Fucked Up this one make sens e but we need to have otehr ways If possible or so and Better color dterministic Icons or so"},"FL:FL-01::S7":{"look":"broken","note":"Basic Suggestion of Income IS fine if they have selected Otehr wise blank or or like that"},"FL:FL-01::S8":{"look":"broken","note":"Dont Give Options TO Create Group With Those Fireidls It Can be  addtional Step IF they want to here just add people you generally trnact with or so....Here name and email if they want to link to a real otehr exising user or so and And Later In seetings A Friend Can have all other informations Like Account Number Other IDetifiers(unique only) if requiref dor make sense to Identify Transactions in Future or Detect as a fucntion in laqter fuction can be noted addtionaly"},"FL:FL-01::S9":{"look":"broken","note":"I think We Can Remove The ShortCut things as soon I will Integrate Siri Intent or so and all and Summary Should Be More Sensbike aand akk and I said Skip after adding Friends still asking me to Create a cgroup in summary(auto)"},"BOOK::cold-1":{"note":"In Empty States In persona l grouop or so nd akk the icons and all are changing Postion in For example in Activity thae Emtpy STate Icome COming ABove a bit while in buttdet a little Lowerthings changes shiould feels kmooth or so"},"EMPTY::SC-04":{"look":"broken","note":"In perosnal I can see Recurring Shopuld it have??? Recurring inCOme  and I thinK the Basica Concept of Expense,Income,Transfer,Invest I lost Invest or so and all  I think i forgot that or so and all need to think a bit "},"EMPTY::SC-03":{"look":"fine","note":"Mostly Fine"},"EMPTY::SC-05":{"look":"broken","note":"Proper Flow Of Assets aand Invemtments and In Account or so aif anything Means Nedds tbe To BlE ClearlY Denined on a single Shout Plans Feels too Complex"},"EMPTY::SC-06":{"look":"fine","note":"Mostly Feels Fine As A Option But Segreegation of Options and Clarirty Between Options can be better"},"EMPTY::SC-07":{"look":"broken","note":"The Option Opening IN Add Like Notes Tags Onr In split is not faste enough The COmponent go then Keyboard is going or like thatother wise Mpotly Fine Just the Catgory The Awwroe in that compionent can be in complete right abnd Year Selctor Can be given IN Select Date From Top ofClick year or buttom or like that I dont KNow How IOS Gives or so If I selecta. adate INcaladar it goes Back The Add Exapense COmponent is NO bottom Black Screen broken  or reduced or so  and The Calculator Needs to feels Imple or so Curretly Feels Too COmplex Calcualtor Can be bemade too Easy for any one will do in last and  and Every Month is not getting Off once opened(basically Repeat or so  and Tags can be saved or so So later it can be Used faster oor so Most used ones or like that or based on Catgory or IN genrall Inlegence can be added later or so  How and Ehern We can have the repeat in last (in the 3) and AUto Pay is not how...BasicallY how is Through Wht Asset BASICALLY SO WE CAN REDUCE FROM THAT OR SO ...REPEAT IS AUTO PAY AUTOMATICALYY(CHHOSEN AUTO DEDUCT INSIDE IT) AND I THINK TIME CAN A PART OF THE TOP RIGHT TODAQY OR DATE TIME AND IN TRANSFER WHY Even Chaning Arrow is allowed until Bo0th Person are not Selected and No abalance between them does this required if nothing exist or so and all...and Try to make it like Consistent why Component Plcainfg Coming and Goig n A ine or or section and changinf Sizes feels UI Broken and all So IN stransfer ONce time thing will be added in Date thing Component or SO Bsically a Date Time COmponent(dynamic wikl be there with Year and Month Selector ) Options and all and Then how will be the main thin tansfer and Income ahve bottom line otehr s dont Feels weired and Based On Auto Catgory or so Select How or so if possible (as a later v ersiuon if not sposisble today just note it)How Was it Paid Selcct Component Cna be vertical and betetr rather than Horixozn Scroll or so "},"EMPTY::SC-08":{"look":"fine","note":"Mostly Nice Edit of lIne Items UI UX can be cleaner or so and all othejr wise "},"EMPTY::SC-09":{"look":"broken","note":"In a normal Group EMpty Sates ICon Feels Fine and akkl Member looks Too COmplex and SOme BUnch of rows Should Be proeprlY Designed always or so "},"EMPTY::SC-10":{"look":"fine","note":"Mostly Fine But too Much Text But NEeds to have aClarity or Sections Whats AN Expense Budget and Whats N Investment Or Such Budget or as All paymkent are not Expense or so or like that...I dont Even KNow wshould we even Consider that In Budget or so I hink we should or so and all and We should have Expenable Income As a tag Like All Income is Growth of Asset is Not Alwasy Exoandable oir needs Clkarity opver thi or so and Too Much Descripotion or so Collapsed ON Screen of Budhet Any where too Much Static OCmntext Can be added a top \"?\" ehlp or giuide kiund of thing...at top We can show the default Choosencadence and below in 3 colorsw we can show Daily,Mongthly,Yearly and iN monthly mentioned (daoily added) and IN yearly Daily and Monthly Added)"},"EMPTY::SC-10b":{"look":"fine","note":"Empty Is Fine Explained ABove"},"EMPTY::SC-11":{"look":"broken","note":"Issue smNtione dBaove"},"EMPTY::SC-13":{"look":"broken","note":"Dind Liek Group Edit Add ALl Bunch Rows and Boxeds =No proepr UI UIx at all or so "},"EMPTY::SC-14":{"look":"broken","note":"Mentione dissues already Rwcccurign Related and EMpty State related or so and all"},"EMPTY::SC-16":{"look":"fine","note":"No Catgories Coming UNtil I dont Spend Or we can show Any Top 3 Until some one expens in that Not a Priority thing but still for later or so "},"EMPTY::SC-20":{"look":"broken"},"EMPTY::SC-17":{"look":"fine","note":"No Goal AExist if datat is empty or so"},"EMPTY::SC-21":{"look":"fine","note":"Data Not Present No Docnus or aso and IN Reporrts the Groups can be collapsed by Deafult and can be segregated as group or so "},"EMPTY::SC-32":{"look":"fine"},"EMPTY::SC-22":{"look":"broken","note":"Graph Removed I think Make it work BCak with solid and Dashabed Line or o and A yellow B ad UI UX line Warning Coming Can be betetr and SHould not come at all when 0 transaactions os so (exopense or so)"},"EMPTY::SC-33":{"look":"fine"},"EMPTY::SC-41":{"look":"fine"},"EMPTY::SC-42":{"look":"fine","note":"UI UX Wise fine otehr wise needs a proepr Outline Clarity or so "},"EMPTY::SC-15":{"look":"fine","note":"No Existy or so"},"EMPTY::SC-18":{"look":"broken","note":"UI UX Can be alot better betetr colors View or Potion or so"},"EMPTY::SC-19":{"look":"broken","note":"It doent COme If nothing to review"},"EMPTY::SC-23":{"look":"fine","note":"Filter UI UX can a little better or so"},"EMPTY::SC-25":{"look":"fine","note":"Here the Same Section Cn be done Like We were thing ABout In Budget As SOme things Might Not be Expense Like  INvestment and SIP or so or like that Clarity baseically needed It willa uto Cascade to Budget and Asset or Add OPnc ecome"},"EMPTY::SC-26":{"look":"broken","note":"Not ABle to Remove Sanvika Why even when evything is Settloeed Up or so or like that...Can Be Archived or so???"},"EMPTY::SC-26a":{"look":"fine","note":"Emptu Doent Come"},"EMPTY::SC-28":{"look":"fine","note":"Fine I think Mpstly Copvered"},"EMPTY::SC-40":{"look":"broken","note":"UI UX Needs to Improved For Adeded Data RIght Now Its Not IN View Thats It becusse EMpty Data"},"EMPTY::SC-38":{"look":"fine","note":"Empty State Doent Exist"},"EMPTY":{"look":"off"}},"finds":[]}
```
