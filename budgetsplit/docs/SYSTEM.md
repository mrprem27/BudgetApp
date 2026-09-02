# SYSTEM.md

**The application as one sheet: entities, features, flows, scenarios, decisions.**

This is the map. `SCREENS.md` describes what each screen looks like; `RELEASE_CHECKLIST.md`
tracks what is left before shipping; `AGENTS.md` is how the code gets built. This document
answers *what the thing is*, and it is the one you cite when something is wrong.

**Browsable version:** <https://claude.ai/code/artifact/027bb3db-e0b3-4a63-85b8-b38432cc1f2a>
— the same content, organised by what the app *does* rather than by id namespace, with a
copyable issue template on every entry. It is **generated from this file**, never hand-written:

```
node scripts/build-system-map.js out.html      # parses this document into the page
node scripts/smoke-system-map.js out.html      # renders every view, checks nothing throws
```

Run both after editing this file, then republish to the same URL. A hand-copied page would
reintroduce exactly the drift this document exists to end.

---

## §0 · Using this document

`Last verified: 2026-09-01 · Guarded by: docIdGraph.test.ts`

### The ID legend

| Prefix | Is | Example | Answers |
|---|---|---|---|
| `E-` | An entity — a noun the app has | `E-04` txn | "What *is* a transaction, exactly?" |
| `AX-` | An axis — a question askable of any row | `AX-03` balance scope | "What dimensions vary?" |
| `IV-` | An invariant — a rule that must hold | `IV-08` your share is your spending | "What is never allowed to be false?" |
| `FE-` | A feature — a user-facing capability | `FE-12` itemized split | "Does the app do X, and is it live?" |
| `SC-` | A screen — one route | `SC-19` `/review` | "Where does this live?" |
| `FL-` | A flow — a verb, a task with a beginning and an end | `FL-04` add an expense | "How does someone do X?" |
| `SN-` | A scenario ladder — every case for one flow, T0→T4 | `SN-04` | "What happens when it goes wrong?" |
| `OV-` | An overlap — duplication, overload or a phantom | `OV-02` settlement means four things | "Why is this confusing?" |
| `DQ-` | An open decision — a question with no answer yet | `DQ-19` foreign keys are off | "What have we not decided?" |

`E-` numbering: `01–49` table-backed · `50–79` derived, no table · `80–99` device, external or wire.

### Sub-IDs

A flow's parts are addressable, because that is the resolution a UI/UX problem actually lives at:

```
FL-04.E5    entry point 5 into flow 4
FL-04.S2    step 2
FL-04.B1    branch 1
FL-04.FM3   failure mode 3
SN-04.T3c   scenario ladder, tier 3, row c
```

### Filing an issue

Cite the ID and say what is wrong with it. The ID is the shared name; the prose can change under it.

```
Where:    FL-06.E7  (settle-up entered from the Groups friends strip)
What:     lands on Add with `to` set but no `groupId`, so the destination
          pill reads "Personal" and the settlement writes into the wrong scope
Expected: the group that carries the balance, per E-52
Related:  OV-08 (/add/quick takes 11 params), AX-03
```

Two shapes that come up often enough to name:

- **"`E-nn` and `E-mm` are the same thing."** → an `OV-` of kind `alias-sprawl`. Say which name you
  want to keep.
- **"`FL-nn` takes too many steps."** → check the step count in the flow's header. The cap is 9; if
  it is under 9 and still feels long, that is a real finding and the cap is wrong for this flow.

### Which section answers which question

| Question | Section |
|---|---|
| What is this noun, and what is it *not*? | §2 |
| What happens to X when I delete Y? | §3 |
| What is never allowed to be false? | §5 |
| Does the app do X? Is it on? | §6 |
| How do I get there? How many ways are there? | §7 |
| How does someone actually do X, and what can go wrong? | §8, §9 |
| Why does this feel needlessly complicated? | §10 |
| Why has nobody fixed this? | §11 |
| I have an old `V2-14` / `DEBT-11` reference — where did it go? | §12 |

### Walking the app

Every task in §8 carries a **`State.`** line naming which of three base states it can be walked in.
Getting into each takes one tap, from Settings → tap the version seven times → `/storage`.

| Sweep | State | How | Only testable here |
|---|---|---|---|
| **1 · Cold** | empty | **Erase all data** | First run, and **every empty state**. Demo data can never show you these |
| **2 · Loaded** | demo | **Load demo data** | Every populated surface at once. Most of the app, and the fastest sweep |
| **3 · Hands-on** | yours | build on top of demo | The write paths, where the point is watching a **number move** |

⚠️ **Load demo data wipes the database.** It preserves only your name and avatar.

#### The booklets

The browsable version turns this document into **32 small booklets**, four to eight stops each,
finishable in a sitting. Take any one from the shelf, or start at the top and it carries you
through. They are assembled by `scripts/build-system-map.js`, not written by hand.

| Booklet kind | Made of |
|---|---|
| *`<area>` · the screens* | Open each screen, check the pieces on it, check its empty state |
| *`<area>` · doing it* | The tasks in §8 — where to start, the steps, what should happen |
| First run and empty states | The one booklet needing a wiped app |
| Rules that must hold | The 22 in §5, as cross-screen checks |
| Known problems | The 27 in §10 — is each still true? |
| Open questions | The 30 in §11 — your opinion is the answer |

**Every screen, task, component, rule, finding and open question is in exactly one booklet**, and
`coverage.test.ts` fails if any falls out. That test builds the booklets with the real builder
rather than reimplementing the rule, because two implementations of one rule is how they start
disagreeing — which is the subject of this whole document.

**Components** are new here. The builder walks the import graph out from every route, then gives
each component **one home**: the screen that reaches it with the fewest components, which is the
most specific screen using it. Listing all 48 that `/add/quick` pulls in would be useless. Only
`finance/` and `system/` components are named on a stop; the `ui/` primitives render everywhere and
a broken one is obvious the moment you open anything.

That map also found two components nothing imported — `Stagger` and `ContextPill` — which
`AGENTS.md` §11 says to delete rather than keep. `deadComponents.test.ts` now enforces that rule
instead of relying on somebody noticing.

#### What the demo dataset actually contains

`src/db/seedDemo.ts` is built for exactly this — *"a rich, realistic dataset that exercises every
surface."* Cite it by name in a `State.` line rather than saying "a group with a balance":

| | |
|---|---|
| **People** | Aarav · Priya · Rohan · Sneha · Vikram |
| **Groups** | Personal · **Roommates** (equal splits, part-settled) · **Goa Trip** (exact + shares + an itemized bill, **simplify OFF**) · **Office Lunch** (fully settled) · **Family** (you owe *them*) · **Manali Trip** (settled back) · **Weekend Plans** (deliberately empty) · **Old Flat** (archived) |
| **Budgets** | Groceries ₹9,000 spent vs ₹8,000 → **over** · Eating Out ₹2,700 vs ₹3,000 → **near** · Fuel ₹1,500 vs ₹4,000 → **under** · plus daily and yearly cadences |
| **Recurring** | Netflix, Spotify, rent auto-pay, weekly cleaning, a 90-day custom interval · Gym is **paused** · an old prepaid plan is **ended** · three due within 3 days · Prime Video repeats un-ruled, to be detected |
| **Goals** | Emergency Fund 40%, **locked** · Goa Trip Fund **100%** · New Laptop 19% · Europe Vacation, with a **withdrawal** · Anniversary Gift **120% overfunded** · Tax Payment, deadline **already past** · Weekend Getaway at **97.5% — add ₹500 to fire the celebration** · New Phone at **0%** |
| **Money** | ₹2,10,000 bank · ₹45,000 cash · ₹45,000 wallet · ₹10,000 of ₹60,000 credit used · assets: index funds, gold, an FD |
| **Peers** | **Aarav is trusted**, so his expense applied on arrival · **Priya is on review**, so hers waits and counts nowhere · a transfer from Aarav **still waits, though he is trusted** · **Rohan disputes** an entry you wrote |
| **Inbox** | 9 rows waiting in Review — 6 from Google Pay, 3 from email alerts, some pre-categorised, some not |
| **Edges** | a ₹5 expense · a ₹65,000 one · a soft-deleted row · a row labelled *"Delete me — tests the Undo toast"* · `Poker Night`, a category **Aarav used that you do not have** |

The peer rows are the part worth knowing about: **approvals, disputes and trust are walkable on one
phone.** Only real sync — pushing, pulling, sharing a group, accepting an invite, signing in —
genuinely needs a second device.

### Reading it honestly

Every section carries a `Last verified` date and the test that holds it to the code. A section
that says **`Guarded by: nothing — read with suspicion`** is prose, and prose drifts. That line is
not decoration: this document exists because ten other documents said things that had stopped being
true, and two of them still asserted that sync did not exist while the sync engine was deployed.

**Not yet written:** nothing. All twelve sections are complete as of 2026-09-01. A section that is
not yet written is listed here by name and date — never left as an empty heading, because an empty
heading is how a document starts lying.

---

## §1 · The application, in one page

`Last verified: 2026-09-01 · Guarded by: countClaims.test.ts (counts only)`

### What it is

A **personal-finance app and a bill-splitting app in one**, local-first, for the India pilot.
44 screens, 22 SQLite tables, 111 `src/lib` modules, 16 feature flags.

The two halves are not bolted together — they share one ledger and are kept honest by one rule
(§5 `IV-08`): **the group ledger records what happened; your personal ledger records what it cost
you.** Fronting a ₹4,000 dinner for five does not mean you spent ₹4,000. You spent ₹800 and are owed
₹3,200. Every analysis surface in the app already reads it that way.

### Three money worlds

| World | Question it answers | Root entities |
|---|---|---|
| **Personal** | What did I spend, on what, against what budget? | `E-02` (the personal group) · `E-04` · `E-12` |
| **Shared** | Who owes whom, and for what? | `E-02` (shared groups) · `E-03` · `E-06` · `E-07` · `E-50` |
| **Net worth** | What do I have, where is it, and what is it doing? | `E-14` assets · `E-15` goals · `E-54` total money |

They meet in exactly two places: `myShareOf` (`lib/splitMath.ts`), which converts a shared event
into a personal cost, and `E-54`, which converts everything into one position.

### What it deliberately is not

- **Not account-required.** The app is fully usable with no sign-in. An account buys off-device
  backup and shared-group sync, nothing else.
- **Not bank-connected.** No Account Aggregator, no bank feed, no automatic transaction import from
  a live account. Money gets in by typing, voice, receipt scan, QR, or a statement file you supply.
  This is a decision, not a gap — see `DQ-83`.
- **Not a subscription tracker with its own model.** A subscription *is* a recurring rule (`OV-03`).
- **Not ad-supported and not monetised at all today.** There is no paywall, no entitlement, no IAP.
  Feature flags are **user preferences, never entitlements** — do not repurpose them (`DQ-01`).
- **Not a debt collector.** It will draft a WhatsApp reminder for you. It will not chase anyone.

### Egress — everything that leaves the device

| Destination | What | When | Gate |
|---|---|---|---|
| `server/api` (own Worker) | Email address, encrypted backup blob, sealed group entries, device public key | Sign-in, backup, sync | Account + `EXPO_PUBLIC_API_URL` |
| `server/receipt-ocr-proxy` (own Worker → Gemini) | One receipt image | Tapping Scan receipt with the cloud provider selected | `FE-03`, `ocr_provider = gemini` |
| The user's UPI app | A `upi://pay` intent | Tapping Pay via UPI | `FE-17` |
| WhatsApp | A drafted message, composed not sent | Tapping the reminder | `FE-20` |
| The OS share sheet | A CSV / PDF / backup file the user chose to export | Export | — |

Nothing else. No analytics SDK, no crash reporter, no ad network, no third-party telemetry. Receipt
photos never sync (`SYNC-F4`); balances never travel (`E-50`).

### The shape of the data

One SQLite database, `budgetsplit.db`, opened by `SQLiteProvider` at the root. It is the single
source of truth — there is no Redux, no React Query, no in-memory mirror. Reads go through
`src/db/queries/` (23 modules); pure logic lives in `src/lib/` (111 modules) and touches neither
React nor the database.

**Foreign keys are OFF** on every connection (`applyConnectionPragmas`). Every `REFERENCES` clause
in the schema is documentation, not enforcement — which is why §3's cascade table is written from
the code that deletes, not from the DDL. See `DQ-19`.

### Pilot scope

India, invite-only, not public. Currency is INR and there is no picker (`OV-23`). iOS is the pilot
platform; the Android port has named blockers (OCR is Apple Vision; UPI hand-off is untested there,
`DQ-11`). Two things gate going public and neither is engineering work we control: an Account
Aggregator partner and a Gmail OAuth CASA Tier-3 assessment (`DQ-81`, `DQ-83`).
---

## §2 · Entity dictionary

`Last verified: 2026-09-01 · Guarded by: entityCoverage.test.ts (existence), by hand (accuracy)`

53 entities: 22 table-backed, 18 derived, 13 device/external/wire.

Every entry carries the same fields. `—` means empty, and **empty is information**: an entity that
references nothing and is referenced by nothing is a leaf, and one whose `Sync` line is `—` cannot
travel. The **`Is not`** field is the reason this section exists — it is where a concept gets
fenced off from the four other concepts wearing its name.

Storage cites `file:line`. It does **not** reproduce the DDL: `src/db/schema.ts` is the authority on
columns, and copying them here would guarantee drift the guard cannot see.

### The 22 tables at a glance

| | | | |
|---|---|---|---|
| `E-01` person | `E-02` budget_group | `E-03` group_member | `E-04` txn |
| `E-05` recur_skip | `E-06` txn_payment | `E-07` txn_share | `E-08` line_item |
| `E-09` category | `E-10` category_tombstone | `E-11` settings | `E-12` category_budget |
| `E-13` audit_log | `E-14` asset | `E-15` savings_goal | `E-16` savings_txn |
| `E-17` pending_txn | `E-18` sync_outbox | `E-19` friend_request | `E-20` txn_approval |
| `E-21` person_group_trust | `E-22` txn_dispute | | |

---

### E-01 · person — a human, including you

```
Definition.    One human the app knows about: you, a friend, or a group member.
Is not.        · Not an account. An account is E-87, and person.remote_uid is the
                 only thread between them. Most people have none.
               · Not a member — membership is E-03, and a person who left a group
                 is still a person with a balance.
               · Not a contact record. There is no address book import, no
                 directory, and no lookup by email.
Storage.       `person`, src/db/schema.ts:16-26 + migrations :420-573.
Identity.      id TEXT PK, uuid. Exactly one row has is_me = 1 (SYNC-F5 is what
               happens when that stops being true). remote_uid is UNIQUE-partial.
Owned by.      Nothing. A root.
References.    —
Referenced by. E-03 · E-06 · E-07 · E-12 (person_id) · E-19 · E-21 · E-22
               · E-02 (created_by, pair_person_id) · E-04 (author_person_id)
Lifecycle.     created → named → [linked to an account: remote_uid set]
               → [receivable written off] → merged into another person, or deleted
Create.        You, on SC-26 / SC-11. Sync, when a roster names someone you lack.
Edit.          You. Name, avatar colour, photo, UPI VPA, email, mobile.
Delete.        Refused three ways: never yourself (is_me), never someone with a
               linked account (their entries can arrive at any time), and never
               anyone referenced anywhere. That last check counts ten columns
               across eight tables in one statement (persons.ts:102-117) —
               because foreign keys are off (DQ-19), so a reference it missed
               would be a dangling id nothing else would catch. Otherwise the
               verb is merge, not delete.
Sync.          Travels as a RosterMember (E-88) — a third shape, not this row.
Aliases.       person · friend · member · roster member · contact · counterparty
               · payer · sharer · linked person.  Nine.  OV-05.
Surfaces.      SC-26 · SC-26a · SC-11 · SC-38 · SC-04 (balance chips)
Invariants.    IV-10 trust is per person · IV-11 no remote_uid means no write path
Open.          OV-05 · DQ-08 (email is the only identity)
```

### E-02 · budget_group — a ledger scope

```
Definition.    A scope every transaction belongs to: Personal, a shared group, or
               a pair group standing in for one friend.
Is not.        · Not a container of people, primarily. It is a container of money
                 events; E-03 is what makes it social.
               · Not optional. txn.group_id is NOT NULL — there is no ungrouped
                 transaction, and "personal spending" is a group with is_personal = 1.
               · Not a budget. Its own limit_daily/monthly/yearly columns are dead
                 (OV-23); budgets are E-12.
               · Not always visible. A pair group is created on demand to hold a
                 two-person balance and is not listed anywhere.
Storage.       `budget_group`, src/db/schema.ts:28-54 + migrations :437-607.
Identity.      id TEXT PK. idx_group_pair makes pair_person_id UNIQUE where set.
Owned by.      Nothing. A root. created_by is immutable and always an admin.
References.    E-01 created_by · E-01 pair_person_id
Referenced by. E-03 · E-04 · E-12 · E-13 · E-17 (dest_group_id) · E-18 · E-21
Lifecycle.     created → shared (a key is wrapped, E-88) → archived → deleted
               A group has three end states that are not the same thing, and
               conflating them is a real bug source: archived (hidden, still
               yours), left (you are out, it goes on without you), deleted
               (tombstoned for everyone). OV-11.
Create.        You. Also the launch invariant, which guarantees a personal group.
Edit.          Admins (E-64). Name, icon, colour, default split, simplify-debt.
Delete.        The creator only, and never the personal group. It is a
               **tombstone, not a wipe**: deleted_at + is_archived are set and
               the entries stay. It used to hard-delete every txn, share and
               payment, which silently rewrote the deleter's own closed months —
               and the group came back anyway, because the cursor was deleted and
               the next pull re-adopted it from the roster as an empty husk.
               `unarchiveGroup` refuses a group carrying deleted_at, so this
               cannot be walked back. groups.ts:324-406.
Sync.          Travels as a roster doc (E-88), separately from its entries.
Aliases.       group · budget group · scope · ledger · tab · the Personal group.
Surfaces.      SC-04 · SC-09 · SC-13 · SC-14 · SC-10b
Invariants.    IV-16 income is never grouped
Open.          OV-11 three end states · OV-23 dead limit columns
```

### E-03 · group_member — one person's membership of one group

```
Definition.    The fact that a person belongs to a group, and in what role.
Is not.        · Not the person (E-01), and not a copy of them.
               · Not a permission set — E-64 derives what someone may do from
                 this plus created_by.
               · Not hard-deleted on removal. deleted_at is set, because a
                 departed member's past shares still have to resolve.
Storage.       `group_member`, src/db/schema.ts:56-61 + migrations :530-607.
Identity.      PK (group_id, person_id). One row per pair, ever.
Owned by.      E-02.
References.    E-02 · E-01
Referenced by. E-64
Lifecycle.     joined → role changed → removed (deleted_at set) → re-added
Create.        Admins, on SC-11. Sync, when a roster gains someone.
Edit.          Admins change role. `admin` | `member` only — no `owner`, because
               the creator is a column on E-02, not a role.
Delete.        Admins, soft. `memberActive()` (queries/memberSql.ts) is the one
               predicate every statement must use; memberInvariant.test.ts holds it.
Sync.          Travels inside the roster doc (E-88), version-stamped.
Aliases.       member · membership · roster entry · participant.  Four.  OV-05.
Surfaces.      SC-11 · SC-09 (Members tab)
Invariants.    IV-21 the member-active predicate
Open.          OV-05
```

### E-04 · txn — a money event, and also a recurring rule

```
Definition.    One dated money event in one group: expense, income or settlement.
Is not.        · Not a split — who paid and who owes are E-06 and E-07.
               · Not a balance — balances are derived (E-50), never stored.
               · Not a receipt — the photo is a device-local file (E-83).
               · Not always an event. recur_freq IS NOT NULL makes it a *rule*
                 that has never happened and must never be counted as spending.
                 Every money statement carries `recur_freq IS NULL`. IV-04, OV-03.
               · Not one kind of thing when kind = 'settlement': that value means
                 a debt settle-up, a card repayment, an asset purchase or a plain
                 transfer, and one filter treats all four alike. OV-02.
Storage.       `txn`, src/db/schema.ts:63-89 (31 cols) + rebuild :1183-1220.
Identity.      id TEXT PK, uuid, client-minted. A materialized occurrence takes
               the rule's id with an `_n` suffix — which is why E-59 is derived
               and not stored.
Owned by.      E-02 (group_id NOT NULL).
References.    E-02 · E-09 BY NAME (not an FK — OV-06) · E-04 parent_recur_id
               (self) · E-14 asset_id · E-01 author_person_id (NULL = me)
Referenced by. E-06 · E-07 · E-08 · E-05 · E-18 · E-20 · E-22 · E-13
Lifecycle.     [E-17 pending] → live → edited (sync_version++)
                             → soft-deleted (is_deleted = 1)
               as a rule:  active → paused → ended
               There is no hard delete. Deleting the group tombstones the group
               and leaves every entry standing (E-02), so a closed month cannot
               be rewritten under you.
Create.        You, in any group you are in · a trusted peer (lands live) · an
               untrusted peer (lands awaiting approval, E-20) · the system, on
               three paths: recurring materialisation, review commit, asset transfer.
Edit.          The author, or any member of a shared group. Compare-and-set on
               sync_version; a stale write is a 409, never a silent last-write-wins.
Delete.        Soft, by any member. Refused for an entry someone else wrote —
               the honest action there is to dispute it (E-22).
Sync.          Travels, sealed per group. attachment_uri is nulled on receipt
               (SYNC-F4). Line items do not travel: an itemized bill arrives as a
               single expense, correct in money and missing its breakdown.
Aliases.       transaction · entry · expense · txn · recurring rule · series
               · occurrence · item (Review) · line (ledger).  Nine.  OV-01.
Surfaces.      SC-07 · SC-08 · SC-15 · SC-09 · SC-14 · SC-19 · SC-23 · SC-21
               · SC-41 · SC-16 (18 in total, §7)
Invariants.    IV-01 paise · IV-02 shares sum to payments · IV-03 one transaction
               · IV-04 rules are not events · IV-05 awaiting approval is excluded
               · IV-06 settlements out of analysis, in the ledger · IV-17
Open.          OV-01 · OV-02 · OV-03 · OV-23 (txn.currency, txn.tz)
```

### E-05 · recur_skip — one occurrence you decided not to have

```
Definition.    A single date on which a recurring rule deliberately did not fire.
Is not.        · Not a deletion of the rule, and not a pause — a pause stops all
                 future occurrences, a skip removes exactly one.
               · Not a transaction. Nothing was spent; there is no row to show.
Storage.       `recur_skip`, src/db/schema.ts:91-96.
Identity.      PK (series_id, occurrence_date).
Owned by.      E-04 (the rule).
References.    E-04 series_id
Referenced by. E-58 · E-59 (both consult the skip map when expanding)
Lifecycle.     created (skip the next one) → deleted (undo the skip)
Create/Edit/Delete.  You, on SC-41. There is no edit — you unskip by deleting.
Sync.          Does not travel. A skip is a local decision about a shared rule,
               which means two devices can disagree about one occurrence.
Aliases.       skip · skipped occurrence · "skip the next one".
Surfaces.      SC-41
Open.          —
```

### E-06 · txn_payment — who fronted the money

```
Definition.    How much one person actually paid out for one transaction.
Is not.        · Not a settlement, and not "a payment" in the settle-up sense.
                 A settle-up also writes rows here, so this table carries two
                 meanings of the word. OV-02.
               · Not a share. What someone paid and what they owe are independent
                 numbers; that independence is the whole point of the app.
               · Not a place for approval state — the rows are DELETEd and
                 re-INSERTed wholesale on every edit, so a decision stored here
                 would be silently erased. IV-12.
Storage.       `txn_payment`, src/db/schema.ts:98-103. Index idx_txn_payment_person.
Identity.      PK (txn_id, person_id). Amount in paise.
Owned by.      E-04.
References.    E-04 · E-01
Referenced by. E-50 (as the + side of netSql) · E-54 (cash, my rows only)
Lifecycle.     Written with its transaction; replaced wholesale on every edit.
Create/Edit/Delete.  Only ever through E-04's write paths. Never edited alone.
Sync.          Travels inside the sealed entry (E-88).
Aliases.       payment · who paid · payer · fronted · "paid by".
Surfaces.      SC-07 (Payers sheet) · SC-08 · SC-15
Invariants.    IV-02 · IV-12 · IV-20 cash moves only on my rows
Open.          OV-02
```

### E-07 · txn_share — who consumed it

```
Definition.    How much of one transaction one person is responsible for.
Is not.        · Not what they paid (E-06).
               · Not a debt. A debt is the net of shares against payments across
                 many transactions, and it is derived (E-50).
               · Not a place for approval state, for the same reason as E-06.
Storage.       `txn_share`, src/db/schema.ts:105-110. Index idx_txn_share_person.
Identity.      PK (txn_id, person_id). Amount in paise.
Owned by.      E-04.
References.    E-04 · E-01
Referenced by. E-50 (as the − side) · every analysis surface, via myShareOf
Lifecycle.     As E-06 — written and replaced with the transaction.
Create/Edit/Delete.  Only through E-04's write paths.
Sync.          Travels inside the sealed entry.
Aliases.       share · split · your share · owed · consumed · portion.  Six.
Surfaces.      SC-07 (Split sheet) · SC-08 · SC-15
Invariants.    IV-02 · IV-08 your share is your spending · IV-12 · IV-13
Open.          —
```

### E-08 · line_item — one line of an itemized bill

```
Definition.    One named thing on a bill, with a quantity, a price and an
               assignment.
Is not.        · Not a transaction. It has no date, no group and no kind.
               · Not synced. An itemized bill reaches a peer as a single expense:
                 the money is right, the breakdown is gone. SYNC, RELEASE §163.
               · Not the source of the total — adjustments (tax, tip, discount,
                 service) live as JSON on E-04, not here.
Storage.       `line_item`, src/db/schema.ts:112-121. Index idx_line_item_txn.
Identity.      id TEXT PK.
Owned by.      E-04 (itemized entry_mode only).
References.    E-04
Referenced by. —
Lifecycle.     Created and replaced with its transaction.
Create/Edit/Delete.  You, on SC-08. Also the OCR path, which proposes lines.
Sync.          Does not travel.
Aliases.       line item · item · line · bill row.
Surfaces.      SC-08 · SC-15 (read-only)
Invariants.    IV-02 (per-item splits must still reconcile to the whole)
Open.          —
```

### E-09 · category — the global catalog

```
Definition.    A name and a look for a kind of spending, income or transfer.
Is not.        · Not per-group any more. group_id is nullable and always NULL
                 after the Phase-GC migration; the column survives only so the
                 rebuild DDL matches.
               · Not referenced by id. E-04 and E-12 store the *name* as a string,
                 which is why renaming is a migration and why a name can be
                 orphaned. OV-06.
               · Not unique by name. UNIQUE(name, kind) — `Rent` and `Other`
                 legitimately exist twice, once as an expense and once as a
                 transfer.
               · Not `Others`. That is the synthetic fold bucket (E-63), one
                 character away and a different thing entirely. OV-18.
Storage.       `category`, src/db/schema.ts:125-134. Index idx_category_kind_name.
Identity.      id TEXT PK; UNIQUE(name, kind) is the real key.
Owned by.      Nothing. Global.
References.    E-02 group_id (legacy, always NULL)
Referenced by. E-04 by name · E-12 by name · E-10 by (name, kind)
Lifecycle.     seeded → renamed → deleted (leaves E-10 so the re-seed obeys)
Create.        You, on SC-25 or inline while adding. Seeding, on every launch.
Edit.          You. Rename rewrites every referencing row by name.
Delete.        You. Writes a tombstone (E-10), or the next launch resurrects it.
Sync.          Does not travel. Names arriving on a peer entry are adopted or
               fall into `Others`.
Aliases.       category · reason (Transfer's word for it) · tag (no — that is
               E-04.tags) · bucket.
Surfaces.      SC-25 · SC-16 · SC-07 · SC-10 · SC-10b
Invariants.    IV-17 a kind's categories are its own
Open.          OV-06 referenced by name · OV-18 Other vs Others · OV-20
```

### E-10 · category_tombstone — a default category you deleted

```
Definition.    A record that a seeded category was removed on purpose.
Is not.        · Not a deleted category's data. Nothing is recoverable from it.
               · Not needed for a user-created category — only the seeder reads it.
Storage.       `category_tombstone`, src/db/schema.ts:140-145.
Identity.      PK (name, kind).
Owned by.      Nothing.
References.    E-09 by (name, kind)
Referenced by. seedGlobalCategories
Lifecycle.     created on delete → removed if the category is recreated
Create/Delete. The category delete/create paths. Never touched directly.
Sync.          Does not travel.
Aliases.       tombstone · deleted-category marker.
Surfaces.      None. Invisible by design.
Open.          —
```

### E-11 · settings — the SQLite key-value table

```
Definition.    Durable key-value rows: the money profile, and one-time migration
               markers.
Is not.        · Not the app's settings. Most preferences live in AsyncStorage
                 (E-80) — a second store with the same name. OV-13.
               · Not one kind of thing. It holds `money.*` figures, `fix_*` and
                 `category_global_v1` migration markers, and a few defaults.
               · Not the source of money.investments, which is derived from live
                 assets; the key survives only so a launch invariant can find it.
Storage.       `settings`, src/db/schema.ts:147-150. In BACKUP_TABLES.
Identity.      key TEXT PK.
Owned by.      Nothing.
References.    —
Referenced by. E-54 (money profile) · the migration runner
Lifecycle.     written → read → (for fix_* keys) never touched again
Create/Edit.   moneyProfile.ts and the migration runner. Not a general store.
Delete.        clearMoneyProfile, and a full erase.
Sync.          Does not travel. Backed up.
Aliases.       settings · the KV table · money profile · migration markers.
Surfaces.      SC-05 (MoneyEditorSheet) · onboarding
Invariants.    IV-14 investments is derived, never written
Open.          OV-13 two settings stores
```

### E-12 · category_budget — one budget line

```
Definition.    A limit on one category, for one cadence, at one level.
Is not.        · Not one concept. The same table is My Budget (personal group,
                 person_id NULL), a Group Budget (shared group, person_id NULL)
                 and My Override (shared group, person_id = me). Three ideas,
                 two storage levels, distinguished only by two columns. OV-07.
               · Not the only budget in the app. budget_group.limit_* is a dead
                 second answer, and settings.budgetTarget in AsyncStorage is a
                 live fifth one with no category and no cadence. OV-07, OV-23.
               · Not keyed on a category id — the category is a name. OV-06.
Storage.       `category_budget`, src/db/schema.ts:157-163 + :418, :533;
               rebuilt :1274-1288 to drop the original UNIQUE.
Identity.      id TEXT PK. Uniqueness is two partial indexes, not a constraint:
               idx_catbudget_default (person_id IS NULL) and
               idx_catbudget_override (person_id IS NOT NULL).
Owned by.      E-02.
References.    E-02 · E-09 by name · E-01 person_id (NULL = the group's default)
Referenced by. E-56 (resolved lines) · every budget surface
Lifecycle.     set → edited → cleared (a blank override falls back to the default)
Create/Edit.   You, for your own. Admins, for a group's default (E-64).
Delete.        Clearing the amount.
Sync.          Does not travel today.
Aliases.       budget · budget line · limit · allocation · cap · envelope.
Surfaces.      SC-10 · SC-10b · SC-16 · SC-09 (Budget tab)
Invariants.    IV-08 (a group budget is measured against your share, not the bill)
Open.          OV-07 three concepts · OV-19 period vs cadence · OV-22
```

### E-13 · audit_log — what happened, in order

```
Definition.    An append-only record of user-visible changes.
Is not.        · Not a transaction log, and not usable to rebuild state. It stores
                 a rendered summary string, not a diff.
               · Not enforced. entity_type/action are free text against enums
                 nothing validates, and two declared entity types have no writer.
               · Not pruned, ever.
Storage.       `audit_log`, src/db/schema.ts:165-174. Three indexes.
Identity.      id TEXT PK. Polymorphic (entity_type, entity_id), unenforced.
Owned by.      Nothing.
References.    Any entity, by type + id string. E-02 group_id, optionally.
Referenced by. —
Lifecycle.     appended. Never edited, never deleted, never rolled up.
Create.        logAudit, from ~20 call sites.
Edit/Delete.   Nobody.
Sync.          Does not travel.
Aliases.       audit log · history · activity.
Surfaces.      SC-28
Open.          OV-23 (audit_log.amount has exactly one reader)
```

### E-14 · asset — a named thing you own

```
Definition.    Something you own that holds value: gold, an FD, an SIP, a
               property, a vehicle.
Is not.        · Not cash. Cash is derived (E-54) from the money profile and the
                 ledger; an asset carries its own balance column.
               · Not an account. There is no "HDFC" with a running balance —
                 that is DQ-14, still open. The three cash buckets are a
                 different model again (AX-03's sibling, ASSET_BUCKET).
               · Not an expense. Buying one is a transfer: cash moved, nothing
                 was consumed, net worth is unchanged. IV-15 and the settlement
                 overload (OV-02) both live here.
               · Not shared. An asset never travels in group sync.
Storage.       `asset`, src/db/schema.ts:198-215. Index idx_asset_live.
Identity.      id TEXT PK. balance in paise, never negative.
Owned by.      You. Personal by definition.
References.    —
Referenced by. E-04 asset_id (the other half of the transfer)
Lifecycle.     created → balance restated → archived (stops counting) → deleted
Create/Edit/Delete.  You, on SC-42.
Sync.          Does not travel. Is backed up.
Aliases.       asset · holding · investment · net-worth item.  With
               `Investments / SIP`, `Investment`, asset.kind='investment' and
               MIGRATED_INVESTMENTS_NAME, five near-identical spellings. OV-20.
Surfaces.      SC-42 · SC-05 (TotalMoneyCard) · SC-07 (transfer banner)
Invariants.    IV-03 both halves in one transaction · IV-14 · IV-15 archived
               assets stop counting
Open.          OV-02 · OV-20 · DQ-14 named accounts
```

### E-15 · savings_goal — something you are saving for

```
Definition.    A named target amount, with a funding rate and a rank.
Is not.        · Not a budget. A budget caps spending; a goal accumulates.
               · Not ordered by `priority`. That column is a raid-protection tag
                 (emergency | need | want); funding order is sort_order, set by
                 dragging. The two are easy to confuse and mean different things.
               · Not an asset. Money in a goal is still cash you hold (E-54).
Storage.       `savings_goal`, src/db/schema.ts:219-238; rebuilt :938-963 when
               high|medium|low became emergency|need|want.
Identity.      id TEXT PK.
Owned by.      You.
References.    E-09 category, optionally, by name
Referenced by. E-16 goal_id · E-62 (allocation, raid and sweep plans)
Lifecycle.     created → funded → locked (protected from a raid) → reached
               → archived → deleted (restorable)
Create/Edit/Delete.  You, on SC-05 / SC-17.
Sync.          Does not travel. Is backed up.
Aliases.       goal · savings goal · bucket · target · pot.
Surfaces.      SC-05 · SC-17 · SC-16
Invariants.    IV-01
Open.          OV-22 (SAVINGS_FREQUENCY is a sixth cadence vocabulary)
```

### E-16 · savings_txn — one movement into or out of a goal

```
Definition.    An amount added to or taken from one goal, on one date.
Is not.        · Not a transaction (E-04). It is not in the ledger, not in any
                 category breakdown, and not a kind of spending.
               · Not pool-level any more. goal_id was nullable for a savings pool
                 that no longer exists; `fix_drop_savings_pool_v1` deleted those
                 rows, so kind='deposit' should now be unreachable while
                 remaining in the CHECK. OV-23.
Storage.       `savings_txn`, src/db/schema.ts:244-253 + :590.
Identity.      id TEXT PK. amount is positive paise; kind carries the direction.
Owned by.      E-15.
References.    E-15 goal_id · an ASSET_BUCKET string in source_asset (bank | cash
               | wallet) — a bucket name, not E-14.
Referenced by. E-62
Lifecycle.     created. Never edited; a mistake is corrected by the opposite row.
Create.        You (manual), or the engine (auto-fund, sweep, overspend raid).
Edit.          Nobody.
Delete.        Undo of a raid or a sweep.
Sync.          Does not travel. Is backed up.
Aliases.       contribution · deposit · allocation · withdrawal · funding.
Surfaces.      SC-17 (history) · SC-05
Invariants.    IV-01
Open.          OV-23 · DQ-15 the sweep source-asset round trip
```

### E-17 · pending_txn — the import inbox

```
Definition.    A parsed row waiting for you to accept it into the ledger.
Is not.        · Not a peer's entry. That reversal is the single most important
                 thing to know here: an entry someone else wrote is a real E-04
                 with its state in E-20, *not* a row in this table. This table
                 cannot carry one — it has no share or payment rows and no source
                 group, so a split expense routed through it would lose its split.
               · Not a transaction. It has no group until you pick one, no splits
                 until you draft them, and no id in the ledger.
               · Not the only "pending" thing. There are four. OV-21.
Storage.       `pending_txn`, src/db/schema.ts:260-278 + :466-563.
Identity.      id TEXT PK.
Owned by.      Nothing until committed.
References.    E-02 dest_group_id · E-01 counterparty_id / author_person_id /
               payer_person_id (the last two have no writer — residue of the
               reversed design)
Referenced by. E-66 (the commit plan)
Lifecycle.     parsed → drafted (dest, split, category, payer) → committed to
               E-04 → deleted · or discarded
Create.        Import, paste, OCR, voice, Scan & Pay. All of them you.
Edit.          You, in place on SC-19, with draft auto-save.
Delete.        Commit, discard, or clear-all.
Sync.          Does not travel.
Aliases.       pending · pending transaction · review row · staged row · draft
               · inbox item.  Six.  OV-21.
Surfaces.      SC-19 · SC-18
Invariants.    IV-05 does not apply here — pending rows are simply not in `txn`
Open.          OV-21 four pending concepts · OV-23 (two columns with no writer)
```

### E-18 · sync_outbox — what still has to be delivered

```
Definition.    A queue of entries this device has not yet pushed.
Is not.        · Not a change log. One row per entry, so N edits collapse to one
                 delivery of the current state.
               · Not backed up. It is the only member of NEVER_BACKED_UP —
                 restoring a queue would re-push stale writes.
Storage.       `sync_outbox`, src/db/schema.ts:313-317. Two indexes.
Identity.      entry_id TEXT PK.
Owned by.      E-04.
References.    E-04 entry_id · E-02 group_id
Referenced by. syncEngine
Lifecycle.     queued → delivered (row removed)
Create.        Every write to an entry in a shared group.
Edit.          queued_at only.
Delete.        markDelivered.
Sync.          It *is* the sync mechanism. Does not itself travel.
Aliases.       outbox · queue · pending upload.
Surfaces.      SC-43 · SC-44
Invariants.    IV-22 only my own authored entries queue
Open.          —
```

### E-19 · friend_request — an invite, and who you meant by it

```
Definition.    A sent or received link invitation, and the local person it maps to.
Is not.        · Not the link itself — the server holds that.
               · Not a person. It exists precisely because an invite can precede
                 the person, and because the server knows an email while you
                 know a name.
Storage.       `friend_request`, src/db/schema.ts:336-344.
Identity.      id TEXT PK.
Owned by.      Nothing.
References.    E-01 person_id (nullable)
Referenced by. SC-38
Lifecycle.     pending → accepted | declined | cancelled
Create.        Sending or receiving an invite.
Edit.          The outcome, when the server reports it.
Delete.        —
Sync.          Mirrors server state; the local half is the person mapping.
Aliases.       invite · friend request · link request.
Surfaces.      SC-38 · SC-39
Open.          DQ-08
```

### E-20 · txn_approval — my decision about an entry someone else wrote

```
Definition.    Whether I have accepted a peer's entry into my numbers.
Is not.        · Not the entry. The entry is a real E-04 and is shown in the
                 group ledger while it waits.
               · Not a shared fact. It is my device's decision. Rejecting still
                 leaves the two devices holding different rows — but no longer
                 silently: the objection travels back as E-22. DQ-07 closed.
               · Not present when everything is fine — an absent row means
                 approved, which is why the exclusion predicate is a LEFT JOIN.
Storage.       `txn_approval`, src/db/schema.ts:345-365 + :610, :622. 3 indexes.
Identity.      txn_id TEXT PK. created_at is arrival, not event time.
Owned by.      E-04.
References.    E-04
Referenced by. NOT_AWAITING_APPROVAL (queries/approvalSql.ts) — the one constant
               every money statement over `txn` must carry
Lifecycle.     pending → approved | rejected → reopened
Create.        ingestPeerTxn, when the author is not trusted for that group.
Edit.          You, on SC-40 or SC-15.
Delete.        —
Sync.          Device-local. Is backed up.
Aliases.       approval · waiting for you · pending entry · needs review.  OV-21.
Surfaces.      SC-40 · SC-15 · SC-03 (header badge)
Invariants.    IV-05 · IV-09 · IV-12 · IV-13
Open.          OV-21
```

### E-21 · person_group_trust — trusted here, not there

```
Definition.    An override of a person's trust, for one group.
Is not.        · Not group-level trust. Every row is still keyed on a human, so
                 nobody inherits trust by being added to a group. That is the
                 whole reason this is allowed to exist. IV-10.
               · Not required. Absent means the person's global trust applies,
                 and it must stay clearable or "trusted except here" is a
                 one-way door.
               · Not able to reach someone with no account — that check runs
                 first — and not able to waive the transfer rule.
Storage.       `person_group_trust`, src/db/schema.ts:382-388. Sparse.
Identity.      PK (person_id, group_id).
Owned by.      E-01.
References.    E-01 · E-02
Referenced by. E-65, read at the loader so lib/trust.ts stays pure and db-free
Lifecycle.     set → cleared (back to the global answer)
Create/Edit/Delete.  You, on SC-26a.
Sync.          Does not travel. Nobody learns you distrust them.
Aliases.       trust override · per-group trust.
Surfaces.      SC-26a (TrustSheet)
Invariants.    IV-10 · IV-11
Open.          —
```

### E-22 · txn_dispute — what someone said about an entry I wrote

```
Definition.    Another person's recorded objection to one of my entries.
Is not.        · Not my approval of theirs — that is E-20, the mirror image.
               · Not keyed on a local person. by_uid is their *account* id,
                 because a dispute arrives from the server before any person
                 mapping is guaranteed.
Storage.       `txn_dispute`, src/db/schema.ts:395-406.
Identity.      PK (txn_id, by_uid).
Owned by.      E-04.
References.    E-04 · E-87 by_uid
Referenced by. SC-15
Lifecycle.     raised → cleared
Create.        Arrives over sync.
Edit.          cleared, when they withdraw it.
Delete.        —
Sync.          Travels both ways — raising and withdrawing. This is what closed
               DQ-07: pushSyncDispute on push, recordDispute on pull.
Aliases.       dispute · objection · "they said this is wrong".
Surfaces.      SC-15
Open.          —
```
---

### Derived entities — real nouns with no table

These behave like entities: screens show them, users name them, bugs are filed against them. They
have no row, no id and no lifetime. **They cannot be stale, only wrong** — which is a different
failure mode and needs a different kind of thinking.

| | | |
|---|---|---|
| `E-50` balance | `E-51` exposure | `E-52` transfer scopes & settlement plan |
| `E-53` safe-to-spend | `E-54` total money | `E-55` financial health |
| `E-56` resolved budget | `E-57` forecast | `E-58` upcoming bill |
| `E-59` recurring occurrence | `E-60` split | `E-61` afford verdict |
| `E-62` savings plan | `E-63` category spend & `Others` | `E-64` group context |
| `E-65` trust decision | `E-66` review commit plan | `E-67` recurring candidate |

---

### E-50 · balance (owe / owed) — derived, three scopes, no table

```
Definition.    A person's payments minus their shares, computed at read time,
               within a named scope.
Is not.        · Not stored. No table, no cached column, no memo. Every screen
                 that shows it recomputes it. OV-14.
               · Not a debt between two people — that is a further derivation,
                 E-52.
               · Not one number. Three scopes give three different right answers
                 (AX-03) and they are not interchangeable. A figure shown without
                 naming its scope is meaningless. IV-07.
               · Not defined over income or recurring rules — BALANCE_TXN_FILTER
                 excludes both, and CROSS_GROUP_FILTER excludes personal groups.
Storage.       None. src/db/queries/balances.ts — BALANCE_TXN_FILTER :19,
               netSql() :40-58, six exported SQL constants.
Identity.      Keyed by person within a scope. `Record<personId, paise>`.
Owned by.      Nothing. A projection.
Derived from.  E-06 (+) · E-07 (−) · E-04 (filter) · E-02 (scope)
Scopes.        group      getGroupNet    — inside one group, who is up or down
               global     getGlobalNet   — across all shared groups, net per person
               per-group  getNetByGroup  — the global figure, itemised by group
               and MyExposure (:239) — a summary of the global figure, a fourth
               shape wearing the same word. OV-04.
Lifecycle.     None. It has no identity over time.
Create/Edit/Delete.  Nobody. It moves only as a side effect of E-04/06/07.
Sync.          Does not travel, and must never. Each device derives from the rows
               it holds — which is why a rejected entry makes two devices disagree
               about a balance while no row disagrees. The objection itself now
               travels (E-22), so the disagreement is visible rather than silent.
Aliases.       balance · net · owe/owed · who owes whom · exposure · settle-up
               amount · the strip.  Seven names over four shapes.  OV-04.
Reading.       lib/owe.ts turns one signed number into an OweView — direction,
               colour, sign, label. It is the single canonical reading of a sign,
               and nothing should re-derive "is this owed to me" anywhere else.
Surfaces.      SC-03 (strip) · SC-04 (chips) · SC-26 · SC-26a · SC-09 · SC-30
Invariants.    IV-02 · IV-06 · IV-07 · IV-20
Open.          OV-04 · OV-14
```

### E-51 · exposure — the one-line summary of what you are owed and owe

```
Definition.    Your global position, split into what you owe and what is owed to
               you, with written-off receivables removed.
Is not.        · Not a balance per person — it is the aggregate of E-50's global
                 scope, and the two are routinely confused.
               · Not net. It is deliberately two numbers, because netting them
                 hides ₹5,000 out and ₹5,000 in behind a zero.
Storage.       None. getMyExposure / summarizeExposure, queries/balances.ts:239.
Derived from.  E-50 (global scope) · E-01.receivable_state
Aliases.       exposure · owe/owed totals · the Home strip.  OV-04.
Surfaces.      SC-03 · SC-05
Invariants.    IV-07 · the debtLoad rule: a friend's IOU never nets against card
               debt, because one accrues interest on a due date and the other
               does not.
Open.          OV-04
```

### E-52 · transfer scopes & settlement plan — where a settle-up actually lands

```
Definition.    The set of groups two people share, each with its own balance, and
               the plan for which groups a given payment should clear.
Is not.        · Not a settlement (E-04 with kind='settlement'). This is the
                 arithmetic that decides what to write.
               · Not one row. Settling a global figure of ₹420 across three
                 shared groups writes up to three rows, none of them ₹420.
                 SN-06.T2a is the open question this creates.
               · Not usable with an asset as an endpoint — both ends are typed as
                 a Person and assets share no group. Deliberately parked.
Storage.       None. lib/settleScope.ts — computeTransferScopes,
               planAllGroupsSettlement. Simplification is lib/settle.ts.
Derived from.  E-50 (per-group scope) · E-03 · E-02.simplify_debt
Shapes.        Settlement {from,to,amount}            — simplification output
               SettlementPlan {groupId,from,to,amount} — write plan
               PendingSettlementPlan {...identical}    — E-85, in AsyncStorage
               SettlementInput                        — the write argument
               Four structurally similar shapes. OV-02.
Aliases.       settle-up · settlement · transfer · plan · simplify · who pays whom.
Surfaces.      SC-07 (Transfer pill, Scope sheet) · SC-26a · SC-09
Invariants.    IV-06 · IV-09
Open.          OV-02 · DQ-13 (Transfer has no DetailChips and writes transferNote)
```

### E-53 · safe-to-spend — what is genuinely yours to spend

```
Definition.    Available cash minus everything already committed, over a 30-day
               horizon, expressed as a total and a daily rate.
Is not.        · Not your balance. It subtracts upcoming bills, card repayment,
                 this cycle's goal funding, what you owe, and your everyday
                 spend rate.
               · Not net of receivables — deliberately. What a friend owes you is
                 not spendable. (proposeOverspendRaid *does* net them, because
                 "should I break open a goal" is a different question. Do not
                 unify the two.)
               · Not called "Safe to Spend" in the UI. The visible copy is
                 "yours to spend"; the identifiers still say safeToSpend. DQ-02.
Storage.       None. lib/safeToSpend.ts (parts + assembly), assembled by
               queries/spendPower.ts:getSafeToSpend. Rate from spendRateQuery.ts.
Derived from.  E-54 available · E-58 upcoming bills · card repayment · E-62 goal
               remaining · E-51 netIOwe · everyday spend (90-day window, 30 min)
Constants.     STS_HORIZON_DAYS 30 · EVERYDAY_WINDOW_DAYS 90 · EVERYDAY_MIN_DAYS 30
Aliases.       safe to spend · yours to spend · free to spend · the STS strip.
Surfaces.      SC-03
Invariants.    IV-08 · IV-20
Open.          DQ-02 trademark
```

### E-54 · total money — cash, credit and net worth

```
Definition.    Everything you hold: cash across three buckets, investments,
               credit headroom, and the net worth that falls out of them.
Is not.        · Not a sum of accounts. There are no accounts (DQ-14). There are
                 three buckets — bank, cash, wallet — derived from an opening
                 figure plus every transaction attributed to that pay method.
               · Not one figure. total, yourMoney, cashAvailable, investments,
                 creditAvailable, available and netWorth are seven answers to
                 seven different questions, and mixing them is a bug class.
               · Not affected by another person's spending. Cash moves only on
                 payments where person_id = me. IV-20.
Storage.       None. lib/cash.ts (shapes), queries/cashQuery.ts (CASH_TOTALS_SQL,
               BUCKET_FLOWS_SQL), queries/moneyProfile.ts (openings from E-11).
Derived from.  E-11 money profile · E-04 + E-06 (my payments only) · E-14 assets
Aliases.       total money · available money · net worth · cash position · your
               money · the Plan hero.
Surfaces.      SC-05 (TotalMoneyCard) · SC-42 · SC-33
Invariants.    IV-14 investments is derived · IV-15 archived assets stop counting
               · IV-17 never one total across kinds · IV-20
Open.          DQ-14 named accounts · OV-20 five investment spellings
```

### E-55 · financial health — a score out of four pillars

```
Definition.    A 0–100 score over Spend, Save, Borrow and Plan, behind a
               minimum-data gate.
Is not.        · Not a credit score, and not comparable to anyone else's.
               · Not shown before there is enough data — healthGate refuses,
                 and the refusal is the honest state, not a zero.
               · Not a single number underneath: it decomposes into dimensions
                 and factors, and `suggestImprovement` names the cheapest one.
Storage.       None. lib/financialHealth.ts (21 K). 24 inputs.
Derived from.  E-04 (90-day income and spend) · E-56 · E-54 · E-51 · E-58 · E-15
Aliases.       health · health score · the ring · financial health.
Surfaces.      SC-03 (ring → HealthSheet)
Open.          DQ-12 three red surfaces can stack on one Home open
```

### E-56 · resolved budget line — the two-level collapse

```
Definition.    The limit that actually applies to one category for you, after a
               personal override is laid over a group default.
Is not.        · Not a row. It is the collapse of up to two E-12 rows, and the
                 collapse rule is the thing worth knowing: a blank override keeps
                 following the group, it does not mean zero.
               · Not comparable across cadences without conversion —
                 budgetEquivalent exists because a daily and a monthly line
                 answer the same question at different rates.
               · Not measured against the bill. A group budget is measured
                 against your share. IV-08.
Storage.       None. lib/budget.ts (22 K) — resolveBudgetLines, budgetKind
               ('rate' | 'pool'), rollUpBudgets, getCategoryBudgetStatus,
               foldBudgetStatuses, getMyGlobalBudgetSummary.
Derived from.  E-12 · E-04 + E-07 (spend) · E-09
Aliases.       budget · my budget · group budget · override · allocation · limit.
Surfaces.      SC-10 · SC-10b · SC-16 · SC-03 · SC-22
Invariants.    IV-08
Open.          OV-07 · OV-19 · OV-22
```

### E-57 · forecast — where this month ends up

```
Definition.    A projection of month-end spend, blended between this month's run
               rate and a prior, and floored by bills already committed.
Is not.        · Not a plan or a target. It is a prediction, and it says how much
                 to trust itself: `basis` is insufficient | run-rate | blended,
                 with a credibility weight.
               · Not available early. FORECAST_MIN_DAYS is 3; before that the
                 honest answer is "not yet".
Storage.       None. lib/forecast.ts. Bühlmann credibility, FORECAST_PRIOR_DAYS 7.
Derived from.  E-04 spend to date · prior month total · E-58 committed remaining
Aliases.       forecast · projection · month-end · pace · projected spend.
Surfaces.      SC-03 (ForecastCard) · SC-05 · SC-22
Open.          —
```

### E-58 · upcoming bill — a committed occurrence in a window

```
Definition.    A future firing of a recurring rule, expanded into a date and your
               share of it.
Is not.        · Not a transaction. Nothing has happened; there is no row.
               · Not one shape. expandUpcoming returns *every* occurrence in the
                 window (expenses only, your share, skipping anything awaiting
                 approval); buildUpcoming returns one row per series, all kinds.
                 Two functions, two meanings of "upcoming".
Storage.       None. lib/upcoming.ts, over E-59.
Derived from.  E-04 (rules) · E-05 (skips) · E-07 (your share)
Aliases.       upcoming · committed · due · coming up · bills · renewals.
Surfaces.      SC-05 · SC-30 · SC-03
Invariants.    IV-04 · IV-05
Open.          —
```

### E-59 · recurring occurrence — one firing of a rule

```
Definition.    A single date on which a rule fires, either already materialized
               into E-04 or still hypothetical.
Is not.        · Not the rule. The rule is E-04 with recur_freq set; this is one
                 of its firings. Tapping one must open the rule, because an
                 occurrence has no detail page — that mistake shipped as a dead
                 route and is OV-12.
               · Not stably identified. A materialized occurrence carries the
                 rule's id plus `_n`, and `isRecurInstance` detects it by that
                 suffix. Every consumer must strip it to get back to the rule.
Storage.       None as a hypothetical; a real E-04 row once materialized.
Derived from.  E-04 · E-05 · lib/recurrence.ts (materializeInstances,
               nextUnskippedOccurrence, occurrenceDatesUpTo,
               recurringMonthlyEquivalent)
Aliases.       occurrence · instance · firing · materialized txn · this month's X.
Surfaces.      SC-41 · SC-32 · SC-09 (Recurring tab) · SC-14
Invariants.    IV-04
Open.          OV-03 · OV-12
```

### E-60 · split — shares and payments, computed

```
Definition.    The allocation of one amount across people, by equal, exact,
               percent or shares.
Is not.        · Not the stored rows. E-06 and E-07 are the result; this is the
                 arithmetic, and it must reconcile before anything is written.
               · Not lossy. `validateShares` exists because equal splits of an
                 odd number leave a paisa, and it has to land somewhere
                 deterministic.
Storage.       None. lib/splitMath.ts — myShareOf, myShareOrTotal, txnTotal,
               myPaidOf, myIncomeOf, cashDirectionOf, computeShares,
               validateShares, computePayments. 25 importers.
Derived from.  an amount + a participant set + a mode
Note.          `myShareOf` is the money boundary primitive. IV-08 is implemented
               there and nowhere else, and IV-13 says to keep it that way —
               enforcement belongs at the loader, not threaded through its
               thirteen callers.
Aliases.       split · share calculation · who owes what.
Surfaces.      SC-07 · SC-08 · SC-19
Invariants.    IV-02 · IV-08 · IV-13 · IV-16
Open.          —
```

### E-61 · afford verdict — can I buy this

```
Definition.    A Comfortable / Tight / No verdict on one hypothetical purchase,
               over seven axes, with reasons in plain English.
Is not.        · Not a budget check. The category budget is one of the seven axes;
                 cash, buffer, category norm, income share, month projection and
                 basket size are the others.
               · Not overridable by necessity. Marking something a Need softens
                 the buffer axis alone; only cash produces a hard No.
Storage.       None. lib/afford.ts — evaluateAfford.
Derived from.  E-53 · E-54 · E-56 · E-58 · E-51 · E-62 · E-57
Aliases.       afford · can I afford it · the verdict · BudgetNudge.
Surfaces.      SC-33 · SC-07 (the one-line BudgetNudge, same engine)
Open.          —
```

### E-62 · savings plan — auto-fund, raid and sweep

```
Definition.    Three plans over the goal list: what to fund on schedule, what to
               liquidate when you overspend, and what to sweep when you are up.
Is not.        · Not automatic without consent. A raid asks first and is undoable;
                 the sweep is off by default (auto_sweep_enabled) because it
                 moves real money unattended.
               · Not ordered by `priority` — order is drag rank (sort_order).
                 Priority protects a goal from a raid; it does not fund it.
               · Not a transaction. Applying a plan writes E-16 rows.
Storage.       None. lib/savingsEngine.ts — planAutoAllocations, planOverspendRaid,
               planSurplusSweep, periodsElapsed, advanceAnchor. Applied through
               queries/savings.ts.
Derived from.  E-15 · E-16 · E-54 · E-51 (netted, for a raid only)
Aliases.       auto-fund · allocation · raid · sweep · funding plan.
Surfaces.      SC-05 · SC-17
Invariants.    IV-01
Open.          DQ-15 sweep source-asset round trip
```

### E-63 · category spend & the `Others` fold

```
Definition.    Your share of spending grouped by category name, with the long
               tail folded into a synthetic bucket.
Is not.        · Not `Other`. `Other` is a real seeded category in all three
                 kinds; `Others` (OTHERS_LABEL) is the fold. Both render in a
                 breakdown, one character apart. OV-18.
               · Not the bill. Every figure is your share. IV-08.
               · Not inclusive of settlements. IV-06.
Storage.       None. lib/categoryFold.ts · lib/budget.ts getCategorySpending.
Derived from.  E-04 · E-07 · E-09
Aliases.       category spend · breakdown · ranks · the donut · Others.
Surfaces.      SC-03 · SC-16 · SC-20 · SC-22
Invariants.    IV-06 · IV-08
Open.          OV-18
```

### E-64 · group context — what you are allowed to do here

```
Definition.    Your role in one group, and the permissions that follow from it.
Is not.        · Not a role column alone. It combines E-03.role with
                 E-02.created_by, because the creator is not a role — they are a
                 column, and they can neither be demoted nor leave.
               · Not stored. Recomputed per screen from two rows.
Storage.       None. lib/permissions.ts — isCreator, isAdmin, canEditGroupBudget,
               canRemoveMember, canChangeRole, canDeleteGroup.
Derived from.  E-03 · E-02
Aliases.       permissions · role · admin · creator · context.
Surfaces.      SC-09 · SC-11 · SC-13 · SC-10b
Open.          —
```

### E-65 · trust decision — does this entry land or wait

```
Definition.    The answer to "may this person's entry move my numbers without
               my saying so", for one person in one group.
Is not.        · Not a group setting. Trust is per person, always, because a
                 group is only a set of humans and a group-level switch would
                 silently extend trust to whoever is added next. IV-10.
               · Not meaningful without an account. A person with no remote_uid
                 has no write path, so their trust value is inert — that check
                 runs first. IV-11.
               · Not a waiver of the transfer rule. You can always make yourself
                 worse off and never someone else, whatever the trust says. IV-09.
Storage.       None. lib/trust.ts (pure, db-free) — appliesImmediately,
               requiresMyApproval. Read at the loader (ingestPeerTxn).
Derived from.  E-01.trust_state · E-21 (override) · E-01.remote_uid
Aliases.       trust · trusted · on review · auto-accept.
Surfaces.      SC-26a (TrustSheet) · SC-40
Invariants.    IV-09 · IV-10 · IV-11
Open.          —
```

### E-66 · review commit plan — what pressing Save will do

```
Definition.    The full set of writes a Review commit will perform, computed
               before any of them happen.
Is not.        · Not a draft. The draft is on the row (E-17.split_draft); this is
                 the resolved plan for a batch.
               · Not partial. The commit is one transaction: a batch either lands
                 or does not. IV-03.
Storage.       None. lib/reviewCommit.ts (RowEdit, SplitState, CommitPlan,
               ReviewContext) · lib/reviewFilter.ts · lib/reviewViews.ts (SavedView)
               · hooks/useReviewCommit.ts.
Derived from.  E-17 · E-02 · E-01 · E-09
Aliases.       commit · save · plan · batch · the review queue.
Surfaces.      SC-19
Invariants.    IV-03
Open.          OV-24 (SC-19 owns 12 sheet states)
```

### E-67 · recurring candidate — a pattern that looks like a subscription

```
Definition.    A repeated charge the app noticed and offers to turn into a rule.
Is not.        · Not a subscription entity. There is none — a subscription *is* a
                 recurring rule, and the seeded `Subscriptions` category was
                 deliberately deleted to stop the idea coming back. OV-03.
               · Not automatic. It is a suggestion after a Review commit, and it
                 is behind a flag (recurringSuggest).
               · Not sourced from a bank feed. There is no bank feed.
Storage.       None. lib/recurringSuggest.ts.
Derived from.  E-04 (committed history)
Aliases.       suggestion · candidate · subscription · detected recurring.
Surfaces.      SC-19 (RecurringSuggestionsSheet)
Open.          OV-03
```
---

### Device, external and wire entities

State the app depends on that is not in its database: another store on the same device, a file, a
keychain secret, a server record, or a shape that exists only in transit. Each is a place data can
be lost, or diverge, independently of SQLite.

| | | |
|---|---|---|
| `E-80` AsyncStorage settings | `E-81` feature-flag store | `E-82` device key |
| `E-83` attachment file | `E-84` pending payment | `E-85` pending settlement |
| `E-86` voice capture | `E-87` server account | `E-88` sync docs |
| `E-89` backup envelope | `E-90` notification schedule | `E-91` reminder prefs |
| `E-92` smart-category learning | | |

---

### E-80 · AsyncStorage settings — the *other* key-value store

```
Definition.    ~30 device preferences: budget target, default cadence, default
               pay method, sync flags, onboarding markers.
Is not.        · Not E-11. There are two stores called settings, one in SQLite
                 and one in AsyncStorage, and only one of them is backed up.
                 OV-13.
               · Not a complete list of preferences either — featureFlags,
                 reminders and smartCategoryLearn are three further satellite
                 stores, and savings.ts keeps sweep markers of its own.
               · Not the budget, except that `budget_target` is a fifth budget
                 concept living here with no category and no cadence. OV-07.
Storage.       AsyncStorage. src/lib/settings.ts.
Lifecycle.     written on change; cleared only by a full erase.
Sync.          Does not travel. Not in BACKUP_TABLES — a restore does not bring
                 these back, which is worth knowing before promising a restore
                 returns you to where you were.
Aliases.       settings · prefs · app settings · defaults.
Surfaces.      SC-06 · SC-24 · onboarding
Open.          OV-07 · OV-13
```

### E-81 · feature-flag store — 16 switches

```
Definition.    The on/off state of 16 named capabilities.
Is not.        · Not entitlements. They are user preferences and must never be
                 repurposed as a paywall. DQ-01.
               · Not a complete account of what SC-24 shows: three switches on
                 that screen (save_location, auto_sweep_enabled, ocr_provider)
                 are E-80 preferences, not flags — deliberately, because one
                 must await an OS grant, one moves money unattended, and one
                 selects an implementation rather than a surface.
Storage.       AsyncStorage, prefix `feature_`. src/lib/featureFlags.ts (DEFAULTS
               is the single source). Held at boot behind FlagsGate.
Lifecycle.     defaulted → patched by the onboarding persona → hand-toggled.
               Re-applying a persona on SC-24 writes *every* key, undoing
               hand-toggles, which is why it confirms first.
Sync.          Does not travel.
Aliases.       flags · feature flags · modules · switches.
Surfaces.      SC-24
Invariants.    Every key gates a real surface and appears on SC-24 —
               featureFlags.test.ts. The count is held by sourceCounts.test.ts.
Open.          DQ-01
```

### E-82 · device key — this phone's identity

```
Definition.    An X25519 keypair identifying this device to the sync server, and
               the wrapped per-group keys it can open.
Is not.        · Not an account. The account is E-87; this is the thing that
                 makes sealed group entries readable, and losing it loses access
                 to shared history that no password can recover.
               · Not backed up in the ordinary backup. Recovery is a separate
                 mechanism (recoveryCode.ts).
Storage.       Keychain. src/lib/deviceKey.ts, keychain.ts, groupCrypto.ts.
Sync.          The public half is published; the private half never leaves.
Aliases.       device key · identity · keypair · this device.
Surfaces.      SC-43 · SC-38
Open.          —
```

### E-83 · attachment file — a receipt photo

```
Definition.    An image on the device filesystem, referenced by a URI on E-04.
Is not.        · Not part of the transaction row — the row holds a path.
               · Not synced, ever. A peer receives the entry with
                 attachment_uri nulled. SYNC-F4.
               · Not guaranteed to exist. The file can be gone while the URI
                 remains, which is why there is a reaper.
Storage.       Device filesystem. src/lib/attachment.ts, backupPhotos.ts,
               deviceStorage.ts. reapOrphanedAttachments runs at cold start.
Sync.          No. Included in a *local* backup's photo set.
Aliases.       receipt · photo · attachment · image.
Surfaces.      SC-07 · SC-08 · SC-15 (viewer) · SC-27a
Open.          —
```

### E-84 · pending payment — "did that UPI payment go through?"

```
Definition.    A record that you handed off to a UPI app to pay a scanned code,
               kept so the app can ask what happened when you come back.
Is not.        · Not a transaction. Nothing is written until you confirm.
               · Not E-85. That is the same question for a *settle-up*, and it
                 writes straight to E-04 rather than to the inbox. Two sibling
                 modules answering one question with different destinations.
               · Not confirmable by the app itself. UPI gives no reliable
                 callback; only the human knows.
Storage.       AsyncStorage. lib/pendingPayment.ts + lib/confirmPayment.ts.
Destination.   E-17 (the review inbox).
Sync.          No.
Aliases.       pending payment · scan & pay · did it go through.
Surfaces.      ScanPaySheet, prompted from the tab bar on return
Open.          OV-21
```

### E-85 · pending settlement — the same question, for a settle-up

```
Definition.    A record that you handed off to a UPI app to settle a debt.
Is not.        · Not E-84, though the shape is nearly identical and
                 PendingSettlementPlan is structurally the same as E-52's
                 SettlementPlan. OV-02, OV-21.
Storage.       AsyncStorage. lib/pendingSettlement.ts + lib/confirmSettlement.ts.
Destination.   E-04 directly, not the inbox.
Sync.          No.
Aliases.       pending settlement · settle handoff.
Surfaces.      Prompted from the tab bar on return
Open.          OV-02 · OV-21
```

### E-86 · voice capture — a file a Shortcut wrote

```
Definition.    A dictated phrase dropped into a watched folder by an iOS
               Shortcut, waiting to be parsed and logged.
Is not.        · Not in-app dictation. That is the mic in Add, same parser,
                 different entry.
               · Not installable one-tap today: VOICE_SHORTCUT_URL is null, so
                 only the four-step manual setup works. DQ-22.
Storage.       Filesystem `voice-inbox`. lib/voiceInbox.ts, voiceDrain.ts,
               voiceShortcut.ts, voiceParse.ts.
Lifecycle.     written by Shortcut → drained at cold start → parsed → E-04 or E-17
Sync.          No.
Aliases.       voice capture · Siri capture · inbox file · dictation.
Surfaces.      SC-35 · SC-07
Open.          DQ-22 · the whole apparatus is slated for deletion when App
               Intents land
```

### E-87 · server account — an email, and what it unlocks

```
Definition.    An account on `server/api`, identified only by an email address,
               signed in by magic link.
Is not.        · Not required. The app is fully usable without one.
               · Not a profile. It carries an email, a device list, and encrypted
                 blobs — no spending data in readable form.
               · Not changeable or mergeable. Email is the only identity, so a
                 typo at sign-in creates a second account holding none of your
                 backups. DQ-08.
               · Not a person. E-01.remote_uid is the only thread between them,
                 and it is written by exactly one action: matching a linked
                 account to a local person.
Storage.       Remote. src/lib/serverApi.ts (672 L), hooks/useServerSession.ts.
               Gated on EXPO_PUBLIC_API_URL — absent, none of this exists.
Lifecycle.     signed out → magic link sent → signed in → deleted (DELETE /me)
Sync.          It is the sync and backup counterparty.
Aliases.       account · sign-in · server · your email.
Surfaces.      SC-36 · SC-37 · SC-38 · SC-34
Invariants.    IV-11
Open.          DQ-05 DPDP posture · DQ-08 email as the only identity
```

### E-88 · sync docs — the entry doc and the roster doc

```
Definition.    The two wire shapes: a sealed per-entry document, and a per-group
               roster of members and wrapped keys.
Is not.        · Not the tables. A RosterMember is a *third* shape for a person
                 (pid, uid, name, color, role, removedAt), duplicating E-01 and
                 E-03 for transit. OV-05.
               · Not readable by the server. Entries are sealed with a per-group
                 key the server never holds.
               · Not carrying everything. Line items (E-08) and receipts (E-83)
                 do not travel; balances (E-50) must never.
Storage.       In transit + a cursor. queries/syncDoc.ts, lib/syncEngine.ts (769 L),
               groupCrypto.ts. Versioned with compare-and-set; a stale push is
               a 409, never a silent overwrite.
Lifecycle.     queued (E-18) → sealed → pushed → pulled → ingested (peerIngest)
Sync.          It *is* the sync.
Aliases.       entry doc · roster · envelope · payload · the wire.
Surfaces.      SC-43 · SC-44
Invariants.    IV-09 · IV-22
Open.          OV-05
```

### E-89 · backup envelope — the whole database, encrypted

```
Definition.    Every backed-up table plus receipt photos, encrypted under a
               passphrase, written to a file or to your account.
Is not.        · Not a sync. Restoring replaces all data, and is refused outright
                 while sync is on (restoreGuard, SYNC-F9) — because restoring an
                 old state into a shared group would re-publish it.
               · Not complete. E-18 is deliberately excluded (NEVER_BACKED_UP),
                 and E-80's AsyncStorage preferences are not included at all.
Storage.       A file, or server KV. lib/backup.ts, pbkdf2.ts (50k), restoreGuard.ts,
               queries/backup.ts.
Lifecycle.     created → shared / uploaded → restored (replaces everything)
Sync.          Uploaded encrypted; the server cannot read it.
Aliases.       backup · export · snapshot · restore file.
Surfaces.      SC-34 · SC-36
Open.          restore has never run on a device — RELEASE §0.4
```

### E-90 · notification schedule — what the OS is holding for you

```
Definition.    Local notifications the app has asked iOS to deliver: renewal
               reminders, a daily log nudge, a backup nudge.
Is not.        · Not in the database. The OS holds them, so they can be out of
                 sync with the rules that produced them — which is why they are
                 rescheduled at every cold start.
               · Not provable by the test suite. Jest cannot see them. RELEASE §346.
               · Not push. Push is parked on the paid Apple account, and the
                 entitlement is actively stripped at build time.
Storage.       The OS. lib/reminders.ts, reminderPlan.ts, notifications.ts.
               Tap routing is lib/notificationRoutes.ts: `renew_{id}_d{n}` →
               SC-41, `daily_log` → SC-07, `backup_nudge` → SC-20.
Aliases.       reminder · notification · nudge · alert.
Surfaces.      SC-31 · SC-30
Open.          DQ-80 push is parked
```

### E-91 · reminder prefs — which nudges you want

```
Definition.    Per-kind reminder preferences and their timing.
Is not.        · Not the schedule (E-90) — these are the inputs that regenerate it.
Storage.       AsyncStorage. lib/reminderPrefsStore.ts.
Aliases.       reminder settings · notification prefs.
Surfaces.      SC-31
Open.          OV-13
```

### E-92 · smart-category learning — your corrections, remembered

```
Definition.    A local record of which category you chose after the guesser was
               wrong, used to bias the next guess.
Is not.        · Not a model, and not shared. It never leaves the device and
                 never reaches a server.
               · Not authoritative — the guess is always overridable, and the
                 correction is the training signal.
Storage.       AsyncStorage. lib/smartCategoryLearn.ts, with lib/smartCategory.ts.
Sync.          No.
Aliases.       smart category · guess · learned categories.
Surfaces.      SC-07 (the title field)
Open.          OV-13
```
---

## §3 · Relationships

`Last verified: 2026-09-01 · Guarded by: nothing — read with suspicion`

### Ownership tree

Two roots. Everything else hangs off one of them, or off nothing.

```
E-01 person ─────────────────────────────── root
 ├── E-03 group_member ──────────────────── (also under E-02)
 ├── E-21 person_group_trust ───────────── (also under E-02)
 ├── E-19 friend_request
 ├── E-06 txn_payment ────────────────────  (also under E-04)
 ├── E-07 txn_share ──────────────────────  (also under E-04)
 └── E-87 server account ── via remote_uid, at most one

E-02 budget_group ───────────────────────── root
 ├── E-03 group_member
 ├── E-12 category_budget
 │    └── (optionally scoped to one E-01, as an override)
 ├── E-18 sync_outbox
 └── E-04 txn ── group_id NOT NULL, so every money event is here
      ├── E-06 txn_payment          who fronted it
      ├── E-07 txn_share            who consumed it
      ├── E-08 line_item            itemized only, does not sync
      ├── E-05 recur_skip           rules only
      ├── E-20 txn_approval         my decision, at most one
      ├── E-22 txn_dispute          their objections, many
      ├── E-18 sync_outbox          delivery state, at most one
      └── E-04 txn                  parent_recur_id — a rule owns its occurrences

Unparented — global or personal, belonging to no scope
 ├── E-09 category  ── with E-10 category_tombstone
 ├── E-11 settings
 ├── E-13 audit_log ── polymorphic, points at anything, owned by nothing
 ├── E-14 asset     ── referenced only by E-04.asset_id
 └── E-15 savings_goal
      └── E-16 savings_txn

Not in the database at all
 ├── derived        E-50 … E-67   recomputed on every read
 └── device / wire  E-80 … E-92   AsyncStorage, keychain, files, server, transit
```

### Cardinality

| From | | To | Note |
|---|---|---|---|
| `E-01` person | N—N | `E-02` group | through `E-03`, with a role per row |
| `E-01` person | 1—0..1 | `E-02` group | `pair_person_id` — a pair group *is* a friend |
| `E-01` person | 1—0..1 | `E-87` account | `remote_uid`, UNIQUE-partial |
| `E-02` group | 1—N | `E-04` txn | `group_id NOT NULL` — no ungrouped money |
| `E-04` txn | 1—N | `E-06` / `E-07` | PK'd on (txn_id, person_id) |
| `E-04` txn | 1—N | `E-08` line_item | itemized only |
| `E-04` txn | 1—N | `E-04` txn | `parent_recur_id`: rule → occurrences |
| `E-04` txn | 1—0..1 | `E-20` approval | **absent means approved** |
| `E-04` txn | 1—N | `E-22` dispute | keyed on their account id, not a person |
| `E-04` txn | 0..1—1 | `E-14` asset | the other half of a transfer |
| `E-04` txn | N—1 | `E-09` category | **by name, not by id** — `OV-06` |
| `E-12` budget | N—1 | `E-09` category | by name |
| `E-12` budget | 0..1—1 | `E-01` person | NULL = the group's default; set = my override |
| `E-15` goal | 1—N | `E-16` savings_txn | plain column, not an FK |
| `E-16` savings_txn | 0..1—1 | bucket string | `bank`/`cash`/`wallet` — *not* `E-14` |
| `E-13` audit_log | N—1 | anything | `(entity_type, entity_id)`, unenforced |

**`E-50` has no row in this table.** Balances are derived from `E-06` and `E-07` on every read.
The only stored fact about a debt is the deliberate write-off (`person.receivable_state`).

### Cascade and lifetime

Written from the code that deletes, not from the DDL — **`PRAGMA foreign_keys` is OFF**
(`applyConnectionPragmas`), so no `REFERENCES` clause in the schema does anything at runtime
(`DQ-19`). Every rule below is a hand-written statement somebody has to remember.

| Delete | What happens to children | Where |
|---|---|---|
| **`E-02` group** | **Nothing is destroyed.** `deleted_at` + `is_archived` are set; every txn, share, payment and receipt survives. The outbox rows and both pull cursors are deleted; `pending_txn` rows drafted into it have their `dest_group_id`, `split_draft` and `counterparty_id` reset so they stay committable. `unarchiveGroup` refuses a group carrying `deleted_at`. | `groups.ts:324-406` |
| **`E-02` leave** | Departure is announced, *then* sync stops — dropping the queue first would leave nothing able to publish it. Outbox + cursors deleted. A creator cannot leave. | `groups.ts:509-560` |
| **`E-04` txn** | Soft only: `is_deleted = 1`. Children stay. A recurring rule offers cascade-or-not, and the cascade takes the occurrences it logged. Undo restores. | `transactions.ts:640` |
| **`E-04` edit** | `line_item`, `txn_payment` and `txn_share` are **DELETEd and re-INSERTed wholesale**. This is why approval state can never live on them (`IV-12`). | `transactions.ts:548-550, 916-917` |
| **`E-01` person** | Refused if it is you, if they have a linked account, or if *any* of ten columns across eight tables names them — checked in one statement precisely because FKs are off. The real verb is `mergePerson`, which moves every reference and then deletes. | `persons.ts:89-125, 546-640` |
| **`E-09` category** | Its `category_budget` rows go with it; a tombstone (`E-10`) is written so the launch re-seed does not resurrect it. Transactions keep the name as an orphan string and fall into `Others` (`E-63`). | `categories.ts:211-225` |
| **`E-15` goal** | Its `savings_txn` rows are hard-deleted with it. Restorable. | `savings.ts:169-173` |
| **`E-14` asset** | Refused while it has history — archive instead, which stops it counting toward net worth (`IV-15`). | `assets.ts:167-176` |
| **`E-13` audit_log** | Never deleted, never pruned, by anyone. | — |

Two consequences worth stating plainly, because both look like bugs to someone who does not know:

- **Deleting a group does not reduce your past spending.** Your share of those bills already
  counted, in months you have already closed and made decisions on. The tombstone is what protects
  that.
- **A deleted category leaves its name behind on old transactions.** They are not recategorised and
  not lost; they fold into `Others`. That is `OV-06` — the reference is a string, so there is
  nothing to cascade.
---

## §4 · Axes

`Last verified: 2026-09-01 · Guarded by: nothing — read with suspicion`

An axis is a question you can ask of any entity or any flow. There are eleven. They exist so that
§9's scenario ladders are **generated rather than brainstormed**: cross a flow with the axes and the
rows write themselves, and a ladder missing an axis crossing is a *visible* gap rather than an
absence nobody notices.

| ID | Axis | Values | Why it changes behaviour |
|---|---|---|---|
| `AX-01` | **Group scope** | personal · shared · pair | Personal groups are excluded from `CROSS_GROUP_FILTER`, so a balance inside one is unreachable. Income is never grouped (`IV-16`). |
| `AX-02` | **Ownership** | mine · theirs · system-created | Whose entry it is decides whether it lands live, waits for approval, or cannot be deleted by you at all. |
| `AX-03` | **Balance scope** | group · global · per-group (+ exposure) | Three scopes give three different right answers, and they are not interchangeable. A figure without its scope named is meaningless (`IV-07`). |
| `AX-04` | **Feature-flag state** | on · off | 16 flags, one of them (`splitting`) structural: turning it off changes the tab bar, the Home strip, and whether Transfer exists at all. |
| `AX-05` | **Money direction** | in · out · moved | Analysis is two-sided; the ledger is three-sided. Settlements are shown and never counted (`IV-06`). |
| `AX-06` | **Approval state** | immediate · awaiting · rejected · disputed | An entry awaiting approval is visible in the ledger and absent from every money figure (`IV-05`). |
| `AX-07` | **Sync state** | local-only · queued · pushed · conflicted | A queued edit is real to you and does not exist to anyone else. A 409 means someone else got there first. |
| `AX-08` | **Connectivity** | online · offline · flapping | Everything works offline. What changes is when other people find out. |
| `AX-09` | **Lifecycle** | pending · live · soft-deleted · tombstoned | Four states that look alike on screen and behave differently in every query. |
| `AX-10` | **Trust** | trusted · on review · overridden here · no account | Per person, never per group (`IV-10`). Inert without an account (`IV-11`). |
| `AX-11` | **Device count** | one · two · reinstalled | One device can never observe divergence. Two can. A reinstall is the case where the device key (`E-82`) is gone and the history is not. |

**How to use them.** Take a flow, take an axis, ask "what if this were the other value". Most
crossings are uninteresting and get one line; the interesting ones are where two axes meet — `AX-03`
× `AX-11` is where `SN-06.T2a` lives, and `AX-06` × `AX-11` is where a rejection leaves two
devices holding different rows — visibly, since `E-22` travels.

---

## §5 · Invariants

`Last verified: 2026-09-01 · Guarded by: partly mechanical — see the Held-by column`

Rules that must never be false. Each is short on purpose and points at `AGENTS.md` for the argument
— restating that reasoning here would create a second source of truth for build rules, which is the
failure this whole document exists to end.

**Read the Held-by column carefully.** Nine of these are enforced by a test that reads the real
source. The rest are enforced by people remembering, and that is worth knowing before relying on one.

| ID | Rule | Held by | Constrains |
|---|---|---|---|
| `IV-01` | Money is integer paise. `parseToPaise` in, `formatRupees` out, never a float. | `money.test.ts` | `E-04` `E-06` `E-07` `E-12` `E-14` `E-15` `E-16` |
| `IV-02` | A transaction's shares sum to its payments, exactly. Rounding lands somewhere deterministic. | `splitExactness.test.ts` | `E-06` `E-07` `E-60` |
| `IV-03` | Multi-table writes happen inside `withTransactionAsync`. Zero partial writes. | unenforced — by review | every write path |
| `IV-04` | A recurring rule is not a transaction. Every money statement over `txn` carries `recur_freq IS NULL`. | **`txnInvariant.test.ts`** — reads the real SQL | `E-04` `E-58` `E-59` |
| `IV-05` | An entry awaiting approval is shown in the ledger and excluded from every money figure, via the one constant `NOT_AWAITING_APPROVAL`. | **`approvalInvariant.test.ts`** — fails when a new statement over `txn` neither carries it nor says why | `E-04` `E-20` |
| `IV-06` | Settlements are excluded from analysis and shown in the ledger. Settling a debt is not consumption; the purchase was already booked. `lib/cash.ts` is the deliberate exception, because cash genuinely moved. | unenforced | `E-04` `E-50` `E-63` |
| `IV-07` | A balance is never shown without its scope being determinate. | unenforced | `E-50` `E-51` |
| `IV-08` | **Your share is your spending**, the moment it happens. Who fronted the cash is irrelevant. Implemented in `myShareOf` and nowhere else. | unenforced — but single-sourced | `E-07` `E-56` `E-60` `E-63` |
| `IV-09` | An entry takes effect immediately for whoever created it and waits for approval from everyone else it touches. **You can always make yourself worse off, never someone else.** | `peerApproval.test.ts` | `E-04` `E-20` `E-52` |
| `IV-10` | Trust is per person, never per group. A group is only a set of humans, so a group-level switch would silently extend trust to whoever is added next. The per-group *override* is still keyed on a human, which is why it is allowed. | `trust.test.ts` | `E-01` `E-21` `E-65` |
| `IV-11` | A person with no `remote_uid` has no write path, so their trust value is inert. That check runs first. | `trust.test.ts` | `E-01` `E-65` `E-87` |
| `IV-12` | Approval state never lives on `txn_share` / `txn_payment` — both are deleted and re-inserted wholesale on every edit, so a decision stored there would be silently erased. | unenforced — structural | `E-06` `E-07` `E-20` |
| `IV-13` | Enforce the pending exclusion at the loader, not inside `myShareOf`. That function has no row id, and threading a pending set through its thirteen callers recreates the problem the rule exists to prevent. | unenforced | `E-60` |
| `IV-14` | `money.investments` is derived from live assets and never written. | `moveToInvestments.test.ts` | `E-11` `E-14` `E-54` |
| `IV-15` | An archived asset stops counting, because archiving is how you say you no longer own it. | `assetRegister.test.ts` | `E-14` `E-54` |
| `IV-16` | Income is never grouped. It writes `[{me, total}]` and zero shares, because grouping it carries no meaning. | `splitMath.test.ts` | `E-04` `E-06` `E-07` |
| `IV-17` | **Never one total across kinds.** Money in, money out and money moved do not belong in a single figure. Sum per kind and label it, or show a two-sided figure. Shipped as a bug twice. | unenforced | every summary surface |
| `IV-18` | **Never a P2P collect request.** NPCI banned them outright from 1 Oct 2025. Every request-money path is push: a QR the payer scans with their own app. | unenforced — by review | `FE-18` `FE-19` |
| `IV-19` | **Never present a QR-supplied name as who you are paying.** A code's `pn` is written by whoever made the code; lead with the VPA and label the name unverified. | unenforced — by review | `FE-19` |
| `IV-20` | Cash moves only on payments where `person_id = me`. Another person's expense, income or share moves your cash by zero. | `cashSql.test.ts` | `E-54` `E-06` |
| `IV-21` | A removed group member is soft-deleted, and `memberActive()` is the one predicate every statement uses. | **`memberInvariant.test.ts`** | `E-03` |
| `IV-22` | Only entries you authored enter the outbox. | **`outboxAuthorInvariant.test.ts`** | `E-18` |

Three consequences that will look like bugs to anyone who does not know the rules above, and are
not:

- **Cash does not move when a friend pays for you.** `IV-20`.
- **`proposeOverspendRaid` nets receivables and `safeToSpend` deliberately does not.** Two different
  questions: a receivable is not spendable, but it *is* a reason not to break open a goal. Do not
  unify them.
- **`debtLoad` nets friend debt against what friends owe you, never against card debt.** A friend's
  IOU does not reduce a balance accruing interest on a due date.
---

## §6 · Feature register

`Last verified: 2026-09-01 · Guarded by: flagRegister.test.ts (flags), featureFlags.test.ts, sourceCounts.test.ts`

Every user-facing capability, whether it is on, and where it lives.

**State** means: `live` (reachable and wired) · `flag:key` (live, behind a switch) · `server-gated`
(needs `EXPO_PUBLIC_API_URL`) · `unproven` (built and unit-tested, **never run on a device**) ·
`parked` (deliberately not built) · `blocked` (waiting on someone outside this repo) · `dead`
(present in the code, unreachable or inert).

**Flags are user preferences, never entitlements.** There is no paywall, no IAP and no entitlement
anywhere in the app, and repurposing a flag as one is forbidden (`DQ-01`). A flag names a whole
feature, never a fragment of one — five keys once gated a single chart each, which is configuration
nobody asked for.

### The 16 flags

| # | Key | Default | Gates | `FE-` |
|---|---|---|---|---|
| 1 | `splitting` | on | **Structural.** The Groups tab (→ `/personal` when off), the Home owe/owed strip, the Transfer kind in Add, the split-only first-run tiles | `FE-11` |
| 2 | `itemized` | on | "Split by items" in Add → `SC-08` | `FE-02` |
| 3 | `upiSettle` | on | Pay via UPI, Show QR to get paid, Settings → Getting paid | `FE-17` `FE-18` |
| 4 | `savingsGoals` | on | The goals list on Plan, and `SC-17` | `FE-27` |
| 5 | `healthScore` | on | The Home health ring → HealthSheet | `FE-32` |
| 6 | `affordCheck` | on | The Plan header icon → `SC-33` | `FE-33` |
| 7 | `insights` | on | The Plan header icon → `SC-22` | `FE-35` |
| 8 | `reports` | on | The Plan header icon **and** Settings → `SC-20` | `FE-36` |
| 9 | `recurring` | on | The Plan header icon → `SC-32`, and Add's Repeat chip | `FE-23` |
| 10 | `recurringSuggest` | on | The post-commit suggestion sheet on Review. Suggestion-only — never auto-creates, so a miss costs one tap | `FE-24` |
| 11 | `smartCategory` | on | The title→category guess, and the Title/Note field semantics in Add | `FE-07` |
| 12 | `reminders` | on | Settings → Notifications, `SC-30`, and the OS notifications themselves | `FE-50` |
| 13 | `receiptScan` | on | "Scan receipt" on Itemized. iOS only | `FE-03` |
| 14 | `importReview` | on | Settings → Import → `SC-18` / `SC-19` | `FE-40` |
| 15 | `streak` | **off** | The Home streak card. The only off-by-default flag; it also self-hides under 3 days | `FE-39` |
| 16 | `voiceEntry` | on | The Add mic, Settings → Voice entry, the Siri hand-off, the capture drain | `FE-05` `FE-06` |

**Three switches on `SC-24` that are deliberately not flags**, because each is something other than
a surface toggle: `save_location` must await an OS grant and can be refused; `auto_sweep_enabled`
moves real money unattended and is off by default; `ocr_provider` selects an *implementation*
(`gemini` ↔ `device`), not a surface. All three are `E-80` preferences.

**Persona composition.** `lib/personaDefaults.ts` maps the onboarding intent to a *sparse* patch.
Re-applying a persona from SC-24 writes **every** key, undoing hand-toggles — which is why it asks
first.

### Capture — getting money in

| ID | Feature | State | Where | Entities |
|---|---|---|---|---|
| `FE-01` | Quick add — expense, income, transfer, plus edit and rule-edit modes | live | `SC-07` | `E-04` `E-06` `E-07` |
| `FE-02` | Itemized split — 4-step wizard, per-item modes, tax/tip/discount/service | flag:`itemized` | `SC-08` | `E-08` |
| `FE-03` | Receipt scan, cloud (Gemini via own Worker) | flag:`receiptScan`, iOS | `SC-08` | `E-83` `E-08` |
| `FE-04` | Receipt scan, on-device (Apple Vision) | flag:`receiptScan`, iOS | `SC-08` | `E-83` |
| `FE-05` | Voice dictation inside the form | flag:`voiceEntry` | `SC-07` | `E-04` |
| `FE-06` | Hands-free Siri capture → watched folder → drained at launch | flag:`voiceEntry`, **partly dead** | `SC-35` | `E-86` |
| `FE-07` | Smart category guess, and learning from your corrections | flag:`smartCategory` | `SC-07` | `E-92` `E-09` |
| `FE-08` | Location tagging | pref `save_location`, off | `SC-07` `SC-15` | `E-04` |
| `FE-09` | Receipt attachments, viewer, and the orphan reaper | live | `SC-07` `SC-15` `SC-27a` | `E-83` |
| `FE-10` | Duplicate detection (±24 h) on save and on commit | live | `SC-07` `SC-19` | `E-04` |

`FE-06` is **flagged on and not installable**: `VOICE_SHORTCUT_URL` is `null`, so the one-tap
install path is dead and only the four-step manual setup works (`DQ-22`). The whole
Shortcuts apparatus is slated for deletion when App Intents land.

### Splitting, people and settlement

| ID | Feature | State | Where | Entities |
|---|---|---|---|---|
| `FE-11` | Groups — create, archive, delete, membership | flag:`splitting` (tab) | `SC-04` `SC-09` `SC-13` `SC-11` | `E-02` `E-03` |
| `FE-12` | Split math — equal, exact, percent, shares | live | `SC-07` `SC-08` `SC-19` | `E-60` |
| `FE-13` | Settle up, with debt simplification and multi-group allocation | live | `SC-07` Transfer pill — **no standalone route** | `E-52` |
| `FE-14` | Owe / owed exposure | flag:`splitting` (strip) | `SC-03` `SC-04` `SC-26a` | `E-50` `E-51` |
| `FE-15` | People — name-only contacts, no accounts needed | live | `SC-26` `SC-26a` | `E-01` |
| `FE-16` | Trust, and the per-person-per-group override | live | `SC-26a` | `E-21` `E-65` |
| `FE-17` | UPI intent hand-off — pay from your own UPI app | flag:`upiSettle` | `SC-07` | `E-85` |
| `FE-18` | Request money by QR — **push, never a collect request** | flag:`upiSettle` | `SC-07` `SC-06` | — |
| `FE-19` | Scan & Pay — long-press the FAB, scan any UPI/EMV QR, pay, record | live, unflagged | tab-bar FAB long-press | `E-84` `E-17` |
| `FE-20` | WhatsApp reminder composer — drafts, never sends | live | `SC-26a` | — |
| `FE-21` | Scheduled settle reminders | **parked** — needs an overdue scan, a cooldown store and a cadence | — | — |
| `FE-22` | Repayment likelihood / expected recovery | **parked**, design decided; trigger is `FE-20` shipping | — | — |

`FE-17` is **untested on Android** — `useUpiApps` returns null there, so the entire per-app payload
table is *unreachable*, not merely dead (`DQ-11`). The hand-off is refused by PhonePe, Paytm,
Amazon Pay and WhatsApp and that is closed on our side (`DQ-84`); the route round is `FE-18`.

### Personal finance

| ID | Feature | State | Where | Entities |
|---|---|---|---|---|
| `FE-23` | Recurring rules — create, materialize, skip, pause, resume, end | flag:`recurring` | `SC-32` `SC-41` `SC-09` | `E-04` `E-05` `E-59` |
| `FE-24` | Recurring suggestions after a commit | flag:`recurringSuggest` | `SC-19` | `E-67` |
| `FE-25` | My Budget (global) and Group Budget (default + my override) | live | `SC-10` `SC-10b` | `E-12` `E-56` |
| `FE-26` | Budget rebalance — re-plan the rest of the month | live | `SC-03` `SC-09` | `E-56` |
| `FE-27` | Savings goals — drag-rank funding order, lock, deadline, celebration | flag:`savingsGoals` | `SC-05` `SC-17` | `E-15` `E-16` |
| `FE-28` | Overspend raid, **with consent** and undo | live | `SC-05` | `E-62` |
| `FE-29` | Surplus sweep into goals | pref `auto_sweep_enabled`, **off** | `SC-05` | `E-62` |
| `FE-30` | Total money — cash buckets, net worth, credit headroom | live | `SC-05` | `E-54` |
| `FE-31` | **Asset register** — gold, FD, SIP as owned things; a transfer is not an expense | **unproven** — shipped 2026-09-01, never on a device | `SC-42` | `E-14` |
| `FE-32` | Financial health — four pillars behind a minimum-data gate | flag:`healthScore` | `SC-03` | `E-55` |
| `FE-33` | Afford check — seven axes, plain-English reasons | flag:`affordCheck` | `SC-33` `SC-07` | `E-61` |
| `FE-34` | Forecast — credibility-weighted, floored by committed bills | live, unflagged (its flag was deleted) | `SC-03` `SC-05` `SC-22` | `E-57` |
| `FE-35` | Insights — one narrative home, collapsible sections | flag:`insights` | `SC-22` | `E-63` `E-57` |
| `FE-36` | Reports — donut, trend, group summaries, CSV + PDF | flag:`reports` | `SC-20` `SC-21` | `E-63` |
| `FE-37` | Search — 3 years, month-sectioned, per-kind totals only | live, unflagged | `SC-23` | `E-04` |
| `FE-38` | Categories — global catalog, adopt-uncategorized, tombstones | live | `SC-25` `SC-16` | `E-09` `E-10` |
| `FE-39` | Streak | flag:`streak`, **off** | `SC-03` | — |
| `FE-40` | Personal ledger — Activity / Budget, cross-group filter, CSV | live | `SC-14` | `E-04` |
| `FE-41` | Audit log | live | `SC-28` | `E-13` |
| `FE-42` | Safe-to-spend strip | live | `SC-03` | `E-53` |

`FE-31` is the newest feature and the top of `RELEASE_CHECKLIST §0.2`. Until this document it had
**no behaviour section anywhere** — it passed the doc-coverage test by accident, because that test
matches file paths loosely.

`FE-42`'s name is an open legal question (`DQ-02`).

### Ingestion

| ID | Feature | State | Where | Entities |
|---|---|---|---|---|
| `FE-43` | Import a file (PDF / xlsx / xls / CSV / text) or paste | flag:`importReview` | `SC-18` | `E-17` |
| `FE-44` | PDF text extraction — bundled pdf.js in a hidden WebView, SHA-256 pinned | live | `SC-18` | — |
| `FE-45` | Paytm parser — CSV, statement text, xlsx workbook | live | `SC-18` | `E-17` |
| `FE-46` | GPay parser | **partial** — pasted text only; full import blocked on the export format (`DQ-82`) | `SC-18` | `E-17` |
| `FE-47` | Email transaction-alert parse | **partial** — paste only; live Gmail blocked on CASA Tier-3 (`DQ-81`) | `SC-18` | `E-17` |
| `FE-48` | Review inbox — in-place edit, drafts, bulk, filters, focus, saved views | flag:`importReview`, **never device-tested** | `SC-19` | `E-17` `E-66` |
| `FE-49` | CSV export per group / all groups, round-tripping via import | live | `SC-14` `SC-20` `SC-06` | — |
| `FE-50` | Reminders and local notifications, with deep-link routing | flag:`reminders` | `SC-31` `SC-30` | `E-90` `E-91` |
| `FE-51` | Bank sync / Account Aggregator | **dropped for the pilot, not deferred** (`DQ-83`) | — | — |

### Accounts, sync and backup — all server-gated

| ID | Feature | State | Where | Entities |
|---|---|---|---|---|
| `FE-52` | Account — email magic link, no password, delete account | server-gated, **unproven on device** | `SC-36` `SC-37` | `E-87` |
| `FE-53` | Linked people — invite by link or QR; the sender approves | server-gated, **unproven** | `SC-38` `SC-39` | `E-19` |
| `FE-54` | **Encrypted shared-group sync** — per-group key, X25519 wraps, sealed entries, CAS versioning, outbox | **built end to end, never run on a phone** | `SC-43` `SC-44` | `E-18` `E-82` `E-88` |
| `FE-55` | Approvals queue — "waiting for you" | live and reachable | `SC-40` `SC-15` `SC-03` | `E-20` |
| `FE-56` | Disputes — what others said about your entries | live | `SC-15` | `E-22` |
| `FE-57` | Local encrypted backup — passphrase, PBKDF2 50k, share sheet | live | `SC-34` | `E-89` |
| `FE-58` | Server backup / restore | server-gated; **restore never run on a device** | `SC-34` | `E-89` |
| `FE-59` | Restore guard — refuses a restore while sync is on | live | `SC-34` | `E-89` |
| `FE-60` | Push notifications | **parked** on the paid Apple account; the entitlement is stripped at build | — | — |

`FE-54` is the one to be careful about. It is complete — device identity, per-group keys, the
outbox, the server, the transport, sharing a group — and **no part of it has run on a phone**. Two
documents asserted it did not exist at all while it was deployed; that contradiction is what
started this document.

### System and safety

| ID | Feature | State | Where |
|---|---|---|---|
| `FE-61` | Biometric lock, privacy screen, hide amounts | live, all off by default | `SC-06` |
| `FE-62` | Onboarding — 9 stages, persona → sparse flag patch | live | replaces the navigator |
| `FE-63` | Undo — 5 s toast, survives back navigation | live | everywhere |
| `FE-64` | Storage (user-facing) — free space, clear caches, delete receipts. Nothing here can lose a transaction | live | `SC-27a` |
| `FE-65` | Dev storage — load demo data, **erase all data** | live **in release builds today** — deliberate for the pilot (`DQ-21`) | `SC-27`, 7 taps on the version |
| `FE-66` | Help | live, static | `SC-29` |
| `FE-67` | Premium / paywall / IAP | **does not exist, by decision** (`DQ-01`) | — |
| `FE-68` | Currency selection | **dead row** — `SettingsRow label="Currency" value="INR" onPress={undefined}` | `SC-06` |
| `FE-69` | Widget | **parked**, scope genuinely undecided (`DQ-06`) | — |
| `FE-70` | Mistral OCR fallback | **abandoned** — the on-device provider already solves it offline | — |
---

## §7 · Screens and navigation

`Last verified: 2026-09-01 · Guarded by: docCoverage.test.ts, deadRouteRef.test.ts, screenIdMap.test.ts, entryPointCount.test.ts`

44 routes. `SC-xx` numbers are the existing `S-xx` numbers — the same screen, the same digits, so old
citations still resolve (§12). `SC-42`, `SC-43` and `SC-44` are new: `/assets`, `/settings/sync` and
`/settings/sync-log` had no ID and no behaviour section anywhere before this document.

Layout and copy are **not** here — they are in `SCREENS.md`. This section answers "where does it live
and how do I get there".

### Navigator structure

```
SafeAreaProvider → KeyboardProvider → GestureHandlerRootView → SQLiteProvider
  → FeatureFlagsProvider → FlagsGate       blocks until flags load
    → DataRefreshProvider (+ StoreHydrator)
      → ToastProvider
        → LockGate                          biometric, re-auths on foreground
          → OnboardingGate                  replaces the navigator entirely when unfinished
            → Stack   headerShown:false · slide_from_right · bg = colors.bg
```

Only three routes declare options. Everything else inherits.

| Route | Options |
|---|---|
| `(tabs)` | `animation: fade` |
| `add/quick` | `presentation: fullScreenModal`, `slide_from_bottom` |
| `add/itemized` | `presentation: fullScreenModal`, `slide_from_bottom` |

**No `transparentModal` route exists.** Both `SheetModal.tsx` and `DraggableSheet.tsx` document a
"sheet that IS a route" pattern that is never used anywhere — dead guidance in two files (`OV-25`).

The tab bar renders **five slots over four routes**: Home · Groups|Personal · FAB · Plan · Settings.
Slot 2 is conditional on `splitting` (`AX-04`): with it off, the slot **pushes** `/personal`, a
stack route that can never render as focused (`OV-15`). The FAB taps to `/add/quick?kind=expense`
and **long-presses** (350 ms) to Scan & Pay — a hidden gesture taught by a one-time coach mark.

The tab-bar file is 427 lines and most of it is not navigation: sync, pending-payment and
pending-settlement confirmation, the voice drain, vanished-group alerts, the person-merge chain, the
snapshot, and the restore offer all live there (`OV-17`). The reason is real — that code must sit
below `DataRefreshProvider` — but it makes the navigator the busiest file in the app.

### The route table

Entry counts are **in-app `router.*` call sites**, measured from source. Deep links and notification
taps are listed separately below and are not in the count.

#### Tabs

| ID | Route | Purpose | In | Notes |
|---|---|---|---|---|
| `SC-01` | `app/_layout.tsx` | Root shell, provider stack, cold-start maintenance | — | Not a screen |
| `SC-02` | `app/(tabs)/_layout.tsx` | The 5-slot tab bar, plus a great deal that is not navigation | — | Not a screen. `OV-17` |
| `SC-03` | `/` | Home: period hero, health ring, category ranks, forecast, streak, owe/owed strip | 2 | Tabs `Today · Month · Year` |
| `SC-04` | `/groups` | Group list (Personal pinned) + friends balance chips | 5 | `active` / `archived` |
| `SC-05` | `/savings` | **Plan** — total money, assets, goals, upcoming | 2 | Four flag-gated header icons |
| `SC-06` | `/settings` | Everything, grouped. Version ×7 → `SC-27` | 1 | |

#### Add

| ID | Route | Purpose | In | Notes |
|---|---|---|---|---|
| `SC-07` | `/add/quick` | **The** form: expense / income / transfer, edit, rule-edit | **24** | fullScreenModal. 11 params. `OV-08` |
| `SC-08` | `/add/itemized` | 4-step itemized wizard | 1 | fullScreenModal |

#### Groups

| ID | Route | Purpose | In | Notes |
|---|---|---|---|---|
| `SC-09` | `/group/[id]` | Group hub: Expenses · Recurring · Budget · Members | 1 | Redirects to `/personal` for the personal group |
| `SC-10` | `/budget` | **My Budget**, global. Takes no group id, deliberately | 5 | 22-line wrapper over `BudgetEditor` |
| `SC-10b` | `/group/[id]/budget` | A group's default + your override | 1 | Forwards to `SC-10` for the personal group |
| `SC-11` | `/group/[id]/members` | Add / invite / remove | 1 | |
| `SC-13` | `/group/[id]/edit` | Rename, recolour, share, leave, delete | 1 | Shares `GroupForm` with the create sheet |
| `SC-14` | `/personal` | The personal ledger: Activity · Budget | 2 | A stack route in a tab slot. `OV-15` |

#### Money and planning

| ID | Route | Purpose | In | Notes |
|---|---|---|---|---|
| `SC-16` | `/category/[name]` | One category across day/month/year | 2 | Heaviest single read in the app |
| `SC-17` | `/savings/[id]` | One goal | 3 | |
| `SC-20` | `/reports` | Factual monthly history, CSV + PDF | 2 | Cannot advance past the current month |
| `SC-21` | `/report-transactions` | Month-scoped drill-down | 1 | Tabs `All · Expenses · Income · Transfers` |
| `SC-22` | `/insights` | The single narrative home | 3 | |
| `SC-32` | `/plan/recurring` | Every active rule, by next occurrence | 2 | No per-row actions — it taps through |
| `SC-33` | `/afford` | Can I afford this | **1** | Sole entry is an unlabeled icon. `OV-16` |
| `SC-41` | `/recurring/[id]` | **One** rule, with all the actions | 5 | Replaced `group/[id]/recurring` |
| `SC-42` | `/assets` | The asset register | 3 | **New ID.** Undocumented until now |

#### Transactions, review, people

| ID | Route | Purpose | In | Notes |
|---|---|---|---|---|
| `SC-15` | `/txn/[id]` | Transaction detail | 5 | |
| `SC-18` | `/import` | File or paste → parse → `E-17` | 2 | `replace`s to `SC-19` on success |
| `SC-19` | `/review` | The staging inbox | 2 | Largest screen; 12 sheet states. `OV-24` |
| `SC-23` | `/search` | 3-year search, month-sectioned | 1 | A **ledger**, not an analysis surface |
| `SC-25` | `/categories` | The global catalog | 1 | |
| `SC-26` | `/friends` | People | 2 | |
| `SC-26a` | `/person/[id]` | One person, across every group | 2 | |
| `SC-28` | `/history` | Audit log | 4 | |
| `SC-40` | `/approvals` | Entries waiting on you | 2 | **Reachable** — the old doc said otherwise |

#### Settings and system

| ID | Route | In | Notes |
|---|---|---|---|
| `SC-24` | `/features` | 1 | 16 flags + 3 non-flag prefs |
| `SC-27` | `/storage` | 1 | Dev only: demo data, **erase all**. Live in release (`DQ-21`) |
| `SC-27a` | `/settings/storage` | 5 | Safe. Nothing here can lose a transaction |
| `SC-29` | `/help` | 1 | A third collapsible pattern (`DQ-17`) |
| `SC-30` | `/reminders` | 1 | Read-only "what's coming" |
| `SC-31` | `/settings/notifications` | 2 | |
| `SC-34` | `/settings/backup` | 3 | |
| `SC-35` | `/settings/voice` | 1 | |
| `SC-36` | `/settings/account` | 6 | Server builds only |
| `SC-37` | `/auth` | **0** | Deep link only, by design |
| `SC-38` | `/settings/linked` | 2 | Own `ErrorBoundary` |
| `SC-39` | `/link` | **0** | Deep link only, by design |
| `SC-43` | `/settings/sync` | 3 | **New ID** |
| `SC-44` | `/settings/sync-log` | 2 | **New ID** |

### Getting there

A route is not a direction. `/group/[id]/budget` tells you nothing you can act on with a phone in
your hand; *"Groups → a group → Budget tab"* does. One line per screen, written as taps from a cold
open. The walkthrough shows these instead of the paths.

| Screen | Taps |
|---|---|
| `SC-03` | **Home** tab — the first one |
| `SC-04` | **Groups** tab. With splitting off this slot is Personal instead |
| `SC-05` | **Plan** tab — fourth slot, labelled Plan though the route says savings |
| `SC-06` | **Settings** tab, or your avatar at the top right of Home |
| `SC-07` | The **＋** in the middle of the tab bar |
| `SC-08` | **＋** → *Split by items* |
| `SC-09` | **Groups** → tap a group |
| `SC-10` | **Settings → Budget**, or Home's *Set a monthly budget* tile |
| `SC-10b` | **Groups → a group → Budget** tab |
| `SC-11` | **Groups → a group → Members** tab |
| `SC-13` | **Groups → a group → ⋯ → Edit** |
| `SC-14` | **Groups → Personal**, pinned at the top of the list |
| `SC-15` | Tap any transaction row, anywhere |
| `SC-16` | **Home** → tap a category in the ranked list |
| `SC-17` | **Plan** → tap a goal |
| `SC-18` | **Settings → Import transactions** |
| `SC-19` | **Home** → the inbox badge at the top right. Also where an import lands |
| `SC-20` | **Plan** → the chart icon in the header, or **Settings → Reports & export** |
| `SC-21` | **Reports** → tap a slice of the donut |
| `SC-22` | **Plan** → the insights icon in the header, or Home → tap the pace line |
| `SC-23` | **Home** → the magnifier at the top right |
| `SC-24` | **Settings → Features** |
| `SC-25` | **Settings → Categories** |
| `SC-26` | **Settings → People** |
| `SC-26a` | **People** → tap someone, or **Groups** → a balance chip |
| `SC-27` | **Settings** → tap the version number **seven times** |
| `SC-27a` | **Settings → Storage**, or Home's low-disk banner |
| `SC-28` | **Settings → Activity**, or a group → **⋯ → History** |
| `SC-29` | **Settings → Help** |
| `SC-30` | **Home** → the bell at the top right |
| `SC-31` | **Settings → Notifications** |
| `SC-32` | **Plan** → the repeat icon in the header |
| `SC-33` | **Plan** → the question-mark icon in the header. Its only way in |
| `SC-34` | **Settings → Backup & restore** |
| `SC-35` | **Settings → Voice entry** |
| `SC-36` | **Settings → Account.** Only exists in a build with a server configured |
| `SC-37` | Tap the sign-in link in your email. **Nothing in the app opens this** |
| `SC-38` | **Settings → Account → Linked people** |
| `SC-39` | Tap an invite someone sent you. **Nothing in the app opens this** |
| `SC-40` | **Home** → the *waiting for you* badge at the top right |
| `SC-41` | **Plan** → the repeat icon → tap a rule. Also where a renewal reminder lands |
| `SC-42` | **Plan** → tap Total money → **Assets** |
| `SC-43` | **Settings → Sync** |
| `SC-44` | **Settings → Sync → Sync log** |

`SC-01` and `SC-02` are the app shell and the tab bar — you are always inside them, so there is
nowhere to go.

### Reachability

- **Zero in-app entries:** `SC-37` `/auth` and `SC-39` `/link` — correct, both are deep-link landing
  pads. They can cold-start with an empty stack and both use `replace`, which is right.
- **One entry, and it is an unlabeled icon:** `SC-33` `/afford`. `featureFlags.ts` says of its flag,
  "a real feature since the engine grew; off is why nobody found it" — it is on now, and still
  behind one icon in a rail of four (`OV-16`).
- **One entry, buried:** `SC-23` `/search`, `SC-30` `/reminders`, `SC-21` `/report-transactions`,
  `SC-27` `/storage` (a 7-tap gesture).
- **The hub:** `SC-07` `/add/quick`, at 24 in-app call sites plus three external entries. It is the
  destination of every settle-up, every "log it" affordance, the daily-log notification and the Siri
  shortcut. `OV-08`.
- **Three buttons, one destination:** `SC-09` sends the FAB, the Expenses tab's add and the Recurring
  tab's add all to the same `/add/quick?groupId=…&kind=expense` (`OV-27`).

### Non-`router` entries

| Entry | Lands on | Mechanism |
|---|---|---|
| `budgetsplit:///auth?token=…` | `SC-37` | Deep link; token spent once, then `replace` to `SC-36` |
| `budgetsplit:///link?token=…` | `SC-39` | Deep link; claiming *asks*, links nothing yet |
| Siri `VOICE_DEEP_LINK` | `SC-07` | `?q=…` |
| Notification `renew_{ruleId}_d{n}` | `SC-41` | `routeForReminder` |
| Notification `daily_log` | `SC-07` | `routeForReminder` |
| Notification `backup_nudge` | `SC-20` | `routeForReminder` |
| Tab-bar FAB long-press | ScanPaySheet | 350 ms, taught once by a coach mark |
| Settings version ×7 | `SC-27` | Gated on `DEV_TOOLS_ENABLED` |

### Back-stack

`lib/nav.ts` exports `backOr(router, fallback)` — `back()` if there is a stack, otherwise
`replace(fallback)`. It exists because a deep-linked or cold-started screen has an empty stack and a
dead ✕. **It is used in 5 of 44 route files**; the other ~40 call bare `router.back()` (`OV-10`).
Today that is only safe because nothing deep-links into those screens.

Four sites were pushing a *tab* route onto the stack, which stacks a duplicate tab instead of
switching — Back then returned to the screen you came from rather than leaving it. Fixed 2026-09-01:
Home → Settings and Home → Groups now `navigate`; `/savings/[id]` → Plan and group-edit → Groups now
`dismissTo`, matching the three correct `dismissTo` calls already in that file.

### Sheets

`SheetModal` (RN `Modal` + `DraggableSheet`) is the one sheet primitive. A newly visible sheet
**claims the stage** via `lib/sheetStage.ts`, force-unmounting every other sheet — which fixes the
iOS bug where two modals leave an invisible, touch-eating view behind. Roughly 45 sheet components
use it.

Three presentation tiers are in use, and the boundaries between them are not principled:

| Tier | Used by |
|---|---|
| `fullScreenModal` route | `SC-07`, `SC-08` only |
| Pushed full screen | the other 42 routes <!--count-ok--> |
| In-screen `SheetModal` | ~45 components across 13 route files <!--count-ok--> |

Creating a group is a sheet; editing one is a route. Adding a person is a sheet; adding a member is a
route. Editing a budget is a route (`SC-10`) *and* a sheet (`OwnBudgetSheet`). That is `OV-26`.

### Cold start

```
launch
 └ openDB → seedIfNeeded → materializeDueOccurrences → drainVoiceInbox
          → runSavingsMaintenance → rescheduleReminders → reapOrphanedAttachments
    ├ throws            → ErrorState "Couldn't start BudgetSplit" [Retry]
    └ fonts / db unready → BrandedLoader
 └ FlagsGate → LockGate → OnboardingGate → Stack → (tabs) → SC-03
 └ tab-bar mount: runSync · maybeSnapshot · restore-offer alert
 └ cold notification tap: getLastNotificationResponseAsync → routeForReminder
```

**Onboarding is not routes.** It replaces the navigator entirely: `hero → intent → name → income →
money → pay → budget → people → permissions → summary`, with `people` skipped for the personal
persona. "Replay welcome tour" clears the flag but **requires an app restart** — the gate cannot be
re-entered live.

**There is no auth gating.** The app is fully usable with no account.
---

## §8 · Flow catalog

`Last verified: 2026-09-01 · Guarded by: entryPointCount.test.ts (/add/quick), deadRouteRef.test.ts`

54 flows. `FL-01…11` are the existing `FLOW-01…11`, same numbers; new flows start at `FL-12`.

Each carries: **trigger · entry points `.E` · preconditions · steps `.S` · entities · writes ·
exit + back-stack · branches `.B` · failure modes `.FM` · reversibility · ladder · known problems.**

Two rules make this section do work rather than describe:

- **Entry points are counted in the header.** A number you can watch fall. It is the same mechanism
  as the `review.tsx: 620` line ceiling, which has already forced three real decompositions.
- **Steps are capped at 9.** A flow needing a tenth is two flows. That cap is the enforcement arm of
  "we have made too many complicated flows" — it converts the complaint into a rule.

Flows `FL-01`–`FL-20` get the full treatment. `FL-21` onward are terser where the flow is short or
its interest is entirely in its ladder; every one still names its entities, its exit and its problems.

---

### FL-01 · First run — 1 entry point

```
Trigger.     Opening the app for the first time.
Entry.       .E1 OnboardingGate, when settings.onboardingDone() is false or errors
Pre.         None. This is the only flow with no preconditions.
Steps.       .S1 hero  .S2 intent  .S3 name  .S4 income  .S5 money  .S6 pay
             .S7 budget  .S8 people (skipped for the personal persona)
             .S9 permissions + summary
Entities.    W E-01 (me) · W E-11 money profile · W E-80 · W E-81 flags
Writes.      A person row with is_me, the money profile, a sparse flag patch from
             the persona, budget_target, onboardingDone.
Exit.        The navigator mounts for the first time. No back-stack — onboarding
             *replaces* the navigator rather than sitting in it.
Branches.    .B1 personal persona skips .S8 — 7 numbered steps instead of 8
             .B2 permissions can be refused; the app works anyway
Failures.    .FM1 a read error on the done-flag is treated as "not done", so a
                  storage fault re-runs onboarding rather than skipping it
             .FM2 declining notifications silently disables FE-50's value
Reversible.  "Replay welcome tour" clears the flag but **requires an app restart** —
             the gate cannot be re-entered live. A known rough edge.
State.       empty — Storage → Erase all data, then relaunch. This is the ONLY
             way to see first run, and the only way to see any empty state.
Numbers.     · nothing exists yet. Every list should be a designed empty state
               with something to tap, never a zero or a blank
             · the figures you type here become the opening balances every later
               number is built on — get them wrong and everything downstream is
Also try.    · refuse the notification permission and check the app still works
             · pick the personal-only persona and confirm the Groups tab is gone
             · replay the tour from Settings — it needs an app restart, which is
               a known rough edge worth seeing for yourself
Ladder.      SN-01
Problems.    —
```

### FL-02 · Turn a feature on or off — 1 entry point

```
Trigger.     "I don't want this part of the app", or "where did X go".
Entry.       .E1 SC-06 → SC-24
Pre.         None.
Steps.       .S1 open SC-24  .S2 toggle a switch  .S3 the surface appears/vanishes
Entities.    W E-81 (16 flags) · W E-80 (3 prefs that are not flags)
Writes.      One AsyncStorage key. Optimistic; setFlag cannot fail.
Exit.        Stays on SC-24.
Branches.    .B1 `splitting` off is structural — the tab bar changes shape and
                 Transfer disappears from Add. It warns about unsettled balances first.
             .B2 re-applying a persona writes EVERY key, undoing hand-toggles,
                 so it confirms first
             .B3 save_location must await an OS grant and can be refused
Failures.    .FM1 turning off a flag whose data still exists hides the data, never
                  deletes it — but nothing says so on screen
Reversible.  Fully, instantly.
State.       any.
Numbers.     · turning a switch off **hides a surface, it never deletes data**.
               Turn it back on and everything should still be there
             · turning off splitting with money outstanding: the balances survive
               untouched, they just stop being shown
Also try.    · turn off splitting and count how much of the app changes shape —
               the tab bar, Home's strip, and the Transfer kind all go
             · re-apply a persona and check it warns you first: it overwrites
               **every** switch, including ones you set by hand
             · toggle location and watch it ask the OS rather than just flipping
Ladder.      SN-02
Problems.    —
```

### FL-03 · Premium upgrade — 0 entry points

```
Trigger.     Nothing. There is nothing to trigger.
State.       any — the point is that you will not find this anywhere.
Steps.       .S1 look for a paywall, an upgrade prompt, a locked feature, a
             "Pro" badge or a price. There is none, in any state.
Writes.      Nothing exists to write. No paywall, no IAP, no entitlement, no SDK.
Numbers.     · no figure anywhere is gated. Every feature is on for everyone
             · **feature switches are preferences, not a paywall in disguise.**
               If you ever find one that reads as "upgrade to unlock", that is
               the bug this entry exists to catch
Also try.    · turn off several switches and confirm nothing offers to sell them
               back to you
             · search Settings for any mention of price, plan, upgrade or Pro
Problems.    DQ-01 — what monetisation would even be is genuinely undecided, and
             this entry is here so the answer is not accidentally "the flags".
```

### FL-04 · Add an expense — 24 entry points, 11 params

```
Trigger.     "I spent money."
Entry.       24 in-app call sites, plus 3 external. The full list:
             .E1  tab-bar FAB                        (tabs)/_layout.tsx:350
             .E2  Home banner CTA                     (tabs)/index.tsx:117
             .E3  Home empty-state CTA                (tabs)/index.tsx:258
             .E4  Home balance-strip Settle           (tabs)/index.tsx:346
             .E5  Groups friends-strip Settle         (tabs)/groups.tsx:290
             .E6  group balance card Settle           group/[id].tsx:238
             .E7  group FAB                           group/[id].tsx:261
             .E8  group members pair Settle           group/[id].tsx:294
             .E9  group Expenses tab add              group/[id].tsx:310
             .E10 group Recurring tab add             group/[id].tsx:316
             .E11 members screen Settle               group/[id]/members.tsx:179
             .E12 Personal FAB                        personal.tsx:262
             .E13 Personal empty CTA                  personal.tsx:304
             .E14 person Settle                       person/[id].tsx:235
             .E15 person Add expense                  person/[id].tsx:248
             .E16 friends Settle                      friends.tsx:338
             .E17 reminders "Log payment"             reminders.tsx:144
             .E18 recurring list add                  plan/recurring.tsx:157
             .E19 rule action → log this one          hooks/useRecurringActions.ts:73
             .E20 insights CTA                        insights.tsx:143
             .E21 reports CTA                         reports.tsx:325
             .E22 afford "Log it" / "Buy anyway"      afford.tsx:380
             .E23 category detail add                 category/[name].tsx:383
             .E24 txn detail → Edit                   txn/[id].tsx:126
             .X1  daily_log notification   .X2 Siri VOICE_DEEP_LINK   .X3 deep link
Pre.         A group exists (the launch invariant guarantees the personal one).
             flags.splitting gates the Transfer kind only (AX-04).
Steps.       .S1 amount  .S2 destination group  .S3 category  .S4 title/note
             .S5 date  .S6 pay method  .S7 payers  .S8 split  .S9 save
             All but .S1 and .S9 have defaults. The median real path is 2 steps.
Entities.    W E-04 · W E-06 · W E-07 · R E-02 · R E-09 · R E-01 · W E-18 (shared)
             W E-83 (attachment) · R E-92 (the category guess)
Writes.      One withTransactionAsync: the txn, its payments, its shares, its
             line items if any, and an outbox row if the group is shared. IV-03.
Exit.        Dismisses the fullScreenModal back to wherever it came from. Uses
             backOr, so a cold-started deep link does not get a dead ✕.
Branches.    .B1 kind = income → FL-12, no shares, never grouped (IV-16)
             .B2 kind = transfer → FL-06
             .B3 "Split by items" → FL-05
             .B4 marked recurring → creates a RULE, not an event (IV-04)
             .B5 editId set → edit mode, compare-and-set on sync_version
             .B6 recurEditId set → edits the rule, not one occurrence
             .B7 an untrusted author's copy lands awaiting approval on their device
Failures.    .FM1 amount unparseable → inline validation, haptic.error
             .FM2 duplicate within ±24 h → a warning, never a block
             .FM3 storage full at attachment write → the txn still saves
             .FM4 the destination group was deleted while the sheet was open
             .FM5 shares stop summing to payments after a member is removed mid-edit
Reversible.  Undo toast for 5 s, then soft-delete from SC-15. An entry someone
             else wrote cannot be deleted by you — dispute it instead (FL-28).
State.       demo or yours — Roommates holds you, Aarav and Priya, so a
             three-way split is one tap away.
Numbers.     · **the check that matters most in this app.** Log ₹300 in Roommates
               split three ways: Home's month total rises by **₹100, not ₹300**.
               Your share is your spending, whoever fronted the cash (IV-08)
             · the group balance moves by the other ₹200, owed to you
             · **cash drops by ₹300 only if you paid.** If Aarav paid, your cash
               does not move at all (IV-20)
             · Reports and the category's budget bar move by ₹100, not ₹300
Also try.    · log one where **someone else paid** and confirm your cash is
               untouched while your spending still rose
             · backdate one into last month and check it lands in last month's
               budget, not this one
             · ₹0 · a negative amount · `12.345` · `1,2,3`
             · log into a category already over budget and watch the nudge fire
Ladder.      SN-04
Problems.    OV-08 (11 params, 24 entries) · OV-02 (if kind=transfer) · OV-27
```

### FL-05 · Split a bill by items — 1 entry point

```
Trigger.     "We ordered separately and the bill is one number."
Entry.       .E1 SC-07 → "Split by items"  (flag: itemized)
Pre.         flags.itemized. A shared group with ≥2 members is the useful case,
             though it works in Personal.
Steps.       .S1 items (typed, or scanned — FL-18)  .S2 assign each line
             .S3 adjustments: tax, tip, discount, service  .S4 payers
             .S5 review  .S6 save
Entities.    W E-08 · W E-04 · W E-06 · W E-07
Writes.      One transaction: the txn with adjustments as JSON, its line items,
             and the payments and shares derived from the assignment.
Exit.        Dismisses to the caller.
Branches.    .B1 a line left unassigned splits across everyone
             .B2 per-item split mode can differ from the bill's default
Failures.    .FM1 items summing to less than the bill leaves a remainder that
                  must land somewhere deterministic (IV-02)
             .FM2 OCR returns nothing useful → falls back to manual entry
Reversible.  As FL-04.
State.       demo — the Goa Trip seafood dinner is already itemized, and mixes
             percent and shares splits on one bill.
Numbers.     · the line items, plus tax and tip, minus the discount, must equal
               the bill total shown at the top
             · **your share is the sum of the items assigned to you** — not the
               bill divided by the number of people
             · a line nobody is assigned splits across everyone
Also try.    · open the demo's seafood dinner and **add the four items up by
               hand**, then apply 5% GST, 10% tip and the ₹200 coupon
             · leave a line unassigned and see where its cost goes
             · make the items sum to less than the bill and find where the
               remainder lands — it has to land somewhere deterministic
Ladder.      SN-05
Problems.    **Line items do not sync.** A peer receives a single expense: the
             money is right, the breakdown is gone. Nothing on screen says so.
```

### FL-06 · Settle up — 8 entry points

```
Trigger.     "We're square" / "I paid them back".
Entry.       .E1 Home balance strip  .E2 Groups friends strip  .E3 group balance
             card  .E4 group members pair  .E5 members screen  .E6 person detail
             .E7 friends list  .E8 reminders "Settle now"
             All eight land on SC-07 with kind=transfer and varying params — which
             is why a missing groupId here is a real bug class (OV-08).
Pre.         A non-zero balance with someone (E-50). flags.splitting for the strip.
Steps.       .S1 pick the person  .S2 pick the scope: this group, or all groups
             .S3 amount (defaults to the full net)  .S4 direction
             .S5 method: cash, or hand off to UPI (FL-20)  .S6 confirm
Entities.    R E-50 · R E-52 · W E-04 (kind=settlement) · W E-06 · W E-07
             W E-85 if handed off to UPI
Writes.      One settlement row per group the plan touches — so settling one
             global figure can write three rows, none of them the figure shown.
Exit.        Back to the caller. The balance recomputes; nothing is cached.
Branches.    .B1 partial settlement leaves a remainder
             .B2 over-settling flips the direction
             .B3 simplify_debt on → the plan may route through a third person
             .B4 scope = all groups → planAllGroupsSettlement (E-52)
             .B5 UPI hand-off → E-85, confirmed on return, because UPI gives no
                 reliable callback and only the human knows what happened
Failures.    .FM1 they settle simultaneously → two settlements, balance overshoots
             .FM2 the counterparty has no remote_uid → nothing reaches them
             .FM3 an entry awaiting approval is inside the amount being settled
             .FM4 Android: useUpiApps returns null, the whole hand-off is unreachable
Reversible.  Soft-delete the settlement, which reopens the debt.
State.       demo — Aarav and Priya part-settled in Roommates, Office Lunch is
             fully settled, Family is one you owe. **Goa has simplify OFF**, so
             every debt there stays separate.
Numbers.     · **your month spending must NOT change.** Settling is not spending
               — the purchase already counted (IV-06)
             · **Reports must not change either**
             · cash drops by exactly what you handed over
             · the balance with that person goes to zero, or to the remainder
Also try.    · **settle half** and check the remainder is right
             · **settle more than you owe** and watch the direction flip
             · Office Lunch is already at zero — check it says so rather than
               offering you a settle-up of ₹0
             · you share more than one group with Rohan: settle "all groups" and
               then check **which group each row landed in**. There is a real
               open question here, and it is the best find in this document
Ladder.      SN-06 — the richest ladder in the document
Problems.    OV-02 (kind=settlement means four things) · DQ-13 · DQ-11 (Android)
```

### FL-07 · View the dashboard — 1 entry point

```
Trigger.     Opening the app.
Entry.       .E1 the (tabs) default route
Pre.         None. Has a dedicated first-run empty state.
Steps.       .S1 pick a period: Today · Month · Year  .S2 read  .S3 tap through
Entities.    R nearly everything: E-04 E-07 E-50 E-51 E-53 E-55 E-56 E-57 E-58 E-63
Writes.      None.
Exit.        Stays. Tapping through goes to SC-22, SC-16, SC-07, SC-40, SC-19,
             SC-23, SC-30, SC-06, SC-28, SC-27a, SC-10, SC-04, SC-26.
Branches.    .B1 flags.healthScore off nulls the ring
             .B2 flags.splitting off removes the owe/owed strip
             .B3 flags.streak off (default) removes the streak card
             .B4 under the minimum-data gate, health refuses rather than showing 0
Failures.    .FM1 three red surfaces can stack on one open — deliberately not
                  de-duplicated, because whether that is too many is a question
                  only real users settle (DQ-12)
Reversible.  n/a — read-only.
State.       demo — seeded so every card has something to show.
Numbers.     · **the hero total must equal the sum of the category rows below it**
             · the month-end projection here must be the **same number** Insights
               shows. Two screens, one figure
             · owe and owed are **two figures, never netted into one** — ₹5,000
               out and ₹5,000 in is not zero
             · switching Today / Month / Year changes the window, not the maths
Also try.    · **add the category rows up and check they equal the hero**
             · check the health ring refuses to score when there is too little
               data, rather than showing a misleading zero
             · look for three red things at once — whether that is too many is a
               live open question, and your opinion is the answer
Ladder.      SN-07
Problems.    OV-14 (E-50 recomputed per render)
```

### FL-08 · Import a statement → Review → commit — 2 entry points

```
Trigger.     "I have a statement / a Paytm export / a pile of alerts."
Entry.       .E1 SC-06 → SC-18   .E2 SC-19's empty state → SC-18
Pre.         flags.importReview.
Steps.       .S1 pick a file or paste  .S2 format auto-detected  .S3 parsed rows
             land in E-17  .S4 replace() to SC-19  .S5 edit in place, per row
             .S6 bulk-apply where wanted  .S7 commit
Entities.    W E-17 · R E-02 E-01 E-09 · W E-04 E-06 E-07 on commit · R E-67
Writes.      Parsing writes pending rows. The commit is ONE transaction per batch:
             it lands or it does not (IV-03).
Exit.        SC-18 `replace`s to SC-19, so Back does not return to the picker.
Branches.    .B1 detected as Paytm / GPay / email alert / generic CSV / bank text
             .B2 a PDF goes through the bundled pdf.js in a hidden WebView
             .B3 after commit, FE-24 may offer to make a rule out of a pattern
             .B4 saved views recall a filter set and a per-view payer
Failures.    .FM1 format not recognised → the raw text is kept, nothing is lost
             .FM2 a row's destination group is deleted → dest_group_id, split_draft
                  and counterparty are reset so the row stays committable
             .FM3 duplicates against existing txns are flagged, not blocked
Reversible.  Undo per commit. Discard per row. Clear all.
State.       demo — **9 rows are already waiting** in Review: 6 from Google Pay,
             3 from email alerts, some pre-categorised and some not.
Numbers.     · **nothing in the inbox counts anywhere until you commit.** Note
               Home's total before and after opening Review — it must not move
             · after committing all 9, your month total rises by exactly their
               sum, and the badge goes away
             · a row you route into a group and split counts only your share
Also try.    · open Review and **check Home's badge count matches the row count**
             · edit a row's category in place, leave, come back — the draft
               should still be there
             · commit one row, then re-import the same file and check the
               duplicate warning fires
             · discard everything and confirm no transaction was created
Ladder.      SN-08
Problems.    OV-24 (12 sheet states) · OV-21 · FE-48 has never been device-tested
```

### FL-09 · Set and track a budget — 6 entry points

```
Trigger.     "I want to spend less on X."
Entry.       .E1 SC-06  .E2 Home get-started tile  .E3 SC-14  .E4 SC-22
             .E5 SC-16  .E6 SC-10b's redirect for the personal group
Pre.         None. Categories exist from the seed.
Steps.       .S1 choose the level  .S2 pick categories  .S3 set amounts
             .S4 pick a cadence  .S5 save
Entities.    W E-12 · R E-09 · R E-56 · R E-04 E-07 for the spend side
Writes.      One category_budget row per line, at one of two levels.
Exit.        router.back().
Branches.    .B1 My Budget (global) — SC-10, takes no group id, deliberately
             .B2 a group's default — admin only (E-64)
             .B3 my override on a group — only the categories you fill in become
                 yours; a blank keeps following the group, it does not mean zero
             .B4 over budget → FL-38 rebalance is offered
Failures.    .FM1 a category renamed after a budget is set — the reference is a
                  name, so the rename rewrites it (OV-06)
             .FM2 a budget set on a category later deleted becomes unreachable
Reversible.  Clear the amount.
State.       demo — Groceries is **over** (₹9,000 of ₹8,000), Eating Out is
             **near** (₹2,700 of ₹3,000), Fuel is **under**. Daily and yearly
             cadences are both set, so every bar state exists already.
Numbers.     · a budget is measured against **your share**, never the whole bill
               (IV-08). The Roommates groceries were ₹4,500 and ₹1,500 is yours
             · the bar colour must match the arithmetic: over red, near amber,
               under green
             · a **blank** override means "keep following the group", not zero —
               this is the one most likely to be wrong
             · a daily line and a monthly line are the same money at different
               rates; the yearly one only counts on the Year view
Also try.    · **check Groceries reads ₹9,000 of ₹8,000** and the bar is red
             · set a group default, then override one category for yourself and
               leave another blank — confirm the blank one still follows
             · rename a category that has a budget and check the budget follows
             · set a budget, then delete the category, and see what happens
Ladder.      SN-09
Problems.    OV-07 (three concepts, two levels, plus two dead and one stray)
             OV-19 (period vs cadence) · the path from Home is 3 hops, from a
             group up to 5 with a mid-flight redirect
```

### FL-10 · Fund a savings goal — 3 entry points

```
Trigger.     "I want to put money aside."
Entry.       .E1 SC-05 goal card  .E2 SC-17  .E3 SC-16 related goals
Pre.         flags.savingsGoals.
Steps.       .S1 open the goal  .S2 amount  .S3 source bucket  .S4 confirm
Entities.    W E-16 · R/W E-15 · R E-54 · R E-62
Writes.      A savings_txn row. The goal's saved total is derived from them.
Exit.        Stays on SC-17.
Branches.    .B1 auto-funding on a frequency, run by launch maintenance
             .B2 overspend raid — FL-36, asks first, undoable
             .B3 surplus sweep — FL-37, off by default
             .B4 a locked goal is protected from a raid
             .B5 manual overfunding is allowed; the engine still caps itself
Failures.    .FM1 funding more than you hold → refused against E-54
             .FM2 the source bucket round trip is only partly built (DQ-15)
Reversible.  Withdraw, which writes the opposite row. Raids have explicit undo.
State.       demo — eight goals covering every state: **Weekend Getaway sits at
             97.5%, so ₹500 finishes it and fires the celebration.** Emergency
             Fund is locked, Tax Payment's deadline has passed, New Phone is 0%,
             Anniversary Gift is 120% overfunded.
Numbers.     · **funding a goal does not change net worth** — the money moved
               from cash into a goal, and both are yours
             · **it is not spending either.** Your month total must not move
             · the goal's ring and its rupee figure must agree
             · funding order is drag rank **within** a priority tag, not the tag
               alone — the two are easy to confuse
Also try.    · **add ₹500 to Weekend Getaway and watch the celebration fire**
             · try to fund more than you hold
             · withdraw from Europe Vacation and check the history shows both the
               deposits and the withdrawal, netting to ₹3,000
             · look at Anniversary Gift at 120% — an overfunded goal is allowed
             · look at Tax Payment, whose deadline is already past
Ladder.      SN-10
Problems.    priority vs sort_order is a standing confusion: priority protects
             from a raid, drag rank decides funding order. Two orderings, one word.
```

### FL-11 · Back up and restore — 3 entry points

```
Trigger.     "Don't lose my data" / "I have a new phone."
Entry.       .E1 SC-06 → SC-34  .E2 the restore-offer alert on launch
             .E3 SC-36 → SC-34
Pre.         Restore to an account needs FE-52. A local file needs nothing.
Steps.       .S1 set a passphrase  .S2 the DB + photos are encrypted (PBKDF2 50k)
             .S3 out to the share sheet, or up to the account
             .S4 to restore: pick the file  .S5 passphrase  .S6 confirm REPLACE ALL
Entities.    R/W E-89 · W every BACKUP_TABLE · W E-83 photos
Writes.      A restore **replaces all data**. E-18 is deliberately excluded, and
             E-80's AsyncStorage preferences are not in the backup at all — so a
             restore does not return you to exactly where you were.
Exit.        Back, or a forced reload after a restore.
Branches.    .B1 local file  .B2 server blob  .B3 the launch restore offer
Failures.    .FM1 wrong passphrase → refused, nothing touched
             .FM2 **a restore is refused outright while sync is on** (restoreGuard,
                  SYNC-F9) — restoring an old state into a shared group would
                  re-publish it
             .FM3 a backup over ~25 MiB is capped by KV standing in for R2 (DQ-85)
Reversible.  No. A restore is not undoable, which is why .S6 is explicit.
State.       demo — plenty to back up. **Do this before any destructive test.**
Numbers.     · after restoring, every figure must match what it was at backup
               time, exactly — Home's total, every balance, every goal
             · **your app preferences will not come back.** They live in a
               different store that is not in the backup, and nothing on screen
               warns you
Also try.    · back up, change three things, restore, and check all three reverted
             · **check whether your feature switches survived** — they should not,
               and knowing that is the point
             · try a wrong passphrase and confirm nothing was touched
             · check the confirmation makes "this replaces everything" unmissable
Ladder.      SN-11
Problems.    The restore path has **never run on a device** — RELEASE §0.4.
```

### FL-12 · Add income — 3 entry points

```
Trigger.     "I got paid."
Entry.       .E1 SC-07 Income pill  .E2 Home CTA with kind=income  .E3 review commit
Pre.         None.
Steps.       .S1 amount  .S2 income category  .S3 landing bucket  .S4 date  .S5 save
Entities.    W E-04 (kind=income) · W E-06 · R E-09 (INCOME_CATEGORIES)
Writes.      One txn, one payment row for me, and **zero shares** — income is
             never grouped, because grouping it carries no meaning (IV-16).
Exit.        Dismisses.
Branches.    .B1 INCOME_LANDING picks the bucket: bank (default), cash, wallet, upi
Failures.    .FM1 logged into a shared group, where it means nothing
Reversible.  As FL-04.
State.       demo — three months of ₹85,000 salary, a freelance gig, and interest.
Numbers.     · income raises cash and **never** appears in a spending total
             · it lands in the bucket you pick — bank by default, and the Plan
               screen's three buckets must add up afterwards
             · **income is never split.** It writes one payment and zero shares,
               because splitting income means nothing (IV-16)
Also try.    · log income **into a shared group** and see whether the app lets
               you, and what it does with it
             · land some in Cash instead of Bank and check the buckets on Plan
             · check Reports shows income separately, never mixed into spending
Ladder.      SN-12
Problems.    INCOME_LANDING is a view over PAY_METHOD rather than a real account
             concept — deliberately, and DQ-14 is where that gets revisited.
```

### FL-13 · Edit a transaction — 5 entry points

```
Trigger.     "That was wrong."
Entry.       .E1 SC-15 header Edit  .E2 group ledger row  .E3 Personal row
             .E4 person ledger row  .E5 search / report drill-down → SC-15 → Edit
Pre.         You may edit your own anywhere, and anyone's in a shared group.
Steps.       .S1 open  .S2 change  .S3 save
Entities.    R/W E-04 · W E-06 · W E-07 · W E-08 · W E-18
Writes.      **Payments, shares and line items are DELETEd and re-INSERTed
             wholesale.** This is why approval state can never live on them (IV-12).
             sync_version increments; a stale write is a 409, never silent LWW.
Exit.        Back to SC-15, or to the ledger.
Branches.    .B1 a recurring occurrence opens the RULE, not the occurrence —
                 fixed 2026-09-01; it used to open a route that did not exist (OV-12)
             .B2 itemized entries route to SC-08, not SC-07
             .B3 transfers route to SC-07 with kind=transfer
Failures.    .FM1 409 on push after an offline edit
             .FM2 an edit that makes someone else worse off needs their approval (IV-09)
Reversible.  The previous values are not kept. Undo covers deletion, not edits.
State.       demo — any transaction. Aarav's electricity is a peer entry, which
             behaves differently.
Numbers.     · change ₹300 to ₹600 in a three-way split and your total rises by
               **₹100, not ₹300** — the same rule as adding
             · every surface must move together: Home, the balance, the budget
               bar, Reports. **A figure that moves while the others do not is
               worse than all of them moving**
Also try.    · edit an amount and then check **four screens agree**
             · edit a peer entry — Aarav's — and see whether it is allowed
             · change who paid, without changing the amount, and watch cash move
               while your spending does not
             · edit a **materialized recurring occurrence** and confirm it opens
               the rule rather than a dead end
Ladder.      SN-13
Problems.    The prop is called onEditTxn/editRef everywhere and it opens a
             *detail* screen — the naming and the behaviour disagree.
```

### FL-14 · Delete a transaction — 4 entry points

```
Trigger.     "That shouldn't be there."
Entry.       .E1 group ledger swipe  .E2 Personal swipe  .E3 person ledger swipe
             .E4 SC-15 Delete
Pre.         Your own, or any in a shared group. Refused for a peer's entry.
Steps.       .S1 swipe or tap  .S2 confirm  .S3 undo toast, 5 s
Entities.    W E-04 (is_deleted = 1) · W E-18
Writes.      Soft delete only. Children stay.
Exit.        Stays; the list reloads.
Branches.    .B1 a recurring rule asks: rule only, or rule + everything it logged
             .B2 a peer's entry is refused, and says so out loud rather than
                 swallowing it into "something went wrong" — the honest action
                 there is to dispute it (FL-28)
Failures.    .FM1 undo after the toast expires → use SC-15's restore
Reversible.  Yes, both by toast and by restore.
State.       demo — there is a row labelled **"Delete me — tests the Undo toast"**
             seeded for exactly this, and one already soft-deleted.
Numbers.     · deleting reverses everything adding did, on every surface
             · **undo must restore all of it**, not just the row
             · a soft-deleted row must vanish from every total while still being
               recoverable
Also try.    · **delete the "Delete me" row and press Undo** — then check Home's
               total is back to what it was
             · let the toast expire, then restore from the entry instead
             · delete a recurring **rule** and choose "keep what it logged", then
               do it again choosing "remove them too"
             · try to delete Aarav's entry — a peer's entry is refused, and it
               should say so plainly rather than failing quietly
Ladder.      SN-14
Problems.    —
```

### FL-15 · Create a recurring rule — 2 entry points

```
Trigger.     "This happens every month."
Entry.       .E1 SC-07 Repeat chip  .E2 FE-24's suggestion after a Review commit
Pre.         flags.recurring.
Steps.       .S1 the ordinary Add fields  .S2 frequency  .S3 interval
             .S4 end: never / date / count  .S5 mode: auto or remind  .S6 save
Entities.    W E-04 with recur_freq set — **a rule, not an event**
Writes.      One txn row that is a rule. It must never count as spending; every
             money statement carries `recur_freq IS NULL` (IV-04).
Exit.        Dismisses.
Branches.    .B1 recur_mode auto materializes; remind only notifies
                 (defaultRecurMode: expense = auto, everything else = remind)
             .B2 converting an existing transaction into a rule
Failures.    .FM1 an end date before the start date
             .FM2 a rule created in a group you then leave
Reversible.  Pause, end, or delete — FL-16.
State.       demo — Netflix, Spotify, rent, a weekly clean and a 90-day custom
             interval already exist. **Prime Video repeats un-ruled**, waiting to
             be detected.
Numbers.     · **a rule is not a transaction.** Creating one must move **no**
               figure — not Home, not the budget, not Reports (IV-04)
             · it appears under "coming up", which is a forecast, not a total
             · only when an occurrence actually fires does anything count
Also try.    · **create a rule and check Home's month total does not move**
             · set it to a past start date and see whether occurrences appear
             · set an end date before the start date
             · create one in a shared group and check whose share it counts as
Ladder.      SN-15
Problems.    OV-03 — a rule and a transaction are the same table, which is the
             single most load-bearing piece of knowledge in this document.
```

### FL-16 · Manage a rule — 5 entry points

```
Trigger.     "Skip this month" / "cancel it" / "pause it".
Entry.       .E1 SC-32  .E2 SC-09 Recurring tab  .E3 SC-16  .E4 SC-15 (parent link)
             .E5 the renew_* notification
Pre.         flags.recurring.
Steps.       .S1 open SC-41  .S2 pick an action  .S3 confirm
Entities.    R/W E-04 (recur_state) · W E-05 (skips) · W E-59
Writes.      A skip writes one recur_skip row; pause/resume/end update the rule.
Exit.        Stays, or `replace`s to SC-32 after a delete.
Branches.    .B1 skip the next one  .B2 undo the next skip  .B3 pause / resume
             .B4 stop  .B5 edit the rule  .B6 log this occurrence now
Failures.    .FM1 a skip is local and does not travel — two devices can disagree
                  about one occurrence
Reversible.  Skips undo. Pause resumes. Stop is an end state.
State.       demo — **Gym is paused, the old prepaid plan is ended**, and three
             rules fall due within three days.
Numbers.     · pausing stops future occurrences and **changes no past figure**
             · a skipped occurrence removes exactly one, and the monthly-equivalent
               total should drop for that month only
             · ending is not deleting: what it already logged stays
Also try.    · **find the paused Gym rule and the ended prepaid one** and check
               they look different from active ones, and from each other
             · skip the next occurrence of the weekly newspaper, then undo it
             · check the same rule looks the same in all three places that list
               recurring things — Plan, the group tab, and Home's "coming up"
Ladder.      SN-16
Problems.    Three renderings of overlapping recurring data — SC-32, the group's
             Recurring tab, and Home's "coming up". Two earlier ones were already
             deleted for this reason.
```

### FL-17 · Voice capture — 2 entry points

```
Trigger.     "Two hundred rupees, chai" said out loud.
Entry.       .E1 SC-07 mic disc  .E2 the Siri Shortcut, drained at cold start
Pre.         flags.voiceEntry.
Steps.       .S1 speak  .S2 voiceParse extracts amount, category, note, person
             .S3 the form is prefilled  .S4 review  .S5 save
Entities.    W E-86 (the shortcut path) · W E-04 or E-17
Writes.      Either straight to a transaction, or into the review inbox,
             depending on VoiceDestination.
Exit.        Dismisses.
Branches.    .B1 in-form dictation is the keyboard's own — no new permission,
                 no native dependency, nothing to fail
             .B2 the Shortcut path writes a file that is drained at launch
Failures.    .FM1 the phrase does not parse → the raw text becomes the note
             .FM2 the one-tap Shortcut install is dead: VOICE_SHORTCUT_URL is null,
                  so only the four-step manual setup works (DQ-22)
Reversible.  As FL-04. Voice auto-save has no off switch, deliberately (DQ-20).
State.       any, on a real device — the keyboard's own dictation, so nothing to
             install and no permission to grant.
Numbers.     · what it fills in must be what you said, and nothing more —
               a wrong amount here is a wrong ledger
             · it is a prefilled form, not a save: **nothing is written until you
               confirm**, so a bad parse costs a tap
Also try.    · say "two hundred rupees chai" and check every field it filled
             · say something it cannot parse and confirm the words survive as
               a note rather than being thrown away
             · say a person's name and see whether it routes to a split
             · check the Siri setup screen — the one-tap install is dead today,
               so only the four manual steps work, and that should be evident
Ladder.      SN-17
Problems.    The whole Shortcuts apparatus is slated for deletion when App
             Intents land.
```

### FL-18 · Scan a receipt — 1 entry point

```
Trigger.     "Here's the bill, do the typing."
Entry.       .E1 SC-08 "Scan receipt"  (flag: receiptScan, iOS only)
Pre.         Camera permission. flags.receiptScan.
Steps.       .S1 capture  .S2 OCR  .S3 lines proposed  .S4 correct  .S5 continue FL-05
Entities.    W E-83 · W E-08 (proposed)
Writes.      Nothing until FL-05 saves.
Exit.        Returns into the itemized wizard.
Branches.    .B1 cloud provider — one image to our own Worker, then Gemini
             .B2 device provider — Apple Vision, entirely offline
             .B3 cloud failure auto-falls back to device
Failures.    .FM1 permission denied *after* Scan was tapped
             .FM2 OCR returns nothing usable → manual entry, nothing lost
             .FM3 iOS only; the Android port needs an ML Kit rewrite
Reversible.  Nothing is written until the bill is saved.
State.       any, on a real iPhone with a real receipt. **iOS only.**
Numbers.     · the scanned total must match the paper in your hand
             · **nothing is written until you finish the bill**, so a bad scan
               costs corrections, not data
             · the items must sum to the total, the same as any itemized bill
Also try.    · scan a real receipt and count how many lines it got right
             · scan something that is not a receipt at all
             · deny the camera permission **after** tapping Scan
             · switch the provider to on-device in Settings and scan the same
               receipt again — offline, and the results should be comparable
Ladder.      SN-18
Problems.    A Mistral fallback is documented in ocrProviders/index.ts and was
             never built — deliberately abandoned, since device solves it offline.
```

### FL-19 · Scan & Pay — 1 entry point

```
Trigger.     A QR code on a counter.
Entry.       .E1 tab-bar FAB **long-press**, 350 ms — a hidden gesture taught
                 once by a coach mark, and the only way in
Pre.         Camera permission. Unflagged.
Steps.       .S1 long-press  .S2 scan any UPI or EMV QR  .S3 confirm the payee
             .S4 hand off to a UPI app  .S5 return  .S6 "did that go through?"
             .S7 record it
Entities.    W E-84 · W E-17 on confirmation · R mcc for the category guess
Writes.      The hand-off writes only E-84. The confirmation writes a pending row.
Exit.        Back to wherever the FAB was pressed.
Branches.    .B1 an EMV QR carries an MCC, which seeds the category
             .B2 declining the confirmation discards E-84 and writes nothing
Failures.    .FM1 UPI gives no reliable callback — **only the human knows**, which
                  is the entire reason E-84 exists
             .FM2 a tampered QR: the code's `pn` is written by whoever made it,
                  so the VPA leads and the name is labelled unverified (IV-19)
Reversible.  Nothing is written until confirmed.
State.       any, with a real UPI QR to point at. **The only way in is a
             350 ms long-press on the FAB** — worth checking you can find it.
Numbers.     · **nothing is written when you hand off.** The app cannot know
               whether the payment succeeded — only you can
             · confirming afterwards writes a pending row, not a transaction, so
               it still goes through Review
             · declining the confirmation must leave no trace at all
Also try.    · **long-press the FAB and see whether the gesture is discoverable**
               without being told
             · scan a QR, come back **without paying**, and decline — check
               nothing was recorded
             · check the sheet leads with the **VPA**, not the name printed in
               the code. A code's name is written by whoever made the code, and
               over 70% of Indian UPI fraud in 2025 was exactly this (IV-19)
Ladder.      SN-19
Problems.    Over 70% of Indian digital-payment fraud in 2025 was QR tampering or
             collect-request manipulation. IV-18 and IV-19 are the defences and
             they are enforced by review only.
```

### FL-20 · Hand off to UPI to settle — 1 entry point

```
Trigger.     "Pay them now, from my UPI app."
Entry.       .E1 SC-07 Transfer → "Pay ₹X via UPI"  (flag: upiSettle)
Pre.         Their VPA. flags.upiSettle. iOS in practice (DQ-11).
Steps.       .S1 pick the app  .S2 an intent is built  .S3 hand off  .S4 return
             .S5 confirm  .S6 the settlement is written
Entities.    W E-85 → W E-04 (kind=settlement) · W E-06 · W E-07
Writes.      Straight to the ledger on confirmation — **not** to the review inbox,
             which is the one difference from FL-19's sibling path.
Exit.        Back to the caller.
Branches.    .B1 refused by PhonePe, Paytm, Amazon Pay and WhatsApp — closed on
                 our side; the route round is FL-21 (DQ-84)
Failures.    .FM1 the app returns without confirming anything
             .FM2 **Android: useUpiApps returns null**, so the entire per-app
                  payload table is unreachable, not merely dead (DQ-11)
Reversible.  Soft-delete the settlement.
State.       demo, on a real device with a UPI app installed. **iOS — on Android
             this silently does nothing.**
Numbers.     · the amount handed to the UPI app must match the balance shown
             · confirming writes the settlement **straight to the ledger**, not
               to Review — the one difference from Scan & Pay
             · then the same checks as settling: spending unchanged, cash down
Also try.    · hand off, come back **without paying**, and decline the prompt
             · check which apps are offered — PhonePe, Paytm, Amazon Pay and
               WhatsApp all refuse this hand-off, and that is closed on our side
             · if you have an Android device, try it there and watch nothing
               happen at all. That is a known untested hole, not a surprise
Ladder.      SN-20
Problems.    OV-02 · OV-21 (E-84 and E-85 are near-identical siblings)
```

---

*The remaining tasks, same shape as the twenty above. Written to be walked with the app open.*

### FL-21 · Request money by QR — 1 entry point

```
Trigger.     "Pay me back" — without asking them to type your handle.
State.       demo — you need your own UPI id set first (Settings → Getting paid).
Entry.       .E1 SC-07 Transfer → "Show QR to get ₹X"  (flag: upiSettle)
Pre.         Your own upi_vpa on E-01. Without it the button does not render.
Steps.       .S1 open Transfer  .S2 pick the person and amount
             .S3 tap Show QR  .S4 they scan it with their own UPI app
             .S5 they pay  .S6 you record the settlement yourself (FL-06)
Entities.    R E-01 (your VPA) · nothing is written here
Writes.      **Nothing.** The QR is a picture. The money moving and the ledger
             recording it are two separate events, and only you can join them.
Numbers.     · no figure moves at this step — not your balance, not your cash
             · the balance only moves when you record the settlement afterwards
Exit.        Closes the sheet, back to Add.
Branches.    .B1 the same payload also goes out as an intent, in FL-20
Failures.    .FM1 no VPA set → the button is absent, with no explanation
             .FM2 they pay and you forget to record it → the balance stays wrong,
                  and nothing in the app knows
Reversible.  Nothing to reverse.
Also try.    · scan your own QR with a UPI app and check the amount is prefilled
             · request ₹0, and a negative amount
             · check it is a **push** QR: your app must never send them a collect
               request — NPCI banned P2P collect outright from 1 Oct 2025 (IV-18)
Ladder.      SN-21
Problems.    The gap between paying and recording is unguarded, by design —
             see FL-19's E-84 for the version that does prompt you.
```

### FL-22 · Create a group — 1 entry point

```
Trigger.     "We need to split things — flatmates, a trip, a team lunch."
State.       any. On empty this is the first thing worth doing.
Entry.       .E1 SC-04, the "+" sheet
Pre.         flags.splitting for the Groups tab to exist at all.
Steps.       .S1 name it  .S2 pick an icon and colour  .S3 add people
             .S4 choose the default split  .S5 create
Entities.    W E-02 · W E-03 (you, as creator and admin) · W E-01 for new people
Writes.      The group, your membership with role `admin`, and `created_by` = you.
             `insertGroup` also seeds the group's categories.
Numbers.     · a new group contributes ₹0 to everything until it has an expense
             · it appears on Groups immediately, and on Home's people strip only
               once a balance exists
Exit.        Pushes SC-09, the new group's hub.
Branches.    .B1 default split — equal, exact, percent or shares — is only a
                 default; any single expense can override it
             .B2 simplify debts on or off changes who pays whom, never how much
Failures.    .FM1 a group with no creator and no admin can never have its budget
                  edited by anyone, permanently — which is why .S5 writes both
             .FM2 an empty name
Reversible.  Archive it, or delete it if you created it (FL-26).
Also try.    · create one with no other members, then add someone later
             · two groups with the same name
             · a very long name, and an emoji in it
Ladder.      SN-22
Problems.    OV-26 — creating is a sheet, editing the same thing is a full screen.
```

### FL-23 · Add or remove members — 2 entry points

```
Trigger.     "Priya moved in" / "Vikram moved out."
State.       demo — Roommates has you, Aarav and Priya.
Entry.       .E1 SC-09 Members tab  .E2 SC-11
Pre.         Admin in that group (E-64).
Steps.       .S1 open Members  .S2 add an existing person, or type a new name
             .S3 to remove, swipe the row  .S4 confirm
Entities.    W E-03 · W E-01 when the name is new
Writes.      Adding inserts a membership row. **Removing is a soft delete** —
             `deleted_at` is set and the row stays, because a departed member's
             past shares still have to resolve (IV-21).
Numbers.     · removing someone does **not** change any past expense or any
               balance — their old shares still count, and still show
             · what changes is only who future expenses can be split with
Exit.        Stays on Members; the list reloads.
Branches.    .B1 adding an existing person reuses their row, and their history
             .B2 a removed member can be added back, and the same row revives
Failures.    .FM1 a non-admin sees no add or remove control
             .FM2 removing someone who is owed money — allowed, and the balance
                  survives, which surprises people
Reversible.  Undo toast on remove; otherwise add them again.
Also try.    · remove someone mid-settlement and watch the balance
             · remove yourself (you cannot — leaving is FL-26)
             · add a person whose name matches one already there
Ladder.      SN-23
Problems.    —
```

### FL-24 · Share a group — 2 entry points

```
Trigger.     "Put this group on Aarav's phone too."
State.       **needs a second device and an account.** Not walkable solo.
Entry.       .E1 SC-13 → Share  .E2 SC-09 overflow
Pre.         An account (FL-30), a build with the server configured, and the
             other person linked to a local person (FL-31).
Steps.       .S1 open the group  .S2 Share  .S3 pick who  .S4 confirm
Entities.    W E-88 roster · W E-82 a key wrapped for their device · W E-18
Writes.      The group's key is wrapped once per recipient device and the roster
             is published. This is the moment a local group becomes a synced one.
Numbers.     · nothing changes on your side — no balance, no total
             · on theirs, the whole group's history appears at once
Exit.        Back to the group.
Branches.    .B1 sharing with someone with no account is refused (IV-11)
Failures.    .FM1 no server configured → the option does not exist
             .FM2 **none of this has ever run on a phone**
Reversible.  Stop syncing the group; the other side keeps what it has.
Also try.    · nothing solo. Park this until there are two devices.
Ladder.      SN-24
Problems.    Built end to end, never run on a phone.
```

### FL-25 · Accept an invite — 1 entry point

```
Trigger.     Someone sent you a link.
State.       **needs a second device.** Not walkable solo.
Entry.       .E1 SC-39, from a `budgetsplit:///link?token=…` deep link only
Pre.         The link, and the app installed.
Steps.       .S1 tap the link  .S2 the app opens on SC-39  .S3 claim
             .S4 **the sender confirms on their phone**  .S5 the group appears
Entities.    R E-19 · W E-02 · W E-03 · W E-88
Writes.      Claiming **asks**. Nothing is linked until the sender approves —
             a forwarded link must not be enough to join.
Numbers.     · after adoption, their whole group history lands at once, and your
               owe/owed figures move by your share of all of it
Exit.        `replace`s to the group, or to Settings if it is only a person link.
Branches.    .B1 `adoptGroup` rebuilds the group from the roster document
Failures.    .FM1 a forwarded link claimed by a stranger — stopped at .S4
             .FM2 a spent token
Reversible.  Leave the group (FL-26).
Also try.    · nothing solo.
Ladder.      SN-25
Problems.    Never run on a phone.
```

### FL-26 · Leave, archive or delete a group — 3 entry points

```
Trigger.     "This is over" — and which of the three you mean matters.
State.       demo — Old Flat is already archived; Weekend Plans is empty and
             safe to delete.
Entry.       .E1 SC-13 Archive  .E2 SC-13 Leave  .E3 SC-13 Delete
Pre.         Delete is creator-only. Leave is refused for the creator.
Steps.       .S1 open the group  .S2 ⋯ → Edit  .S3 pick one  .S4 confirm
Entities.    R/W E-02 · W E-03 · W E-18 · W E-11 (cursors)
Writes.      **Three genuinely different things** (OV-11):
             archive  → `is_archived`, still yours, fully reversible
             leave    → announce the exit, **then** stop syncing. The other order
                        leaves nothing able to publish the departure
             delete   → creator only, and a **tombstone, not a wipe**:
                        `deleted_at` + `is_archived` are set and **every entry
                        survives**
Numbers.     · **archiving changes no figure at all** — the group's past spending
               still counts toward your months, because it happened
             · **deleting changes no figure either.** It used to hard-delete
               every transaction, which silently rewrote months you had already
               closed and made decisions on
             · leaving stops future entries reaching you; your history stays
Exit.        All three `dismissTo` SC-04.
Branches.    .B1 unarchiving is refused for a group carrying `deleted_at`
Failures.    .FM1 a creator trying to leave → refused, told to delete instead
             .FM2 leaving with an unsettled balance → allowed, and it says so
Reversible.  Archive yes. Leave and delete, no.
Also try.    · archive Old Flat's sibling and check Home's totals do not move
             · delete Weekend Plans (it is empty on purpose) and confirm your
               month total is unchanged
             · try to leave a group you created
Ladder.      SN-26
Problems.    OV-11 — three end states, and the UI words for them are not distinct
             enough. Two other documents still describe delete as destroying data.
```

### FL-27 · Approve or reject a peer entry — 2 entry points

```
Trigger.     Someone added something that touches your money.
State.       demo — **Priya's ₹3,600 groceries is waiting**, and Aarav's
             electricity already applied because he is trusted. Both in Roommates.
Entry.       .E1 SC-40, from the Home badge  .E2 SC-15, on the entry itself
Pre.         A peer entry exists. Demo data makes three.
Steps.       .S1 open Waiting for you  .S2 read the entry  .S3 Approve, or
             "Not mine"  .S4 optionally, trust the person from here
Entities.    R/W E-20 · R E-04 · W E-22 on reject
Writes.      Approving clears the exclusion and the entry starts counting.
             Rejecting soft-deletes it **for you** and sends an objection back.
Numbers.     · **this is the check worth doing.** Before approving, note Home's
               month total and the Roommates balance. A waiting entry must move
               **neither** (IV-05)
             · after approving Priya's ₹3,600 split three ways, your month total
               rises by **₹1,200, not ₹3,600** (IV-08)
             · the group balance moves by the other ₹2,400
Exit.        Back to the queue, one item shorter.
Branches.    .B1 trusting the person from here applies their future entries at
                 once, in every group you share (IV-10)
             .B2 a **transfer** waits even from a trusted person — money arriving
                 is a different question from an expense being recorded
Failures.    .FM1 rejecting leaves the two devices holding different rows. The
                  objection travels, so it is visible, but nothing reconciles them
Reversible.  Reopen the approval.
Also try.    · approve Aarav's transfer and watch cash, not just the balance
             · reject Priya's and check the Roommates balance goes back
             · compare Priya's entry with Aarav's — same shape, different landing,
               and the only difference is who wrote it
Ladder.      SN-27
Problems.    —
```

### FL-28 · Dispute an entry — 1 entry point

```
Trigger.     "That split is wrong" — about an entry you did not write, or one
             someone is objecting to that you did.
State.       demo — **Rohan disputes your ₹2,800 airport cab** in Goa Trip. Open
             it and look for the red banner.
Entry.       .E1 SC-15
Pre.         A synced entry with an author.
Steps.       .S1 open the entry  .S2 read the banner  .S3 raise or withdraw
Entities.    W E-22 · W E-20 (`dispute_state`)
Writes.      An objection, keyed on their **account** id rather than a local
             person — it can arrive before any person mapping exists.
Numbers.     · a dispute **changes no figure on your side**. It is a message,
               not a correction
             · the two devices' balances stay different until someone edits or
               deletes the entry
Exit.        Stays on the entry.
Branches.    .B1 withdrawing an objection travels back too
Failures.    .FM1 nothing reconciles the rows themselves — only the humans do
Reversible.  Withdraw it.
Also try.    · open the disputed Goa cab and check the banner is **red**, and
               visibly unlike the amber "waiting for you" one — they mean
               opposite things
             · check your Goa balance still includes the disputed amount
Ladder.      SN-28
Problems.    —
```

### FL-29 · Set trust — 2 entry points

```
Trigger.     "I do not need to check everything Aarav adds."
State.       demo — **Aarav is trusted, Priya is on review**, and that single
             difference is why their entries land differently.
Entry.       .E1 SC-26a TrustSheet  .E2 SC-40 "Trust <name>"
Pre.         The person has an account matched to them (FL-31). Without it the
             setting is inert (IV-11).
Steps.       .S1 open the person  .S2 Trust  .S3 pick trusted or on review
             .S4 optionally override for one group only
Entities.    W E-01.trust_state · W E-21 for the per-group override
Writes.      Trust is **per person, never per group** (IV-10). The per-group
             override is still keyed on a human, which is why it is allowed.
Numbers.     · changing trust moves no figure retroactively — entries already
               waiting stay waiting
             · it only decides where their **next** entry lands
Exit.        Closes the sheet.
Branches.    .B1 "trusted everywhere except this group" is the override
             .B2 clearing the override falls back to the global answer
Failures.    .FM1 a person with no account — the control should say why it does
                  nothing, and this is worth checking on screen
Reversible.  Fully, both directions.
Also try.    · trust Priya, then look at her waiting entry — it should still wait
             · set a per-group override on Aarav for Roommates only
             · check the override is clearable, or "trusted except here" is a
               one-way door
Ladder.      SN-29
Problems.    —
```

### FL-30 · Sign in — 4 entry points

```
Trigger.     "Back up off this phone" / "put this on my other phone."
State.       **needs a real email and a server build.** Never seen on a device.
Entry.       .E1 SC-06 → Account  .E2 SC-34  .E3 SC-43  .E4 the restore offer
Pre.         A build with `EXPO_PUBLIC_API_URL` set. Otherwise none of this exists.
Steps.       .S1 type your email  .S2 send the link  .S3 open the mail
             .S4 tap it — the app opens on SC-37  .S5 the token is spent once
             .S6 SC-37 replaces itself with the account screen
Entities.    W E-87 · R E-01
Writes.      An account keyed on the email, and a session. No password anywhere.
Numbers.     · signing in changes no financial figure. It buys backup and sync,
               nothing else
Exit.        `replace`s to SC-36, or Home.
Branches.    .B1 signing out keeps all local data
             .B2 deleting the account is a separate, live endpoint
Failures.    .FM1 **a typo in the email makes a second account holding none of
                  your backups**, and email is the only identity — it cannot be
                  changed or merged (DQ-08)
             .FM2 a link opened twice — the token is spent
Reversible.  Sign out. The account itself is deletable.
Also try.    · sign in, then check that Settings shows **which email** you used
               — this is the cheap fix for DQ-08 nobody has taken
             · open the magic link on a different phone
Ladder.      SN-30
Problems.    DQ-08. Never seen on a device.
```

### FL-31 · Link a person to an account — 1 entry point

```
Trigger.     "This Aarav in my list is that Aarav who just signed up."
State.       **needs a second account.** Demo fakes the result: Aarav, Priya and
             Rohan already carry account ids.
Entry.       .E1 SC-38 Linked people
Pre.         An account, and an invite accepted in both directions.
Steps.       .S1 open Linked people  .S2 pick the incoming account
             .S3 match it to a person in your list  .S4 confirm
Entities.    W E-01.remote_uid — **the only writer of that column**
Writes.      The thread between an account and a local person.
Numbers.     · no figure moves. This is identity, not money
Exit.        Stays.
Branches.    .B1 matching says **who they are**. Trusting says **and their
                 entries may count**. Two decisions, deliberately separate
Failures.    .FM1 matching the wrong person — their entries would then reach the
                  wrong name in your ledger
Reversible.  Unmatch.
Also try.    · check that a person with no account cannot be trusted meaningfully
             · look at Aarav in demo data: he has an account id, which is why
               his trust setting does anything at all
Ladder.      SN-31
Problems.    Never run on a phone.
```

### FL-32 · Sync push and pull — 0 entry points

```
Trigger.     Nothing. It runs itself when the tab bar mounts — there is no button.
State.       **needs a second device.** Demo fakes the results, not the transport.
Entry.       .X1 app launch, from the tab bar
Pre.         An account, a shared group, and a network.
Steps.       .S1 the outbox is drained, oldest first  .S2 each entry is sealed
             with the group key  .S3 pushed  .S4 the server's changes are pulled
             .S5 each arriving entry goes through `ingestPeerTxn`
             .S6 trust decides: land it, or hold it for approval
Entities.    R/W E-18 · W E-04 · W E-20 · R E-82 · R/W E-88 · W E-11 (cursors)
Writes.      Compare-and-set on `sync_version`. A stale push is a **409**, never
             a silent last-write-wins.
Numbers.     · **the promise to check:** an entry waiting for approval must move
               **no figure of yours** — not Home, not the balance, not Reports
             · once approved, every figure moves at once and they agree
Exit.        Nothing visible. SC-43 says when it last ran and why it did nothing.
Branches.    .B1 offline → the outbox just grows
             .B2 a group that vanished server-side is archived, never deleted
Failures.    .FM1 409 on push after an offline edit
             .FM2 entries this device cannot decrypt
             .FM3 **no part of this has run on a phone**
Reversible.  n/a.
Also try.    · open Settings → Sync and read what it says about the last run —
               that screen is the only window into any of this
             · nothing else, solo
Ladder.      SN-32 — the fullest list of cases in the document, and worth reading
             before trusting any of it
Problems.    Built end to end, never run on a phone.
```

FL-27 · Approve or reject a peer entry — 2 entries (SC-40, SC-15)
  R/W E-20. Approving removes the exclusion and the entry starts counting.
  Rejecting is the honest "this isn't mine". The two devices then hold different
  rows — but the objection travels back to the author (FL-28), so neither side is
  left guessing. That round trip is what closed DQ-07. Ladder SN-27.

FL-28 · Dispute an entry — 1 entry (SC-15)
  W E-22, keyed on their account id rather than a local person. The half of the
  rejection problem that does travel back. Ladder SN-28.

FL-29 · Set trust — 2 entries (SC-26a TrustSheet, SC-40 "Trust <name>")
  W E-01.trust_state or W E-21 for the per-group override. Per person, never per
  group (IV-10); inert without an account (IV-11). Ladder SN-29.

FL-30 · Sign in — 4 entries (SC-06, SC-34, SC-43, the restore-offer alert)
  Email magic link, no password. Lands on SC-37 by deep link, spends the token
  once, replaces itself with SC-36. Email is the ONLY identity and cannot be
  changed or merged, so a typo makes a second account holding none of your
  backups (DQ-08). Ladder SN-30. Never seen on a device.

FL-31 · Link a person to an account — 1 entry (SC-38)
  W E-01.remote_uid — the single writer. Matching says WHO THEY ARE; trusting
  says AND THEIR ENTRIES MAY COUNT. Two decisions kept apart on purpose.
  Ladder SN-31.

FL-32 · Sync push / pull — 0 user entries; runs from the tab bar on mount
  R E-18 → seal → push; pull → peerIngest → W E-04 + W E-20. Compare-and-set;
  a stale push is a 409. Cursors live in E-11. Ladder SN-32 — the one to read
  before trusting any of this. Built end to end, never run on a phone.

```

### FL-33 · Buy or sell an asset — 3 entry points

```
Trigger.     "I bought gold" / "I put ₹20,000 into the index fund."
State.       demo — index funds ₹95,000, gold ₹40,000, an FD ₹15,000.
Entry.       .E1 SC-42  .E2 SC-05 TotalMoneyCard  .E3 SC-07's transfer banner
Pre.         None. Assets are personal.
Steps.       .S1 open Assets  .S2 pick one, or add  .S3 put in, or take out
             .S4 amount  .S5 confirm
Entities.    W E-14 balance · W E-04 (kind=settlement) · W E-06 · W E-07
Writes.      **Both halves in ONE transaction** (IV-03). A half-written one drops
             net worth by the amount invested and leaves a ledger row that looks
             entirely correct — the worst kind of wrong.
Numbers.     · **net worth must not change.** Cash goes down ₹20,000, the asset
               goes up ₹20,000, and the total on Plan is the same number
             · **your month spending must not change either** — buying an asset
               is not consuming anything (IV-06)
             · taking money out is **not income**: you already owned it, it only
               changed shape
Exit.        Back to Assets.
Branches.    .B1 archiving an asset stops it counting toward net worth (IV-15),
                 because archiving is how you say you no longer own it
             .B2 restating a balance ("it is worth more now") is a third verb
Failures.    .FM1 deleting an asset with history is refused — archive instead
             .FM2 a negative balance is not allowed
Reversible.  Take the money back out. Archiving is reversible.
Also try.    · **write down Plan's net worth, buy ₹10,000 of gold, check it is
               the same number.** This is the whole point of the asset register
             · check the ledger row appears in Personal but **not** in Reports
             · archive the FD and watch net worth drop by exactly ₹15,000
Ladder.      SN-33
Problems.    OV-02 — this writes `kind='settlement'`, the same value a debt
             settle-up uses, so the settle-up suggester can offer to "settle" it.
             Shipped 2026-09-01, never run on a device.
```

### FL-34 · Pay the card bill — 1 entry point

```
Trigger.     "The card bill is due."
State.       demo — ₹10,000 used of a ₹60,000 limit.
Entry.       .E1 SC-05 → PayCardBill
Pre.         A credit limit and some used, set in the money profile (FL-45).
Steps.       .S1 open Plan  .S2 tap the credit line  .S3 amount  .S4 confirm
Entities.    W E-04 (kind=settlement, pay_method=card) · W E-06 · W E-07
Writes.      A settlement carrying `pay_method='card'` — the second of the four
             meanings that value has (OV-02).
Numbers.     · credit used goes **down** by what you paid
             · cash goes **down** by the same amount
             · **net worth does not change** — you moved a debt, not spent
             · your month spending does not change either
Exit.        Back to Plan.
Branches.    .B1 paying more than is used
Failures.    .FM1 paying with money you do not have
Reversible.  Delete the settlement row.
Also try.    · pay ₹4,000 and check credit available rises to ₹54,000
             · check Reports does not move
             · pay the full ₹10,000 and see what the card row looks like at zero
Ladder.      SN-34
Problems.    OV-02.
```

### FL-35 · Move money to investments — 1 entry point

```
Trigger.     "Move ₹5,000 from cash into the index fund."
State.       demo — three assets already exist.
Entry.       .E1 SC-05 → MoveToInvestments
Pre.         At least one asset.
Steps.       .S1 open Plan  .S2 tap investments  .S3 pick the asset
             .S4 amount  .S5 confirm
Entities.    W E-14 · W E-04 · R E-54
Writes.      As FL-33 — both halves, one transaction.
Numbers.     · `money.investments` is **derived from live assets and nothing
               writes it** (IV-14). If you ever see it change without an asset
               changing, that is a bug
             · net worth unchanged; cash down; the asset up
Exit.        Back to Plan.
Branches.    .B1 the same movement backwards is FL-33's "take out"
Failures.    .FM1 no asset yet → you are sent to create one first
Reversible.  Move it back.
Also try.    · move money in, then check the Assets screen shows the new balance
             · confirm the investments figure equals the sum of live assets
Ladder.      SN-35
Problems.    OV-20 — five near-identical spellings of "investment" across the app.
```

### FL-36 · Overspend raid — 1 entry point

```
Trigger.     You are over for the month and something has to give.
State.       demo — Groceries is ₹9,000 against ₹8,000, so the prompt is live.
Entry.       .E1 SC-05, offered when you are over
Pre.         An overspend, and at least one unlocked goal.
Steps.       .S1 open Plan  .S2 read the proposal — which goals, how much
             .S3 accept, or decline  .S4 undo if you change your mind
Entities.    R E-62 plan · W E-16 withdrawals · R E-15
Writes.      Withdrawals from goals, in raid order. **It asks first** — this
             moves real money.
Numbers.     · the goals named lose exactly what the proposal said
             · **`emergency`-tagged and locked goals are never touched** — demo's
               Emergency Fund is both, so it must be absent from every proposal
             · `want` goals are raided before `need` ones
             · the raid **nets what friends owe you first**, which safe-to-spend
               deliberately does not — a receivable is not spendable, but it *is*
               a reason not to break open savings. Do not expect the two figures
               to agree; they answer different questions
Exit.        Stays on Plan.
Branches.    .B1 declining leaves everything untouched
Failures.    .FM1 not enough in unlocked goals to cover the overspend
Reversible.  **Explicit undo**, and it must restore every goal exactly.
Also try.    · check New Phone (0% funded, `want`, last in rank) is proposed first
             · check Emergency Fund is never proposed
             · accept, then undo, then verify all eight goals are back to where
               they were
Ladder.      SN-36
Problems.    —
```

### FL-37 · Surplus sweep — 0 entry points

```
Trigger.     Nothing. It runs itself, if you turned it on.
State.       demo, **plus** turning on `auto_sweep_enabled` in Settings → Features.
Entry.       .X1 launch maintenance
Pre.         `auto_sweep_enabled` — **off by default, because it moves real money
             with nobody watching.**
Steps.       .S1 turn it on  .S2 restart the app  .S3 look at your goals
Entities.    R E-62 · W E-16 · R E-54
Writes.      Deposits into goals, in funding order, from what is left over.
Numbers.     · money leaves cash and appears in goals — net worth unchanged
             · funding order is drag rank within a priority tag, not the tag alone
Exit.        Nothing visible. You find out by looking.
Branches.    .B1 nothing to sweep → nothing happens, silently
Failures.    .FM1 it runs while you are mid-edit somewhere else
             .FM2 you do not notice it ran
Reversible.  Withdraw from the goal.
Also try.    · turn it on, note your cash, restart, and see if anything moved
             · turn it off again — this is the one switch that spends money
               without asking, and it is worth knowing where it is
Ladder.      SN-37
Problems.    DQ-15 — where the money came from is only approximately tracked.
```

### FL-38 · Rebalance a budget — 2 entry points

```
Trigger.     "I am over on groceries and there are two weeks left."
State.       demo — Groceries over, Fuel well under. A donor exists.
Entry.       .E1 SC-03's over-budget state  .E2 SC-09 Budget tab
Pre.         At least one over line and one under line.
Steps.       .S1 tap the over-budget prompt  .S2 read which lines would give
             .S3 accept, or adjust  .S4 save
Entities.    R E-56 · W E-12
Writes.      New amounts on the budget lines. Nothing about your spending changes.
Numbers.     · **the total across all lines should stay the same** — this moves
               an allowance, it does not create one
             · the over line's bar should go from red toward amber or green
             · the donor line's headroom shrinks by exactly what it gave
Exit.        Back where you came from.
Branches.    .B1 no donor with headroom → it should say so, not offer nothing
Failures.    .FM1 every line already over
Reversible.  Edit the amounts back.
Also try.    · rebalance, then add the totals by hand and check they match
             · try it when Fuel is the only line with room
Ladder.      SN-38
Problems.    —
```

### FL-39 · Afford check — 2 entry points

```
Trigger.     "Can I buy this?"
State.       demo — realistic cash, bills and goals make the answer meaningful.
Entry.       .E1 SC-33  .E2 SC-07's inline BudgetNudge, same engine
Pre.         flags.affordCheck.
Steps.       .S1 open Plan → the "Can I afford?" icon  .S2 amount
             .S3 optionally a category  .S4 optionally Need / Want / Can wait
             .S5 read the verdict and the reasons
Entities.    R E-61 · R E-53 · R E-54 · R E-56 · R E-58 · R E-51
Writes.      **Nothing.** It is a question, not an action.
Numbers.     · seven axes: cash, buffer, category budget, category norm, income
               share, month projection, basket size
             · **only cash produces a hard No.** Everything else can make it
               Tight, never impossible
             · marking something a Need softens the **buffer axis alone** and
               must never override the cash answer
Exit.        Stays, or "Log it" hands you to Add with the amount prefilled.
Branches.    .B1 the same engine writes the one-line nudge inside Add
Failures.    .FM1 nobody finds this screen — its only route in is an unlabeled
                  icon, and the flag file says so out loud (OV-16)
Reversible.  Nothing written.
Also try.    · ask about ₹500, then ₹50,000, then ₹5,00,000 and watch the verdict
               and the reasons change
             · ask about ₹3,000 of Groceries — already over budget — and check
               the category axis fires
             · mark a large amount as a Need and confirm it does **not** flip a
               cash No into a yes
Ladder.      SN-39
Problems.    OV-16.
```

### FL-40 · Search — 1 entry point

```
Trigger.     "Where was that dinner?"
State.       demo — three months of history to search.
Entry.       .E1 SC-03's magnifier
Pre.         None.
Steps.       .S1 tap search  .S2 type  .S3 results appear by month
             .S4 filter by kind  .S5 tap through to the entry
Entities.    R E-04
Writes.      Nothing.
Numbers.     · **on "All" there is deliberately no total.** One figure across
               money-in, money-out and money-moved answers no question (IV-17)
             · pick a single kind and a total appears
             · it is a **ledger**, so settlements are listed here even though
               Reports excludes them
Exit.        Tapping a row opens the entry.
Branches.    .B1 scope: everything, personal only, or groups only
Failures.    .FM1 a query matching nothing
             .FM2 deliberately **no pull-to-refresh** — the list is the query
Reversible.  Nothing written.
Also try.    · search "Prawns" — it is a line item inside an itemized bill
             · search a rupee amount
             · **check "All" shows no total, then pick Expenses and check one
               appears.** This shipped as a bug twice
             · search something that only matches a soft-deleted row
Ladder.      SN-40
Problems.    —
```

### FL-41 · Manage categories — 2 entry points

```
Trigger.     "I want a category for the dog."
State.       demo — **`Poker Night` is sitting uncategorised**, because Aarav used
             a category you do not have.
Entry.       .E1 SC-06 → SC-25  .E2 SC-07, created inline while adding
Pre.         None. The catalog self-heals if empty.
Steps.       .S1 open Categories  .S2 add, rename, or delete
             .S3 or adopt an uncategorised name  .S4 confirm
Entities.    W E-09 · W E-10 on delete
Writes.      A rename **rewrites every referencing row by name**, because the
             reference is a string and not an id (OV-06). A delete writes a
             tombstone, or the next launch would resurrect it.
Numbers.     · renaming moves no money — every total should be identical after
             · **deleting does not recategorise anything.** Old transactions keep
               the name as an orphan string and fold into `Others`
             · adopting `Poker Night` should move ₹400 out of `Others` and into
               a category of its own
Exit.        Stays on Categories.
Branches.    .B1 the same name can exist twice — once as an expense, once as a
                 transfer. `Rent` and `Other` both do
Failures.    .FM1 deleting a category that has a budget — the budget goes with it
             .FM2 `Other` and `Others` are one character apart and mean entirely
                  different things (OV-18)
Reversible.  Recreate it; the tombstone is removed.
Also try.    · **adopt `Poker Night` and watch `Others` shrink by ₹400**
             · rename Groceries and check the budget still applies
             · delete a category you have spent in, then look at Reports
Ladder.      SN-41
Problems.    OV-06 · OV-18 · DQ-16.
```

### FL-42 · Reports and export — 3 entry points

```
Trigger.     "What did last month look like?"
State.       demo — three months of history, so the trend has three points.
Entry.       .E1 SC-06  .E2 SC-05's rail  .X1 the backup-nudge notification
Pre.         flags.reports.
Steps.       .S1 open Reports  .S2 pick a month  .S3 read the donut and trend
             .S4 tap a slice to drill in  .S5 export CSV or PDF
Entities.    R E-63 · R E-04 · R E-56
Writes.      Nothing, until you export — and that goes to the share sheet.
Numbers.     · **settlements are excluded here** (IV-06). Demo has settlements in
               Roommates and Office Lunch; none of them may appear in the donut
             · every figure is **your share**, not the bill (IV-08). The Goa hotel
               was ₹40,000 and ₹10,000 of it is yours
             · the donut's slices must sum to the month total shown above it
             · the month selector **cannot advance past this month**
Exit.        A slice opens the drill-down; a row opens the entry.
Branches.    .B1 CSV round-trips back in through Import (FL-48)
Failures.    .FM1 a month with no data
             .FM2 export cancelled at the share sheet
Reversible.  Nothing written.
Also try.    · **add the donut slices by hand and check they equal the total**
             · compare this month with last: demo puts Eating Out at ₹2,700
               against ₹1,500, an ~80% jump the insights should notice
             · try to move the month selector into the future
Ladder.      SN-42
Problems.    —
```

### FL-43 · Insights — 3 entry points

```
Trigger.     "Tell me something I do not already know."
State.       demo — deliberately seeded so every section has something to say.
Entry.       .E1 SC-05's rail  .E2 SC-03's pace tap  .E3 SC-03's forecast card
Pre.         flags.insights.
Steps.       .S1 open Insights  .S2 read the headline  .S3 expand each section
Entities.    R E-63 · R E-57 · R E-56 · R E-53
Writes.      Nothing.
Numbers.     · the headline's spend-vs-budget figure must match Home's
             · the month-end projection must match Home's forecast card — **two
               screens, one number, and they must agree**
             · "changed vs last month" should surface Eating Out, which demo
               moved from ₹1,500 to ₹2,700
Exit.        Sections link to Add, Budget and category detail.
Branches.    .B1 before day 3 the forecast declines to guess, which is the
                 honest answer rather than a bad number
Failures.    .FM1 too little data → sections should self-hide, not show zeroes
Reversible.  Nothing written.
Also try.    · **open Insights and Home side by side and check the projection
               is the same number on both**
             · check no section shows a settlement as spending
             · look for a section with nothing to say and confirm it is hidden
               rather than empty
Ladder.      SN-43
Problems.    —
```

```
### FL-44 · Reminders — 2 entry points

```
Trigger.     "Tell me before the rent goes out."
State.       demo — three rules fall due within 3 days, so there is something to
             be reminded about. **Needs a dev build for real notifications.**
Entry.       .E1 SC-06 → SC-31  .E2 SC-30, which is read-only
Pre.         flags.reminders, and the OS permission.
Steps.       .S1 open Notifications  .S2 turn on renewals, daily log, backup
             .S3 grant the OS permission  .S4 send a test  .S5 tap the test
Entities.    W E-91 prefs · W E-90 the OS schedule
Writes.      Preferences here; the OS holds the actual schedule, and it is
             **regenerated at every cold start** because the two can drift.
Numbers.     · nothing financial moves
             · SC-30 should list the same bills as Plan's "upcoming", and the
               same ones Home shows under "coming up" — three surfaces, one set
Exit.        Stays. A tapped notification routes: a renewal opens the rule, the
             daily nudge opens Add, the backup nudge opens Reports.
Branches.    .B1 permission refused → the switches should say so, not fail quietly
Failures.    .FM1 **jest cannot prove any of this.** It is device-only
             .FM2 the OS schedule drifting from the rules that made it
Reversible.  Turn them off.
Also try.    · send a test, background the app, and tap the notification —
               check it lands on the right screen and not just Home
             · compare SC-30's list against Plan's upcoming section
             · deny the permission and see what the screen says
Ladder.      SN-44
Problems.    Needs a dev build. DQ-80 gates real push entirely.
```

### FL-45 · Set the money profile — 2 entry points

```
Trigger.     "The app does not know how much I actually have."
State.       demo — bank ₹2,10,000 · cash ₹45,000 · wallet ₹45,000 ·
             ₹10,000 used of ₹60,000 credit.
Entry.       .E1 SC-05 MoneyEditorSheet  .E2 onboarding
Pre.         None.
Steps.       .S1 open Plan  .S2 tap the money card  .S3 set the three buckets
             .S4 set the credit limit and what is used  .S5 save
Entities.    W E-11 `money.*` keys
Writes.      Opening balances only. Every later figure is those plus the ledger.
Numbers.     · **investments is not editable here, deliberately** — it is derived
               from live assets and nothing writes it (IV-14). If you find a way
               to type into it, that is a bug
             · changing the opening bank balance should move total money by
               exactly that difference, and nothing else
             · cash available = the three buckets ± every transaction you paid for
Exit.        Closes the sheet; Plan reloads.
Branches.    .B1 onboarding sets the same keys, from a friendlier form
Failures.    .FM1 negative values
             .FM2 credit used above the limit
Reversible.  Edit again.
Also try.    · **note total money, add ₹1,000 to the wallet opening, check the
               total rose by exactly ₹1,000**
             · look for any field that lets you type an investments figure
             · set credit used above the limit and see what happens
Ladder.      SN-45
Problems.    DQ-14 — buckets are not named accounts, and never will be until
             that is decided.
```

### FL-46 · Write off a receivable — 1 entry point

```
Trigger.     "Sneha is never paying me back, and I am done tracking it."
State.       demo — several people owe you across Goa and Manali.
Entry.       .E1 SC-26a
Pre.         A person who owes you.
Steps.       .S1 open the person  .S2 write it off  .S3 confirm
Entities.    W E-01.receivable_state
Writes.      **The only stored fact about a debt in the entire app.** Everything
             else about a balance is computed on the spot (E-50).
Numbers.     · the amount leaves your "owed to you" total on Home
             · **no transaction is deleted** — the group ledger is unchanged, and
               opening the group still shows every expense
             · your past spending does not change: your share was always yours
Exit.        Stays.
Branches.    .B1 it is reversible — expecting it again restores the figure
Failures.    .FM1 writing off, then them paying anyway
Reversible.  Yes, by setting it back to expected.
Also try.    · **write one off, then open the group and confirm every expense is
               still there.** This is the difference between forgiving a debt and
               deleting history
             · check Home's owed total dropped by exactly that amount
             · undo it and check the figure comes back
Ladder.      SN-46
Problems.    —
```

### FL-47 · WhatsApp reminder — 1 entry point

```
Trigger.     "Nudge Rohan about the Goa money."
State.       demo — Rohan owes you in Goa Trip.
Entry.       .E1 SC-26a
Pre.         WhatsApp installed. Their number is not required — you pick the chat.
Steps.       .S1 open the person  .S2 tap the reminder  .S3 WhatsApp opens with
             a drafted message  .S4 **you** send it, or do not
Entities.    R E-50 for the amount
Writes.      Nothing. Ever.
Numbers.     · the amount in the draft must match the balance on screen
             · nothing changes in the app whether you send it or not
Exit.        Leaves the app.
Branches.    .B1 no WhatsApp installed
Failures.    .FM1 the draft naming the wrong scope — the global net rather than
                  this group's, or the other way round
Reversible.  Nothing written.
Also try.    · **check the drafted amount against the balance the screen shows**
             · back out without sending and confirm nothing was recorded
             · try it for someone you owe, rather than someone who owes you
Ladder.      SN-47
Problems.    The app drafts; it never sends. That is deliberate — it is not a
             debt collector.
```

### FL-48 · CSV export and re-import — 3 entry points

```
Trigger.     "Get my data out" / "put it back."
State.       demo — plenty to export.
Entry.       .E1 SC-14  .E2 SC-20  .E3 SC-06 → Export all data
Pre.         None.
Steps.       .S1 export  .S2 the share sheet opens  .S3 save the file
             .S4 Settings → Import  .S5 pick the same file  .S6 review
             .S7 commit
Entities.    R E-04 · W E-17 on the way back in
Writes.      Export writes nothing. Re-import goes through the Review inbox, so
             nothing lands unseen.
Numbers.     · **round-trip test:** export, re-import, commit, and your month
               total should be **exactly doubled** — every row is now there twice
             · which also means the duplicate warning should fire on all of them
Exit.        Export leaves to the share sheet; import lands on Review.
Branches.    .B1 `isBudgetSplitExport` recognises our own format and maps columns
Failures.    .FM1 demo rows are filtered by hardcoded signatures that can fall
                  out of step with `seedDemo.ts` — a known drift risk
             .FM2 a file edited in a spreadsheet and re-saved
Reversible.  Discard on the Review screen before committing.
Also try.    · **export and re-import without committing** — check the duplicate
               warning fires on every row
             · open the CSV in a spreadsheet and check the amounts are readable
               rupees, not paise
             · export a single group rather than everything
Ladder.      SN-48
Problems.    The demo-row filter and `seedDemo.ts` are edited independently.
```

### FL-49 · Server backup and restore — 1 entry point

```
Trigger.     "Keep a copy somewhere that is not this phone."
State.       **needs an account and a server build.** Restore has never run on
             a device.
Entry.       .E1 SC-34
Pre.         An account (FL-30), and a passphrase you will not forget.
Steps.       .S1 open Backup  .S2 set a passphrase  .S3 back up to the account
             .S4 to restore: pick it  .S5 passphrase  .S6 confirm **replace all**
Entities.    R/W E-89 · W every backed-up table
Writes.      Encrypted before it leaves. The server cannot read it.
Numbers.     · after a restore every figure should match what you had at backup
               time, exactly
             · **but your app preferences will not come back** — they live in a
               different store that is not in the backup, and nothing says so
Exit.        A restore forces a reload.
Branches.    .B1 the same flow writes a local file instead (FL-11)
Failures.    .FM1 **a restore is refused outright while sync is on**, because it
                  would re-publish an old state. Check the refusal, not the warning
             .FM2 backups above about 25 MiB — KV is standing in for R2 (DQ-85)
Reversible.  **No.** A restore is not undoable, which is why it asks twice.
Also try.    · back up, change something, restore, and check the change is gone
             · **check whether your feature switches survived the restore**
Ladder.      SN-49
Problems.    Restore never run on a device. RELEASE §0.4.
```

### FL-50 · Load demo data or erase everything — 1 entry point

```
Trigger.     Starting a test sweep, or clearing up after one.
State.       any. **This flow is how you change state.**
Entry.       .E1 SC-27, reached by tapping the version seven times in Settings
Pre.         `DEV_TOOLS_ENABLED`, which is deliberately true for the pilot.
Steps.       .S1 Settings  .S2 tap the version 7×  .S3 Storage opens
             .S4 Load demo data, or Erase all data  .S5 confirm
Entities.    W everything, or D everything
Writes.      Both **wipe the database**. Loading demo preserves only your name
             and avatar.
Numbers.     · after loading demo you should see 5 people, 8 groups and 8 goals,
               and the confirmation toast says the counts it actually wrote
             · after erasing, every figure is zero and every list is an empty
               state — which is the only way to see those
Exit.        Stays on Storage.
Branches.    .B1 erase gives you sweep 1; demo gives you sweep 2
Failures.    .FM1 **neither is undoable and neither takes a backup first**
             .FM2 running it on real data
Reversible.  No.
Also try.    · erase, then walk the first-run flow and every empty state
             · load demo and check the toast's counts against what you see
Ladder.      SN-50
Problems.    DQ-21 — this ships in release builds today, on purpose, so testers
             can reset the build they were given. It is also what makes this
             whole walkthrough possible.
```

### FL-51 · Lock and privacy — 1 entry point

```
Trigger.     "Do not show my money to whoever picks up my phone."
State.       any.
Entry.       .E1 SC-06
Pre.         A device passcode or biometric enrolled.
Steps.       .S1 Settings  .S2 turn on the lock  .S3 background the app
             .S4 come back  .S5 authenticate
Entities.    R E-80 preferences
Writes.      Preferences only.
Numbers.     · hide-amounts must blank **every** figure, not only the hero — the
               category rows, the balances, the goal amounts
             · nothing is actually changed; this is presentation
Exit.        Stays.
Branches.    .B1 the privacy screen covers the app in the task switcher
             .B2 hide amounts is separate from the lock
Failures.    .FM1 biometrics unavailable or refused
             .FM2 a figure that escapes hide-amounts somewhere
Reversible.  Turn it off.
Also try.    · turn on hide amounts and **hunt for a number that still shows**
             · background and reopen with the lock on
             · check the task switcher preview is covered
Ladder.      SN-51
Problems.    All off by default.
```

### FL-52 · Merge two people — 1 entry point

```
Trigger.     "There are two Aaravs."
State.       demo, plus creating a duplicate person by hand first.
Entry.       .E1 the merge alert, from the tab bar's sync chain
Pre.         Two person rows that are the same human.
Steps.       .S1 create a second "Aarav" in People  .S2 give them an expense
             .S3 the merge prompt appears  .S4 pick which survives  .S5 confirm
Entities.    W E-01 · W E-03 · W E-06 · W E-07 · W E-12 · W E-21 · W E-04
Writes.      Every reference across **eight tables** is moved, then the loser is
             deleted. This is the real answer to "delete a person" — a plain
             delete is refused for anyone referenced anywhere.
Numbers.     · **the merged person's balance must equal the sum of the two**
             · no expense may be lost, and no total may change
Exit.        Stays.
Branches.    .B1 `deletePerson` refuses; merge is the supported path
Failures.    .FM1 a reference the merge misses would be a dangling id, and
                  foreign keys are off, so nothing else would catch it (DQ-19)
Reversible.  **No.**
Also try.    · make a duplicate, split an expense with each, merge, and **check
               the balance is the sum**
             · check the group member list shows one of them afterwards, not two
Ladder.      SN-52
Problems.    DQ-19.
```

### FL-53 · Adopt an uncategorised name — 1 entry point

```
Trigger.     "What is this `Poker Night` thing in my breakdown?"
State.       demo — **`Poker Night` is there waiting**, from Aarav's game night
             in Roommates. ₹400 of it is yours.
Entry.       .E1 SC-25
Pre.         A transaction carrying a category name you do not have — which
             happens whenever someone else in a shared group uses their own.
Steps.       .S1 open Categories  .S2 find the uncategorised section
             .S3 adopt it, or leave it  .S4 pick an icon and colour
Entities.    W E-09
Writes.      Turns a name that only exists on transactions into a real category.
Numbers.     · **before adopting, your ₹400 is inside `Others`**
             · after adopting, `Others` drops by ₹400 and `Poker Night` appears
               with ₹400 — the month total must not move
Exit.        Stays.
Branches.    .B1 leaving it alone is a valid choice; it stays folded
Failures.    .FM1 confusing `Others` (the fold) with `Other` (a real category one
                  character away, OV-18)
Reversible.  Delete the category again; it returns to the fold.
Also try.    · **note the `Others` figure, adopt `Poker Night`, check `Others`
               dropped by exactly ₹400 and the month total did not move**
             · adopt it and then set a budget on it
Ladder.      SN-53
Problems.    OV-18 · DQ-16.
```

### FL-54 · Storage cleanup — 3 entry points

```
Trigger.     "The phone says it is full."
State.       demo — there are attachment rows, though not real files.
Entry.       .E1 SC-06  .E2 SC-03's low-disk banner  .E3 SC-07
Pre.         None.
Steps.       .S1 open Storage  .S2 read what the app is using
             .S3 clear cached exports, or delete receipt photos  .S4 confirm
Entities.    D E-83 files · R device free space
Writes.      Files only. **Nothing here can lose a transaction** — that is the
             entire reason this screen is separate from the developer one.
Numbers.     · the reclaimed figure should match what the row promised
             · **no financial figure may change at all**
             · a transaction whose photo you deleted stays, and loses its image
Exit.        Stays.
Branches.    .B1 the low-disk banner on Home routes straight here
Failures.    .FM1 a URI left pointing at a file that is gone — there is a reaper
                  for exactly this, run at cold start
Reversible.  No, but nothing important is lost.
Also try.    · delete all receipt photos, then **open a transaction that had
               one** and check the entry survived
             · check your month total is untouched
             · confirm this screen has no way to erase data — that is `SC-27`
Ladder.      SN-54
Problems.    Deliberately separate from SC-27, so the two destructive actions
             are never one tap from Settings.
```
---

## §9 · Scenario ladders

`Last verified: 2026-09-01 · Guarded by: scenarioStatus.test.ts (markers only)`

One ladder per flow, numbered to match: `SN-04` is the ladder for `FL-04`.

**Rows are generated, not brainstormed.** Cross the flow with §4's axes and the rows fall out. That
is what makes coverage checkable: a money flow whose ladder has no `AX-11` crossing at T2 has a
*visible* hole, rather than an absence nobody notices.

| Tier | Definition | Generated by |
|---|---|---|
| **T0** | One user, one device, defaults, valid input. **Exactly one row per flow.** | — |
| **T1** | Ordinary variation. Still one person, one device, valid input. | `AX-01` `AX-05`, entry mode, edit-after-save |
| **T2** | Two or more people, groups or devices. The first tier where approval, trust and sync exist at all. | `AX-02` `AX-03` `AX-06` `AX-10` `AX-11` |
| **T3** | Adversarial: bad input, interruption, race, offline, permission denied, stale data, deleted counterparty. Things that **do** happen. | `AX-07` `AX-08` `AX-09`, input validity, process death |
| **T4** | Pathological: the schema permits it, the UI forbids it, and nothing enforces the gap. | schema-vs-UI gap ∪ scale ∪ clock ∪ FK-off |

**What is actually here, as of 2026-09-02.** This section used to claim "T0–T2 for every flow" while
carrying four ladders, which is the document overstating itself — the same failure as the six guard
files it once named that did not exist. The truth:

| | |
|---|---|
| **Four tasks** carry a full T0–T4 ladder | `SN-04` add an expense · `SN-06` settle up · `SN-08` import → review · `SN-32` sync |
| **Every other task** carries its ordinary and multi-party cases inline | as `Also try` in its §8 entry, where a person walking the app will actually read them |
| **The crossings table** below covers the rest | one line per task, naming where it is known or suspected to misbehave |

The four with full ladders are the four where the money is hardest and the failure is quietest.
Promoting another task to a full ladder is a deliberate act, not a backlog item.

**Status markers**, a closed set of four:

| | Means |
|---|---|
| `✅ <test>` | Verified by an automated test, named |
| `🔍 date` | Verified by hand on a device, dated |
| `❓` | Unverified. Nobody has checked. |
| `❌ ID` | Known broken or known open, linked |

Most rows below are `❓`. That is the honest state of a suite with **zero component-render
coverage**: it proves the arithmetic thoroughly and has never once proved that a screen does what
this document says it does. `AGENTS.md` §11 names that gap as the one that shipped two launch
crashes. (`scripts/smoke-system-map.js` renders the System Map page, which is the only render
coverage anywhere in the repo — and it covers the page, not the app.)

---

### SN-04 · Adding an expense

**T0** — Personal, ₹250, Groceries, today, from the Home FAB. → 1 `txn`, 1 `txn_payment(me)`,
1 `txn_share(me)`. The Home total moves by ₹250. `✅ amountCalc.test.ts` `✅ splitMath.test.ts`

| | T1 — ordinary variation | |
|---|---|---|
| .T1a | Group expense, equal split, 3 people, I paid | `✅ splitMath` |
| .T1b | Group expense, someone else paid — I owe my share | `✅ splitExactness` |
| .T1c | Backdated 40 days, crossing a month boundary — which month's `E-12` does it count against? | `❓` |
| .T1d | A category created inline during entry | `❓` |
| .T1e | Itemized, 6 lines, 2 unassigned | `✅ itemized` |
| .T1f | Income instead — same screen, zero shares (`IV-16`) | `✅ splitMath` |
| .T1g | Marked recurring at creation — is a rule created, an event, or both? | `✅ txnInvariant` |
| .T1h | Edited two minutes later, amount changed | `❓` |
| .T1i | Entered by voice | `✅ voiceParse` |
| .T1j | Entered from a receipt scan | `❓` |
| .T1k | Entered via a Review commit — a different write path, the same entity | `✅ pendingRoundTrip` |
| .T1l | Into a category already at 96% of budget — `BudgetNudge` fires | `❓` |

| | T2 — multi-party, multi-scope | |
|---|---|---|
| .T2a | Shared group, peer **trusted** → lands live on their device | `✅ peerApproval` |
| .T2b | Peer **untrusted** → awaits approval. **My** group balance has already moved; theirs has not | `✅ peerApproval` |
| .T2c | Added on phone A while phone B is offline; B reconnects | `❓` |
| .T2d | The payer has no `remote_uid` — the entry can never reach them (`IV-11`) | `✅ trust` |
| .T2e | Split by shares, then exact, then percent — three modes, one row shape | `✅ splitMath` |
| .T2f | Paid for a group, but filed under a personal category | `❓` |
| .T2g | Added to a group I leave ten seconds later | `❓` |
| .T2h | Trusted globally, on review **in this group** (`E-21`) | `✅ trust` |

| | T3 — adversarial | |
|---|---|---|
| .T3a | Amount `12.345` / `1,2,3` / `-50` / empty / `0` | `✅ money` |
| .T3b | App killed between the `txn` insert and the `txn_share` insert — is `withTransactionAsync` really around both? (`IV-03`) | `❓` |
| .T3c | Offline → the outbox queues → 409 stale on push | `✅ syncOutbox` |
| .T3d | Two devices edit the same amount within one second | `❓` |
| .T3e | The category is deleted by another device while the sheet is open | `❓` |
| .T3f | The destination group is deleted while the Add screen is open | `❓` |
| .T3g | Shares stop summing to payments because a participant was removed mid-edit | `❓` |
| .T3h | Storage full at receipt-write time — the txn must still save | `❓` |
| .T3i | Camera permission denied *after* Scan was tapped | `❓` |
| .T3j | Entered with `groupId` set while `splitting` is **off** — one of 24 entries, 11 params | `❌ OV-08` |
| .T3k | Back after tab routes were pushed onto the stack | `🔍 2026-09-01 fixed` |

| | T4 — pathological | |
|---|---|---|
| .T4a | **Two `is_me` rows** (`SYNC-F5`): `myShareOf` reads one, the Home strip reads the other | `❌ SYNC-F5` |
| .T4b | `group_id` points at a group that was hard-deleted on an older build — reachable because foreign keys are off | `❌ DQ-19` |
| .T4c | A rule whose `recur_end` precedes its `date` | `❓` |
| .T4d | 10,000 transactions in one group; Home recomputes `E-50` on every render | `❌ OV-14` |
| .T4e | A `kind='settlement'` written by the **asset** path, opened in the settle-up sheet, which assumes a debt | `❌ OV-02` |
| .T4f | Device clock set to 2027 — a future-dated txn, and budget-month rollover | `❓` |
| .T4g | `tz` is recorded but `date` is an epoch integer: a 00:30 IST entry shows on the previous day after travel | `❌ OV-23` |
| .T4h | Restore over a sync-enabled device — verify the **refusal**, not the warning (`SYNC-F9`) | `❓` |
| .T4i | `txn_share` rows naming a person who was deleted | `❌ DQ-19` |

---

### SN-06 · Settling up

**T0** — One shared group, two people, I owe Rohan ₹420, tap Settle up, confirm cash. → 1 `txn`
kind=settlement, payment(me, 420), share(Rohan, 420). The group net goes to 0.
`✅ settle.test.ts` `✅ confirmSettlement.test.ts`

| | T1 | |
|---|---|---|
| .T1a | Partial: ₹200 of ₹420 | `✅ settle` |
| .T1b | Over-settle ₹500 — the direction flips, they now owe me ₹80 | `✅ settle` |
| .T1c | Via UPI intent rather than cash | `❓` |
| .T1d | I record that *they* paid *me* | `✅ owe` |
| .T1e | Started from Friends rather than from the group | `❓` |
| .T1f | Backdated, with a note | `❓` |

| | T2 — where the real design question lives | |
|---|---|---|
| .T2a | **Rohan and I share three groups. The global net is ₹420. No single group is ₹420. Which group does the settlement row land in?** | `❌ AX-03` |
| .T2b | A three-way cycle A→B→C→A at ₹300 each — does it suggest the collapse, or three payments? | `✅ settle` |
| .T2c | Settling a global balance where one contributing group is one I have left | `❓` |
| .T2d | Rohan untrusted → awaits his approval → **my** balance shows settled, his does not until he accepts | `✅ peerApproval` |
| .T2e | Settle on phone A while phone B holds an unsynced expense in the same group; after sync the balance is no longer zero | `❓` |
| .T2f | Settling with a local-only person, who has no account | `✅ trust` |

| | T3 | |
|---|---|---|
| .T3a | The UPI app returns without confirming — there is no callback truth | `❓` |
| .T3b | Android: `useUpiApps` is null, so the hand-off is unreachable | `❌ DQ-11` |
| .T3c | Settled, then the counterparty edits an old expense and reopens the balance | `❓` |
| .T3d | Offline settle → 409 because they settled simultaneously → two settlements, the balance overshoots negative | `❓` |
| .T3e | Rejecting a settlement → soft-deleted on mine, alive on theirs, and the objection travels back | `✅ peerApproval` |
| .T3f | Settling an amount that includes an entry still awaiting approval | `❓` |
| .T3g | The settle sheet is open while the group key is re-wrapped | `❓` |

| | T4 | |
|---|---|---|
| .T4a | The suggester offers to "settle" a **card repayment** or an **SIP purchase** — four meanings, one filter | `❌ OV-02` |
| .T4b | Settling with yourself, reachable if `.T4a` of `SN-04` has happened | `❌ SYNC-F5` |
| .T4c | Settling ₹0 | `❓` |
| .T4d | A settlement inside a **personal** group: `CROSS_GROUP_FILTER` excludes it, so the row exists and no balance ever reflects it | `❌ AX-01` |
| .T4e | 40 groups × 12 people — `getNetByGroup` fan-out and an O(n²) suggestion | `❓` |
| .T4f | A settlement referencing a person who was merged away | `❓` |
| .T4g | A settlement dated before every expense it settles | `❓` |
| .T4h | Restore an old backup after settling — the settlement vanishes, the debt returns, and their device still has both | `❌ SYNC-F9` |

`.T2a` and `.T4d` are the point of this whole section. Neither was found by testing. Both fell out
of writing `E-50`'s **Is not** field honestly — "not one number, three scopes give three different
right answers" — and then asking what happens when the scopes disagree.

---

### SN-32 · Sync push and pull

The ladder to read before trusting any of `FE-54`. **Every row here is `❓` at T2 and above**, because
the subsystem is complete and has never run on a phone.

**T0** — One device, one shared group, one entry. Queue → seal → push → 200. `✅ syncOutbox` `✅ groupCrypto`

| | T1 | |
|---|---|---|
| .T1a | Ten entries queued, one drain — `MAX_PER_DRAIN` bounds the batch | `✅ syncOutbox` |
| .T1b | An entry edited three times before its first push — the outbox collapses to one row | `✅ syncOutbox` |
| .T1c | An entry created and deleted before any push | `❓` |

| | T2 | |
|---|---|---|
| .T2a | Two devices, both mine, same account | `❓` |
| .T2b | A peer's entry arrives from a trusted author → lands live | `✅ peerApproval` |
| .T2c | From an untrusted author → lands awaiting approval, invisible to every money figure (`IV-05`) | `✅ approvalInvariant` |
| .T2d | A new member joins → the roster gains a member, the key is wrapped for their device | `✅ shareGroupKey` |
| .T2e | A member is removed → soft-deleted, past shares still resolve (`IV-21`) | `✅ memberInvariant` |
| .T2f | The group vanishes server-side → `archiveVanishedGroup`, never a silent data loss | `✅ rosterLiveness` |
| .T2g | A reinstall: the history is here, the device key is not | `❓` |

| | T3 | |
|---|---|---|
| .T3a | 409 on push — compare-and-set refuses, never a silent last-write-wins | `✅ syncDoc` |
| .T3b | Offline for a week, then a large drain | `❓` |
| .T3c | Connection drops mid-drain | `❓` |
| .T3d | The server has entries this device cannot decrypt | `❓` |
| .T3e | A roster version older than the local one | `✅ rosterLiveUpdates` |
| .T3f | Two devices adopt the same group simultaneously | `✅ groupAdoption` |

| | T4 | |
|---|---|---|
| .T4a | Rejecting an entry leaves the two devices holding different rows. The objection travels back (`E-22`) and withdrawing it travels too, so the difference is visible to both — but nothing reconciles the rows themselves | `✅ peerApproval` |
| .T4b | Two `is_me` rows after a restore-then-sync | `❌ SYNC-F5` |
| .T4c | An itemized bill arrives as a single expense — the money is right, the breakdown is gone, and nothing on screen says so | `❌ SYNC-F4` |
| .T4d | A receipt is attached locally and never travels, so one side sees evidence the other cannot | `❌ SYNC-F4` |
| .T4e | A restore while sync is on would re-publish an old state — refused by `restoreGuard`, and the refusal itself is untested | `❌ SYNC-F9` |
| .T4f | Clock skew between two devices reorders `updated_at` | `❓` |

---

### SN-08 · Import → Review → commit

**T0** — A Paytm CSV of 20 rows, all detected, all committed to Personal. → 20 `txn` + 20 payment +
20 share rows, in one transaction. `✅ importParse` `✅ paytmParse` `✅ pendingRoundTrip`

| | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| a | xlsx workbook instead of CSV `✅ xlsx` | Rows destined for a shared group `❓` | A malformed row mid-file `✅ importParse` | 5,000 rows in one file `❓` |
| b | A PDF through pdf.js `❓` | Rows split with a counterparty `❓` | The app is killed mid-commit — the batch must land or not at all (`IV-03`) `❓` | Every row a duplicate of an existing txn `❓` |
| c | Pasted email alerts `✅ emailTxnParse` | A saved view with a per-view payer `❓` | The destination group is deleted while rows are drafted — dest, draft and counterparty are reset `✅ deleteAndLeaveGroup` | A row whose category exists only as a tombstone `❓` |
| d | GPay pasted text `✅ gpayParse` | Committed while a peer edits the same period `❓` | Discard-all with drafts in progress `❓` | A file that is our own CSV export, re-imported `❓` |

`FE-48` — the Review screen itself — has **never been device-tested**. Every `❓` above is honest.

---

### SN-09 · Budgets · SN-10 · Goals · SN-11 · Backup

```
SN-09  T0  One category, ₹8,000/month, Personal. Spend counts against it.  ✅ budget
       T1  a daily cadence · a yearly cadence · a group default · my override
           · an override left blank (keeps following the group, does not mean 0)
       T2  a  Admin sets the group default; every member inherits          ✅ permissions
           b  I override two of eight categories; six keep following        ✅ budget
           c  A non-admin tries to edit the default → refused               ✅ permissions
       T3  a  A category renamed after the budget is set (by NAME)  ❌ OV-06
           b  A category deleted — the budget row goes with it       ✅ schemaFixes
           c  Month rollover mid-edit                                ❓
       T4  a  `period` and `cadence` disagree on one row             ❌ OV-19
           b  budget_target (AsyncStorage) and E-12 disagree          ❌ OV-07
           c  A budget on a group I have left                        ❓

SN-10  T0  Fund ₹5,000 into one goal from bank.                             ✅ savings
       T1  withdraw · adjust the target · set a deadline · lock · reorder by drag
       T2  a  Auto-funding fires at launch for three goals in rank order    ✅ savingsEngine
           b  A locked goal is skipped by a raid                            ✅ overspendRaid
       T3  a  Funding more than E-54 holds → refused                        ✅ savings
           b  Two goals, one bucket, insufficient for both                  ✅ savingsEngine
           c  The sweep runs unattended while you are mid-edit              ❓
       T4  a  priority=want but drag-ranked first — which wins? (protection vs order) ❓
           b  A goal reached and overfunded manually while the engine caps itself     ❓
           c  savings_txn with goal_id NULL — unreachable since the pool was dropped, still in the CHECK  ❌ OV-23

SN-11  T0  Backup to a file with a passphrase; restore it on a clean install.  ✅ backup
       T1  server blob instead of a file · the launch restore offer
       T2  a  Restore onto a device that already has data → REPLACES ALL     ✅ backup
           b  Restore while sync is on → REFUSED (SYNC-F9)                   ❓
       T3  a  Wrong passphrase → refused, nothing touched                    ✅ backup
           b  Truncated file                                                 ✅ backup
           c  Backup over ~25 MiB — KV stands in for R2                      ❌ DQ-85
       T4  a  Restore an export from a newer schema onto an older build      ❓
           b  E-80 preferences are NOT in the backup, so a restore does not
              return you to where you were, and nothing says so              ❌ OV-13
           c  Restore, then sync, then two is_me rows                        ❌ SYNC-F5
```

---

### The remaining ladders

`SN-01`–`SN-03`, `SN-05`, `SN-07`, `SN-12`–`SN-31`, `SN-33`–`SN-54` follow the same generation rule.
Rather than pad this section with rows that restate their flow, each is recorded by **the crossings
that actually bite** — the axis pairs where that flow is known or suspected to misbehave.

| Ladder | Flow | The crossings that bite |
|---|---|---|
| `SN-01` | First run | `AX-04`: the persona writes flags; a refused permission must not break the app. Replaying needs a restart. |
| `SN-02` | Feature toggle | `AX-04` × data: turning `splitting` off with unsettled balances. Re-applying a persona silently undoes hand-toggles. |
| `SN-03` | Premium | None. The flow does not exist. |
| `SN-05` | Itemized | `AX-11`: **line items do not sync**, and nothing on screen says so. `IV-02` at T3: a remainder must land deterministically. |
| `SN-07` | Dashboard | `AX-04` × 3: three red surfaces can stack on one open (`DQ-12`). `OV-14` at T4: `E-50` per render. |
| `SN-12` | Add income | `AX-01`: income logged into a shared group means nothing (`IV-16`). |
| `SN-13` | Edit | `AX-07` 409; `AX-02` an edit that makes someone else worse off needs approval (`IV-09`); `IV-12` at T4. |
| `SN-14` | Delete | `AX-02`: a peer's entry is refused out loud. Undo after the toast expires. |
| `SN-15`/`SN-16` | Recurring | `AX-09`: `IV-04` — a rule must never count as spending. A skip is local and does not travel. |
| `SN-17` | Voice | The one-tap install is dead (`DQ-22`). Auto-save has no off switch (`DQ-20`). |
| `SN-18` | Receipt scan | Permission denied *after* Scan. iOS-only. Cloud→device fallback. |
| `SN-19`/`SN-20` | Scan & Pay, UPI | No callback truth — only the human knows. `IV-19` QR name spoofing. Android unreachable (`DQ-11`). |
| `SN-21` | Request QR | `IV-18`: must never become a collect request. |
| `SN-22`–`SN-26` | Groups | `SN-26` is the important one: archive vs leave vs delete are three end states (`OV-11`), and delete is a tombstone, not a wipe. |
| `SN-27`/`SN-28` | Approve, dispute | `AX-06` × `AX-11`: rejection leaves different rows on each device, visibly. The round trip is tested; the reconciliation does not exist. |
| `SN-29` | Trust | `IV-10` per person; `IV-11` inert without an account; the override must stay clearable. |
| `SN-30`/`SN-31` | Account, linking | `DQ-08`: a typo at sign-in makes a second account holding none of your backups. |
| `SN-33`–`SN-35` | Assets | `IV-03` — a half-written transfer drops net worth and leaves a ledger row that looks correct. `IV-15` archived stops counting. `OV-02`. |
| `SN-36`/`SN-37` | Raid, sweep | Consent and undo for the raid; the sweep is unattended, which is why it is off by default. `DQ-15`. |
| `SN-38` | Rebalance | Donor selection when every category is already over. |
| `SN-39` | Afford | Only cash produces a hard No; necessity must never override it. |
| `SN-40` | Search | `IV-17`: no total on "All", because one figure across three kinds answers nothing. |
| `SN-41`/`SN-53` | Categories | `OV-06`: rename rewrites by name; delete orphans a string into `Others`. `OV-18`. |
| `SN-42`/`SN-43` | Reports, insights | Month selector must not advance past today. `IV-06` settlements excluded. |
| `SN-44` | Reminders | The OS holds the schedule and drifts; jest cannot prove any of it. |
| `SN-45` | Money profile | `IV-14`: nothing writes `investments`, and the type only *mostly* enforces it. |
| `SN-46` | Write-off | The only stored fact about a debt. |
| `SN-47` | WhatsApp | Composes, never sends. |
| `SN-48` | CSV round trip | Demo-row signatures can drift from `seedDemo.ts`. |
| `SN-49` | Server backup | Never run on a device. |
| `SN-50` | Erase / demo | Not undoable, takes no backup first, live in release (`DQ-21`). |
| `SN-51` | Lock | Locks on background, re-auths on foreground. |
| `SN-52` | Merge | Eight tables in one statement; a missed reference is a dangling id (`DQ-19`). |
| `SN-54` | Storage cleanup | Nothing here can lose a transaction — that is why it is separate from `SC-27`. |
---

## §10 · Complexity and overlap register

`Last verified: 2026-09-01 · Guarded by: docIdGraph.test.ts (IDs only)`

This is the section for "we have created too many and unnecessarily complex flows". Each entry names
the duplication, counts it, prices the fix, and **commits to a verdict**.

**Kind** — `alias-sprawl` (N names, one concept) · `overload` (one name, N concepts) ·
`path-duplication` (N routes to one outcome) · `dead-alternative` (a second answer nobody uses) ·
`split-storage` (one concept, two stores) · `phantom` (a reference to something that is not there).

**Verdict** — one of five:

| Verdict | Means |
|---|---|
| `COLLAPSE` | Do it. The cost is bounded and the confusion is active. |
| `COLLAPSE-AFTER-PILOT` | Real, but the fix touches money or the wire. Needs a trigger, filled in. |
| `RENAME-ONLY` | The concepts are fine; the vocabulary is not. Zero code risk. |
| `KEEP-DOCUMENTED` | It looks like duplication and is not. Writing it down *is* the fix. |
| `NEEDS-DECISION` | Cannot be resolved without answering a `DQ-`. |

**`RENAME-ONLY` and `KEEP-DOCUMENTED` are wins, not deferrals.** They close an item at zero risk.
Of the 27 below, **12 close that way** — which is the most useful thing this section says. The app is
not as over-built as it feels; it is *under-named*. Most of the confusion is vocabulary, and
vocabulary is cheap to fix. Six items are genuine structural duplication worth code, and five of
those can wait for the pilot.

**Tally:** 4 `COLLAPSE` · 5 `COLLAPSE-AFTER-PILOT` · 8 `RENAME-ONLY` · 4 `KEEP-DOCUMENTED` ·
6 `NEEDS-DECISION`.

---

### The four to actually do

```
OV-12 · A route referenced from three screens that does not exist        [phantom]
  The N.   `/group/[id]/recurring`, deleted when SC-41 replaced it; one caller missed.
  Evidence useGroupTxnActions.ts:72, reached from SC-09, SC-14, SC-26a. No
           +not-found.tsx, so it landed on expo-router's Unmatched Route screen.
  Cost.    Tapping Edit on a materialized recurring row was a dead end, silently,
           from three ledgers. Not mentioned in any document.
  Collapse Push /recurring/{ruleId}, the derivation handleDelete already does.
  Blast.   One line, plus the now-dead `groupId` parameter and its three callers.
  Risk.    None.
  Verdict. COLLAPSE — **done 2026-09-01**, with deadRouteRef.test.ts to hold it.
  Trigger. —

OV-09 · Tab routes pushed onto the stack                      [path-duplication]
  The N.   4 sites: (tabs)/index.tsx:194 → /settings, :279 → /groups,
           savings/[id].tsx:207 → /savings, group/[id]/edit.tsx:173 → /(tabs)/groups.
  Evidence group/[id]/edit.tsx uses dismissTo correctly three lines away, and
           documents why. The file contradicted itself.
  Cost.    Pushing a tab stacks a second copy of the tab navigator; Back then
           returned to where you came from instead of leaving.
  Collapse navigate() between tabs; dismissTo() from a pushed screen back to one.
  Blast.   4 lines.
  Risk.    Low. Needs a device pass on the back gesture.
  Verdict. COLLAPSE — **done 2026-09-01**.
  Trigger. —

OV-25 · A sheet pattern documented twice and used never      [dead-alternative]
  The N.   SheetModal.tsx:21 and DraggableSheet.tsx:39 both describe "a sheet that
           IS a route screen → use a transparentModal route". No transparentModal
           route exists anywhere in app/.
  Cost.    Two files instruct the next person to build something the codebase has
           already decided against. Guidance that is wrong is worse than none.
  Collapse Delete both comments, or replace them with "we do not do this, and here
           is why: the stage-claiming in sheetStage.ts assumes one navigator level".
  Blast.   Two comments.
  Risk.    None.
  Verdict. COLLAPSE.
  Trigger. Now — it costs nothing and misleads continuously.

OV-27 · Three buttons to one destination on one screen        [path-duplication]
  The N.   SC-09's FAB (:261), Expenses-tab add (:310), Recurring-tab add (:316) —
           all push /add/quick?groupId={id}&kind=expense.
  Cost.    Three affordances competing for the same tap, and the Recurring tab's
           add is actively misleading: it looks like "add a rule" and adds an expense.
  Collapse Keep the FAB. Remove the Expenses-tab add. Make the Recurring tab's add
           create a RULE (kind=expense + the Repeat chip pre-opened), which is what
           its position promises.
  Blast.   Two call sites, one param change.
  Risk.    Low, but it is a layout change — worth confirming before doing.
  Verdict. COLLAPSE.
  Trigger. Now.
```

### The five worth code, after the pilot

```
OV-02 · kind='settlement' means four different things                   [overload]
  The four. 1 a debt settle-up between two people          FL-06
            2 a credit-card repayment                      FL-34, payCardBill
            3 an asset purchase or sale                    FL-33, moveToInvestments
            4 a plain transfer between holdings            TransferBody
  Evidence  schema.ts:66 CHECK(kind IN (...)); balances.ts:19 BALANCE_TXN_FILTER
            treats all four identically, as does the settle-up suggester.
  Cost.     SN-06.T4a — the suggester offers to "settle" an SIP purchase. The
            analysis exclusion (IV-06) is right for 1 and 2 and wrong for 3.
  Collapse  txn.settle_kind TEXT ('debt'|'card'|'asset'|'transfer'), defaulted to
            'debt'; make BALANCE_TXN_FILTER and the suggester select on it.
  Blast.    1 column, 1 migration, ~6 queries, 4 screens, ~9 tests.
  Risk.     Wire compatibility — a peer on the old shape reads NULL. The backfill
            is unambiguous (derivable from is_personal + an empty share set).
  Verdict.  COLLAPSE-AFTER-PILOT.
  Trigger.  The first asset-register bug report, or before a second holding kind ships.

OV-07 · Budget is three concepts, two levels, and three strays          [overload]
  The N.    1 My Budget      E-12, personal group, person_id NULL
            2 Group Budget   E-12, shared group, person_id NULL
            3 My Override    E-12, shared group, person_id = me
            4 budget_group.limit_daily/monthly/yearly — dead, never read
            5 settings.budgetTarget in AsyncStorage — LIVE, no category, no cadence
  Evidence  budget.ts:26-40 names the first three itself. schema.ts:33-43 calls
            the fourth "a SECOND, contradictory answer". homeData.ts:213 and
            useBudgetEditor.ts:71 both read the fifth as a fallback allocation.
  Cost.     Five answers to "what is my budget", in three storage locations, two of
            which nothing reconciles. SN-09.T4b is the case where 5 and 1 disagree.
  Collapse  Drop 4 (dead). Fold 5 into E-12 as an uncategorised monthly line, or
            delete it and have onboarding write real lines.
  Blast.    3 dead columns, 1 AsyncStorage key, 2 readers, ~4 tests.
  Risk.     Onboarding writes budgetTarget; changing it changes first-run numbers.
  Verdict.  COLLAPSE-AFTER-PILOT.
  Trigger.  The first "my budget says two different things" report.

OV-08 · /add/quick: 11 params, 24 entry points            [path-duplication]
  Evidence  Measured, not estimated: 24 in-app router call sites plus 3 external.
            Params: groupId kind editId recurEditId from to amount note date category q.
  Cost.     The single highest-fan-in screen in the app, and effectively a mini-app.
            Every settle-up, every "log it", the daily-log notification and the Siri
            shortcut all land here. A missing groupId is a whole bug class
            (SN-04.T3j), because the destination silently falls back to Personal.
  Collapse  Not "split the screen" — the form genuinely is one form. Instead: make
            the params a single typed intent object with a parser that REFUSES an
            incoherent combination rather than defaulting, and put a ceiling on the
            call-site count so it cannot grow.
  Blast.    1 hook, 24 call sites, 1 new test.
  Risk.     Medium. It is the most-used screen; every entry needs re-checking.
  Verdict.  COLLAPSE-AFTER-PILOT.
  Trigger.  entryPointCount.test.ts is in place now and starts at 24. It may not rise.

OV-17 · The tab bar owns sync, alerts, reconciliation and snapshots     [overload]
  Evidence  app/(tabs)/_layout.tsx, 427 lines. Navigation is a minority of it:
            runSync, vanished-group alerts, the person-merge chain, pending-payment
            and pending-settlement confirmation, the voice drain, maybeSnapshot,
            and the restore-offer alert.
  Cost.     The navigator is the busiest file in the app, and none of what makes it
            busy is navigation. Every one of those behaviours is untestable, since
            the suite never renders a component.
  Collapse  One <AppStartupTasks/> sibling component under DataRefreshProvider.
            The constraint that put them here — they must sit below that provider —
            is satisfied by a sibling just as well as by the tab bar.
  Blast.    ~250 lines moved, zero logic changed.
  Risk.     Low in principle, and it is pure code movement, which is exactly the
            class the pilot decision says to defer.
  Verdict.  COLLAPSE-AFTER-PILOT.
  Trigger.  The next bug in any of those behaviours.

OV-24 · SC-19 owns twelve sheet states                                  [overload]
  Evidence  showRecurSheet, destSheetFor, paySheetFor, whoSheetFor, bulkGroupSheet,
            bulkSheet, filterSheet, viewsSheet, saveViewSheet, and more, in one file
            under a 620-line ceiling that has already forced three decompositions.
  Cost.     The largest screen in the repo, and the one feature that has never been
            device-tested. Twelve independent booleans is twelve times the state
            space of one discriminated union.
  Collapse  One `activeSheet: {kind, payload} | null`. The stage-claiming in
            sheetStage.ts already assumes one sheet at a time, so the type would
            finally say what the runtime already enforces.
  Blast.    1 screen, ~12 states, no behaviour change.
  Risk.     Low, and the ceiling will hold it.
  Verdict.  COLLAPSE-AFTER-PILOT.
  Trigger.  The Review device pass — whichever bug it finds will be in this state space.
```

### The eight that are vocabulary, not architecture

```
OV-01 · Nine names for one row                                     [alias-sprawl]
  transaction · entry · expense · txn · recurring rule · series · occurrence ·
  item (Review) · line (ledger).
  Verdict. RENAME-ONLY. Keep **entry** in user-facing copy and **txn** in code.
           "Expense" means kind=expense only. "Item" and "line" belong to E-08.

OV-04 · Seven names over four shapes for a balance                 [alias-sprawl]
  balance · net · owe/owed · who owes whom · exposure · settle-up amount · the strip,
  over getGroupNet / getGlobalNet / getNetByGroup / MyExposure.
  Verdict. RENAME-ONLY, with one rule attached: **a balance is never named without
           its scope** (IV-07). "Net" alone should not appear anywhere.

OV-05 · Person, friend, member, roster member, contact             [alias-sprawl]
  One `person` row; FriendBalance is a projection that also RETAINS people who
  left, so "friend" ≠ "current member". RosterMember is a third wire shape.
  Verdict. RENAME-ONLY. **Person** everywhere in code. "Friend" only in UI copy,
           and only where retaining departed people is intended.

OV-18 · `Other` and `Others`, one character apart                  [alias-sprawl]
  `Other` is a real seeded category in all three kinds. `Others` is the synthetic
  fold bucket (E-63). Both render in the same breakdown.
  Verdict. RENAME-ONLY. Rename the fold to **"Everything else"**. One string.

OV-20 · Five near-identical investment identifiers                 [alias-sprawl]
  'Investments / SIP' (expense category) · 'Investment' (transfer category) ·
  asset.kind='investment' · MoneyProfile.investments (derived) ·
  MIGRATED_INVESTMENTS_NAME = 'Investments'.
  Verdict. RENAME-ONLY, and worth doing because these mean genuinely opposite
           things: one is money consumed, one is money moved.

OV-22 · Six vocabularies over daily/weekly/monthly/yearly          [alias-sprawl]
  BUDGET_CADENCE · Period · BUDGET_PERIOD · TabKey+TARGET_FOR_TAB · RECUR_FREQ ·
  SAVINGS_FREQUENCY.
  Verdict. RENAME-ONLY for four of them; OV-19 handles the two that are storage.
           They are genuinely different domains — a budget cadence and a recurrence
           frequency are not the same idea — so unifying the TYPES would be wrong.
           Unify the WORDS.

OV-11 · A group has three end states that get conflated               [overload]
  archived (hidden, still yours, reversible) · left (you are out, it continues) ·
  deleted (tombstoned for everyone, entries survive).
  Note.    The old claim here — "deleteGroup hard-deletes history" — is **false as
           of today**. It was true once, it caused exactly the damage you would
           expect, and it was fixed. Two documents still describe the old behaviour.
  Verdict. RENAME-ONLY. The three states are right; the UI words for them are not.

OV-26 · Create-as-sheet, edit-as-route                        [path-duplication]
  Creating a group is a SheetModal; editing one is a route. Adding a person is a
  sheet; adding a member is a route. Editing a budget is a route (SC-10) AND a
  sheet (OwnBudgetSheet).
  Verdict. RENAME-ONLY — meaning: write the rule down rather than churn the UI.
           The rule the codebase actually follows is "a sheet for one field, a
           route for a form". SC-10 vs OwnBudgetSheet is the one real violation.
```

### The four that only look like duplication

```
OV-03 · A recurring rule and a transaction share a table               [overload]
  A rule is `txn` with recur_freq NOT NULL — a row that has never happened, in the
  table of things that did. Every money statement must exclude it.
  Why keep it. A separate table would need every column txn has, plus a join on
           every ledger read, and the occurrences would still be txns. The
           exclusion is ONE predicate, and txnInvariant.test.ts reads the real SQL
           and fails when a new statement over txn omits it. That is a stronger
           guarantee than a second table would give.
  Verdict. KEEP-DOCUMENTED. This entry is the fix.

OV-13 · Two key-value stores both called "settings"               [split-storage]
  SQLite `settings` (E-11: money profile, migration markers, sync cursors) and
  AsyncStorage `lib/settings.ts` (E-80: ~30 preferences). Only the first is backed up.
  Why keep it. They have genuinely different lifetimes and different backup
           semantics. Merging them would put device preferences into a backup that
           is restored onto a DIFFERENT device, which is wrong.
  But.     The consequence is real and undocumented until now: **a restore does not
           bring your preferences back**, and nothing on screen says so.
  Verdict. KEEP-DOCUMENTED, plus one line of UI copy on the restore screen.

OV-21 · Four things called "pending"                                   [overload]
  E-17 pending_txn (the import inbox) · E-20 txn_approval (a peer's entry, which is
  a REAL txn) · E-84 pendingPayment · E-85 pendingSettlement.
  Why keep it. The reversal is load-bearing and hard-won: pending_txn CANNOT carry
           a peer entry, because it has no share or payment rows and no source
           group, so a split expense routed through it loses its split. E-84 and
           E-85 are siblings with different destinations on purpose.
  Verdict. KEEP-DOCUMENTED. Rename the AsyncStorage pair to "handoff" — that much
           is free — and leave the architecture alone.

OV-16 · Four features behind unlabeled icons             [path-duplication]
  SC-33 /afford, SC-32 /plan/recurring, SC-22 /insights, SC-20 /reports — four
  icon-only buttons in one rail on SC-05, each the sole or main route in.
  Why it is not simply wrong. The rail is compact and the alternative is four rows
           of chrome on the Plan screen.
  But.     featureFlags.ts says of affordCheck: "a real feature since the engine
           grew; off is why nobody found it". It is on now, and still nobody finds it.
  Verdict. KEEP-DOCUMENTED → **NEEDS-DECISION**, because whether to spend Plan's
           vertical space on labels is a layout question, not a correctness one.
           Deferred to you: see the note at the end of this section.
```

### The six that need a decision first

```
OV-06 · Categories are referenced by NAME, not by id            [split-storage]
  txn.category and category_budget.category are strings. A rename is a migration;
  a delete orphans the string into Others.
  Blocked on. Whether categories become global-and-undeletable-once-shared, which
              is a product decision, not a schema one.  → DQ-16
  Verdict. NEEDS-DECISION.

OV-10 · backOr is used in 5 of 44 route files            [path-duplication]
  lib/nav.ts documents exactly the cold-start-empty-stack failure it fixes. ~40
  bare router.back() calls remain. Safe today only because nothing deep-links into
  those screens — and FL-44 adds deep links.
  Blocked on. Which screens become deep-link targets, which follows from the
              widget and App Intents decisions.  → DQ-06
  Verdict. NEEDS-DECISION. Cheap to fix mechanically; the question is which 40.

OV-14 · E-50 is recomputed on every read, with no memo boundary       [overload]
  Home recomputes every balance on every render.
  Blocked on. Whether it is actually slow, which needs a device and real data.
  Verdict. NEEDS-DECISION. Do not optimise this before measuring it.

OV-15 · /personal is a stack route pretending to be a tab  [path-duplication]
  With splitting off, tab slot 2 PUSHES /personal, which can never render as
  focused and can be pushed repeatedly.
  Blocked on. Whether splitting-off is a supported configuration for the pilot at
              all, or just a persona artefact.  → DQ-01
  Verdict. NEEDS-DECISION.

OV-19 · category_budget.period AND .cadence                  [dead-alternative]
  Both stored; `period` is in the partial unique index key and `cadence` is not;
  lib/budget.ts reasons exclusively in cadence.
  Blocked on. Dropping `period` means rebuilding the table and both partial
              indexes, which is the same migration OV-07 wants. Do them together.
  Verdict. NEEDS-DECISION → sequence behind OV-07.

OV-23 · Dead and near-dead columns                           [dead-alternative]
  budget_group.limit_daily/monthly/yearly (never read) · default_currency (never
  read or written) · carry_over (written always 0, read by nothing) · txn.currency
  (written, no picker exists, setCurrency has no caller) · txn.tz (recorded, never
  displayed — SN-04.T4g is the bug that causes) · savings_txn kind='deposit'
  (unreachable since the pool was dropped) · pending_txn.author_person_id and
  payer_person_id (no writer) · audit_log.amount (one reader).
  Blocked on. Currency is not dead, it is PARKED — a multi-currency pilot would
              want it. Dropping columns is irreversible; leaving them costs bytes.
  Verdict. NEEDS-DECISION. The honest default is to leave them and keep this list.
```

### One layout question for you

`OV-16` is the only item in this register whose resolution is a matter of taste rather than
correctness, and per standing practice it is yours rather than mine. Three features
(`/afford`, `/plan/recurring`, `/insights`) are reachable only through unlabeled icons in one rail,
and the flag file itself records that this is why nobody found `/afford`.

The options are: label the rail (costs a row of vertical space on Plan), move one or two of them
into Settings as named rows (costs discoverability for the others), or leave it and accept that
these are power-user surfaces. I have not changed anything here.
---

## §11 · Open decisions

`Last verified: 2026-09-01 · Guarded by: docIdGraph.test.ts (IDs only)`

30 entries: **29 still open**, one closed and kept. Each names **the default if nobody ever
decides** — because most of these will not be decided, and the default is what actually ships.

A decided `DQ-` is struck through in place with the date and the answer, **never deleted**: the id
has to stay resolvable, or every citation of it rots. `DQ-07` is the first, and writing this section
is what found it — the pre-mortem table still describes it as "named, not solved" two hundred lines
above the entry recording that it was closed.

### Product and business

| ID | Question | Default if never decided | Trigger |
|---|---|---|---|
| `DQ-01` | **What is the monetisation shape?** No paywall, entitlement, IAP or SDK exists anywhere, and flags are preferences that must never be repurposed as gates. | Free forever, funded by nobody. | Real users, or a server bill that stops being trivial. |
| `DQ-02` | **"Safe to Spend" as a name.** Simple Bank registered it and enforced it (C&D to Monzo, 2015). Simple shut in 2021, so it may have lapsed — *that is an assumption, not a finding.* | Visible copy stays "yours to spend"; identifiers keep saying `safeToSpend`. | Any public listing, or a lawyer's five minutes. |
| `DQ-03` | **Aggregate use of spend data.** Raised, never decided. Would need opt-in, a rewritten privacy policy, and a story for demo rows. | Never done. Nothing leaves the device that is not listed in §1. | A monetisation decision (`DQ-01`). |
| `DQ-04` | **The non-engineering cost of running a server**: DPDP obligations, a privacy policy, hosting, uptime, on-call. | Absorbed personally, unpriced. | The first outage with a real user on it. |
| `DQ-05` | **India DPDP posture.** The moment one real user signs in, an email address is personal data on a server you operate. | Unaddressed. | The first non-you sign-in. |
| `DQ-06` | **Widget scope** — balance? today's spend? quick-add? Genuinely undecided. | No widget. | `DQ-80` (a paid Apple account) unblocking. |
| `DQ-07` | ~~**Rejecting a peer entry diverges the two devices silently.**~~ **Closed 2026-08.** A rejection now travels back to the author as an objection on the entry (`E-22`), and withdrawing it travels too — `pushSyncDispute` on push, `recordDispute` on pull, round-tripped in `peerApproval.test.ts`. The two devices still hold different rows; the difference is now **visible to both**, which was the actual defect. | — | — |
| `DQ-08` | **Email is the only identity**, unchangeable and unmergeable. A typo at sign-in creates a second account holding none of your backups. | The typo wins. | The first support message that starts "I can't find my backup". |

`DQ-08` has a cheap partial answer nobody has taken: **show the signed-in email wherever restore is
offered.** That does not solve identity; it turns a silent loss into a visible one.

### Technical

| ID | Question | Default | Trigger |
|---|---|---|---|
| `DQ-09` | **CRED's `mode` vs `tr`** was never isolated — it failed once with both added and both are off today, which closes the question by avoidance. Two attempts would settle it. | Both stay off. | An hour with a CRED account. |
| `DQ-10` | **Amazon Pay and WhatsApp were tested against the same `@kotak` handle** — an uncontrolled variable, and Kotak is not among WhatsApp's five PSP banks. | Recorded as "refused" on possibly-wrong evidence. | Retest against `@okhdfcbank` or `@ybl`. |
| `DQ-11` | **Android UPI is entirely untested.** `useUpiApps` returns null there, so the per-app payload table is *unreachable*, not merely dead. Needs a device pass, not a patch. | The whole feature silently does nothing on Android. | The Android port. |
| `DQ-12` | **Three red surfaces can stack on one Home open.** Thresholds deliberately not moved or de-duplicated. | Three at once. | Real users saying so. |
| `DQ-13` | **Transfer has no `DetailChips`** and writes `transferNote`, a different field from every other kind's `note`. Consolidating means deciding which fields a settlement legitimately has — a product question. | Two note fields. | `OV-02`'s collapse, which touches the same rows. |
| `DQ-14` | **Named accounts as entities** ("HDFC", "Paytm") with their own balances. Half-closed: three buckets shipped. Bank sync would need the rest. | Buckets forever; `INCOME_LANDING` stays a view over `PAY_METHOD`. | `DQ-83`, or the first "which account?" complaint. |
| `DQ-15` | **The sweep's source-asset round trip** is decided and only partly built — parked *behind* the per-method baselines pass, not beside it. | The sweep works; where the money came from is approximate. | Turning `auto_sweep_enabled` on for anyone. |
| `DQ-16` | **Global categories, undeletable once shared.** Phase GC made them global; whether a shared category can ever be deleted is unanswered, and `OV-06` (reference by name) is blocked behind it. | Categories stay deletable and references stay strings. | The first shared group where one person deletes a category the other is using. |
| `DQ-17` | **`help.tsx` is a third collapsible pattern.** Converting to `SectionCard` is a real visual change. | Three patterns. | Any Help rewrite. |
| `DQ-18` | **`TransactionRow` never displays pay method.** A density question, not a bug. | Not shown. | Real users asking "which card was that". |
| `DQ-19` | **`PRAGMA foreign_keys` is OFF** on the live connection. Every `REFERENCES` clause is documentation. Flipping it needs every delete path audited first — `deletePerson` already hand-rolls a ten-column check *because* of this. | Off. Referential integrity is a convention. | Any dangling-id bug in the wild. |
| `DQ-20` | **Voice auto-save has no off switch**, deliberately — "add one only if it misfires in practice". | No switch. | It misfiring. |
| `DQ-21` | **`DEV_TOOLS_ENABLED = true`** ships a load-demo-data / erase-everything screen in a release build. This is **deliberate for the pilot** so testers can reset the same build they were given, and `devToolsGate.test.ts` fails the suite while it is true unless `RELEASE_CHECKLIST` carries the matching unchecked blocker. | It stays true and the guard keeps complaining, which is the design. | App Store upload. Flip one constant. |
| `DQ-22` | **`VOICE_SHORTCUT_URL` is `null`**, so a flagged-on feature's one-tap install is dead and only the four-step manual setup works. This needs a *hosted file*, not a code change. | Manual setup only, for a feature most people will not find. | Hosting the `.shortcut`, or App Intents making the whole apparatus deletable. |
| `DQ-23` | **`expo-file-system` legacy API** — the suite proves nothing either way, because jest stubs it. Downgraded from a blocker, not closed. | Keep using it until it breaks. | An Expo upgrade that removes it. |

### Externally blocked — not ours to decide

| ID | Blocker | Owner | Consequence today |
|---|---|---|---|
| `DQ-80` | Paid Apple Developer account, $99/yr | Apple | Gates TestFlight, the friend pilot, push, App Intents and the widget. A free Apple ID covers the first four steps of `RELEASE §0`. Deferred 2026-09-01. |
| `DQ-81` | Google OAuth **CASA Tier-3** for `gmail.readonly` | Google | Blocks live email ingestion. A workaround exists: an OAuth client in Testing mode, ≤100 manual test users, behind a beta flag. |
| `DQ-82` | The GPay export format | Google | `FE-46` parses pasted text only. The parser spec is written against a real statement; on-device PDF extraction is the hard part. |
| `DQ-83` | An Account Aggregator partner integration | A partner | **Dropped for the pilot, not deferred.** No bank feed exists and none is planned for v1. |
| `DQ-84` | UPI hand-off refused by PhonePe, Paytm, Amazon Pay, WhatsApp | TPAPs / NPCI | **Closed on our side** — every payload lever was varied, HTTPS universal links are impossible (PhonePe serves 404 at its AASA path), and the aggregator `sign=` is minted by the payee's PSP. The route round is `FE-18`. Reopens only with merchant or TPAP registration. |
| `DQ-85` | R2 object storage | A Cloudflare dashboard opt-in that asks for a card | KV stands in, capping backups around 25 MiB. |
| `DQ-86` | Cloudflare Email Sending | Workers Paid $5/mo + an owned domain | Brevo's free tier stands in. |

---

## §12 · ID map — what this supersedes

`Last verified: 2026-09-01 · Guarded by: docIdGraph.test.ts, screenIdMap.test.ts`

### Supersession policy, in three sentences

`SYSTEM.md` is the live description of what the app is. `SCREENS.md` (formerly
`FEATURES_AND_FLOWS.md`) keeps per-screen layout, copy and state detail, and is the only other live
behaviour document. Everything in `docs/history/` is frozen evidence of a past state, is never
edited to stay green, and is cited only as the *origin* of an `OV-` or a `DQ-`.

### Screens: `S-xx` ↔ `SC-xx`

**They are the same numbers.** `S-19` is `SC-19`. Old citations resolve unchanged; the only reason
the prefix changed is that `S-` collides with too much else in prose.

Three routes had **no ID at all** and are new here:

| New | Route | Why it had none |
|---|---|---|
| `SC-42` | `/assets` | Shipped 2026-09-01. `FEATURES_AND_FLOWS.md` mentioned "assets" exactly once, in an unrelated `src/assets/pdfjs` path. It passed `docCoverage.test.ts` only because that test matches file paths loosely. |
| `SC-43` | `/settings/sync` | Never documented. |
| `SC-44` | `/settings/sync-log` | Never documented. |

Twelve routes had an `S-` id and **no state row** in the old §20: `/approvals`, `/assets`, `/auth`,
`/link`, `/budget`, `/person/[id]`, `/settings/{account,linked,storage,sync,sync-log,voice}`.

### Flows: `FLOW-xx` ↔ `FL-xx`

Same numbers for `FL-01`–`FL-11`. `FL-12`–`FL-54` are new — 43 flows that existed in the app and in
nobody's document.

### Frozen namespaces

| Namespace | Where it lives now | Rule |
|---|---|---|
| `F-01…F-34` (AUDIT §1 feature inventory) | `docs/history/AUDIT.md` | Superseded by `FE-`. Never extended. |
| `DEBT-01…16` (AUDIT §9) | `docs/history/AUDIT.md` | Triaged into `OV-`/`DQ-`/closed. Never extended. |
| `BL-01…33` (AUDIT §7 business logic) | `docs/history/AUDIT.md` | Superseded by `E-50…E-67` and `IV-`. |
| `ISS-`, `INT-` (AUDIT §8, §5) | `docs/history/AUDIT.md` | Frozen. |
| `V2-01…36` | `docs/history/V2_PRODUCT_REVIEW.md` | Frozen. `docIds.test.ts` already keeps every cited `V2-` resolvable — that test stays. |
| `DRIFT-01…26` | `docs/history/AUDIT_DOC_DRIFT.md` | Frozen. This document is what `DRIFT-21` asked for and never got. |
| `F1…F12` (the sync pre-mortem) | `RELEASE_CHECKLIST.md`, **renamed `SYNC-F1…F12`** | It genuinely collided with AUDIT's `F-01…F-34` in prose. One find-replace. Stays in the checklist, because it is an operational hold list; the live constraints it names are mirrored here as `IV-` and `DQ-`. |

### The triage

The one-time pass over the three frozen debt namespaces. Result only — the audits themselves are not
rewritten.

| Origin | Became |
|---|---|
| `DEBT-06` category detail reads the whole year | `OV-14`'s sibling — still true, still `NEEDS-DECISION` (measure first) |
| `DEBT-11` / `V2-21` `review.tsx` is too large | Closed. The ceiling in `sourceCounts.test.ts` forced three decompositions, 1029 → 620. What remains is `OV-24`. |
| `V2-07` budget rebalance missing | Closed — shipped as `FE-26` |
| `V2-13` Mistral OCR fallback | Closed — deliberately abandoned; the device provider solves it offline |
| `V2-14` flag count drift | Closed — `sourceCounts.test.ts`. **Generalised** to every other count by `countClaims.test.ts`, which found four more drifts on the day it was written. |
| `DRIFT-01` `src/lib` module count | Closed by `countClaims.test.ts` |
| `DRIFT-21` two feature inventories with no shared IDs | Closed by `FE-` |
| AUDIT §5 "no OAuth, no backend, no accounts" | **False since 2026-08-04.** Superseded by §1's egress table. |
| `ARCHITECTURE.md` §1 "sync does not exist" | **False.** `syncEngine.ts` is 769 lines and deployed. Superseded by `FE-54` and `E-88`. This contradiction is why this document exists. |

### What changed in the doc set

| Before — 10 live, 7,513 lines | After |
|---|---|
| `ARCHITECTURE.md` | **Deleted.** §1 → `SYSTEM §1`; §5 → `SYSTEM §2`/`§3`; stack, folders, boot and query layers → `AGENTS.md`. |
| `FEATURES_AND_FLOWS.md` | **→ `SCREENS.md`.** Flags → `FE-`, flows → `FL-`, validation → `IV-`, egress → `SYSTEM §1`. Component inventory deleted (the filesystem is the inventory); manual tests → `RELEASE_CHECKLIST §2`. |
| `RELEASE_CHECKLIST.md` | Stays. Decisions → `DQ-`, shape-debt → `OV-`. Hosts `SYNC-F1…F12`. |
| `AUDIT.md`, `AUDIT_DOC_DRIFT.md`, `V2_PRODUCT_REVIEW.md`, `COMPETITIVE_ANALYSIS.md`, `PERSONAL_REDESIGN.md`, `SYNC_CONTEXT.md` | **→ `docs/history/`**, each with a frozen banner naming its live successor. |
| `STORE_LISTING.md` | Untouched. |

Four live documents, one question each: **what it is** (`SYSTEM.md`) · **what each screen looks
like** (`SCREENS.md`) · **can we ship** (`RELEASE_CHECKLIST.md`) · **how we build** (`AGENTS.md`).

### The guards

Eight tests bind this document to the code. Six are new.

| Test | Holds |
|---|---|
| `countClaims.test.ts` | Every stated count of routes, tables, lib modules, query modules or hooks |
| `deadRouteRef.test.ts` | Every navigation target in code **and** every route named in a doc |
| `entityCoverage.test.ts` | Every `CREATE TABLE` has an `E-`, and every table-backed `E-` has a table |
| `screenIdMap.test.ts` | Route ↔ exactly one `SC-`, and every `SC-` has at least one entry point |
| `flagRegister.test.ts` | Every flag in `DEFAULTS` has an `FE-` |
| `entryPointCount.test.ts` | `/add/quick`'s entry count matches §8, and may not rise |
| `scenarioStatus.test.ts` | Every T3/T4 row carries one of the four markers, and every `✅` names a real test |
| `docIdGraph.test.ts` | Every `E-/AX-/IV-/FE-/SC-/FL-/SN-/OV-/DQ-` citation resolves to a definition — **and every `*.test.ts` a live doc names actually exists.** This document shipped naming six guard files that did not exist: the checks were real but lived together in one file, so it cited six paths you could not run. Nothing caught it because nothing was looking |

Plus the five that already existed and still apply: `docCoverage`, `sourceCounts`, `featureFlags`,
`docIds`, `devToolsGate`.

**What none of them do** is check that this prose is *true*. They check that it is *consistent with
the code's shape*. A section marked `Guarded by: nothing — read with suspicion` has neither.
