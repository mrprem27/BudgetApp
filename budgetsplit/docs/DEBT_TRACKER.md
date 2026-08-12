# BudgetSplit — Debt Tracker

> **Shipping?** Read [V2_LAUNCH_CHECKLIST.md](./V2_LAUNCH_CHECKLIST.md) instead — it is the
> pre-launch list, and it links back to the rows here rather than restating them. This file
> stays the record of *why* something is owed; that one is *what blocks launch*.

> **Single source of truth for open debt.** Replaced four overlapping planning docs
> (BRUTAL_ANALYSIS, REFACTORING_PLAN, IMPROVEMENT_PLAN, FUTURE_IMPROVEMENTS), which were
> archived once their items were merged here and deleted once all of them were closed.
> Their reasoning is in git history. Add new items **here**.

**Current — 2026-07-28, after the 🔴/🟡/🟢 paydown passes and Pass 4** (branch
`refactor/phase-1-perf-safety`):

| | at audit | now |
|---|---|---|
| `npx tsc --noEmit` | ✅ clean | ✅ clean |
| `npx jest` | 290/290, 31 suites | ✅ **541/541, 46 suites** |
| Screens rendering the personal group | 2 | **1** — `/personal`; `/group/{personalId}` forwards |
| Onboarding `useState` in the screen | ~15 | **0** — all in `useOnboardingForm` |
| Feature flags with no effect on the persona | 12 of 12 | **0** — `lib/personaDefaults.ts` |
| Screens discarding load errors | 6 | **0** |
| Untested lib modules | 17 | **13** — *not* 9, and not "all native I/O adapters": the count missed `homeData` (218 L), `reportsData` (178 L), `insightsData` (125 L) and `txnDetail`, which were extracted from screens during the C5/C9/C10 paydown without tests. See AUDIT DEBT-07 |
| `any` / `@ts-ignore` | 42 | **5** (all documented library gaps) |
| Dead style keys | 154 | **0** |
| Raw hex in UI code | 19 | **0** |
| Hex-suffix colour concatenations | 153 | **0** (via `alpha()`) |
| Screen-reader-silent controls | 6 | **0** |
| Colour palettes | 3 sources | **1 file** |
| Largest screen | 1354 LOC | **749** (`app/review.tsx`) — see the note below |
| Hand-rolled data loaders | 1 | **0** |

**Every 🔴, 🟡 and 🟢 item is closed.** The only rows still open are the two ⛔
external blockers (GPay export format, Google CASA assessment), which are not
code. See [§ Resolved](#-resolved) and [§ Won't fix](#-wont-fix--by-design).

> **`SwiftUICore` link workaround.** `expo-camera` (live UPI QR scanning) pulls SwiftUI in, and
> Xcode 16's **simulator** SDK ships `SwiftUICore.tbd` as a private framework only SwiftUI may
> link — the build fails with *"cannot link directly with 'SwiftUICore' because product being built
> is not an allowed client of it"*. `plugins/withSwiftUICoreLinkFix.js` adds
> `"$(SDKROOT)/System/Library/Frameworks"` to `FRAMEWORK_SEARCH_PATHS` so the linker resolves the
> real framework instead of the stub. ⚠️ **`-Wl,-weak_framework,SwiftUICore` does NOT fix this** —
> tried on the pod targets and then on the app target, failing identically both times. Don't re-try
> it. Delete the plugin once a newer Xcode stops emitting the implicit link.

> **Free Apple team + push entitlement.** `expo-notifications` adds `aps-environment` on prebuild,
> which a personal developer team cannot sign. `plugins/withoutPushEntitlement.js` removes it — the
> app only ever schedules **local** notifications. If remote push is ever wanted, deleting that
> plugin is the small part; **moving to a paid Apple team is the actual blocker.**

> **`review.tsx`: 1354 → 977 (2026-07-28) → 1029 (regrown) → 749 (2026-08-08).** `C1` stays struck
> because the first paydown really happened; the file then grew back past its own fixed size, which
> is the argument for a *mechanism* over repeated manual paydowns. `sourceCounts.test.ts` pins the
> ceiling — now **750** — and it is only ever lowered.
>
> The 2026-08-08 pass extracted `ReviewRowCard` plus five overlays (`ReviewDestSheet`,
> `CounterpartySheet`, `BulkGroupSheet`, `ReviewOverflowSheet`, `SavedViewsSheet`) into
> `components/finance/review/`, and reused Add's `PayMethodSheet` instead of a second
> pay-method list. **`ReviewRowCard` must stay at module scope** — defining it inside
> `ReviewScreen` creates a new component type per render, which remounts the row and drops
> keyboard focus while typing an amount. That regression has happened once already; the file
> carries a comment saying so.

**Pass 4 (2026-07-28)** additionally closed 7 items that `AUDIT.md` had tagged `DEFER`
because they needed an owner decision rather than more analysis — the personal-screen
merge (S-04 · S-14 · DEBT-03) and the onboarding persona (FLOW-01 · F-27 · ISS-04 ·
DEBT-12). Detail in [AUDIT.md § Pass 4](./AUDIT.md). **Nothing in Pass 4 has been
device-tested** — `tsc` and `jest` cannot see a broken layout, and the new `splitting`
flag changes the tab bar.

---

## Open money-model gaps (2026-08-08)

**Card repayment is not modelled.** `pay_method = card` now correctly routes spend to
used credit instead of cash (`lib/cash.ts` + `cashQuery.ts`, parity locked by
`cashSql.test.ts`), and `creditUsed` is read as *stated balance + card spend since
`money.updated_at`* — so it self-corrects whenever the user re-enters the balance in
the Plan editor. What's missing is the other direction: paying your card bill should
move cash down and `creditUsed` down, and there is no card-bill concept to hang that
on. Guessing (a magic category name, or a bank→card transfer) would be worse than the
gap. Until a real card-payment path exists, `creditUsed` only grows between Plan edits.

**Accounts as entities.** Income records *where it landed* (`INCOME_LANDING`, a view
over `pay_method`), but cash is a single pooled figure — choosing Bank vs Cash labels
the transaction, it does not maintain separate balances. Real accounts with balances
would reopen Total Money, the settlement engine and the transfer flow; deliberately
deferred. The two gaps above are the same missing model.


## How to use this file

1. **Add a row** to the right section with the next free ID. Never renumber.
2. **Every row cites `file:line`.** A claim without evidence gets deleted, not debated.
3. **Never delete a row** — move it to [§ Resolved](#-resolved) with the date, or to
   [§ Won't fix](#-wont-fix--by-design) with the reason.
4. **Verify before you carry an item forward.** The four docs this replaced rotted because
   ~60 checkboxes were left unticked after the work shipped, so they read as far more broken
   than the code was. Nine items were caught that way on 2026-07-28 — already done, still
   listed as open. Re-check against live code before believing any row.

**Severity** — 🔴 breaks or blocks a user · 🟡 inconsistency, risk, or drift · 🟢 cosmetic
**Status** — `open` · `⏸️ blocked` (needs a decision) · `⛔ external` (blocked outside the codebase)

---

## 🎨 UI/UX

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**U1**~~ | ✅ | ~~6 screens discard `useScreenData` error~~ | **Fixed 2026-07-28** — all 25 `useScreenData` screens now render `ErrorState` with retry. `afford.tsx` also stopped swallowing the error into a zeroed snapshot (it was rendering "₹0 available" — a confident wrong answer). | done |
| ~~**U2**~~ | ✅ | see commit log | ~~6 data screens flash an empty state before load~~ **Fixed** — gated on `loading`. `afford.tsx` also had two DEAD guards testing `snap === null` when `useScreenData` yields `undefined`, so it rendered "₹0 available" and a full verdict from unloaded data | done |
| ~~**U3**~~ | ✅ | see commit log | ~~Pull-to-refresh on 11 of 31 screens, no rule~~ **Fixed** — rule codified in AGENTS.md §12 (data + own scroll container ⇒ yes) with an explicit exempt table; applied to the 6 qualifying screens. Zero violations | done |
| ~~**U4**~~ | ✅ | see commit log | ~~85 pressables missing `accessibilityLabel`~~ **Fixed — and the number was wrong.** 124 of the 130 have a `<Text>` child that RN derives a name from. Only **6** were genuinely silent; all labelled, and the notifications `Toggle` gained a required `label` prop | done |
| ~~**U5**~~ | ✅ | ~~19 raw hex outside tokens~~ **Fixed** — `app/` and `src/components/` now contain **zero** raw hex. Three near-identical dark reds collapsed into one `expenseTintDeep`; added `amberTint` + `streakFlame`. Remaining hex is legitimate: the palette/category catalogues, the light-themed print document, and demo fixtures | — | done |
| ~~**U6**~~ | ✅ | see commit log | ~~Three colour palettes~~ **Fixed** — the second `CHART_COLORS` had zero consumers (deleted, no visual change); `GOAL_COLORS` and `GOAL_ICONS` moved out of the screen. All palettes now in `constants/palette.ts` | done |
| ~~**U7**~~ | ✅ | see commit log | ~~5 screens hand-roll a header~~ **Fixed per owner decision** — `(tabs)/groups` and `category/[name]` → `ScreenHeader`. Home, `(tabs)/settings` and `add/itemized` stay bespoke by design | done |
| ~~**U8**~~ | ✅ | see commit log | ~~Two modal metaphors~~ **Fixed** — `SplitSheet` and `CategoryPicker` were hand-rolling backdrop + handle + title + keyboard avoidance around a raw `<Modal>`; both now use `SheetModal`. The 3 remaining raw `<Modal>`s are correct (SheetModal itself, the photo lightbox, the FAB overlay) | done |
| ~~**U9**~~ | ✅ | see commit log | ~~Home first-run empty state~~ **Resolved as won't-fix** — owner confirmed the bespoke hero is intentional. No longer blocked | done |
| ~~**U10**~~ | ✅ | see commit log | ~~`add/itemized` → ModalHeader~~ **Resolved as won't-fix** — wizard header is intentional. No longer blocked | done |
| ~~**U11**~~ | ✅ | ~~`accessibilityState` on review/itemized toggles~~ **Fixed, wider than scoped** — swept every selection control: **14** toggles across savings, settings, categories, review, FilterForm, Onboarding and TransferSlotSheet now report `{ selected }`, and both of `help.tsx`'s disclosure levels report `{ expanded }` | — | done |

---

## 🧩 Features

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**F1**~~ | ✅ | ~~25 files of finished work uncommitted~~ | **Fixed 2026-07-28** — committed. | done |
| ~~**F2**~~ | ✅ | see commit log | ~~Subscription vs Recurring tangle~~ **Re-labelled as product work, not debt** (owner decision) — it changes app behaviour, so it does not belong in a cleanup pass. Tracked in the roadmap | done |
| ~~**F3**~~ | ✅ | see commit log | ~~Global-categories migration~~ **Re-labelled as product work, not debt** (owner decision) — needs a schema migration and a call on existing per-group categories | done |
| **F4** | ⛔ | GPay import blocked — source export format unknown | Phase GP | ⛔ external |
| **F5** | ⛔ | Live email ingestion blocked — Google OAuth needs CASA assessment | Paste path shipped as the workaround | ⛔ external |
| ~~**F6**~~ | ✅ | ~~Receipt-OCR provider has no Settings row~~ | **Fixed 2026-08-04** — **Cloud Receipt Scanning** added to Feature management → Smart capture (`app/features.tsx`, `toggleCloudOcr` → `settings.setOcrProvider`). On = `gemini`, off = `device`. A `settings` pref rather than a `FeatureKey` for the same reason `save_location` is: it isn't a show/hide-a-surface boolean. Neither direction warns (off needs no defence; on is the default) — the caption carries the consequence and flips with the state. Not dimmed when off, since off means "read locally", not "scanning disabled". | done |
| ~~**F7**~~ | ✅ | ~~**Receipt scanning ships unflagged.**~~ Closed 2026-08-05 in the Wave-3 flag rework: `receiptScan` now gates the Scan button, and `featureFlags.test.ts` asserts it gates something. | `app/add/itemized.tsx`; AUDIT F-31 | **done** |
| **F8** | ⛔ | **UPI hand-off: PhonePe · Paytm · Amazon Pay · WhatsApp refuse a payment we start.** Closed on our side — every payload lever was varied (path, `mode`, `tr`, `pn`, withholding `am`) with an identical refusal each time; HTTPS universal links are impossible (PhonePe serves **404** at its `apple-app-site-association` path, so iOS can never route one) and aggregator `sign=` is made by the *payee's* PSP, so no gateway can sign for a friend's VPA. The way round is the request-QR, which needs no credentials. Would only reopen with merchant/TPAP registration. | `src/lib/upiIntent.ts`; FEATURES_AND_FLOWS §14 | ⛔ external |
| **F9** | 🟡 | **Every per-app UPI result on record is iOS.** On Android `useUpiApps` returns `null`, so `spec` is null, no per-app prefix or `blocked` flag is ever reached and all four "blocked" apps get the generic `upi://pay` through the OS chooser — untested. Android intents carry the calling package, which is what PhonePe is known to whitelist against, so this is the one test that could reopen F8 for PhonePe/Paytm. Amazon Pay and WhatsApp fail PSP-side and would likely fail there too. **Costs one Android build and ₹1 per app.** | `src/hooks/useUpiApps.ts`; FEATURES_AND_FLOWS device table | open |
| **F10** | 🟡 | **Per-app payload quirks are dead on Android.** `UpiPayloadQuirks` are read from the app's spec, and there is no spec on Android — so CRED receives `mode=04` (the parameter it is pinned to avoid) and Airtel loses the `tr` it paid with. The two apps with *proven* payloads are the only two getting a payload they were never proven on. Structural rather than careless: the OS chooser means we cannot know the target app. Needs a decision, not a patch. | `src/hooks/useUpiHandoff.ts`, `src/lib/upiIntent.ts` | ⏸️ blocked |
| **F11** | 🟢 | **CRED's `mode` vs `tr` was never isolated.** It paid on `pa/pn/am/cu` and failed once **both** `mode` and `tr` were added, so the cause is the payload but not which half. Both are off for CRED today, closing the question by avoidance. Two attempts settle it — and if `mode` is innocent, one app-specific quirk disappears. | `src/lib/upiIntent.ts` CRED entry | open |
| **F12** | 🟢 | **Amazon Pay and WhatsApp were both tested against the same `@kotak` handle**, so the two "blocked" verdicts share an uncontrolled variable — the same confound Airtel already produced here. Amazon Pay resolved that handle (green-ticked name) while WhatsApp could not, and Kotak is not among WhatsApp's five PSP banks. Retrying WhatsApp against an `@okhdfcbank`/`@ybl` handle could show it is not blocked at all. | FEATURES_AND_FLOWS device table | open |

---

## 🧹 Cleanness

| ID | Sev | Item | Evidence | Status |
|----|-----|------|----------|--------|
| ~~**K1**~~ | ✅ | ~~17 lib modules with zero tests~~ | **Fixed 2026-07-28** — 8 now covered (`settleScope`, `reminderPlan`, `txnGrouping`, `settings`, `featureFlags`, `reviewViews`, `groupExport`, `reportExport`) via a new in-memory AsyncStorage mock. Found and fixed a real CSV-escaping bug on the way (see K10). The remaining 9 are native I/O adapters (`haptics`, `location`, `shareCsv`, `pdfjsCache`, `attachment`, `avatar`, `notifications`) plus 2 db-heavy (`analytics`, `onboarding`) — see 🟡 K11. | done |
| ~~**K2**~~ | ✅ | see commit log | ~~42 `any` / `@ts-ignore`~~ **Fixed → 5.** Root cause was stale codegen: `typedRoutes` was already on but `.expo/types/router.d.ts` was from 2026-06-24 and missing every newer route. Regenerated ⇒ 28 casts deleted. 4 more genuinely typed; the last 5 are documented library gaps | done |
| ~~**K3**~~ | ✅ | see commit log | ~~Byte-identical copy-paste between savings and insights~~ **Fixed — it wasn't shared UI.** The styles were left behind when the velocity card moved to /insights. See K9 | done |
| ~~**K4**~~ | ✅ | see commit log | ~~No `IconCircle` primitive~~ **Fixed** — created in `components/ui/`, adopted at 9 pixel-identical sites, and **AGENTS.md §8 now prescribes the component instead of the inline snippet** (the doc was teaching the copy-paste). 43 sites with extra positioning left for opportunistic migration | done |
| ~~**K5**~~ | ✅ | see commit log | ~~29 screens import `db/queries` directly~~ **Fixed — and the premise was wrong.** AGENTS.md's rule is no inlined SQL + load via `useScreenData`; its own reference screens import query functions inside the loader. Measured properly: 0 screens inline SQL, and exactly **one** hand-rolled a loader (`(tabs)/settings`), now migrated | done |
| ~~**K6**~~ | ✅ | ~~No `alpha()` helper; `+ '22'` ~47×~~ **Fixed** — it was **153** sites across **15** different opacities, not one. New `theme/alpha.ts`: `alpha(c, 13)` returns the identical string, asserted per-opacity in `alpha.test.ts`, so the migration is provably visual-noop. Zero concatenations remain | — | done |
| ~~**K7**~~ | ✅ | ~~No `SectionCard collapsible`~~ **Fixed** — new `components/ui/SectionCard.tsx` adopted in `group/[id]/budget` and `categories`. It also closes an a11y gap both copies shared: a disclosure needs `accessibilityState={{ expanded }}`, which neither set | — | done |
| ~~**K8**~~ | ✅ | ~~`PersonEditSheet` duplicated~~ **Fixed** — it was **three** copies (two in `friends`, one in `members`), not two. New `PersonNameSheet` owns the field constraints so name rules can't drift between screens | — | done |
| ~~**K11**~~ | ✅ | see commit log | ~~9 lib modules untested~~ **Assessed, not code.** 7 are thin native I/O adapters where a unit test would only exercise the mock; 2 (`analytics`, `onboarding`) need a SQLite fake. Recorded so "9 untested" is never mistaken for "9 forgotten" | done |
| ~~**K9**~~ | ✅ | see commit log | ~~Dead styles in savings.tsx~~ **Fixed** — swept repo-wide: **154 unused style keys** removed across 17 files, 73 in `(tabs)/savings.tsx` alone (71% of its stylesheet). Verified no dynamic `styles[key]` access first | done |

---

## 🌀 Complexity

Ranked by LOC and `useState` count. `quick.tsx` is deliberately absent — it was 1250 LOC and is
now 7 `useState`, outside the top 25. That extraction worked; these are the ones left.

**AGENTS.md sets the bar at ~300 lines** ("when a screen file grows past ~300 lines, extract").
Every row below is over it; C1–C3 are 3–4.5× over.

| ID | Sev | File | LOC | `useState` | Note |
|----|-----|------|-----|-----------|------|
| ~~**C1**~~ | ✅ | [app/review.tsx](../app/review.tsx) | ~~1354~~ → **977** | ~~24~~ → 19 | **Fixed 2026-07-28** — extracted `FilterForm`, `SaveViewForm`, `DestOption` into `components/finance/review/`, and the whole commit path into pure [lib/reviewCommit.ts](../src/lib/reviewCommit.ts) (**42 new tests** covering how money is booked). |
| ~~**C3**~~ | ✅ | [app/add/itemized.tsx](../app/add/itemized.tsx) | ~~847~~ → **614** | ~~23~~ → **0** | **Fixed 2026-07-28** — all state/behaviour moved to [useItemizedForm](../src/hooks/useItemizedForm.ts), mirroring the existing `useAddTxnForm` pattern. The screen is now pure render. |
| ~~**C2**~~ | ✅ | [Onboarding.tsx](../src/components/system/Onboarding.tsx) | ~~961~~ → **793** | 17 | **Fixed 2026-07-28** — the four carousel illustrations moved verbatim to [onboarding/SlideArt.tsx](../src/components/system/onboarding/SlideArt.tsx). ⚠️ The hero ring/fan (`LogoAssembly.tsx` + the `stage === 'hero'` block) was **not touched** — verified byte-identical. |
| ~~**C4**~~ | ✅ | [db/queries/transactions.ts](../src/db/queries/transactions.ts) | ~~888~~ → **593** | — | Recurring-series lifecycle split into [queries/recurring.ts](../src/db/queries/recurring.ts) (318). Shared `loadSplits`/`insertTxnRows` exported `@internal` rather than duplicated; 2 exports that had no external callers made private. |
| ~~**C5**~~ | ✅ | [app/reports.tsx](../app/reports.tsx) | ~~596~~ → **437** | 6 | Loader → [lib/reportsData.ts](../src/lib/reportsData.ts). The 450ms skeleton floor stayed in the screen — that's presentation. |
| ~~**C6**~~ | ✅ | [app/savings/[id].tsx](../app/savings/[id].tsx) | ~~561~~ → **434** | ~~12~~ → **0** | → [useSavingsGoalScreen](../src/hooks/useSavingsGoalScreen.ts). |
| ~~**C7**~~ | ✅ | [app/txn/[id].tsx](../app/txn/[id].tsx) | ~~551~~ → **435** | — | → [useTxnDetail](../src/hooks/useTxnDetail.ts). Its handler blocks are **not** contiguous (the loading/error guards sit between them), so this one was cut by exact block. |
| ~~**C8**~~ | ✅ | [app/(tabs)/savings.tsx](../app/%28tabs%29/savings.tsx) | ~~540~~ → **327** | ~~14~~ → **1** | → [useSavingsTab](../src/hooks/useSavingsTab.ts). Preserves the deliberate read/mutation split: the overspend-raid stays in its own focus effect so it can't re-raid on every refetch. |
| ~~**C9**~~ | ✅ | [app/(tabs)/index.tsx](../app/%28tabs%29/index.tsx) | ~~539~~ → **351** | 7 | Loader + period-range helpers → [lib/homeData.ts](../src/lib/homeData.ts). |
| ~~**C10**~~ | ✅ | [app/insights.tsx](../app/insights.tsx) | ~~499~~ → **377** | — | Loader → [lib/insightsData.ts](../src/lib/insightsData.ts); `insightTint` stayed in the screen (tone → colour is render, not data). |
| ~~**C11**~~ | ✅ | Unvirtualized lists | — | — | **Triaged — "20 screens" was a naive grep.** `search`, `review` and `history` (the three called risky) already use SectionList/FlatList. One real unbounded list existed: `getGoalHistory` had no LIMIT, so a goal's whole ledger mounted in a ScrollView. Now paged at 50 with a visible "showing N of M" — and the delete-undo path passes `limit: null` deliberately, since capping there would silently drop rows on restore. |

---

## 📌 Found during the 🟢 pass — recorded, not actioned

Two things surfaced that are outside what a cosmetic pass should decide alone. **N1 has since been decided and fixed** (`V2-09`); N2 stands.

| # | Item | Why it wasn't done here |
|---|---|---|
| ~~**N1**~~ ✅ | ~~`colors.textMuted` is **2.98:1** on `bgCard` — below WCAG AA's 4.5:1 for small text.~~ | **Fixed 2026-08-05** as `V2-09`. It *was* a design decision, which is why it needed deciding rather than deferring again: `#5A6B69` → **`#7C918E`** (5.02:1 on `bgCard`, 5.78 on `bg`, 4.62 on `bgInput`). Deliberately not lightened further — clearing AA on `bgMuted`/`bgElevated` too needs `#8A9D9A`, indistinguishable from `textSecondary`, collapsing three text tiers into two to fix surfaces that carry no muted text. `contrast.test.ts` computes the ratios from the palette and asserts the hierarchy survives. |
| **N2** | `help.tsx` is a third collapsible, structurally unlike the other two (bare header + card body, plus a nested item-level accordion). | Converting it to `SectionCard` would add card chrome to its header — a real visual change I can't device-verify. Its missing `accessibilityState` **was** fixed; only the structural convergence is deferred. |

---

## 🚫 Won't fix / by design

Recorded so they stop being re-raised as bugs.

| Item | Reason |
|---|---|
| `PRAGMA foreign_keys` OFF on the live connection | ON only during migrations ([schema.ts:294-438](../src/db/schema.ts#L294)). Cascades are hand-rolled deliberately; flipping it needs every delete path audited first. |
| Dead schema columns + unused `settings` table | Column drops require a risky table rebuild. Zero runtime cost. **Named set, as of 2026-07-28:** `person.remote_uid`, `budget_group.limit_daily/monthly/yearly`, `budget_group.carry_over`. These are now dead *config* with **no reader at all** — `getBudgetUsage`, the last consumer, was deleted (see Resolved). The `settings` table is not unused either: it holds the `category_global_v1` flag and the one-time-fix completion keys. The five `is_demo` columns that used to be listed here are **gone** — they were written but never read, so the writes and migrations were removed; pre-existing databases keep an inert column. |
| Files over the ~300-line rule | `AGENTS.md` prescribes extracting **opportunistically** — "whenever you're already editing one for a feature; no big-bang migration". That makes it standing policy, not a scheduled task, so it should not sit on a backlog as if it were. The genuine outliers (`review.tsx` **1029**, `Onboarding.tsx` 793, `itemized.tsx` 614) are tracked individually instead. |
| Two token import paths (`src/constants/*` → `src/theme`) | `constants/{colors,typography,layout}` are documented back-compat re-export shims; `src/theme` is canonical. 45 files still import the old path. A sweep is safe but is a large diff that changes no behaviour, and `AGENTS.md` already says to prefer `src/theme` in new code — so it converges without a migration. |
| Subscription auto-detection dormant | Subscriptions are sourced from **recurring rules** — there is no bank feed to detect from. `lib/subscriptions.ts` stays dormant intentionally. |
| Raw `TextInput`s not converted to `Input` | Audited 2026-07-13: the remainder are search bars with a clear (×) button, deliberately border-less inline card rows (AGENTS.md rule 4), and hero amount fields. Converting them would *degrade* the design. |
| Categories stored as strings, not IDs | Safe `renameCategory` shipped instead of a full normalisation migration. |

---

## ✅ Resolved

### Shipped 2026-08-12 — budget lines fold against the catalog, like spend already did

Completes the requirement whose second half was unresolved when the two-level budget shipped.

`category_budget.category` is a **loose name string, not a foreign key**, so a group default can
budget `Gym` while your catalog has no `Gym`. Spend on Gym already folded into `Others`
(`foldUncategorized`, used by `homeData` and `reportsData`); its **budget did not**, and sat in
the list as a category you do not have. Same category, two different treatments — the
asymmetry, not a missing feature.

`foldBudgetStatuses` (`src/lib/budget.ts`) applies the spend rule to budget lines: a line whose
category is absent from the catalog shows as `Others`, and adopting the category un-folds it
with the amount intact.

| Decision | Why |
|---|---|
| **Presentation, never arithmetic** | Nothing is redistributed and no total moves — pinned by a test asserting the total is identical before and after adopting the category. The alternative (creating a category takes a slice out of an `Others` budget) needs a split rule nobody has, and would silently change amounts when you edit your catalog. |
| **Folded per cadence** | A daily ₹100 and a monthly ₹2,000 share no window, so one merged row could not state a meaningful percentage. Almost always one row in practice. |
| **`Other` ≠ `Others`** | `Other` is a real seeded, budgetable category; `Others` (`categoryFold.ts:2`) is the display bucket. A real `Others` in the catalog is treated as itself, not as the bucket. |
| **Applied to analytics too** | Those lists supply the counts rendered directly above the rows, so folding one and not the other would print "2 over" above a single Others row. `daysToLimit` is dropped on a folded row — it is a pace estimate for one category and a merged bucket has no single pace. |
| **`rollUpBudgets` untouched** | Totals are computed from lines, not display rows, so the headline is identical either way. Also pinned. |

**Mostly forward-looking today.** With no sync, the catalog is device-wide and
`setCategoryBudgets` writes from your own catalog, so divergence is hard to reach on purpose —
`deleteCategory` even removes an expense category's budget rows with it. It becomes reachable
with V3 multi-user, and is defensive now against restored or imported data.

### Shipped 2026-08-12 — group roles, and a budget default a member can override

`69a5912` · `d087d18`

Extends D1. `4c7ee45` settled that a group budget *amount* is one person's allowance; this adds
the two layers above it. Neither existed in any form beforehand.

| Item | Detail |
|---|---|
| **Roles, from nothing** | `budget_group` had no `created_by` and `group_member` was `(group_id, person_id, joined_at)`. Now the creator is recorded immutably and `group_member.role` is `admin`/`member`. There is deliberately **no `owner` role**: creator-ness lives in a column that is written once and never updated, so "nobody can remove the creator" is a property of the data model rather than a rule someone can edit their way out of. The creator is treated as admin whatever their role row says, so a mis-migrated role cannot lock them out of their own group. |
| **Who may do what** | Any admin (including the creator) can add, remove, promote, demote. Nobody can remove or demote the creator — including the creator themselves, because a group with no permanent admin becomes unmanageable. Delete is creator-only: it destroys every member's history, not just the actor's. Rules are pure in `src/lib/permissions.ts` and enforced in `db/queries`, never in screens — a hidden button is a courtesy, the write path is the control. |
| **Two-level budgets** | `category_budget.person_id`: NULL is the group default every member inherits, set is that person's override. Every pre-existing row is a default, so there is no data migration — pinned by a test rather than asserted. |
| **Nobody writes another person's override** | Not even an admin. With no sync yet the target could not see it, so it would silently drive *their* over-budget warnings from someone else's opinion. |
| **SQLite trap 1 — NULL uniqueness** | `UNIQUE(group_id, category, period, person_id)` looks correct and enforces **nothing** at the default level, because SQL treats NULLs as distinct: one category could accumulate unlimited group defaults. Replaced by two partial unique indexes, one per level. |
| **SQLite trap 2 — the original constraint** | The table's own `UNIQUE(group_id, category, period)` made an override **impossible outright** — the override row collides with the default on exactly those columns. SQLite cannot drop a constraint, so `category_budget` is rebuilt once, guarded on its stored DDL, the same way `txn` and `category` already were. Both traps were found by tests, not by reading. |
| **Five readers were ignoring overrides** | `getCategoryBudgets` was called without an identity in `analytics`, both budget-status readers, the afford snapshot and the category screen — so they would have read only defaults while appearing to work. Same shape as the nine rollups that each answered "what is my budget" differently. `resolveBudgetLines` is keyed on `(category, cadence)` so overriding a monthly line cannot silently discard a yearly default. |
| **Test-harness gaps this exposed** | `INDEXES` is now exported, because `openTestDb` was building tables without the constraints the app runs on — it accepted data the app can never produce. `schemaFixes.test.ts` declares "the subset the fixes touch" and had to grow `created_by`/`group_member`. And the new fix must be **appended**, not prepended: that suite pins that a failing fix leaves nothing marked applied, which jumping the queue broke. |
| **A duplicate caught late** | `addGroupMember`/`removeGroupMember` were written in `groups.ts` before noticing `persons.ts` already had `addMemberToGroup`/`removeMemberFromGroup` with audit logging wired. The duplicates were deleted and the originals gated instead. |

**Still V3**, because both need a second device: publishing a budget to members, and another
person accepting a role or seeing their override. Per-member budgets set *by* an admin are out
for the same reason — a number nobody agreed to or can see is worse than no number.

### Shipped 2026-08-12 — one budget rollup, one spend window, one Reports basis

`0880152`

Checklist §0 items 0.6 / 0.7 / 0.8, which had been parked on three product decisions. Those
were made: **a budget rolls up only, never down**; **"spent" is what happened, not what is
scheduled**; **Reports is my-share**.

| Item | Detail |
|---|---|
| **The rule** | A budget line is a **rate** or a **pool** *relative to the headline being shown* — not a property of its cadence. At target period T, a cadence at or finer than T rolls up (`daily × real days in that month/year`, `monthly × 12`); anything coarser is a pool, reported separately and never divided down. ₹24,000/yr for Trips is not ₹2,000/month: a trip spends the pool in one month, so ÷12 would report "over budget" in exactly the month the money was meant to be spent. `src/lib/rebalance.ts:46` already worked this way; the rest of the app now agrees with it. |
| **`analytics.ts` — the one that was on no list** | `totalAllocated` summed raw amounts across cadences while `totalSpent` summed each line's spend **in its own window** (daily → today, monthly → this month, yearly → this year), and `utilizationPct` divided one by the other. Not a wrong percentage — not a percentage. It fed the group Budget tab, Reports, the Groups list, Home's health engine and the Plan forecast, where a large annual budget made a *monthly* forecast look comfortably funded. Both halves now come from one target window, restricted to rate lines: excluding the allocation while keeping the spend would have inflated utilisation instead of fixing it. |
| **`monthlyBudgetTotal`** | Filtered to `cadence === 'monthly'`, so it correctly dropped yearly pools but silently dropped **daily** lines too — a ₹500/day budget contributed nothing to the figure the month-end projection is compared against. Now the monthly rollup. |
| **Pools stay visible** | `budgetEquivalent` returns `null`, never `0`, so a caller cannot silently drop a pool into a sum; `rollUpBudgets` returns `pooled` + `pooledCount`. The group Budget tab and its section headers name what they left out ("plus ₹24,000 in 1 yearly budget") rather than presenting an incomplete total as complete. |
| **Nine sites, not five** | `budget.ts`, `analytics.ts` (×2), `savings.ts` (a private copy that divided yearly by 12), `homeData.ts`, `insightsData.ts`, `useSavingsTab.ts`, `app/group/[id]/budget.tsx`, `app/category/[name].tsx` (flattened every cadence to a per-day rate and prorated back out — downward proration in both directions). |
| **0.8 — spend windows** | `windowForCadence`, `analytics.currentWindow` and `homeData`'s month window now end at `now`. `cashQuery` (`t.date <= ?`) and `insightsData` were already correct. Future-dated commitments already had a home in `upcomingBills` (`getAffordSnapshot`), so nothing was lost — it moved to the surface that means it. |
| **0.7 — Reports basis** | Six sites in `reportsData.ts` summed every member's share while every other surface summed mine, so one month read ₹95,000 on Reports and ₹40,000 on Home with nothing explaining the gap. All six now use `myShareOf` / the new `myIncomeOf` (`lib/splitMath.ts`) — income is attributed by who received it, expenses by who owes a share, so the two kinds read different tables and are not collapsed into one call. Per-group budget *utilisation* stays group-scoped: that is **D1**, still open. |
| **A latent test flake** | `homeData.test.ts` seeded fixtures at **midday today**, which only worked because windows ran to end-of-period. With windows ending at `now`, the suite passed after lunch and failed before it. Fixtures now use a moment already past. |
| **A test helper that made a bug untestable** | `setCategoryBudget` wrote the cadence into the legacy `period` column, which is `CHECK(period IN ('monthly','yearly'))` — so **no test could ever create a `daily` budget**. It now mirrors `setCategoryBudgets`: `period` constant, `cadence` its own column. |

Suite 1255/1255 across 79 files; `tsc` clean. New: `budgetRollup.test.ts` (full target × cadence
matrix), plus window and utilisation cases in `budget.test.ts`.

### Shipped 2026-08-11 — the zero-decision half of the launch checklist

`e0fdd32` · `a522d77` · `ced6264` · `4f17652`

Everything in `V2_LAUNCH_CHECKLIST.md` §0 and Tier 1 that needed no decision. Suite went
1237/1237 across 78 files; `tsc` clean. Each fix has a test that reproduces the bug first.

| Item | Detail |
|---|---|
| **Recurring pause/resume (0.3)** | Pause stamped `recur_end = now`, destroying the user's own end date — there is no second copy — and resume set it `NULL`, so a bounded rule became immortal. `recur_state` alone already gates materialization. New `txn.recur_paused_at`; resume writes the dormant window into the existing `recur_skip` ledger instead of back-posting it (a 60-day pause on a daily ₹300 rule posted 60 rows). |
| **Month-end recurrence walk-back** | `advance()` stepped off the *previous* cursor, so `addMonths`' clamp compounded: 31 Jan → 28 Feb → **28 Mar** → forever, and a yearly 29 Feb rule collapsed after one leap year. Replaced by anchor-based `occurrenceAt(startMs, freq, interval, n)`; all four steppers (`materializeInstances`, `nextOccurrenceOnOrAfter`, `occurrenceDatesUpTo`, `nthOccurrenceMs`) now share it. |
| **Discarded recurring edit** | `splitRecurringSeries` returning `null` was thrown away and followed by `haptic.success(); router.back()`. Now alerts. The split also silently dropped the series' `tags` and receipt — both are passed through. |
| **Recurrence end ≤ start** | Fell through to `undefined`, which does not mean invalid — it means *never ends*. Now refused with an alert. |
| **Itemized edit re-dated the bill** | `useItemizedForm` hardcoded `date: Date.now()` on update as well as insert, so a July bill corrected in August left July's totals and charged August. The form now carries `txnDate`, loaded from the row. |
| **Category rename/delete kind-blindness** | The catalog is `UNIQUE(name, kind)` and `Rent`/`Other` are seeded as **both** expense and transfer, but both writes propagated by name alone — renaming transfer-`Rent` relabelled every *expense* Rent txn to a name the expense catalog lacked, folding them into Others and leaving that budget reading ₹0 spent forever. Both scoped through a new canonical `TXN_KIND_FOR_CATEGORY`; budgets are expense-only. |
| **Deleted seeded categories resurrected** | `seedGlobalCategories` runs on every `openDB`, so the category came back while its budget — deleted alongside — stayed gone. New `category_tombstone (name, kind)`; re-creating by hand clears it. |
| **`deleteGroup` orphaned `pending_txn`** | Rows drafted into a deleted group became permanently un-committable and sat in Review forever. Now reset (`dest_group_id`, `split_draft`, `counterparty_id`) rather than deleted — the row is a real unreviewed import; only its destination died. |
| **Direction-blind "All groups" settlement** | `planAllGroupsSettlement` ranked purely by amount, so a payment could land in the one group where *they* owed *you*, inflating the balance it was meant to clear. The global net still netted out, which is why nothing surfaced it. Now ranks only groups running `from → to`, with a largest-balance fallback so a genuine prepayment is still recorded. **The suite pinned the bug** — one existing test asserted the old behaviour and was rewritten. |
| **Backup indicator lied** | Enabling the backup *reminder* stamped `backup_anchor_at`, which is the key the Settings row read as "Backed up just now". Split into `last_backup_at`, written only by a completed export or restore. |
| **Two forecast models (0.9)** | Contradicts the "one `forecast` model" line under *Shipped earlier* below — that consolidation missed `insightsData.ts`, which kept a naive `(monthSpend / dayOfMonth) * daysInMonth` for the hero while the chart badge ~100px away used the credibility-weighted `forecast.ts`. Both now read `forecastMonthEnd`, computed once. |
| **Non-deterministic savings insights** | `generateInsights` jittered scores with `Math.random`, reshuffling the set on every pull-to-refresh. Seeded on the candidate's own text plus the day number: stable within a day, still rotates daily. |
| **Goals engine** | Completed goals were raidable (the filter checked `locked` and `saved > 0`, never `saved >= target`). `reorderGoals` wrote `0..n-1` for only the *active* goals it was handed, leaving completed ones with stale values interleaved in what is a single ranking — now a total permutation. And before any drag every goal sits at `sort_order = 0`, so the stable sort made the newest goal both funded first *and* raided first; ties now break in reverse for the raid, restoring the mirror. |
| **UI** | Raid prompt shows ₹ per goal (`withdrawals` always carried it) · Goals uses `useContentInset({ fab, tabBar })` so the FAB stops covering the last card · `FChip`'s `maxWidth: 160` cap removed (the row already wraps) · `PrimaryButton` truncates at one line, so a long label can no longer break the fixed 52pt height · QR-from-photo via `scanFromURLAsync` + `expo-image-picker`, both already installed — `src/lib/qrFromImage.ts`, shared `PickQrFromPhotos`, wired into both scanners. |

**Still open in §0, and only these:** 0.6 (monthly-budget cadence) and 0.7/0.8 (spend basis +
month window). Both need a product decision, not effort. Two Tier-1 items also remain —
backups exclude photos, and app lock has no failure path.

### Shipped 2026-07-29 — receipt OCR revival + encrypted backup/restore

| Item | Detail |
|---|---|
| [lib/ocr.ts](../src/lib/ocr.ts) revived, no longer unused | Was parked `@deprecated` (on-device OCR read only a single total, not line items) — removed from Won't-fix, it's not "won't fix" anymore. Gained a tuned regex line-item heuristic, then a swappable provider factory (`src/lib/ocrProviders/`): `device` (Apple Vision + the heuristic, free/offline) and `gemini` (**the default** — sends the photo directly to a free-tier vision model, avoiding the on-device path's column-scrambling failures on two-line item layouts). `gemini` is the app's **first-ever network call**, routed through a small serverless proxy (`server/receipt-ocr-proxy/`) that holds the API key server-side — never shipped in the app bundle. A raw-text debug panel and a full-screen scanning overlay ship alongside it. |
| Encrypted backup/restore | New `src/lib/backup.ts` + `app/settings/backup.tsx`: passphrase-encrypted whole-DB export/import via the OS share sheet. Whole-replace restore (wipe + reinsert), not a merge. Passphrase is user-typed and never stored on-device — forgetting it makes that backup permanently unrecoverable, the deliberate tradeoff for surviving a lost phone. |
| New "Service Charge" adjustment type | Itemized bills' Tax/Tip/Discount adjustments gained a 4th type, added in the same pass as the OCR work (receipts commonly print a separate mandatory service charge alongside tip). |

### Pass 4 — the two decision-blocked audit clusters (2026-07-28)

| Item | Detail |
|---|---|
| **DEBT-03 / S-04 / S-14** — two personal screens | `/personal` is canonical. `group/[id].tsx` forwards `is_personal` via `router.replace`, so old deep links resolve instead of breaking. `/personal` gained the capabilities only the group variant had (swipe edit/delete via a generalized `useGroupTxnActions`, FAB, audit log, overflow menu). `GroupHero`, `BudgetTab` and `TransactionsTab` — all single-caller — lost their `isPersonal` branches; `computePersonalMonthSpend` lost its last caller and was deleted with its test. **The audit's nav claim was wrong**: it said "every other deep link" pointed at the group variant; there was exactly one (`insights.tsx`). |
| **F-27 / ISS-04 / FLOW-01 / §4.6** — persona stored, never read | New pure `lib/personaDefaults.ts`: intent → a **sparse** flag patch, with only deviating keys persisted (writing all of them would freeze every flag at day-one values and make future `DEFAULTS` changes unreachable). 15 tests. `FeatureFlagsProvider` gained `reload()` — it mounts above the onboarding gate, so without it the answer wouldn't apply until the next cold start. The `people` step is skipped for the personal-only persona in both directions. |
| **New: `splitting` flag** — the persona had nothing real to switch | Found while wiring the mapping: none of the 12 keys touched groups/owe-owed/splitting and the tab bar had no gating, so two different personas produced near-identical apps. A 13th key now gates the Groups tab (slot 2 becomes Personal), the Home owe/owed strip, the split-only first-run tiles and the Transfer kind. **"Group Splitting" is no longer a Core pillar** in Feature Management. Turning it off while holding unsettled balances names the group count and the amount first — otherwise money you're owed would silently vanish from every screen. |
| **DEBT-12** — `Onboarding.tsx` 793 L, split commit | Both halves. `setMoneyProfile` folded into `finalizeOnboarding` (one commit point). State/stage-machine/commit → `src/hooks/useOnboardingForm.ts`; the screen is **0 `useState` / 0 `useRef`**, 691 L of JSX + `StyleSheet`. ⚠️ `LogoAssembly.tsx` and the `stage === 'hero'` block **verified untouched** — no hero lines in the diff. |

### Caught stale on 2026-07-28 — listed as open in the archived docs, already done in code

These were carried as open work and are verified fixed. This is why rule 4 exists.

| Was listed as | Actually |
|---|---|
| 4 missing DB indexes | All present — [schema.ts:371-383](../src/db/schema.ts#L371) |
| `nextOccurrence` duplicated in `recurring.tsx` | ⚠️ **This row was wrong when written** — every *other* caller imported the library, but `app/group/[id]/recurring.tsx` still carried its own copy of the walker, which is the one file the row named. Caught by AUDIT DEBT-05 / DRIFT-13 and fixed for real on 2026-07-28: the screen now composes [recurrence.ts:44](../src/lib/recurrence.ts#L44) and only keeps the paused/ended check and skip-stepping the library doesn't model. A reminder that rule 4 applies to this table too. |
| `quick.tsx` monolith (1250 LOC) | Extracted — 7 `useState`, out of the top 25 |
| `group/[id].tsx` monolith (1125 LOC) | Now 310 LOC |
| `edit.tsx handleSave` silent failure | Has `try/catch` + `Alert` + `finally` — [edit.tsx:63-82](../app/group/[id]/edit.tsx#L63) |
| No max-amount/overflow guard in `money.ts` | `MAX_INT_DIGITS` / `MAX_PAISE` + clamping — [money.ts:120-148](../src/lib/money.ts#L120) |
| Missing `maxLength` on group + goal names | Both present — [GroupForm.tsx:62](../src/components/finance/GroupForm.tsx#L62), [savings.tsx:374](../app/%28tabs%29/savings.tsx#L374) |
| Missing `AmountInput`, `RecurrenceEditor`, `GroupPickerSheet`, `LocationRow` | All built — `add/AmountField.tsx`, `add/RecurringControls.tsx`, `add/DestinationSheet.tsx` (which replaced `GroupSelector.tsx`), `add/LocationRow.tsx`. (`income.tsx`, the other half of each cited pair, no longer exists.) |
| `add/quick.tsx` has no error handling | Handled in [useAddTxnForm.ts:256-380](../src/hooks/useAddTxnForm.ts#L256) — `try/catch` + `Alert` on every write path |

### Fixed during the 🔴 paydown (2026-07-28)

| Item | Detail |
|---|---|
| **K10 — CSV export corrupted quoted fields** | `buildReportCsv` escaped `"` in the note but **not** in the group name or category, so a group called `Trip "2026"` exported as broken CSV with shifted columns. Found by a new test. Fixed by routing every quoted field through one `csvQuote` helper — now the single inverse of `splitCsvLine` in [importParse.ts](../src/lib/importParse.ts), replacing a duplicate escaper in `groupExport.ts`. |
| **U1 — `afford.tsx` swallowed load failures** | Its loader caught errors into a zeroed snapshot, rendering "₹0 available" — telling the user they can't afford anything, as fact. Now propagates to `ErrorState`. |
| **Test infrastructure** | New in-memory AsyncStorage mock (`__mocks__/asyncStorage.js`) unlocked testing for the three settings stores. |

### Shipped earlier (see archived docs for detail)

Zustand store trimmed · `lib/settings.ts` single prefs store · feature-flag defaults deduped ·
N+1 split loader batched · atomic `splitRecurringSeries` · `deleteCategory` budget-orphan fix ·
one `recurringMonthlyEquivalent` · one `forecast` model (**incomplete — `insightsData.ts` was
missed; finished 2026-08-11**) · one `budgetHealth`/`utilLabel` ·
`recordSettlement` single write path · `Card.tsx`/`settle.tsx`/`computeNet` deleted ·
central `src/theme` module · Phase 0–3 screen migrations to `useScreenData`.

---

## Known intermittent: chained `test:calendar` suite-load flake

`npm run test:calendar` spawns `jest` seven times in a row (one per `FAKE_TODAY`). **Three times
now**, one **randomly chosen** suite has failed at *load* time in the middle of that loop —
`txnInvariant.test.ts` twice, `financialHealth.test.ts` once — reporting a suite failure while
the remaining suites pass and the test count drops by exactly that suite's size.

The third occurrence (2026-08-09) added the missing detail: the worker was killed by
**`SIGSEGV`**, reported as *"A jest worker process was terminated by another process"*, with
**0 tests failing**. That is a native crash in the runner, not a failed assertion — which
confirms the diagnosis below rather than pointing at app code.

Neither has ever reproduced: the same date runs 884/884 in isolation, three times consecutively,
and a repeat of the full seven-date matrix comes back green on all seven. Different suite each
time, load-level rather than assertion-level, and only under repeated jest invocation — which
points at the runner (worker/haste-map reuse across back-to-back spawns), not at app code.

**If you hit it:** re-run the single date directly before believing it. It is recorded here so
the third occurrence isn't mistaken for a new regression — and so that if it ever *does*
reproduce, this is the note to delete.

---

## Deferred by the voice-capture + storage change (2026-08-09)

Found while building hands-free voice capture and the storage safeguards. Recorded rather than
fixed, each for a stated reason.

| Item | Why it's deferred, not forgotten |
|---|---|
| **Attachment files orphan on delete** | `softDeleteTxn` ([transactions.ts](../src/db/queries/transactions.ts)) and `updateItemizedTxn` never unlink the receipt file, and `avatar.ts` writes a new timestamped image on every pick without removing the old one. **Unlinking on delete would be wrong**: a soft-deleted transaction is restorable through the Undo toast, so deleting its photo would silently break restore. The correct fix is a reaper over rows deleted more than N days ago — its own change, with its own tests. Mitigated meanwhile by **Delete all receipt photos** and **Clear cached exports** on `settings/storage.tsx`. |
| **`expo-file-system/legacy` may already be broken** | `avatar.ts` and `ocrProviders/gemini.ts` still call the legacy API, while [pdfjsCache.ts](../src/lib/pdfjsCache.ts)'s own comment states *"the legacy readAsStringAsync/downloadAsync throw at runtime in SDK 56."* Either that comment is wrong or those two paths are dead. Untested either way — jest stubs the module. Worth a device check. |
| **No background drain** | Voice captures are filed at launch and on every foreground, which covers the realistic cases without a native dependency. `expo-background-task` would make it opportunistically sooner, at the cost of a new native module and an OS-scheduled path that fails silently. Not worth it until the file capture is proven in daily use. |
| ~~`VOICE_SHORTCUT_URL` is null~~ | **Closed 2026-08-09.** Both shortcuts authored and shared; each command in `VOICE_COMMANDS` now carries its own `installUrl`, and the manual steps moved behind a disclosure as the fallback. ⚠️ Editing a shortcut invalidates its link — Apple keeps serving the shared version, so a re-share needs the constant replaced. |
| ~~Shortcuts→Documents write is unverified~~ | **Closed 2026-08-09** — the Shortcut's *Save File* destination picker reaches `On My iPhone → BudgetSplit → voice-inbox` on device, and captures are filed. `Subpath` is relative to that destination and cannot navigate to it, which was the one real trap. |
| **The two iCloud links are unverified on a second device** | They resolve for the phone that authored them. Whether a shared link installs cleanly *elsewhere* — specifically whether the *Save File* destination, a bookmark into one device's container, re-resolves — is untested. If it doesn't, each new user re-picks the folder once. The **two-way** command (`Add expense`) has no folder at all and is portable for certain, which is the reason both are offered. |
| ~~The install link is null~~ | **Closed 2026-08-10.** One shortcut (`budget`), one deep link, one live URL in `VOICE_SHORTCUT_URL` — down from three, which is most of the reason for collapsing them. ⚠️ Editing the shortcut still invalidates the link: rebuild → import → re-share → replace the constant. That round trip has now cost four passes; check the constant is current before believing any setup bug report. |
| ~~`VOICE_SHORTCUT_URL` is null~~ | **Closed 2026-08-10.** Rebuilt for **"Please log"**, re-shared, constant live. Two words on purpose: a lone common noun competes with Siri's own intents and that failure is silent. |
| **The shared shortcut is named `please-log`, not `Please log`** | A `.shortcut` plist has no name field — iOS reads the name off the *filename*, and `build-shortcuts.ts` was slugging it, so a hyphen landed in the middle of the wake phrase. The script now writes the name verbatim, but the live link was minted from the old file and Apple serves what was shared. Harmless if Siri hears "please-log" as two words; if it doesn't, rebuild and re-share — do **not** change `VOICE_ONE_WAY_NAME` to match, because a hyphen cannot be spoken. |
| ~~`WFCondition: 100` is unverified~~ | **Closed 2026-08-10 — but the code was never the whole story.** `100` = *has any value*, confirmed against real exported shortcuts. What that check missed: the code only takes effect alongside a `WFInput` shaped `{Type: Variable, Variable: <attachment>}`. We emitted the bare attachment a *text field* takes, so the If rendered with an empty Condition chip and matched nothing. Now built by `conditionInput()` and pinned by a test. |
| ~~Raw dictation spliced into the deep link~~ | **Closed 2026-08-10.** The URL action took `Provided Input` directly, on the reasoning that speech has spaces but no `&`/`#`. That missed `%` — "fifty percent off" dictates as `50%`, making `q=50% off` a *malformed escape*, which parsers reject rather than pass through. Apple's guidance is blunter than the reasoning was: never put unencoded user text in a URL. Now `is.workflow.actions.urlencode` (`WFEncodeMode: Encode`) sits inside the If and the URL binds to *its* output. `useLocalSearchParams` decodes on the way in, so nothing double-decodes. Pinned by a test asserting the URL's attachment is the encode UUID and **not** the ask UUID. |
| **⚠️ `VOICE_SHORTCUT_URL` is null** | Every link shared so far carried the blank-condition If, so the shortcut could only ever reach its Otherwise branch. Nulled rather than left live. Rebuild → import → **open it in the Shortcuts editor and read the If row** → share → paste. |
| ~~`Dismiss Siri` is unverified on device~~ | **Removed 2026-08-10.** Its real name is *Dismiss Siri and Continue* — it tears the interface down and keeps running, talking over the "Nothing logged" line, which is the one ending that must be heard. Reaching the end of a shortcut closes Siri on its own, after the speech finishes. |
| **Voice auto-save has no off switch** | A confident phrase now posts itself and lands on the new transaction. The guard is Undo (`showUndo` in `add/quick.tsx`) plus the duplicate prompt, which still fires. There is deliberately no feature flag — `flags.voiceAutoSave` would mean touching `featureFlags`, `personaDefaults` and the features screen for a behaviour that is already one tap from reversible. Add one if auto-save turns out to misfire in practice. |
| **Kind detection is unverified on real speech** | `detectVoiceKind` decides expense / income / transfer from the phrase, which is what makes one command possible. It is unit-tested against the shapes people say, but never against actual dictation output. It is allowed to be wrong — the form opens showing its guess and the kind pills are on screen — but a systematic miss (e.g. `en-IN` returning something unexpected for "salary") would be worth catching. |
| ~~`Save File`'s destination cannot be generated~~ | **Moot 2026-08-10.** It was a per-device security-scoped bookmark that could not survive sharing, so every installer had to re-pick a folder and, when they got it wrong, nothing arrived — silently, forever. Deep links have no folder and nothing to configure. The cost is that the app now comes to the front for every capture. `voiceDrain` is kept as the legacy path (captures may already be on disk, and it is the only silent one) but nothing writes to it any more. |
| **Truly hands-free needs App Intents** | Deep links mean the app opens every time; file capture meant a setup wall that failed silently. Only App Intents gives zero setup *and* no app launch — plus Siri reading balances back, and single-utterance entry. Costs a paid Apple team and native Swift. Chosen consciously on 2026-08-10: deep links now, App Intents later. |
| **Income and settle by voice are built but untried** | `useAddTxnForm` has always seeded `kind` from a param, so `?kind=income&q=…` needed no new code — but no shortcut has ever sent one. The parse → `applyVoiceDraft` → Income/Transfer form path is covered by unit tests and has never run on a device. The settle path in particular depends on `parseVoice` matching a person by first name, which needs real contacts to be worth anything. |
| **Single-utterance Siri entry is not possible with Shortcuts** | *"Hey Siri, log expense four fifty groceries"* in one breath needs **App Intents** with a parameterised phrase — native Swift, an App Group, and a paid Apple team. Even there, Apple's own forums report inline parameters falling back to a prompt ([thread 778519](https://developer.apple.com/forums/thread/778519)). Shortcuts gives two beats: the command, then the dictation. Revisit only alongside the App Intents work. |

## Deferred by the Add-polish + Transfer change (2026-08-09)

| Item | Why it's deferred, not forgotten |
|---|---|
| **`add/quick.tsx` keeps a container `gap`** | AGENTS §3/§12 say a `SectionHeader` must not sit under a scroll-container `gap`, because the two margins add up — which is exactly the 40px found under Split. Fixed at the header (`first`) rather than by removing the gap, because removing it re-spaces all nine blocks on the screen and risks the same class of regression as the `ComingUpList` de-clutter. The gap should go, with each block given its own margin, as its own change. |
| **`TransferBody` lives outside `finance/add/` and mounts its own sheets** | It sits in `components/finance/` unlike every other Add component, and mounts `UpiUriSheet` + `RequestQrSheet` from local state — breaking the one-overlay-at-a-time invariant that `QuickAddSheets` exists to enforce. Both are moves, not behaviour changes, so they belong in a commit where a regression is attributable. |
| **Transfer has no `DetailChips`** | No tags, receipt, time, location or repeat on a transfer, and its note is a bespoke `TextInput` writing a *different* field (`transferNote`) from every other kind (`note`). Pay method is a third control again — a horizontal scroller here, a chip → sheet elsewhere. Consolidating means deciding which fields a settlement legitimately has, which is a product question, not a refactor. |
| **A mid-phrase lone numeral is ignored; a leading one is not** | `parseVoice` refuses a single bare numeral mid-sentence (transliterated Hindi makes "do"/"char" homophones), but a phrase *starting* with one is still read as the amount — so "do you have change" is ₹2. That leading rule is what makes "450 groceries" work, so tightening it costs more than it saves. Covered by a test that documents the limit rather than asserting it away. |
