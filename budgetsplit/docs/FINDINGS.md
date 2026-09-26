# FINDINGS.md — why each tracker item is what it is

`Last verified: 2026-09-07 · Guarded by: trackerIntegrity.test.ts · countClaims.test.ts · docIdGraph.test.ts`

**The evidence behind every id in [`TRACKER.md`](./TRACKER.md).** That file says what is left and
where each item stands, in one row apiece. This one says *why*: what was counted, what it costs,
what breaks if you touch it, and the argument behind every verdict.

They are split because they answer different questions and get read at different moments. You open
the tracker to pick something; you open this once you have picked it. Keeping both in one file made
a 996-line document that was neither scannable nor readable.

**Section numbers match.** `TRACKER.md` §2 is this file's §2. Every id in one has an entry in the
other, and `trackerIntegrity.test.ts` fails if they disagree.

## §0 · How this file works

**Status** is not repeated here — it lives in `TRACKER.md`, once, so the two can never drift. What
you get here is the reasoning, which is what a status can never carry.

**Closed items stay.** This follows the precedent already set in `SYNC-MODEL.md` Part 5: *the
account is kept rather than deleted, because why they were wrong is the reasoning the rules rest
on.* A closed entry is how you find out why the current shape is the current shape, and deleting it
is how the same mistake gets made twice.

**Ids keep their prefixes.** `OV-` `DQ-` `W1-` `SYNC-F` are cited **138 times** across `SYSTEM.md`,
`SCREENS.md`, `AGENTS.md` and the source tree itself. Renumbering into one clean sequence would
break every one of those citations to gain nothing.

### Where all this came from

Findings used to live in **nine registers across five documents**, and they had started to disagree.
Four sync failures carried one status in one file and the opposite in another — and **the
disagreements pointed both ways**: three were fixed in code while one document still called them
open, and a fourth was ticked as done while the code showed it was not. Twenty-five decisions
existed in two copies. Every stated count was wrong. Eleven cross-references pointed at table rows
that had been deleted.

**A register nobody can trust is worse than no register**, and nine of them disagreeing is worse
still. Every status was re-derived from the source tree or from the most recent of the conflicting
documents — not copied.

### The three guards — why this should not go stale

Rot happens by hand-editing and being believed anyway. Each of these turns one class of it into a
failing test rather than something a reader has to notice:

1. **Every count is derived or guarded.** `countClaims.test.ts` checks each stated number against
   the entries beneath it. This is what would have caught all five wrong counts in the old
   registers — including the one that would have gone *vacuously green* on an empty parse, which is
   why that test now asserts it found something before it compares.
2. **Every cited id resolves.** `docIdGraph.test.ts` reads every live doc, not just `SYSTEM.md`, so
   a citation of an id that no longer exists fails the suite. The `MW-` namespace is what this is
   for: it labels the rows of the "who can change your numbers" table in `SYNC-MODEL.md` Part 4, the
   table was later trimmed, and **11 of its 26 citations went on pointing at rows that no longer
   existed** — while the other 15 resolved fine, which is exactly why nobody noticed. The dangling
   11 are gone; the working 15 stay, now guarded.
3. **No id is defined twice**, and the register agrees with the evidence.
   `trackerIntegrity.test.ts` allows an id exactly one entry here and exactly one row in
   `TRACKER.md`, and fails if either side has one the other does not. Every contradiction above came
   from the same id being maintained in two places, and drifting.

**What is in neither file.** `SYSTEM.md` keeps the entity dictionary, the flow catalog and the
invariants; `SCREENS.md` keeps the screen specs; `SYNC-MODEL.md` keeps the plain-language
explanation of what happens when someone else can change your numbers; `RELEASE_CHECKLIST.md` keeps
the device pass and the ship procedure; `AGENTS.md` keeps the standing rules. Those are reference.

---

## §1 · Ship blockers

Nothing ships until every one of these is closed. `DONE` rows are kept because several of them were
closed by discovering the claim was false, which is worth not rediscovering.

| | Blocker | Status |
|---|---|---|
| `B-01` | **Set `DEV_TOOLS_ENABLED` to `false`** (`src/constants/devTools.ts`) before the App Store upload. Deliberately `true` for the pilot so a tester build can be erased and re-seeded — which means the shipped app currently contains a screen that **deletes every transaction, group, person, budget and goal**, no backup, no undo, reachable by tapping the version 7× in Settings → About. One edit closes every entry point. `devToolsGate.test.ts` fails the suite if the line and the constant disagree, so it cannot drift — but the *decision* is yours. Also `DQ-21`. | `OPEN` |
| `B-02` | **Buy the Apple Developer Program** ($99/yr). Gate 0: TestFlight external testing, push, App Intents and the widget all sit behind it. Why `plugins/withoutPushEntitlement.js` exists. Also `DQ-80`. | `BLOCKED` |
| `B-03` | **Native rebuild** — `npx expo prebuild --clean && npx expo run:ios`. `expo-secure-store` is a new native module; the current binary crashes at launch without it (degraded gracefully in `src/lib/serverApi.ts`, but the feature needs the rebuild). Gates the entire device pass. | `OPEN` |
| `B-04` | **`EXPO_PUBLIC_API_URL` present wherever release builds run.** Without it there is no account UI at all. | `OPEN` |
| `B-05` | **`EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL` likewise** — otherwise Scan degrades **silently**. `EXPO_PUBLIC_*` bakes into the bundle at build time, so a clean checkout, a stale Metro cache or an EAS build without `.env` gets `undefined`. See `.env.example`. | `OPEN` |
| `B-06` | ~~**Confirm demo/seed data is off** in release builds.~~ **2026-09-25** — confirmed in code: first-run seeding never calls `seedDemo.ts`; demo data loads only from the dev storage screen (`app/storage.tsx`), whose every entry point is behind `DEV_TOOLS_ENABLED` (`B-01`, held by `devToolsGate.test.ts`). The CSV export's demo-row signatures still drift from `seedDemo.ts` by design. | `DONE` |
| `B-07` | **Rotate the Brevo API key.** It was pasted into a chat transcript and is a live credential for the deployed Worker. **Yours to do.** | `OPEN` |
| `B-08` | **Privacy policy + App Store listing.** Required even for external TestFlight, and sharper since `DQ-93`: the server now holds a readable copy of every signed-in account's finances, not only email addresses. The policy has to say so, say it is not end-to-end encrypted, and say what account deletion erases (`sync/erase.ts`). | `OPEN` |
| `B-09` | **India DPDP posture.** The moment one real user signs in, their email **and their whole ledger** are personal data on a server you operate (`DQ-93`). Being opt-in does not change this. What exists already: in-app account deletion that erases the account's own copy. What does not: a privacy notice, consent wording at sign-in, a grievance contact, and a stated retention period. Also `DQ-05`. | `DECIDE` |
| `B-10` | **App icon, splash, screenshots** — never audited. Needs a real asset pass. | `OPEN` |
| `B-11` | **`VOICE_SHORTCUT_URL` is `null`.** Every link shared so far carried a blank-condition `If`, so the shortcut could only reach its Otherwise branch. Until it is re-minted a pilot user cannot install voice capture at all: rebuild → import → **open in the Shortcuts editor and read the If row** → share → paste the constant. Also `DQ-22`. | `OPEN` |
| `B-12` | **Device-test Pass 4** (the persona/flag work). `src/lib/featureFlags.ts:47` alters the tab bar itself, and that has never rendered on a phone. | `OPEN` |
| `B-13` | **Paste the store copy into App Store Connect and confirm the privacy answers.** The draft was rewritten for server sync on 2026-09-25: **Financial info and User content are now collected and linked** once someone signs in (`DQ-93`) — the old "not collected" answer rested on sealed data and is no longer true. Receipt photos count as collected because they leave the device, and they are ON by default; an undeclared data type is a rejection. **Yours to do.** | `OPEN` |
| `B-14` | **Run §0a's no-enumeration diff.** It needs a real session, so it cannot be done without receiving a sign-in email. Procedure is in `RELEASE_CHECKLIST.md` §0a. **Yours to do.** | `OPEN` |
| `B-15` | ~~**`KDF_ITERATIONS`, and getting the cost off the drawing thread.**~~ 50,000 rounds, and `lib/pbkdf2.ts` unrolls the loop so it yields to the event loop rather than holding the thread for the whole derivation — backup and restore show a moving percentage instead of freezing. Output is byte-identical to `CryptoJS.PBKDF2`, asserted against CryptoJS itself rather than a fixture, because a one-byte difference would make every backup already written permanently unopenable. | `DONE` |
| `B-16` | ~~**Rehearse `category_global_v1` against a populated database.**~~ **2026-08-19** — the rehearsal exists as a test. `categoryGlobalMigration.test.ts` builds the *actual* pre-migration shape a real device has on disk and runs the real migration SQL against it via `node:sqlite`. Stronger than a one-off scratch-device run, because it re-runs on every commit. Pilot users install fresh, so this migration never executes against their data at all. | `DONE` |
| `B-17` | ~~**Push all 25 commits.**~~ **The claim was false.** `HEAD` is level with `origin` and both named branches are ancestors of it. The only unpushed commits are three merge commits on an unrelated `Test` branch. Verified with `git log --branches --not --remotes`. | `DONE` |
| `B-18` | ~~**No way to delete your account.**~~ **2026-08-31**, version `429c2230`. `DELETE /me` plus a Delete account row on the account screen — App Store Review 5.1.1(v) requires it *from inside the app*, so this was a rejection at submission. It destroys the email, name, phone, avatar, every session, every unused magic link, every device key and the `sync_wrap`s sealed to them, and every backup blob in R2. The `users` row survives, scrubbed: six tables reference it and those rows are **other people's records** — cascading would rewrite four ledgers because a fifth person closed their account. Four migrations were pending, not one. See `server/api/migrations/0010_account_deletion.sql`. | `DONE` |

**Order of operations.** Everything below `B-03` needs a **phone**, and none of it can be done from
a machine. Stop at the first thing that fails — each step assumes the one above it worked. The paid
Apple account (`B-02`) blocks **less than it looks**: a free Apple ID signs a build onto your own
phone for 7 days, which is everything the device pass needs. The paid account is only for handing it
to somebody else. **Test now, distribute later.**

---

## §2 · Complexity and overlap — `OV-`

This is the section for "we have created too many and unnecessarily complex flows". Each entry names
the duplication, counts it, prices the fix, and **commits to a verdict**.

**Kind** — `alias-sprawl` (N names, one concept) · `overload` (one name, N concepts) ·
`path-duplication` (N routes to one outcome) · `dead-alternative` (a second answer nobody uses) ·
`split-storage` (one concept, two stores) · `phantom` (a reference to something that is not there).

**Verdict** — one of six:

| Verdict | Means | Status |
|---|---|---|
| `COLLAPSE` | Do it. The cost is bounded and the confusion is active. | `OPEN` until done |
| `COLLAPSE-AFTER-PILOT` | Real, but the fix touches money or the wire. Needs a trigger, filled in. | `PARKED` |
| `RENAME-ONLY` | The concepts are fine; the vocabulary is not. Zero code risk. | `OPEN` until done |
| `KEEP-DOCUMENTED` | It looks like duplication and is not. Writing it down *is* the fix. | `DONE` on being written |
| `LABELLED` | The thing is right and unfindable. A caption closes it, not a refactor. | `DONE` on being labelled |
| `NEEDS-DECISION` | Cannot be resolved without answering a `DQ-`. | `DECIDE` |

`LABELLED` was used on `OV-16` before it was declared, which is how it came to be described in that
entry as *"not one of the five verdicts in the legend above"*. It is a sixth verdict, and it earns
its place: four features sat behind unlabeled icons, and the fix was a caption under each glyph
rather than any change to the features.

**`RENAME-ONLY`, `KEEP-DOCUMENTED` and `LABELLED` are wins, not deferrals.** They close an item at
zero code risk. Of the 34 below, **12 close that way** (8 + 3 + 1). That was the most useful thing
this section said when it held
27 entries: the app is not as over-built as it feels, it is *under-named*, and vocabulary is cheap to
fix. Walk 1 has since qualified it. All seven of its findings are structural rather than vocabulary,
and all seven are `COLLAPSE` — which is the second useful thing this section says. **Actually walking
the app finds different problems from reading it**, and the ones it finds are cheaper: not one of the
seven touches money, the wire, or a migration.

**34 entries: 15 `DONE`, 8 `OPEN`, 5 `PARKED`, 6 `DECIDE`.**

**By verdict:** 11 `COLLAPSE` · 5 `COLLAPSE-AFTER-PILOT` · 8 `RENAME-ONLY` · 3 `KEEP-DOCUMENTED` ·
1 `LABELLED` · 6 `NEEDS-DECISION`.

**Still open:** `OV-01` `OV-04` `OV-05` `OV-11` `OV-18` `OV-20` `OV-21` `OV-27`.
**Needs a decision from you:** `OV-06` `OV-10` `OV-14` `OV-15` `OV-19` `OV-23`.

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
  Verdict. COLLAPSE — **done 2026-09-06**. Both docstrings rewritten. The kept
           half is the REASON the pattern looked attractive (nesting a Modal in a
           transparentModal route goes black once the keyboard opens); what went is
           the instruction to use a pattern the app has no instance of. Note the
           line numbers here were stale by ~10 — SheetModal.tsx:30-31 and
           DraggableSheet.tsx:49-51, and SCREENS.md:169 cites _layout.tsx:108-111
           for options that live at :207-208.
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

### The seven Walk 1 found

`WALK-01.md` is the record of the cold sweep — a wiped app walked through first run and every
empty state on 2026-09-04. These seven came out of it. Six are things the walk hit directly; the
seventh (`OV-33`) came out of reading the asset register while writing up `OV-30`.

```
OV-28 · Autopay is both a chosen method and a detected fact            [overload]
  The N.   `PayMethod.Autopay` is offered in the pay-method picker
           (enums.ts:75) and means the same thing as `RECUR_MODE = 'auto'`
           (enums.ts:205), which sits on the same Add screen as the "When it's
           due" control. It even carries the `repeat` glyph (enums.ts:92).
  Evidence Nothing that reads money treats it as a method: cashQuery.ts:93 folds
           it into `bank`, and so does payMethodBucket (enums.ts:145). The
           onboarding pay step already leaves it out and says why
           (Onboarding.tsx:587). The Add screen's sheet does not.
  Cost.    Two controls on one screen claim the same fact, and the one reached
           first changes nothing. "Autopay" answers *how it was paid*, and a
           mandate is not a how — it is a schedule.
  Collapse Give the picker its own set the way onboarding already does
           (PAY_CHOICES, Onboarding.tsx:592) and leave Autopay out of it. It
           stays in the enum, in detection and in the cash fold, because it is
           the right answer for an imported row (payMethodDetect.ts:31,
           paytmParse.ts:145) where no rule exists to carry `recurMode`.
  Blast.   One array, plus a fallback for rows already carrying the value —
           which already render through PAY_METHOD_LABEL.
  Risk.    Low. Detection, storage and the cash fold are untouched.
  Verdict. COLLAPSE — **done 2026-09-04**. `PAY_METHOD_CHOOSABLE` is what a person
           may pick; `PAY_METHOD` stays what a row may store, so detection and the
           bank fold are unchanged. Held by payMethod.test.ts.
  Trigger. —

OV-29 · Onboarding asks how you pay twice, with different sets  [path-duplication]
  The N.   2 steps, one state. The `money` step renders PayMethodSelector over
           all 7 methods (Onboarding.tsx:312); the `pay` step asks again one
           screen later over 5 (:330-365). Both write the same `payMethod`.
  Evidence useOnboardingForm.ts:51 holds a single value, so whichever screen is
           touched second wins — and the second cannot express two of the
           first's answers.
  Cost.    A first-run user is asked one question twice, given a different menu
           each time, and then told on the second screen that the missing
           options are "still available on each transaction" (:363).
  Collapse Delete the section on the `money` step. The `pay` step is the one with
           the reasoned option set and the explanation.
  Blast.   Two lines and a SectionHeader on one step.
  Risk.    None. The state and its writer do not change.
  Verdict. COLLAPSE — **done 2026-09-04**. Note the sequencing: an earlier commit
           had already deleted the `pay` step's hand-rolled list in favour of the
           shared component, which left TWO IDENTICAL CALL SITES and a comment
           claiming "this is now the only version". Collapsing N implementations
           into one component does nothing about calling it twice, so the guard
           counts call sites, not implementations (onboardingConsistency.test.ts).
  Trigger. Now — it is among the first things a new user sees.

OV-30 · Add detects an investment and cannot record one                 [phantom]
  The N.   1 banner pointing at another screen. add/quick.tsx:203-212 offers
           /assets when category = 'Investments / SIP', because Add's own
           transfer path is person-to-person only (useAddTxnForm.ts:534-590)
           and never writes `asset_id`.
  Evidence The write it would need exists and is already correct: transferToAsset
           (assets.ts:206) writes the settlement row, the asset_id and the
           balance in one transaction. Only the entry point is missing.
  Cost.    The highest-fan-in screen in the app (24 entries, OV-08) recognises
           what you are doing and hands you elsewhere to finish it. Walk 1
           recorded this from the outside as "I lost Invest" — the concept is
           intact everywhere except where money is actually entered.
  Collapse A fourth Add pill, Invest, pre-scoped to the asset register and saving
           through transferToAsset. Storage does not change: `asset_id` already
           separates it from a debt settlement, which is the discriminator OV-02
           proposes to formalise.
  Blast.   UNDERSTATED HERE, and the correction is the lesson. This entry said
           "ADD_KIND and its labels, one branch in useAddTxnForm's save, and the
           banner". The real set was eight files, of which only TWO failed the
           build: the Record<AddKind,…> maps in VoiceEntrySheet and
           voiceShortcutFile. The six that compiled fine were switch statements
           with a default:, a === chain with a fallback, and `kind !== 'transfer'`
           gates whose meaning silently widened. Worst was the deep link —
           ?kind=invest fell through to Expense and opened the wrong form.
  Risk.    Low, and it does not wait on OV-02 — it is what makes OV-02 worth
           doing rather than a bookkeeping tidy-up.
  Verdict. COLLAPSE — **done 2026-09-05**. A fourth pill saving through
           transferToAsset, which gained a `date` parameter so the screen's date
           chip is honoured. The banner survives, repointed: it switches kind in
           place instead of pushing to /assets, so it keeps the amount you typed.
           Voice detection reaches the new kind (INVEST_HINTS, ordered after
           INCOME_HINTS so a dividend stays income). Held by addKind.test.ts,
           which asserts exhaustiveness where the compiler cannot — and forbids
           new `kind !== '<one kind>'` gates, the shape that widened silently.
  Trigger. Now. WALK-01 §2 has the three layers this separates.

OV-31 · Two designed empty states nothing can reach               [dead-alternative]
  The N.   2. reports.tsx:319-328 is guarded `summaries.length === 0`, never
           true: reportsData.ts:80-83 builds one summary per group and
           seed.ts:28-33 creates a Personal group on every device. review.tsx:414
           has two entry points and both require rows — import.tsx:176 replaces
           only after a successful parse, and Home's inbox badge is gated
           `reviewCount > 0` ((tabs)/index.tsx:170-177).
  Evidence Walk 1 hit the second one and recorded it as "it doesn't come if
           nothing to review". That is exactly right, and the state was built.
  Cost.    Two screens designed for their empty case show something else: Reports
           shows zero-value cards and a bare "No transactions this month" string
           (:395); Review shows nothing, because you cannot get in.
  Collapse Reports: guard on whether any group has activity, not on how many
           groups exist. Review: link it from Settings beside /import, which is
           the only place that currently offers one and not the other.
  Blast.   One condition, one settings row.
  Risk.    None.
  Verdict. COLLAPSE — **done 2026-09-04**. Reports now guards on
           monthSpent/monthEarned, the same figures its own hero renders;
           Settings carries a "Review inbox" row beside Import.
  Trigger. —

OV-32 · One empty state, four renderings                           [alias-sprawl]
  The N.   4. EmptyState.tsx is the component; Home hand-rolls its own hero and
           never imports it ((tabs)/index.tsx:253-260, including the accent
           TouchableOpacity AGENTS §5 forbids); ShareGroupRow:127-138
           re-implements the layout at space.lg rather than space.xxl; and
           settings/linked.tsx:346 is the only site that wraps it in a Card.
  Evidence It also renders at three heights, because it top-aligns and exposes no
           position prop: 48pt under Personal→Activity (personal.tsx:343,
           `paddingHorizontal`), 64pt under Personal→Budget (BudgetList.tsx:231,
           `padding`), and lower again on a filter miss, where FilterBar renders
           above it (personal.tsx:238). Every group tab uses `padding`, so
           personal.tsx:343 is the outlier.
  Cost.    Switching tabs moves the illustration. This was Walk 1's opening note
           and the only finding in it that is systemic rather than local.
  Collapse Let EmptyState own its anchor instead of inheriting one, then delete
           the three hand-rolls. AGENTS §2 specifies the anatomy and says nothing
           about where it sits, which is how they drifted.
  Blast.   One component, one style line, three call sites.
  Risk.    Low, but it changes what four screens look like. WALK-01 §4 has the
           options.
  Verdict. COLLAPSE — **done 2026-09-04**. The anchor is an opt-in `fill` prop at
           the eight sites that own their space, NOT a default: `flex: 1` against
           an auto-height parent resolves to zero, and ~30 call sites sit in a
           ScrollView content container or a ListEmptyComponent. The reported jump
           was one word — `paddingHorizontal` → `padding` in personal.tsx. Both
           hand-rolls absorbed (Home keeps its "₹0" via a new `art` slot);
           linked.tsx's Card unwrapped. Held by emptyState.test.ts, which fails on
           a 64pt IconCircle outside the component.
  Trigger. —

OV-33 · Restating an asset leaves no record, and two comments say it does [phantom]
  The N.   2 comments referring to a row that is never written. schema.ts:207-209
           says balance moves "only by transfers in/out and by the user restating
           it, both of which write a transaction row so the change is explainable
           afterwards"; assets.ts:117-118 says the same in different words. The
           function's own docblock (assets.ts:300-307) correctly says the
           opposite — "deliberately does NOT write a transaction… the one path
           that changes a balance without a row".
  Evidence restateAssetBalance is one UPDATE (assets.ts:317). The audit log has
           no asset entity at all — AuditEntityType is txn | group | member |
           budget | recurring | settlement (audit.ts, rendered at
           history.tsx:33-40). So a restatement is invisible in both places a
           user would look.
  Cost.    `asset.balance` is one overwritten number. There is no way to see what
           an asset was worth last month, to chart it, or to tell a market move
           from a typo — and net worth moves silently when it changes. The code
           is right and the comments are wrong, which is the failure mode this
           whole document exists to end, committed inside the source.
  Collapse Fix the two comments now: they cost nothing and mislead continuously,
           exactly as OV-25. Whether to keep a valuation history is a separate
           question and is DQ-27, not a rewrite of this entry.
  Blast.   Two comments.
  Risk.    None.
  Verdict. COLLAPSE — **done 2026-09-04**. Both now say a transfer writes a row
           and a restatement writes nothing, and schema.ts names DQ-27 as the
           open half rather than implying a history already exists.
  Trigger. — (DQ-27 still open for the history itself.)

OV-34 · Four filter surfaces, three implementations                [alias-sprawl]
  The N.   3 implementations over 4 surfaces. ui/FilterBar.tsx is the shared one
           and has exactly two consumers, personal.tsx:240 and the group ledger
           (TransactionsTab.tsx:78). search.tsx hand-rolls its own chip row
           (styles.chip / chipActive over TouchableOpacity) and does not import
           FilterBar at all. review/FilterForm.tsx is a third.
  Evidence AGENTS §9 says the pill shape is ui/Chip and is never hand-rolled;
           FilterBar hand-rolls its own chips too (FilterBar.tsx:89, :131), so
           the shared component is itself one of the variants that rule exists to
           remove. The capability sets differ as well: the group ledger filters
           on kind and free text only, in memory over already-loaded rows
           (TransactionsTab.tsx:35-42), while search adds `source` and folds tags
           into the haystack (search.tsx:45, :78).
  Cost.    The ledger you are most likely to need a filter in — a shared group
           with months of entries — has the weakest one, and no two of the four
           behave the same way. Reported in Walk 1 twice, on the group ledger and
           on SC-23.
  Collapse One FilterBar, built on ui/Chip, carrying the union of the fields that
           are already implemented somewhere: kind, source, free text, and the
           date range the group ledger has no way to express. Adopt it in SC-23
           and SC-19 rather than keeping their own.
  Blast.   One component rewritten on an existing primitive, plus three call
           sites. No query changes — all four filter in memory today.
  Risk.    Low. Behaviour is additive per surface; nothing loses a filter.
  Correction. Four hand-rolled chip implementations, not three — ui/FilterBar was
           itself one of them (its chips are at :68; :89 and :131 cited here were
           the search buttons). And two doc claims were backwards: SC-14 Personal
           offered group scope and NO text search at all, not "kind, free text";
           and date range was NOT absent everywhere — review/FilterForm already
           chained DatePickerSheet into TimePickerSheet, so the collapse adopted
           that rather than designing it.
  Verdict. COLLAPSE — **done 2026-09-05**. Two halves. The matching moved to
           lib/txnFilter.ts, so a word that finds a row on one ledger finds it on
           all three — Search's haystack was the widest and became the shared one
           (tags, and both spellings of the amount). The chips became ui/Chip
           everywhere, including inside FilterBar. Date range and person are on
           all three; person existed nowhere before, in an app about shared
           spending. Held by filterSurfaces.test.ts + txnFilter.test.ts.
  Left.    CategoryChip and ReviewRowCard still paint their own pills. Neither is
           a filter, and each has a visual argument (a filled selected state; a
           flex:1 row-internal pill), so both are allowlisted BY NAME with the
           reason rather than silently.
  Trigger. Now — SC-23 is a ledger and finding a row is its whole job.
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

OV-20 · Seven near-identical investment identifiers                [alias-sprawl]
  'Investments / SIP' (expense category) · 'Investment' (transfer category) ·
  asset.kind='investment' · MoneyProfile.investments (derived) ·
  MIGRATED_INVESTMENTS_NAME = 'Investments' · AddKind.Invest / 'Invest' ·
  moveToInvestments' hardcoded note 'Moved to investments'.
  Count.   Was five. P6 added the sixth — AddKind.Invest — and it is the ONLY one
           a user ever reads; the seventh is a literal that bypasses the constant.
           onboarding.ts writes name: 'Investments' rather than importing
           MIGRATED_INVESTMENTS_NAME, so that is an eighth uncontrolled copy.
  Sharper  The first two no longer merely LOOK alike. The Invest banner fires on
  now.     the expense category and its action switches to the kind that files
           under the transfer one — two opposite meanings, one tap apart.
  Verdict. RENAME-ONLY, and worth doing because these mean genuinely opposite
           things: one is money consumed, one is money moved. What P8 fixed is the
           PRESENTATION sprawl (four words for one movement, lib/settlementView.ts);
           the identifier sprawl is untouched and still open.

OV-22 · Six vocabularies over daily/weekly/monthly/yearly          [alias-sprawl]
  BUDGET_CADENCE · Period · BUDGET_PERIOD · TabKey+TARGET_FOR_TAB · RECUR_FREQ ·
  SAVINGS_FREQUENCY.
  Correction. "The two that are storage" undercounts. FOUR are: BUDGET_CADENCE
           (category_budget.cadence), RECUR_FREQ (txn.recur_freq), SAVINGS_FREQUENCY
           (savings_goal.frequency) and BUDGET_PERIOD (category_budget.period) each
           sit behind a CHECK constraint, so changing a VALUE is a migration, not a
           rename. Only Period (an alias of BudgetCadence) and TabKey/TARGET_FOR_TAB
           are free. There is also a settings key `default_cadence` holding a raw
           string.
  Verdict. RENAME-ONLY **for the prose and the two aliases only** — done 2026-09-06.
           They are genuinely different domains — a budget cadence and a recurrence
           frequency are not the same idea — so unifying the TYPES would be wrong.
           Unify the WORDS, and only where a word is not also a stored value.

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
  Verdict. RENAME-ONLY — **written down 2026-09-06**, in AGENTS.md as "a sheet for
           one field, a route for a form". Nothing renamed, nothing churned; the
           OwnBudgetSheet violation is named there and deliberately left, because
           the sheet edits ONE category's line from inside a list and the route
           edits every line at once. Meaning: write the rule down rather than churn the UI.
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
  Verdict. KEEP-DOCUMENTED — **the copy shipped 2026-09-06**. A second warning
           line on app/settings/backup.tsx names what does NOT come back: the ~30
           AsyncStorage preferences (features, reminders, default pay method,
           location). The SQLite `settings` TABLE is in BACKUP_TABLES and always
           was — the two stores share a name, which is most of why nobody noticed.

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
  Correction. The four are not equivalent, which is what made this look like a
           pure taste question. /insights has two more entries on SC-03 (Home) and
           /reports has a named Settings row; /afford has NO other entry, and
           /plan/recurring's only other one is a recovery link on SC-41's
           not-found state. So the rail was the discovery path for both — and
           onboarding's summary sends the user to one of them by name
           ("Recurring · Plan").
  Note.    LABELLED was not in the legend when this entry was written, and this
           entry stays filed under "only look like duplication" where it has
           always been — answering it decremented KEEP-DOCUMENTED, not
           NEEDS-DECISION, which an earlier edit got backwards. It is a declared
           verdict now; this line was itself labelled `Verdict.`, which made one
           entry carry two of them and the tally read six LABELLED where there is
           one.
  Verdict. LABELLED — **done 2026-09-04**. Caption under each glyph, not beside
           it: beside it, four labels plus a 28pt "Plan" overflow the row on a
           small phone. Costs ~16pt of header height once; no content moves, and
           no vertical band is spent above the Total Money hero.
```

### The six that need a decision first

```
OV-06 · Categories are referenced by NAME, not by id            [split-storage]
  txn.category and category_budget.category are strings. A rename is a migration;
  a delete orphans the string into Others.
  Blocked on. Whether categories become global-and-undeletable-once-shared, which
              is a product decision, not a schema one.  → DQ-16
  Verdict. NEEDS-DECISION.

OV-10 · backOr is used in 6 of 46 route files            [path-duplication]
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

**Answered, and the premise was wrong in a useful way.** The four were treated as equivalent; they
are not. `/insights` has two other entry points on `SC-03` (Home) and `/reports` has a named row in
Settings. **`/afford` is linked from nowhere else at all**, and **`/plan/recurring`'s only other
link is a recovery action on `SC-41`'s not-found state** — which appears when a rule is missing, so
it is a way back rather than a way in. `SYSTEM.md`'s own route table records that second entry
(`SC-32`, In = 2); an earlier version of this paragraph said "nowhere else in the app" for both and
contradicted it. Either way the rail was the discovery path, and onboarding's summary closes by
telling the user their salary now lives in "Recurring · Plan".

The rail is labelled in place: the caption sits **under** each glyph, not beside it, because beside
it four labels plus a 28pt "Plan" overflow the row on a small phone. It costs about 16pt of header
height once and moves no content — where the option I had been weighing, a chip row below the
header, would have cost a whole band above the Total Money hero. `Can I afford?` shortens to
`Afford` on screen and keeps the full question as its accessibility label.
---

---

## §3 · Open decisions — `DQ-`

**57 entries: 10 answered and kept, 38 still open, 2 answered and being built (`DQ-94`, `DQ-98`), 7 `BLOCKED` outside the codebase** (`DQ-80`–`DQ-86`,
in the **Blocked outside the codebase** table below). Each names **the default if nobody ever decides** — because most of these will
not be decided, and the default is what actually ships.

**Answered:** `DQ-07` (2026-08) · `DQ-26` (2026-09-05) · `DQ-28` and `DQ-31` (2026-09-04, both
verified against the source tree rather than a changelog — see §5's `SYNC-F13` and `SYNC-F14`) ·
`DQ-88` (2026-09-23) · `DQ-91` (2026-09-24) · `DQ-32`, `DQ-89` and `DQ-93` (2026-09-24, the sync
direction and what it settles) · `DQ-97` (2026-09-25, amended 2026-09-26) · `DQ-94` and `DQ-98` (2026-09-26, answered, being built).

`DQ-24` to `DQ-27` came out of Walk 1 (`WALK-01.md`) and share a shape worth naming: each is a
question the app currently answers by **omission**, and in every case the omission is invisible.
Nothing on screen says income was counted as spendable, that a person cannot be removed, that the
budget ignores an SIP, or that an asset's previous value is gone.

`DQ-28` to `DQ-33` come from `SYNC-MODEL.md` and share a different shape: each is a question about
**what someone else may do to my numbers**, and the default answer to all six is more permissive
than it reads. They are the reason that document exists, and each cites the section of it the
scenario falls out of.

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
| `DQ-26` | **ANSWERED 2026-09-05 — does investing belong in Budget, and as what?** A ₹10,000 monthly SIP was invisible to the plan. `IV-17` forbids folding it into a spend total, so the only question was *a separate line or nothing* — and "nothing" left the budget describing consumption while under-stating committed outflow. | **A named second line, never summed.** `budgetInvestedCaption` — *"plus ₹10,000 invested this month · kept, not spent"* — on the same terms and in the same style as the pooled-budget line directly above it. The figure is accumulated inside `getCategorySpendingDetail`'s existing loop, so it reads the same rows, window and approval filter as the spend figure beside it and the two cannot disagree. | Fired: `OV-30` landed 2026-09-05, which is what made the omission visible in one tap. |

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
| `DQ-28` | **ANSWERED 2026-09-04 — which peer entries must wait for me.** Anything claiming *I* paid, not just transfers. Only a transfer touching me was force-confirmed, so an expense asserting "you paid ₹4,000" from a trusted author applied on arrival and moved my cash. The answer is the one predicate the entry proposed: gate on whether a payment **names me as payer**, not on the entry's kind. Shipped as `IncomingEntry.assertsIPaid`, carried as its own field rather than by widening `touchesMe` — which legitimately means payer-*or*-sharer, so narrowing it would have gated my own share of a friend's dinner too. `trust.ts:50`, applied at `peerIngest.ts:264`. `SYNC-F13`. | — | Kept because the *shape* of the answer — a new field beside `touchesMe`, not a redefinition of it — is the reasoning the trust rules now rest on. |
| `DQ-29` | **Partial acceptance.** Approval is binary; there is no way to accept ₹3,000 of a claimed ₹5,000, which is the multi-payer case where a person has no move but reject. `SYNC-MODEL.md` §4.2. | Binary. The only route to a corrected figure is reject → objection → their edit. | The first shared bill nobody can agree on. |
| `DQ-30` | **A tracking-only group mode.** A group whose entries move balances and nothing else — no budget, no spending, no cash. It is the second axis that lets `IV-10` stay intact while still giving one switch that makes a whole group inert. `SYNC-MODEL.md` §4.3. | No such mode. Every shared group is live, and the only inert group is one nobody has been invited to. | Anyone wanting to keep score without it counting as their spending. |
| `DQ-31` | **ANSWERED 2026-09-04 — should a peer's deletion re-open an approval?** Yes. An *edit* could already re-open one; a *deletion* had no gate at all and moved my numbers back silently. Shipped as `txn_approval.pending_delete` — deliberately **not** `state='pending'`, which would have made the retraction take effect on arrival and so done the exact harm the gate exists to prevent. The entry keeps counting until I decide; approving applies the delete, refusing keeps the entry. A retraction of something *still waiting* still applies at once, because nothing of mine had moved. `peerIngest.ts:284`. `SYNC-F14`. | — | Kept because the near-miss is the lesson: the obvious implementation of this gate would have been a silent regression wearing the fix's name. |
| `DQ-32` | **ANSWERED 2026-09-24 — revocation and re-keying.** Answered by the sync direction (`DQ-93`), not by a key design: the server now holds readable data, so there is no group key to rotate, and removal becomes a server call that only an admin can make (`SPEC-SERVER.md` §5). A removed member's pull reports the group as `revoked` from then on. What they had already synced stays on their phone — the same honest limit `SYNC-F2` states for a shared number. Closes in code with `SYNC-F16` and `SYNC-F17`. | — | Kept because the old answer ("re-keying orphans every entry published under the old key") is why option A had to rotate forward; that reasoning is `SYNC-AUDIT-2026-09.md` §7.3. |
| `DQ-33` | **Ownership: handover, and the group with no admin.** There is no way to hand a group over, and a group adopted without a resolvable creator can never have its budget, membership, roles or name changed by anyone. The egalitarian group where nobody is admin is reachable today only by accident, and in that state nothing can be administered rather than everyone being equal. `SYNC-MODEL.md` §4.6,,, `SYNC-F20`. | Neither exists. Every group has a permanent, un-removable, un-demotable owner — or none at all, permanently. | The first group whose creator stops using the app. |
| `DQ-24` | **Income that lands in an asset is not spendable.** A reinvested dividend or interest capitalised into an FD raises net worth without raising what you can spend, and `lib/safeToSpend.ts` cannot tell either from salary. Entangled with `DQ-14`: the landing bucket is `INCOME_LANDING`, a view over `PAY_METHOD`, so there is no account for it to land *in*. Walk 1 asked for it as an "expendable income" tag. | Every rupee of income counts as spendable. Safe-to-Spend overstates for anyone with a reinvestment flow, quietly and by exactly the reinvested amount. | The first user with an SIP or dividend flow, or `DQ-14` closing. |
| `DQ-25` | **A person can never be removed, and cannot be archived either.** `deletePerson` refuses on any reference across ten columns *including bare `group_member`* (`persons.ts:102-116`), so someone added to a group and never involved in an expense is permanent. `person` has no `is_archived` — unlike `budget_group` — and `mergePerson` is reachable only from the sync duplicate prompt. Settling in full changes nothing: the check is referential, never net. | The roster only grows. "Take them out of a group instead" stays the only answer, and it does not remove them from People. | A roster somebody finds unusable, or the first person asking why a settled friend cannot be filed away. |
| `DQ-27` | **Should an asset keep a valuation history?** `restateAssetBalance` overwrites one number (`assets.ts:317`) and the audit log has no asset entity, so there is no way to see what something was worth last month, chart it, or tell a market move from a typo — while net worth moves each time. `OV-33` is only the wrong comments; this is the feature. | One current value per asset. Net worth is a snapshot with no past, and a mistyped restatement is indistinguishable from a real gain. | Any asset chart, any net-worth-over-time surface, or the first mistyped restatement. |
| `DQ-87` | **Does invest-mode Add still record as a transfer to an asset, or count as spending?** `SPEC-2026-09-FEEDBACK.md` §4 removes the standalone Invest pill from the switcher; picking the Investment category from Expense switches into the same invest-entry state in place. The question is whether that entry keeps `settlementView`'s asset-transfer treatment (net worth flat, excluded from analysis, `AGENTS.md` §12) or becomes a real expense now that it is reached from the Expense tab. | Transfer to an asset — net worth stays flat, excluded from spend analysis, unchanged from today's Invest pill. | Reopens only if a user reports an SIP/gold/FD entry showing as spending, or if `moveToInvestments.test.ts` needs a different shape. |
| `DQ-88` | **ANSWERED 2026-09-23 — onboarding take-home presets, which figures?** No presets at all. A wider preset grid (₹25k/40k/60k/80k/1L/1.5L/2L) was built — reordered ahead of the typed field per `SPEC-2026-09-FEEDBACK.md` §2 O3 — and cut on review before it shipped: a single free-text amount, as it was before this pass, stayed the step. `Onboarding.tsx`'s income step is back to one `StepAmountField` and nothing else; `lib/onboarding.ts` carries no preset list. | — | Kept because the near-miss is the lesson: "selectable money tabs/options" in the original feedback did not mean *more, bigger presets in front of typing* — it's why O3's acceptance criteria are gone from `SPEC-2026-09-FEEDBACK.md` rather than struck through. |
| `DQ-89` | **ANSWERED 2026-09-24 — does "I have an account" restore server data?** Yes, and all of it. With the server holding everything (`DQ-93`), signing in on a fresh phone restores the whole ledger and skips onboarding. A phone that already holds data is asked, never silently overwritten (`SPEC-SERVER.md` §4, `DQ-94`). Until that lands, the shipped behaviour is unchanged: sign in, then onboarding as new. | — | Kept because the interim answer ("no") was the right call only while the sync shape was undecided. |
| `DQ-90` | **Does the Upcoming screen (was Reminders) keep the bell icon?** `SPEC-2026-09-FEEDBACK.md` §6 renames `/reminders` to `/upcoming` and retitles it; the Home header icon that opens it was never re-examined against the new name. | Yes — the bell stays, relabelled. A bell reads as "things needing attention," which upcoming charges are, and swapping it risks a second inconsistency while fixing the first. | A user reporting the bell no longer matches what it opens. |
| `DQ-91` | **ANSWERED 2026-09-24 — should T11, the Invest pill leaving the Add switcher, proceed at all?** `add-kinds` was never in the original 15-point feedback (`SPEC-2026-09-FEEDBACK.md` §4) — it entered the plan when the capability map was written, and the only piece the user had confirmed was the money-math question, `DQ-87`. First answer was "will discuss" (a start on `enums.ts` was reverted rather than left half-built); minutes later, unprompted: **"Lets Remove Invest it or so I belive I dont want to add Unssessary COmplexity to user or so 3 States are Fine… for v1 atleast."** Shipped as planned: `ADD_KIND_TABS` (3: Expense/Transfer/Income) drives the switcher; `ADD_KIND` (4, unchanged) still validates a deep link, a voice parse, a stored draft. The "Switch to Invest" Banner stayed tap-to-confirm rather than becoming automatic — `useAddTxnForm.ts`'s `onTitleChange` re-matches the category on every keystroke, so an instant switch on a category match would flip the whole screen mid-sentence, before the user finished typing. | — | "For v1 at least" — a fourth pill returns if the pilot shows people reaching for it another way. |
| `DQ-92` | **Home's "Coming up" list is gone — a badge count only — but nothing else was told.** Found while renaming `/reminders` → `/upcoming` (`SPEC-2026-09-FEEDBACK.md` §6, T16): `homeData.ts` still computes the full list (`buildUpcoming(…, limit=99, within=14, …)`), but `app/(tabs)/index.tsx` only reads `.length` for the bell's badge — no card, no rows, anywhere on Home. Meanwhile `RELEASE_CHECKLIST.md` S-03 still asks a tester to verify "'Coming up' shows the near-due rules," `seedDemo.ts`'s own comment says it seeds rules "so Home 'Coming up' + Plan 'Upcoming' populate," and a SYSTEM.md scenario listed it as one of "three renderings of overlapping recurring data" to compare — none of which is true today. Whether this was a deliberate simplification or a silent regression is not known from the code alone. | Leave it removed. The three live docs above are corrected to say so, plainly, rather than continuing to describe a card that isn't there — but the `homeData.ts` computation stays (cheap, and `upcoming.length` still needs it for the badge). | The user deciding they want the card back, at which point it's a `ComingUpList` on Home reusing data already computed — not a new query. |
| `DQ-93` | **ANSWERED 2026-09-24 — which sync direction?** Server-readable (option B of `SYNC-AUDIT-2026-09.md` §7), chosen over hardening the zero-knowledge engine. The user's words: *"for now let's keep privacy aside and have a real working application like a real world web app."* Four answers shaped it: **everything** lives on the server (not only shared groups); the phone stays **offline-first**; the **trust and approval model is kept**; **iOS only**, with an API a browser client could use later. A later ask added: proper, clearly named server entities (`users`, `groups`, `transactions`, `assets`…) and relations, stricter than the local schema. Spec: `SPEC-SERVER.md`. | — | Kept because it reverses a promise made in writing (`SYNC-MODEL.md` Part 7: *"the server cannot read my money"*). Everything that repeats that promise is rewritten in `SPEC-SERVER.md` §7, and `DQ-05`/`B-09` stop being hypothetical. |
| `DQ-94` | **ANSWERED 2026-09-26 — merge two ledgers at first sign-in?** Yes. A phone with data signing into an account that already has data now gets a third choice, **Merge into my account**, beside "Use my account" and "Not now". The rule is the user's: everything on the phone is added to the account **as new, even if it looks identical** — no name matching, no dedupe — except the three things an account has exactly one of, or that are provably the same: "me" (already `user:<account>` after `linkLedger`), the Personal group (the server allows one per owner, `ux_groups_one_personal`, so the phone's folds into the account's; a clashing budget line keeps the account's), and **people with the same email**. Anything else that is really one person is combined by hand later ("Same person as…"). Built as: pull the account in first, fold, then queue only rows the account has no version of (`db/queries/mergeLedger.ts`). Offered only when the phone is not joined to a *different* account, whose group ids would collide. **Duplicates (decided the same day):** everything is still added, then the phone expenses that match an account expense by the app's existing duplicate rule (`findRecentDuplicate` — same group, category, amount, ±24 h) are listed once, side by side, with *Keep both* / *Remove this phone's copy* — never skipped silently, because two identical ₹40 chais on one day are real. | Building. Until it ships: "Use my account" (phone exported to a file first) or "Not now". | Revisit if duplicated history (the same expense on both sides) turns out to be common — that is the cost of "add as new".  |
| `DQ-95` | **Workers Paid before the pilot?** Since 2026-09-01, D1 Free hard-stops at 100,000 rows written/day and index writes count too (Cloudflare D1 pricing docs). A months-old ledger is about 20 row writes per transaction to upload, so two or three first sign-ins on one day could stop sync for everyone until 00:00 UTC. | Free while developing; Paid ($5/mo) before the first non-you sign-in. | The first real user, or the first `D1 limit` error in the Worker log. |
| `DQ-96` | **May a group member edit someone else's transaction?** Splitwise works like a wiki: anyone involved may edit or delete. This app has always said no (`AGENTS.md` §13, `MW-23`) — approve or reject is how you answer someone else's entry. | No. The server enforces author-only edits (`SPEC-SERVER.md` §3.2). | A pilot group asking to fix each other's typos. |
| `DQ-97` | **ANSWERED 2026-09-25, amended 2026-09-26 — what does signing out do to this phone's data?** Built as described (sync first, then empty the phone). **Amended by the user:** signing out no longer clears preferences or sends the person back through onboarding — *"after clearing the data, we do not need to reset onboarding"*; signing back in restores the ledger (`hooks/useSignOut.ts`). Original question: Today it leaves the whole ledger in place (*"Your data stays on this device"*, `settings/account.tsx`) — right while the server held only encrypted backups, wrong once it holds everything (`DQ-93`). A signed-out phone would keep a full copy nobody syncs, and the next account to sign in meets it as the "Ask" case (`DQ-94`). Raised by the user 2026-09-25: *"if someone logs out then all data should be in sync, otherwise a warning that sync is in progress; the app should be empty … whenever someone logs in again the whole app is back to its state."* | **Sync first, then empty the phone.** Sign-out runs one sync; with nothing left unsent it wipes the ledger and returns to Welcome, where *I have an account* restores it (`SPEC-SERVER.md` §4.1). Anything unsent → a warning naming the count, with **Cancel** or **Sign out anyway**, which writes an export file first. A phone never linked to the account (first sign-in unresolved) is signed out **without** a wipe — its data exists nowhere else. | Built as `S14b`; revisit if pilot users sign out expecting their data to stay. |
| `DQ-98` | **ANSWERED 2026-09-26 — how is the UPI app chosen when paying?** Before: iOS drew a plain system text list (`ActionSheetIOS`, `useUpiHandoff.ts`), Android handed `upi://pay` to the OS chooser, so the same moment looked different on each platform and neither showed which app you were about to open. The user's call, from three drawn options: **one button with the last-used app's logo — "Pay ₹450 with Google Pay" — and "Change app" under it, opening a logo grid of installed apps**; choosing one pays and becomes the new default. Decided with it (engineering): real brand logos bundled per `UpiAppSpec`, the same picker on both platforms (Android targets the package, generic `upi://` kept as "Other UPI app"), `blocked` apps kept in the grid with their "opens the scanner" subtitle rather than dropped. Covers Scan & pay, Request QR and Settle-up pay. The UPI invariants in `AGENTS.md` (no P2P collect, never trust a QR's `pn`) are untouched. | Building. Until then: the text list on iOS, the OS chooser on Android. | Revisit if a store review objects to bundled brand logos. |
| `DQ-99` | **Where do Recurring and Upcoming live?** Raised by the user 2026-09-26: *"notification opens upcoming … recurring doing at top in plans but should be in person I believe."* Today Recurring is a captioned icon in Plan's header rail (`OV-16`) and the Home bell opens `/upcoming` (`DQ-90`). The user's instinct is that a recurring charge belongs with the person or group it is with. Not yet scoped: whether that means *moving* Recurring off Plan, adding a per-person "recurring with them" section, or both; and what was wrong at the bottom of Plan. | Stays as it is: Recurring on Plan, the bell opens Upcoming. | The user picking a layout — to be drawn as options, per the screen workflow. |
| `DQ-100` | **What should "Can I afford?" answer?** Raised by the user 2026-09-26: *"Afford UI/UX is bullshit, also logic."* The engine (`lib/afford.ts`) is sound on the one hard rule — Safe-to-Spend minus the price below zero is "No" — but three things make its answer useless: **(1) the cushion can make "Comfortable" impossible.** `bufferTarget` is 15% of *total cash* but is compared against what is left *after* commitments: ₹1,00,000 cash with ₹90,000 committed gives Safe-to-Spend ₹10,000 against a ₹15,000 cushion, so even a ₹0 purchase reads "Tight". **(2) Six independent tripwires, any one enough** (cushion, category budget/norm, >10% of monthly income, month forecast over, goal delay ≥ half a month, 3× a usual basket) — so nearly every real purchase is "Tight", and a verdict that is almost always the same answers nothing; the income-share test alone makes a ₹12k phone "Tight" on a ₹1L salary with lakhs in the bank. **(3) `MonthAlreadyOver` says the month was over *before* this purchase** but fires when this purchase is what tips it over. The numbers people want — what would be left, which goal slips and by how long, when it becomes affordable — are all computed and then collapsed into one word plus a reason list. | Today's engine and screen, unchanged. | The user choosing a direction; proposed: lead with the one number left to spend, at most two trade-offs in words, cushion as a share of Safe-to-Spend, drop the income-share tripwire. Layout drawn as options first. |
| `DQ-101` | **Settings has too many rows.** Raised by the user 2026-09-26: *"Settings have too many options, like sync and sign-up can be one."* The Settings tab (`app/(tabs)/settings.tsx`) carries ~27 rows in 8 sections (Account, Getting paid, Manage, Preferences, Security, Notifications, Data & Help, About), and three of them overlap: **Account**, **Sync** and **Backup & restore** are separate rows, and Backup is reachable from both Settings and the Account screen. Also: Currency is a row that cannot be tapped (INR only), Import and Review inbox are two rows for one pipeline, Reports & export and Export all data are two rows for exporting, and Replay welcome tour is a developer affordance. | Stays as it is. | The user picking a consolidated layout; proposed: one **Account & sync** row (sign-in, status, linked people, invites, sign out, delete), one **Data** row (import + review, export, backup file), drop Currency until there is a second one. Drawn as options first. |
| `DQ-102` | **The app explains too much.** Raised by the user 2026-09-26: *"app is too verbose — unnecessary explanation."* Many screens carry paragraph footnotes and "what this does" blocks (e.g. `settings/sync.tsx`'s explainer, `settings/account.tsx`'s notes, the first-sign-in step's two-sentence body). | Stays as it is. | Proposed rule for `AGENTS.md`: at most one short line of supporting copy under any control; no explainer paragraphs on a screen; anything longer lives in Help. Applied as one copy pass, screen by screen, after `DQ-101`. |
| `DQ-103` | **Safe-to-Spend feels vague.** Raised by the user 2026-09-26: *"Safe to spend also little vague, needs to add credibility."* A breakdown already exists — tapping the hero opens `StsSheet` (`components/finance/home/StsSheet.tsx`): cash available, minus bills still due, card to repay, goal contributions, what you owe, everyday spending. What it lacks is **checkability**: no line opens the rows behind it (which bills? which card spend? owed to whom?), and the top line, *Cash available*, rests on an opening balance typed once in onboarding and never reconciled — if that is stale, every line below is exact arithmetic on a wrong start. The "everyday spending" estimate already shows its rate and day count for exactly this reason; the other lines never got the same treatment. | The sheet as it is. | Proposed: every line taps through to its rows; a "Cash last confirmed <date>" line with a one-tap *Update*; say plainly when the estimate is thin (little history). Also feeds `DQ-100` — Afford leads with the same number, so its credibility is Afford's too. |

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

---

## §4 · Walk 1 — `W1-`

The cold sweep: an unpopulated app, opened as a first-time user, every screen. **38 ids were
assigned**, running `W1-01` to `W1-37` plus `W1-39` — the number W1-38 was never used, recorded here
so nobody goes hunting for it. The nineteenth finding split into two leaves, `W1-19a` (a message
that was simply false) and `W1-19b` (a policy), giving **39 leaves: 22 `DONE`, 7 `OPEN`,
10 `PARKED`.**

Statuses here are re-derived from the walk's own phase plan, which was the most current source. The
walk's `✅` is deliberately not carried over: it meant *"traced"* in one section and *"fixed"* in
another, with no legend, and five ids were marked fixed in one place while sitting in the
remaining-work list of the next.

**What the walk could not do.** It found no wrong figures — and it could not have. **Nothing in it
exercised a write path.** Sweep 2 is demo data, sweep 3 is hands-on, and only the third can test
that the money is right.

### Open

| | Finding | Status |
|---|---|---|
| `W1-06` | More pay methods, and better icons for them. Layout. | `OPEN` |
| `W1-17` | Reports groups are not collapsible (`SC-21`). | `OPEN` |
| `W1-18` | Member and group-edit rows read as undesigned (`SC-09`, `SC-11`, `SC-13`). | `OPEN` |
| `W1-28` | *"Component placement comes and goes in a line/section and sizes change — feels broken."* The general form of `W1-05` and the empty-state anchor: **things that appear conditionally must not move what is already on screen.** Worth one rule rather than N fixes. | `OPEN` |
| `W1-29` | *"Transfer and Income have a bottom line, others don't."* **No divider asymmetry exists in source** — `formBlock` is margin-only and `AmountField`'s underline is on every kind. Needs a device look to locate. | `OPEN` |
| `W1-31` | Tags are already saved for reuse and ranked by frequency, derived from your own rows. The real delta is **per-category** ranking. | `OPEN` |
| `W1-32` | The category chip is a `grow` chip with a chevron and may be clipped on the right. Cosmetic, needs a device look. | `OPEN` |

### Parked, with the trigger

| | Finding | Un-parks when |
|---|---|---|
| `W1-02` | Features should adapt to the intent picked at onboarding. Partly true already; the rest is an ask. | The persona → flag-defaults pass. |
| `W1-11` | A light "additional income" entry. | Weighed against `OV-08` — `/add/quick` already has 11 params and 24 entry points. |
| `W1-16` | `SC-16` could suggest a top 3 before any spend exists. | Taste, cheap, no urgency. |
| `W1-19b` | **The policy:** whether a settled person can be removed at all. | `DQ-25`. |
| `W1-24` | *"How is really: through which asset, so we can reduce from it."* This is `DQ-14` restated from the outside, and **it is the better framing** — pay method is a label; an account is a thing with a balance. | `DQ-14`. |
| `W1-30` | The calculator feels too complex — four operators, a custom keypad, a running total, a remainder warning; no `AC`, no `%`. **Worth asking what to cut before cutting**: the divide-by-N case is the one that earns it. | You answer what to cut. |
| `W1-34` | Settings option grouping and clarity (`SC-06`). | Taste, cheap, no urgency. |
| `W1-35` | Line-item editing could be cleaner (`SC-08`). | Taste, cheap, no urgency. |
| `W1-36` | Colours, view and position on `SC-18`. | Taste, cheap, no urgency. |
| `W1-37` | `SC-42` needs a clearer outline. | Taste, cheap, no urgency. |

### Done

| | Finding | Closed by |
|---|---|---|
| `W1-01` | Hero text preceded the animation — delays of 1400/1550/1700 against a mark that forms at **3250 ms**. | One `HERO_REVEAL_MS`, derived from `LogoAssembly`'s own constants and guarded, so it cannot drift from the animation again. |
| `W1-03` | The name field sat under the keyboard: the footer was outside the scroll view, so the keyboard covered the field *and* the CTA. | `KeyboardStickyView` + a measured `bottomOffset`. The page still never resizes. |
| `W1-04` | Payday should be a date, not chips. | All 31 days, as `ui/DayOfMonthGrid`. Revealed only once an income is given — the help line promised a salary entry that is only written for `incomeNum > 0`. |
| `W1-05` | The money step's footer read as cut off. | Horizontal selector, 16pt to the footer, no trailing line. |
| `W1-07` | Budget presets should be blank without an income. | Blank now — and deduped: rounding had collapsed 50/60/70% into three identical chips on duplicate keys at low incomes. |
| `W1-08` | The people step should not create groups; it should collect name + email. | Group creation deleted (it bypassed `GroupForm`); the step collects name + optional email, and `person.email` finally has a writer. |
| `W1-09` | Asked to create a group after skipping the people step. | The prompt is keyed on `flags.splitting` **and** `onboarding_skipped_people` **and** a live group count. Skip only records "no thanks" when nothing was added — once there are people it means "done here", and recording that as a refusal was the opposite of what they did. |
| `W1-10` | Onboarding income never became a recurring transaction. | Not a plumbing gap — the rule *was* created and listed. It was invisible because its destination was an unlabelled glyph. Fixed as `OV-16`. |
| `W1-12` | The forecast section vanished with no explanation (`SC-22`). | **2026-09-06.** A `SectionCard` placeholder saying a projection this early would swing on one purchase. Not un-gated — the honest answer is that there is not enough data yet, and saying so beats an empty space. |
| `W1-13` | The amber sample note had no zero guard. | `SampleNote` returns null at zero, guarded **in the component**, so every caller gets it. |
| `W1-14` | `/approvals` empty state had no CTA. | It now sends you to who you trust, which is what the screen is about. |
| `W1-15` | `SC-38` was the only empty state wrapped in a `Card`. | Unwrapped. |
| `W1-19a` | **The message:** *"cannot remove a settled person"* is simply false when the only reference is group membership. | `deletePerson` returns `via: 'account' \| 'history' \| 'group'` and `lib/personCopy.ts` says something true for each. The group case deliberately offers no escape, because none exists. |
| `W1-20` | *"Every Month doesn't turn off once opened."* An effect with `enabled` in its dependency list and no guard, so switching off **while the sheet was open** turned it straight back on — and the sheet's own comment claimed the switch was the way back off. | A `useRef` latch arms the sheet once per open. |
| `W1-21` | The direction control had no guard: one tap on an untouched Transfer form swapped an empty id with yours, both slots resolved to you, and the form showed *"From and To must be different people"* — **an error the user could not have caused.** | It refuses until both people are chosen, and says so to a screen reader rather than offering an action that does nothing. |
| `W1-22` | Quick Add never read safe-area insets; its scroll container ended 16pt from the physical edge on a `fullScreenModal`. This regressed the codebase's own rule — `useContentInset` names *"in Quick Add"* as one of the guessed values it exists to replace. | Adopted `useContentInset()`. |
| `W1-23` | Picking a day called `onChange` and then closed — correct for a one-shot picker, wrong when you are scanning months. | Stays open while scanning. |
| `W1-25` | Date and time should be one control, with a year selector. Time **was** already captured with its own chip and sheet; reaching a date a year back took twelve taps. | Merged, with a year selector. |
| `W1-26` | Repeat should be last of the three in "How & when". | Moved — the header had claimed that order all along. |
| `W1-27` | *"'How was it paid' could be vertical rather than a horizontal scroll."* | Same component the onboarding money step uses, so fixing it once fixed both notes — and closed `W1-05` with it. |
| `W1-33` | *"Opening Notes/Tags/Split isn't fast enough."* Not a slow animation: opening a sheet dismisses the keyboard, the modal presents, then the sheet's field autofocuses while the sheet is still mid-spring — **two uncoordinated keyboard transitions.** | Focus after the animation rather than at mount. |
| `W1-39` | `SC-03`, `SC-15`, `SC-17`, `SC-26a`, `SC-28`, `SC-32`, `SC-33`, `SC-41` — fine, or correctly have no empty state. | Recorded so they are not re-swept. `SC-35` was not reached. |

---

## §5 · Sync — `SYNC-F`

**24 failures: 23 `DONE`, 1 `OPEN`.**

Two different exercises produced these, and the difference matters. `F1`–`F12` were written *while
designing*, so they are mostly **constraints that were designed against and held** — a `DONE` there
means the wall exists, not that a bug was fixed. `F13`–`F24` came from reading the **built code**
against the question *"what am I exposed to if I trust someone?"*, and four of those were live
defects that moved numbers or lost data.

> **Four statuses here were wrong in both source documents, in opposite directions**, which is the
> single strongest argument for this file existing. `F19`, `F21` and `F23` were marked open in
> `SYNC-MODEL.md` and are genuinely **fixed in code**; `F22` was marked ✅ in `RELEASE_CHECKLIST.md`
> and is genuinely **still open**. Every status below was re-verified against the source tree, not
> copied from either file.

### Open

| | Failure | The wall that stops it |
|---|---|---|
| `SYNC-F8` | **Email is the only identity and cannot be changed or merged** — a typo at sign-in is a second account with none of your backups. | A change-email flow. **At minimum, show the signed-in email wherever a restore is offered** — cheap, and pilot-relevant. |

### Done

| | Failure | How it is stopped |
|---|---|---|
| `SYNC-F1` | Invite links are made to be forwarded — first stranger to tap gets linked, and gets your number. | **Sender approves the claim.** Tapping creates a pending request; nothing binds until approval. |
| `SYNC-F2` | "Stop sharing my number" cannot take it back — it is already on their device. | Worded as a **disclosure** ("Shared with Rohan on 12 Aug"), never a revocable permission. |
| `SYNC-F3` | Document-level last-write-wins silently discards a co-editor's edit, and the shares-sum-to-payments invariant still passes. | Compare-and-set on `txn.sync_version`; `PUT /sync/entries` refuses a stale push with 409 and the current row attached. **Never silent LWW on money — and never an auto-merge either.** |
| `SYNC-F4` | `attachment_uri` is a `file://` path from another device — "receipt attached" over nothing. | Rows sync, photos never do; the receiving device nulls the URI. |
| `SYNC-F5` | `seed.ts` wrote `is_me = 1` with a fresh `uuid()` per install — one account could get two "me" rows, and **every my-share figure would silently read one of them.** | The local `is_me` row is bound to `person.remote_uid` at sign-in (`persons.ts:166`). Refuses outright if there is not exactly one `is_me`, because a wrong answer re-authors history. |
| `SYNC-F6` | `category` has `UNIQUE(name, kind)`, so adding `is_deleted` would make delete-then-re-add "Groceries" fail. | No `is_deleted` on `category`; sync through the existing `category_tombstone`. |
| `SYNC-F7` | `settings` holds one-time migration flags, so syncing it wholesale would make a device **skip a migration and record it as done**. | Explicit key allowlist. Migration flags are device state and are never synced. |
| `SYNC-F9` | Restore replaces everything and, with sync on, propagates — while the alert said "this device". | `confirmRestore` **refuses outright** while sync is on, and offers the Sync screen. A refusal rather than a warning, because the damage lands on other people's phones — where the person causing it cannot see it and the people suffering it cannot undo it. |
| `SYNC-F10` | **Rejecting an entry diverged the two devices.** Reject soft-deleted locally; their copy survived, so their group balance stopped matching mine and neither was told. | A rejection travels back to the author as an **objection** on the entry, and withdrawing it travels too. `pushSyncDispute` on push, `recordDispute` on pull. |
| `SYNC-F11` | **Deleting a shared group hard-deleted every transaction in it**, which under sync would either destroy shared history or diverge silently. | `deleteGroup` is creator-only, leaving is its own route, and a deletion propagates: the server reports `deleted`/`removed` and the client archives, stops syncing, and says so once. **Nothing is deleted locally** — my share already counted as spending in closed months, and erasing it for a decision that was not mine has no undo. |
| `SYNC-F12` | **Losing the per-group key loses that group's history** — the same class of loss as a forgotten backup passphrase, but it takes the group down with you. | The key is wrapped once per **device** and stored server-side, so any member who still holds it can reissue a wrap. Never derived from one device's secret — which is also why reinstalling mints a new device key rather than resurrecting the old one. |
| `SYNC-F13` | **A trusted peer moved my cash with no prompt.** An expense asserting *"you paid ₹4,000"* is an ordinary entry, so from a trusted author it applied on arrival — and because the payment named me, `CASH_TOTALS_SQL` counted it. | **2026-09-04.** `IncomingEntry.assertsIPaid`, read from the payment rows at the loader and gated ahead of trust. Carried as its own field rather than by widening `touchesMe`, which legitimately means payer-**or**-sharer. |
| `SYNC-F14` | **A peer could delete an entry I had already approved, with no gate at all**, and every reader filters deleted rows, so my numbers moved back silently. `peerApproval.test.ts` asserted this as correct behaviour — **its title was the bug report.** | **2026-09-04.** `txn_approval.pending_delete` — deliberately not `state='pending'`, which would have made the retraction take effect on arrival. The entry keeps counting until I decide. A retraction of something still waiting still applies at once, because nothing of mine had moved. |
| `SYNC-F18` | **Outbox head-of-line starvation.** More than 50 queued rows in a never-shared group meant every drain fetched the same unsendable 50 forever, and a shared group's newer entries were never reached. | **2026-09-04.** `pendingUploads` takes the sendable group ids and filters in SQL, so an unshared backlog can no longer fill the page. |
| `SYNC-F19` | **A peer's roster could promote its author and overwrite `created_by`.** Roles were applied straight from the wire with no immutability guard. | `created_by` is set once and never overwritten (`syncDoc.ts:804`, guarded on `created_by IS NULL` — an idempotence check would not have been enough). An inbound role change is treated as a **claim, not a fact**, gated behind `mayGrantRoles`. |
| `SYNC-F21` | **Approval and trust decisions were not audited** — so *"I rejected Aarav's ₹4,000"* appeared nowhere in the log a dispute is meant to be settled from. | `approveTxn`, `rejectTxn`, `reopenApproval` and the trust setters all write `audit_log` rows now. **Audit the decision, not just the entry** — these are the rows a disagreement is resolved with. |
| `SYNC-F23` | **`is_shared` was a dead column** — hard-coded `0` on create, `1` only on adoption, never updated. The picker's "Shared" label therefore appeared only on groups you *received*, and was wrong for every group you shared yourself. | Derived instead of stored: `MEMBER_COUNT` counts active members. **A count cannot drift, because it is the thing itself.** |
| `SYNC-F15` | Any approved member could push a new version of an entry I authored — the old ingest looked it up by id alone and rewrote its author. | **The server refuses it.** Only the stored author may send a new version or delete (`sync/entities/transactions.ts`, `DQ-96`), and the author of a new entry is always the session's own person. the `server/sharedTransactions` suite. |
| `SYNC-F16` | Removing a member was local only — they kept pulling every future entry. | **Removal is a server write** that only an admin can make; the removed member's next pull lists the group as `revoked` and their phone archives it. the `server/members` suite, `groupFlows.test.ts`. |
| `SYNC-F17` | The group key was never rotated, so anyone who ever held it held it forever. | **There is no group key.** Server sync (`DQ-93`) stores readable rows and gates reads by membership, so removal is the whole revocation (`DQ-32`). What a removed member already pulled stays on their phone — the limit `SYNC-F2` states. |
| `SYNC-F22` | The structured author was recorded but nothing read or showed it. | **Shown where it matters**: an entry awaiting approval names its author, and a transaction's History (`GET /transactions/:id/history`) names who saved each version. |
| `SYNC-F24` | Sharing was admin-gated on the client and member-gated on the server. | **The server enforces the app's own rule**: `sync/entities/members.ts` imports `canAddMember`/`canRemoveMember`/`canChangeRole` from the app's `permissions` and refuses a plain member. the `server/members` suite. |
| `SYNC-F20` | A group with no admin was reachable — first by v1's adoption, then by its owner deleting their account. | **Adoption is gone (S22), and account deletion hands the group over** in the same batch: an admin first, else the longest-standing active member with an account (`sync/erase.ts`). The schema's owner trigger allows it only once the old owner's account is marked deleted; no push can reach `owner_id`. A group with no other active account holder keeps its old owner id. The `server/erase` suite. `DQ-33` (handover while the owner is still here) stays open. |

---

## §6 · Open debt

Real, evidenced, and not blocking the pilot.

> An open-debt list that overstates itself costs more than it saves. **Verify a bullet against the
> tree before acting on it, and delete it the moment it lands.** Five bullets were removed from the
> predecessor of this list in one pass — two had been fixed weeks earlier and never struck.

| | Debt | Status |
|---|---|---|
| `D-01` | **CRED's `mode` vs `tr` was never isolated** — it failed once *both* were added, so the payload is the cause but not which half. Both are off today, closing the question by avoidance. Two attempts settle it. `DQ-09`. | `OPEN` |
| `D-02` | **Amazon Pay and WhatsApp were both tested against the same `@kotak` handle** — an uncontrolled variable, and Kotak is not among WhatsApp's five PSP banks. Retrying against `@okhdfcbank`/`@ybl` could show it was never blocked. `DQ-10`. | `OPEN` |
| `D-03` | **Android UPI is entirely untested.** `useUpiApps` returns null there, so `spec` is always null and no per-app prefix or `blocked` flag is ever reached — the quirks are not "dead on Android", they are **unreachable** there, and the whole per-app table is untested on the platform the pilot is heading to. Needs a device pass, not a patch. `DQ-11`. | `OPEN` |
| `D-04` | **`help.tsx` is a third collapsible**, structurally unlike the other two (bare header + card body, plus a nested item-level accordion). Converting to `SectionCard` adds card chrome — a real visual change. `DQ-17`. | `OPEN` |
| `D-05` | **`TransactionRow` never displays pay method.** Captured everywhere now, shown only in Review and on transaction detail. A density question, not a bug. `DQ-18`. | `DECIDE` |
| `D-06` | **Transfer has no `DetailChips`** — no tags, receipt, time, location or repeat; its note writes `transferNote`, a *different field* from every other kind's `note`. Consolidating means deciding which fields a settlement legitimately has, which is a product question. `DQ-13`. | `DECIDE` |
| `D-07` | **`budget_group.limit_daily/monthly/yearly` still exist as columns.** Removed from the `BudgetGroup` type — nothing ever wrote them, so the type was advertising a group-level budget the app does not have. The physical columns stay: dropping one in SQLite needs a table rebuild, not worth a migration for three fields nobody reads. **`person.remote_uid` is not dead** — `SYNC-F5` uses it. `OV-23`. | `PARKED` |
| `D-08` | **The sweep has to know *where from*, and give it back to the same place.** A surplus sweep moves money out of a specific asset, and a later withdrawal has to return it to **that same one** — handing ₹5,000 back as "cash" when it came from a bank account silently rewrites where the money is, and every figure built on that is then wrong. The sweep logic is small; **the prerequisite is not.** Parked *behind* the per-method baselines pass, not beside it, because building it first would bake the pooled-cash assumption into the savings ledger — the hardest place to unpick it. When built: `savings_txn` needs the source asset on the row, a withdrawal must default to it and be unable to silently pick another, and an auto-sweep must **refuse rather than guess** when the source is ambiguous. `DQ-15`. | `PARKED` |
| `D-09` | **Named accounts as entities.** Cash is now three buckets — bank / cash / wallet — with real per-bucket balances (`assetOf`, `BUCKET_FLOWS_SQL`, `openingTotal`), and `INCOME_LANDING`'s answer is finally read; `savings_txn.source_asset` means a goal remembers which bucket funded it and a withdrawal is capped by it. **Still open is named accounts** ("HDFC", "Paytm") with their own balances, which is what bank sync would eventually need. `DQ-14`, `W1-24`. | `PARKED` |
| `D-10` | **Migrations are forward-only, applied by hand, with no rollback and no staging.** `0004_sync.sql` is strictly additive and readable by the currently deployed Worker — because `deploy` and `migrate` are separate manual commands and **nothing orders them.** | `OPEN` |
| `D-12` | **Import restructure (remainder).** pdf.js vendoring is done; `app/import.tsx` and `paytmParse.ts` are still one long screen and one long parser. | `PARKED` |

---

## §7 · Known and accepted for the pilot

Recorded so nobody re-discovers them as bugs. These are **decisions**, not neglect.

| | Accepted |
|---|---|
| `A-01` | **Three red surfaces stack on every Home open** — the Safe-to-Spend strip, the pace row and the health ring. Retention research names a "guilt cycle": two or three months of red and users conclude they are bad at budgeting and leave. Each one was given a next action and the band that judged the person was renamed ("Vulnerable" → "Stretched thin"), but **no threshold was moved and the three were not de-duplicated.** Whether three at once is too many is a question only real users can settle. `DQ-12`. |
| `A-02` | **`openDB()` re-runs ~40 `ALTER`s every launch.** Cold-start cost, accepted. |
| `A-03` | **`PRAGMA foreign_keys` is OFF** on the live connection (ON only during migrations); cascades are hand-rolled. Flipping it needs every delete path audited first. `DQ-19`. |
| `A-04` | **Voice auto-save has no off switch.** A confident phrase posts itself; the guard is Undo plus the duplicate prompt. Deliberately no flag — add one only if it misfires in practice. `DQ-20`. |
| `A-05` | **Files over the ~300-line rule**: `review.tsx` (pinned at ≤750 by `sourceCounts.test.ts`, only ever lowered), `Onboarding.tsx`, `itemized.tsx`. Extraction is opportunistic policy, **not a backlog**. |
| `A-06` | **Categories are stored as strings, not ids.** `OV-06` is the decision that would change it. |
| `A-07` | **A mid-phrase lone numeral is ignored; a leading one is not** — "do you have change" parses as ₹2. The leading rule is what makes "450 groceries" work, so tightening it costs more than it saves. |
| `A-08` | **No background drain for voice captures** — filed at launch and on every foreground. `expo-background-task` would be sooner, at the cost of a native module and a silently-failing OS path. |
| `A-09` | **Anyone who used the app before `7b597e1` saw their health score move once**, with no notice. Nothing to migrate; recorded rather than fixed. |
| `A-10` | **Itemized line items do not travel.** An itemized bill arrives with its totals and shares intact — **the money is right** — but the per-item breakdown is not carried, so the receiving phone shows it as a single expense. Cosmetic, not financial. Listed because it will look like a bug to whoever hits it first. |
| `A-11` | **`expo-file-system` legacy API** — the suite proves nothing either way, because jest stubs it. Downgraded from a blocker, **not closed**. Un-parks on an Expo upgrade that removes it. `DQ-23`. |

---

## §8 · Parked, with the trigger

| Item | Why it is parked | Un-parks when |
|---|---|---|
| **Per-method money baselines** | Money-correctness risk; deserves its own reviewed pass | The next money-model pass — accounts-as-entities and investments-as-transfer are waiting with it |
| **Monetisation / premium tier** | A tier boundary drawn before anyone uses the app is a guess. **No paywall, entitlement check or purchase SDK exists anywhere, and that absence is intentional** — feature flags are user preferences, never entitlements, and must not be repurposed | After the pilot. Needs a new entitlement concept; nothing existing can be repurposed. `DQ-01` |
| **Push notifications** | Only local notifications exist; `withoutPushEntitlement.js` strips the entitlement a personal team cannot sign | Gate 0 clears — then delete the plugin |
| **App Intents** | True hands-free, no app launch, Siri reading results back. Native Swift target + entitlements + App Group | Gate 0 clears. Apple's own forums report inline parameters falling back to a prompt |
| **In-app mic capture** | On-device recognition, live partial transcript, insert on silence. **No first-party Expo speech-to-text exists** (`expo-speech` is TTS); needs a native module on the `modules/expo-ocr` precedent | You want the Shortcuts round trip gone |
| **Widget** | Scope genuinely undecided — balance? today's spend? quick-add? | You answer that **and** Gate 0 clears. `DQ-06` |
| **Repayment likelihood → expected recovery** | Per-person "how likely is this to come back", turning owed-to-me from a face value into an expected one. Three constraints decided up front: it stays **out of Safe-to-Spend** (every term there is certain money, and a probabilistic one makes the headline a guess); the maths is **Σ(amount × probability)**, not an average or median of probabilities — a median discards the amounts, so a 20%-likely ₹40,000 would rank below a 90%-likely ₹200; and the rating **never syncs**, because at S3 it could reach the person being rated | The WhatsApp composer ships — that is what gives it an order |
| **Scheduled reminder nudge** | Needs an overdue scan, a per-person cooldown store, notification routing, and a cadence that cannot be guessed from an empty pilot. Get it wrong and users disable notifications, **losing the channel permanently** | The manual composer ships first — a strict prerequisite |
| **Unified `SplitEditor`** | One reusable component (member select + type toggle + per-mode inputs + remainder validation) for Quick Add, GPay review and Itemize — kills the last duplicated split UI | Lands with Phase GP |
| **Global categories, full vision** | The global catalog shipped; what is left is the multi-user half — a category becomes undeletable while shared, un-adopted ones fold into "Everything else", and budgets become per-group-as-a-whole | Real multi-user sync exists (S3). `DQ-16` |
| **Retire the voice Shortcuts apparatus** | When mic/App Intents land, delete `voiceDrain.ts`, `voiceShortcut.ts`, `voiceShortcutFile.ts`, `scripts/build-shortcuts.ts` and the import→share→paste round trip **that has cost six passes** | The replacement capture path ships |
| **Nearby friends, suggested for a split** | A thought from the user (2026-09-26): when adding an expense, suggest the friends who are physically nearby, so splitting a dinner is one tap. Needs other people's live location or a Bluetooth/UWB proximity handshake — both are privacy-heavy, both need the other person's consent and app running, and neither exists on-device today. Location already stays on this phone; this would be the first feature that shares it | Shared groups are in real use (post-pilot), and a consent model for proximity is decided first |
| **Achievements, a game with friends** | A thought from the user (2026-09-26): achievements and friendly competition. The risk is rewarding the wrong thing — a streak for *logging* or *settling up fast* helps; anything that ranks *spending* between friends pressures it. Would reward habits (logging streak, settled within a week, goal reached), never amounts, and never show one person's figures to another | After the pilot, once there is real usage to base habits on |
| ~~**WhatsApp reminder composer**~~ | **Shipped.** Pure builder in `lib/whatsappReminder.ts`, button on the person screen, share-sheet fallback when the number has no country code. Push only — never a collect request | — |
| ~~**Goals surplus sweep**~~ | **Shipped.** `planSurplusSweep` (pure, refuses rather than guesses) + `runSurplusSweep`, opt-in via `settings.autoSweep`, off by default. Records the bucket it drew from, so a withdrawal returns there | — |
| ~~**Insights restructure**~~ | **Shipped 2026-09-01.** One always-present headline (it rendered *only* when overspending) over collapsible `SectionCard`s. Recommendations + Driving overspend merged — both were built from the same over-budget categories. `insightsScreen.test.ts` locks it | — |
| ~~**Multi-device sync (S2)**~~ / ~~**Shared groups (S3)**~~ | **Built, then rebuilt as server sync** (`DQ-93`, S0–S22): everything a signed-in account owns, offline-first, checked by the server. What is *not* proven is in `RELEASE_CHECKLIST.md` §3.1 — **sync has never run on a phone** | — |

---
