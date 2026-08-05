# BudgetSplit — Codebase Audit

> ## ⚠️ Dated record — parts of this describe a state that no longer exists
>
> **This file is evidence of what an audit found on 2026-07-28, not a description of the app
> today.** Its findings are deliberately left unedited: rewriting them would destroy the before/after
> that makes the audit worth keeping. Read it as history.
>
> Known superseded claims, as of **2026-08-05** (Waves 1–3):
>
> | Says here | Actually now |
> |---|---|
> | `affordCheck` is **off by default** (§F-28, §4.3 flag table) | **On.** The engine grew past a cash check in `V2-32`; defaulting it off is why nobody found it |
> | The flag table lists **12 keys**, incl. `forecast`, `dashboardInsights`, `savingsInsights`, `reportsDonut`, `reportsTrend` | **15 keys.** Those five gated chart *fragments* and were deleted; six real surfaces (`itemized`, `upiSettle`, `insights`, `reports`, `receiptScan`, `importReview`) gained keys |
> | `smartCategory` is **off by default** | **On** — it only ever suggests, and a miss costs one tap (`V2-19`) |
>
> **The live sources are [`FEATURES_AND_FLOWS.md`](./FEATURES_AND_FLOWS.md) §14 (flags) and
> [`DEBT_TRACKER.md`](./DEBT_TRACKER.md) (open debt).** `sourceCounts.test.ts` keeps the flag count
> in those honest; it deliberately does **not** read this file, precisely because this one is allowed
> to be out of date.

> **Read-only audit.** Derived from the code as it exists on branch `refactor/phase-1-perf-safety`
> (HEAD `95e88ca`) on 2026-07-28. Nothing here was copied from the other docs in this folder —
> sections 1–9 were written from source only. §10 records where the pre-existing docs disagree
> with what the code actually does.
>
> This file is meant to be **groomed by hand**. Every item carries a stable ID so it can be
> referenced individually in later work.
>
> **2026-08-04:** §2 (screen inventory) and §3 (user flows) moved to
> [FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) — one behaviour doc instead of two. The
> `S-XX` / `FLOW-XX` IDs are unchanged and still resolve; only their home changed. Everything
> else here is as taken on 2026-07-28.

### Changes since the audit was taken

> **This audit has been actioned.** The findings below were triaged in
> [TAGS.md](./TAGS.md) — one line per ID — and worked through in three passes on 2026-07-28.
> **TAGS.md is the authoritative per-item status; this file is the reasoning behind each
> finding.** Resolved items are annotated inline (`✓ RESOLVED`) and every count in the prose
> below has been refreshed, so nothing here contradicts the code. Where an item was investigated
> and turned out **not** to be a defect, that is recorded too — those are as useful as the fixes.
>
> Nothing tagged `IMPROVE` remains: 56 items resolved, 5 reclassified as by-design, 18 deferred
> with a stated reason, 1 (F-31) awaiting product input.
>
> **Pass 4 (2026-07-28) closed 7 of those 18 deferrals** — the two clusters that needed a product
> decision from the owner rather than more analysis. See the Pass 4 table below.

**Pass 1 — behaviour, dead configuration, security**

| Was | Outcome |
|---|---|
| **ISS-01** — six legacy data fixes re-ran on every launch, silently undoing user edits (a recreated "Subscriptions" category was deleted again on next start) | Declared as data in `ONE_TIME_FIXES` and applied by `applyOneTimeFixes` (`src/db/schema.ts`), each guarded by its own key in the `settings` table — the mechanism `category_global_v1` already used. A failure leaves the key unwritten so the fix retries. Locked in by `schemaFixes.test.ts`, which runs the real SQL twice against an in-process SQLite. |
| **ISS-06** — `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` never declared, so iOS would **crash** rather than deny on the first receipt photo | Added to `ios.infoPlist` and, canonically, via the `expo-image-picker` config plugin, with `microphonePermission: false` so no unjustified `RECORD_AUDIO`. Verified with `npx expo config --type introspect`. |
| **ISS-02 / DEBT-09** — 11 of 19 feature flags gated nothing; 5 were live switches | `healthScore`, `savingsInsights`, `reportsDonut`, `reportsTrend` now gate their surfaces. The 7 with no UI at all were deleted. `FeatureKey` is **12 keys, every one gating something and every one visible in the Features screen** — asserted by `featureFlags.test.ts`, which scans the source. |
| **ISS-08** — archiving a group logged `action: 'deleted'` | New `'archived'` action, and the audit-log label now derives from entity + action, so a group archive no longer renders "Expense deleted". |
| **ISS-09** — `deleteGroup` orphaned audit rows and receipt files | Both cleaned. `deleteGroup` returns the orphaned URIs for the caller to unlink, keeping `db/queries` free of native file IO. |
| **ISS-11** — flags flashed before loading; `ready` had no consumer | `FlagsGate` holds the branded loader until flags resolve. |
| **INT-08 / DEBT-10** — remote pdf.js executed with no integrity check | SHA-256 pinned and verified on download *and* on every cache read; the CDN `<script>` fallback carries an SRI hash. An integrity failure refuses to run rather than falling back to the same unverified bytes. |
| **BL-05** — `rawDebts` diverged from `simplify` by rounding | Slices now allocate with carried remainders so **both** margins are exact (each share fully spent, each payer credited what they fronted). Pinned by a 200-case randomised property test. |
| **BL-31 / DEBT-05** — duplicated `nextOccurrence` | The group screen composes `lib/recurrence`; only the paused/ended check and skip-stepping remain local. |
| **ISS-10 / ISS-13 / ISS-14 / DEBT-15** — dead `is_demo` columns, unrendered imports, placeholder email | All removed, including the placeholder in `seed.ts` and `seedDemo.ts`, not just the migration. |

**Pass 2 — the remaining triage**

| Was | Outcome |
|---|---|
| **BL-18 / DEBT-08** — two coexisting budget-rollover semantics | The legacy path was **unreachable**: nothing ever writes `budget_group.limit_*`, so `limit` was always null. Its one caller computed the result and discarded it without rendering. `getBudgetUsage`, `getSpentInRange`, `getPriorPeriodRange` and `BudgetUsage` deleted. |
| **BL-11 / DEBT-14** — the `recur_freq IS NULL` invariant held only by convention | `txnInvariant.test.ts` scans every `FROM txn` statement in `db/queries` and requires the filter, an explicit rule-row intent, or a commented allowlist entry. **It immediately found two live violations** — `getUncategorizedNames` and `getCategoriesByFrequency` were counting recurring rule templates as spend. Both fixed. |
| **BL-33 / ISS-05** — `monthlyIncome` / `payday` written, never read | Storage removed. The seeded salary rule already records both, and the afford engine derives income from actual transactions. |
| **INT-04** — the test-notification error was swallowed | `sendTestReminder` already returned a typed reason; the caller was discarding it and showing "Sent!" regardless. It now reports denied vs. unavailable. |
| **DEBT-07** — the screen-data assemblers were untested | New `__tests__/helpers/testDb.ts` presents the expo-sqlite async surface over `node:sqlite`, so `db`-taking code can be tested for real against the real schema. `homeData`, `reportsData`, `insightsData` and `analytics` now covered (29 tests). |

**Investigated, not a defect**

| Finding | What the code actually says |
|---|---|
| **ISS-12** — "an unbalanced `exact` split can reach the DB" | Overstated. `canSave` already required `remainder === 0` and `handleSave` returns early on `!canSave`. The rule was consolidated into one `validateShares` helper shared with the Review path, plus a guard at the write boundary — but no such expense could be saved. |
| **BL-08** — "the remainder can over-settle the smallest group" | An overpayment has to land somewhere, and a test named *"puts an overpayment remainder on the last ranked group"* pinned this deliberately. The real inconsistency was the doc comment claiming "largest" while code and test said smallest; the comment was corrected. |
| **F-30 / DEBT-04** — location tagging uses a different store | By design. The toggle must **await** an OS permission result and refuse to enable if denied; feature flags are optimistic and cannot fail. Folding it in would make the flag API async for one case. |
| **DEBT-13 / DEBT-16** — oversized files, two token import paths | Already standing `AGENTS.md` policy (extract opportunistically; prefer `src/theme` in new code), not scheduled work. Recorded in `DEBT_TRACKER.md`'s won't-fix table. |

**Pass 4 — the two deferred clusters that were waiting on a product decision**

Both were tagged `DEFER` because they needed an owner call, not more investigation. The calls were
made on 2026-07-28 and both clusters are closed.

*Cluster 1 — which personal screen is canonical (S-04 · S-14 · DEBT-03).* Decision: **`/personal`
wins**, matching the spec locked in `PERSONAL_REDESIGN.md`. Two corrections to the audit came out
of doing it:

| Was | Outcome |
|---|---|
| **DEBT-03** — "two screens render the personal group; every other deep link routes to `/group/{personalId}`" | The nav claim was **overstated**: exactly *one* site navigated there (`insights.tsx`, the "See what to cut" CTA). Every other `personalId` reference is a data filter. `/group/[id]` now forwards `is_personal` to `/personal` with `router.replace`, so older deep links still work rather than breaking. |
| **S-14** — tagged `KILL` as "duplicates the personal variant of S-09" | Inverted: the **S-09 branch** was the duplicate. `/personal` keeps the unified cross-group Activity, the my-share global budget and the grouped Recurring tab; it gained the capabilities only the group variant had (swipe edit/delete, FAB, audit log, an overflow menu). `group/[id].tsx` lost its `isPersonal` branching entirely, and so did `GroupHero`, `BudgetTab` and `TransactionsTab` — all single-caller. `computePersonalMonthSpend` lost its last caller and was deleted with its test. |

*Cluster 2 — the onboarding persona (FLOW-01 · F-27 · ISS-04 · DEBT-12).* Decision: **give the
persona something real to switch**, not just a re-shuffle of existing flags.

| Was | Outcome |
|---|---|
| **§4.6 / ISS-04 / F-27** — the persona was stored and never read, so all three answers produced an identical app | New pure `src/lib/personaDefaults.ts` maps intent → a **sparse** flag patch (sparse so a flag added later doesn't silently inherit a per-persona opinion, and so `DEFAULTS` stays the single source for anything a persona doesn't name). Applied inside `finalizeOnboarding`; only keys that actually deviate are persisted, otherwise every flag would freeze at day-one values. 15 tests. |
| **The flag set could not express the persona's main promise** | Found while wiring it: none of the 12 keys touched groups, owe/owed or splitting, and `(tabs)/_layout.tsx` had four hardcoded tabs with no gating — so "Track my own spending" and "Split with people" would still have produced near-identical apps. Added a 13th key, `splitting`, the one flag that changes the app's *shape*: off hides the Groups tab (slot 2 becomes Personal), the Home owe/owed strip, the split-only first-run tiles and the Transfer kind in Add. **"Group Splitting" stopped being a Core pillar** in the Features screen — a Core badge over a switchable module is a promise the app no longer keeps. |
| **FLOW-01** — persona had no effect on the flow either | The `people` step is now skipped for the personal-only persona, in both directions, and the progress dots stop counting it. |
| **DEBT-12** — `Onboarding.tsx` 793 L, ~15 `useState`, commit split across two files | Both halves closed. `setMoneyProfile` folded into `finalizeOnboarding`, so "what does onboarding persist?" has one answer. State/stage-machine/commit moved to `src/hooks/useOnboardingForm.ts`; the screen is **0 `useState`, 0 `useRef`** and 691 L (the remainder is JSX + `StyleSheet`). ⚠️ `LogoAssembly.tsx` and the `stage === 'hero'` block are **verified untouched** — the diff contains no hero lines. |
| **ISS-11's sibling** — the provider loads flags *above* the onboarding gate | So a persona's flags wouldn't apply until the next cold start. `FeatureFlagsProvider` gained `reload()`, called by `OnboardingGate` before it opens. |

One edge case handled that wasn't in the audit: switching `splitting` **off** while holding
unsettled balances would make money you're owed silently vanish from every screen. The toggle now
names the group count and the outstanding amount, and says nothing is deleted, before proceeding.

Verification after every pass: `npx tsc --noEmit` clean, `npx jest` green — **541 tests across 46
suites** as of Pass 4. (The prior counts recorded here and in `DEBT_TRACKER.md` disagreed with each
other; 541/46 is measured, not carried forward.)

## 0. How to read this file

### ID scheme

| Prefix | Means | Section |
|---|---|---|
| `F-XX` | Feature / module | §1 |
| `S-XX` | Screen / route | **[FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) §3** (moved) |
| `FLOW-XX` | User flow | **[FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) §15** (moved) |
| `INT-XX` | Third-party / platform integration | §5 |
| `BL-XX` | Business-logic note | §7 |
| `ISS-XX` | Known issue | §8 |
| `DEBT-XX` | Tech-debt / risk area | §9 |
| `DRIFT-XX` | Doc-vs-code disagreement | §10 |

IDs are **stable and never reused**. If an item is deleted, leave the ID retired.

### Status vocabulary

| Status | Means |
|---|---|
| `working` | Complete path from UI to persistence, no dead ends found |
| `partial` | Ships and is reachable, but a named sub-capability is missing or stubbed |
| `broken` | Reachable but produces wrong or no result |
| `stubbed` | Code exists, not wired to any reachable UI |
| `dormant` | Fully built, deliberately unreachable (waiting on an external dependency) |

### Directories deliberately not audited

`node_modules/`, `ios/Pods/`, `ios/build/`, `ios/BudgetSplit.xcodeproj`, `ios/BudgetSplit.xcworkspace`,
`android/` (Gradle wrapper + generated app shell), `.expo/`, `.expo/types` (generated router types),
`dist/` (build output), `assets/` (fonts + images, no logic), `scripts/gen-icon.js` (one-off icon
generator), `.git/`, `.vscode/`.

Everything under `app/`, `src/`, and `modules/expo-ocr/` was read.

---

## 1. Feature Inventory (F-XX)

**Every feature is free.** There is no premium tier, paywall, entitlement check, purchase
SDK, or `isPro`-style gate anywhere in the codebase. The "gating" column below therefore
records the *feature flag* that hides a surface, which is a user preference, not a
monetization boundary. The `Gate` column reads `always` when nothing hides it.

| ID | Feature | Purpose | Status | Primary files | Gate |
|---|---|---|---|---|---|
| F-01 | **Expense / income entry** | Log a transaction of any kind through one form. | working | `app/add/quick.tsx`, `src/hooks/useAddTxnForm.ts` (417 L), `src/lib/splitMath.ts`, `src/db/queries/transactions.ts` | always |
| F-02 | **Bill splitting** | Equal / exact / percent / shares split among group members, with arbitrary payers. | working | `src/lib/splitMath.ts`, `src/lib/money.ts` (`splitByMode`), `components/finance/add/SplitSheet.tsx`, `PayersSheet.tsx` | always |
| F-03 | **Itemized bills** | Per-item assignment with per-item split mode + tax/tip/discount. | working | `app/add/itemized.tsx`, `src/hooks/useItemizedForm.ts` (308 L), `src/lib/itemized.ts` | always |
| F-04 | **Groups** | Create / edit / archive / delete shared expense groups with members and a default split mode. | working | `app/(tabs)/groups.tsx`, `app/group/[id]*`, `src/db/queries/groups.ts`, `components/finance/GroupForm.tsx` | always |
| F-05 | **Settle up** | Net who-owes-whom down to minimal transfers, optionally scoped per group. | working | `src/lib/settle.ts`, `src/lib/settleScope.ts`, `src/lib/owe.ts`, `src/db/queries/balances.ts` | always |
| F-06 | **Owe / owed exposure** | One netted per-person figure across all groups. | working | `src/db/queries/balances.ts` (`getMyExposure`), `src/lib/owe.ts` | always |
| F-07 | **People / contacts** | Name-only contacts, no accounts, with avatars. | working | `app/friends.tsx`, `src/db/queries/persons.ts`, `src/lib/avatar.ts` | always |
| F-08 | **Category budgets** | Per-category limits with independent cadences (once/daily/monthly/yearly), no rollover. | working | `app/group/[id]/budget.tsx`, `src/lib/budget.ts`, `src/db/queries/categoryBudgets.ts` | always |
| F-09 | **Dashboard** | Period-scoped spend hero, category ranks, balances, forecast. | working | `app/(tabs)/index.tsx`, `src/lib/homeData.ts` (218 L), `components/finance/home/*` | per-section flags |
| F-10 | **Savings goals** | Goals with drag-ranked funding order, manual + scheduled funding, lock, deadline. | working | `app/(tabs)/savings.tsx`, `app/savings/[id].tsx`, `src/lib/savingsEngine.ts`, `src/db/queries/savings.ts` | `savingsGoals` |
| F-11 | **Total Money** | Cash available + investments + available credit, from a manual money profile. | working | `src/lib/cash.ts`, `src/db/queries/moneyProfile.ts`, `components/finance/plan/TotalMoneyCard.tsx` | always |
| F-12 | **Overspend raid** | When cash goes negative, auto-pull from the lowest-ranked unlocked goals, with Undo. | working | `src/lib/savingsEngine.ts` (`planOverspendRaid`), `src/db/queries/savings.ts` (`runOverspendRaid`) | `savingsGoals` |
| F-13 | **Financial health score** | Five independent signals scored into a band with plain-language explanations. | working | `src/lib/financialHealth.ts` (355 L), `components/finance/HealthSheet.tsx` | `healthScore` |
| F-14 | **Spend forecast** | Bühlmann credibility-weighted month-end projection. | working | `src/lib/forecast.ts`, `components/finance/home/ForecastCard.tsx` | `forecast` |
| F-15 | **Insights** | Narrative insights: velocity, category shifts, what-if cut, recommendations, drivers. | working | `app/insights.tsx`, `src/lib/insightsData.ts`, `src/lib/savingsInsights.ts`, `src/lib/analytics.ts` | `dashboardInsights` / `savingsInsights` |
| F-16 | **Recurring rules** | Repeating transactions that materialize into real editable rows, with pause/resume/end/skip. | working | `src/db/queries/recurring.ts`, `src/lib/recurrence.ts`, `app/group/[id]/recurring.tsx`, `app/plan/recurring.tsx` | `recurring` |
| F-17 | **Import** | PDF / xlsx / CSV / pasted-text statement ingestion with format auto-detection. | working | `app/import.tsx`, `src/lib/importDetect.ts` + 5 parsers, `src/lib/xlsx.ts`, `components/system/PdfTextExtractor.tsx` | always |
| F-18 | **Review inbox** | Correct and commit imported rows; drafts, bulk actions, filters, saved views. | working | `app/review.tsx` (977 L), `src/lib/reviewCommit.ts`, `reviewFilter.ts`, `reviewViews.ts`, `src/db/queries/pending.ts` | always |
| F-19 | **Reports & export** | Monthly donut / trend / group summaries; CSV and PDF export. | working | `app/reports.tsx`, `src/lib/reportsData.ts`, `src/lib/reportExport.ts`, `src/lib/donut.ts` | `reportsDonut` / `reportsTrend` |
| F-20 | **CSV export/import round-trip** | Per-group and all-group CSV that re-imports through F-17. | working | `src/lib/groupExport.ts`, `src/lib/shareCsv.ts`, `importParse.ts` (`isBudgetSplitExport`) | always |
| F-21 | **Audit log** | Append-only history of every create/update/delete/settle/pause/resume/end. | working | `src/db/queries/audit.ts`, `app/history.tsx` | always |
| F-22 | **Search** | Free-text search over 3 years of transactions. | working | `app/search.tsx` | always |
| F-23 | **Smart categories** | Keyword→category guess from a typed title, word-boundary aware, with learned corrections. | working | `src/lib/smartCategory.ts`, `src/lib/smartCategoryLearn.ts` | `smartCategory` (**off by default**) |
| F-24 | **Tracking streak** | Consecutive-days-logged counter on Home. | working | `components/finance/home/StreakCard.tsx`, `src/lib/homeData.ts` | `streak` (**off by default**) |
| F-25 | **Reminders / notifications** | Local notifications for upcoming bills and a daily log nudge. | working | `src/lib/reminders.ts`, `src/lib/reminderPlan.ts`, `src/lib/notifications.ts`, `app/settings/notifications.tsx` | `reminders` |
| F-26 | **App lock & privacy** | Biometric gate + app-switcher privacy screen + hide-amounts. | working | `components/system/LockGate.tsx` (203 L), `PrivacyScreen.tsx`, `src/lib/settings.ts` | always |
| F-27 | **Onboarding** | Multi-slide intro + questionnaire that seeds name, salary rule, budget, contacts. | **partial** | `components/system/Onboarding.tsx` (793 L), `OnboardingGate.tsx`, `src/lib/onboarding.ts` | first run |
| F-28 | **Afford check** | "Can I afford this?" verdict from cash, upcoming bills, category norm and income share. | working | `app/afford.tsx`, `src/lib/afford.ts`, `getAffordSnapshot` | `affordCheck` (**off by default**) |
| F-29 | **Receipt attachments** | Attach a photo to a transaction, view full-screen, manage storage. | working | `src/lib/attachment.ts`, `components/finance/add/AttachmentRow.tsx`, `app/storage.tsx` | always |
| F-30 | **Location tagging** | Tag a transaction with a reverse-geocoded place label. | working | `src/lib/location.ts`, `src/hooks/useLocationCapture.ts`, `components/finance/add/LocationRow.tsx` | `save_location` (AsyncStorage, **off by default**) |
| F-31 | **Receipt OCR** | Scan a receipt into itemized line items. Two providers: Gemini Flash via a Cloudflare Worker proxy (default) and on-device Apple Vision. | working | `src/lib/ocrProviders/`, `src/lib/ocr.ts`, `modules/expo-ocr/`, `components/finance/add/{ReceiptScanSheet,ScanningOverlay}.tsx`, `server/receipt-ocr-proxy/` | always (unflagged) |
| F-32 | **Demo / reset data** | Load a full test dataset or erase everything. | working | `src/db/seedDemo.ts` (370 L), `app/storage.tsx` | hidden (7-tap) |
| F-33 | **Feature flags** | Per-surface toggles persisted to AsyncStorage. **✓ RESOLVED** — was 19 keys of which 11 gated nothing. `DEFAULTS` is now **14** keys, all live: the 12 from Pass 3, plus `splitting` (Pass 4) and `recurringSuggest` (shipped with Review's suggestion banner). | working | `src/lib/featureFlags.ts`, `components/system/FeatureFlagsProvider.tsx`, `app/features.tsx` | always |
| F-34 | **Category catalog** | A single global category catalog per kind, with adopt-uncategorized. | working | `app/categories.tsx`, `src/db/queries/categories.ts`, `src/db/seedCategories.ts`, `src/constants/categories.ts` | always |

### Status notes

- **F-27 is `partial`**, not `working`. The questionnaire asks the user to pick a persona
  (`personal` / `split` / `both`) and *does* persist it —
  `Onboarding.tsx:171` calls `settings.setOnboardingIntent(intent)`. But **nothing ever
  reads it**: the only callers of `settings.onboardingIntent()` are in `settings.test.ts`.
  The code says so itself (`Onboarding.tsx:169-170`: "Not wired to feature flags yet").
  The persona question therefore has zero effect on the app. See §4 and ISS-04.
- **F-31 shipped on 2026-08-01** (`be5f795`) and is no longer `dormant`. The blocker recorded
  in this audit — OCR could read a bill's total but not itemize it — was solved by adding a
  vision-model provider rather than by improving the regex: `gemini` sends the photo to Gemini
  Flash through `server/receipt-ocr-proxy` and gets structured line items back, while `device`
  keeps the offline Apple Vision path. The entry point is the itemized wizard's **Scan receipt**
  button. Behaviour is documented in
  [FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) §7.4; the egress this introduces is §19.
  **✓ Provider is now user-selectable** (2026-08-04): Feature management → Smart capture →
  **Cloud Receipt Scanning** writes `settings.setOcrProvider`, so the offline `device` path is
  reachable without code. Like `save_location` it is a `settings` pref rather than a `FeatureKey`
  — here because it picks between two implementations, not because of async validation.
  **One gap remains:** scanning ships **unflagged** (the `itemizedOcr` key was deleted in the
  2026-07-28 purge and never re-added), so the Scan button itself can't be hidden —
  DEBT_TRACKER F7.
  The module's bogus `android` platform declaration is gone (ISS-07).
- **F-23, F-24, F-28, F-30 are off by default** and only discoverable through S-24.

### Utility modules with no user-facing feature

`haptics.ts`, `avatar.ts`, `shareCsv.ts`, `txnDetail.ts`, `txnGrouping.ts`, `categoryFold.ts`,
`groupDetail.ts`, `pdfjsCache.ts`, `payMethodDetect.ts`, `upcoming.ts`, `donut.ts`,
`recurrence.ts`, `savings.ts` (pure goal math), `homeData.ts` / `insightsData.ts` /
`reportsData.ts` (screen data assemblers).

---

## 2. Screen Inventory (S-XX) — moved

**See [FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) §3.** The full `S-01 … S-34` inventory
was absorbed there on 2026-08-04, so the screen catalogue and the screen *behaviour* it belongs
next to live in one file. The IDs are unchanged, so every `S-XX` reference in this repo still
resolves.

Two catalogues of one app guarantee they drift apart, and these two already had: this section
still described receipt scanning as "deliberately hidden" months after it shipped, and never
gained `app/settings/backup.tsx`. `AUDIT_DOC_DRIFT.md` had recorded the overlap as the open
decision (DRIFT-20 / DRIFT-21's sibling); this is the resolution.

What stays here: everything the behaviour doc deliberately doesn't carry — the per-feature status
inventory (§1), integrations (§5), business-logic notes (§7), known issues (§8) and debt (§9).

---

## 3. Key User Flows (FLOW-XX) — moved

**See [FEATURES_AND_FLOWS.md](./FEATURES_AND_FLOWS.md) §15.** `FLOW-01 … FLOW-10` were absorbed
there on 2026-08-04 with their IDs intact, plus a new `FLOW-11` for backup/restore. They sit
beside the screens they run through, which is the point.

---

## 4. Feature Toggle / Onboarding System

### 4.1 Where toggles live

Three independent preference stores, none of which is the `settings` DB table:

| Store | Backing | Owns | Read via |
|---|---|---|---|---|
| **Feature flags** | AsyncStorage, `feature_*` namespace | 19 `FeatureKey`s | `useFeatureFlags()` (React context) |
| **App preferences** | AsyncStorage, 12 discrete keys | biometric, privacy screen, hide amounts, save location, default cadence/currency, income, payday, last-open, onboarding done/intent, pending-first-add | `settings.*` (`src/lib/settings.ts`) |
| **Reminder prefs** | AsyncStorage, one JSON blob | notification schedule | `getReminderPrefs()` (`src/lib/reminders.ts`) |

`src/lib/settings.ts:9-15` deliberately documents *why* the other stores are not folded in:
they own a richer shape and aren't "scattered settings". The same comment names two more
self-contained stores — `smartCategoryLearn.ts` and the savings sweep markers in
`db/queries/savings.ts`.

The `settings` SQL table (§6a) is **not** an app preference store. Its sole live use is the
`category_global_v1` migration flag.

### 4.2 How flags are stored and applied

`src/lib/featureFlags.ts`:

- `FeatureKey` is a **13**-member union (was 19, cut to 12 — see §4.3; `splitting` added in Pass 4);
  `DEFAULTS` sets each initial value.
- `loadFlags()` does a single `AsyncStorage.multiGet` over all keys and falls back to
  `DEFAULTS` for any key that has never been written. Values are the literal strings
  `'true'` / `'false'`.
- `setFlag(key, value)` writes one key.

`FeatureFlagsProvider` (`components/system/FeatureFlagsProvider.tsx`) holds them in React
state, mounted **third** in the root provider stack. It renders children with `DEFAULTS` and
swaps in the loaded values when `loadFlags()` resolves. Writes are optimistic: local state
updates first, persistence is best-effort (`.catch(() => {})`) — which is why a flag cannot
express a preference the OS may refuse (see §4.4).

**✓ RESOLVED (ISS-11)** — that swap used to flash a disabled surface on every cold start,
because `ready` existed for exactly this and had no consumer. `FlagsGate` (same file, wrapped
in `app/_layout.tsx`) now holds `BrandedLoader` until the stored values land, matching how the
root already waits on fonts and the DB.

Gating in screens is a plain conditional: `{flags.streak && <StreakCard … />}`.

### 4.3 Flag reality check — **✓ RESOLVED**

**As audited: 8 of 19 flags worked, and 5 of the 11 dead ones were live switches** in S-24 —
the health score, savings insights, reports charts and receipt scanning toggles all persisted
a value nothing read, while the surfaces they claimed to control rendered unconditionally. The
six `dashboard*` keys (minus `dashboardInsights`) plus `budgetInsights` were pure dead
configuration: no UI, no gate.

Two fixes, per ISS-02 / DEBT-09: the four flags whose surfaces genuinely exist were **wired**,
and the seven with no UI at all were **deleted**. Current state — every key gates something and
every key is user-visible:

| Flag | Default | Gates | In the Features UI? |
|---|---|---|---|---|
| `forecast` | on | Home `ForecastCard`, `src/lib/homeData.ts` | ✅ |
| `dashboardInsights` | on | Home shift teaser, `homeData.ts` | ✅ *(newly surfaced)* |
| `recurring` | on | `app/(tabs)/savings.tsx`, `app/add/quick.tsx` | ✅ |
| `reminders` | on | `app/(tabs)/settings.tsx` | ✅ |
| `savingsGoals` | on | `app/(tabs)/savings.tsx` | ✅ |
| `smartCategory` | **off** | `app/add/quick.tsx`, `useAddTxnForm.ts` | ✅ |
| `affordCheck` | **off** | `app/(tabs)/savings.tsx` | ✅ |
| `streak` | **off** | `app/(tabs)/index.tsx` | ✅ |
| `healthScore` | on | Home ring + `HealthSheet` *(newly wired)* | ✅ |
| `savingsInsights` | on | `insightsData.ts` → Insights nudges *(newly wired)* | ✅ |
| `reportsDonut` | on | `app/reports.tsx` donut *(newly wired)* | ✅ |
| `reportsTrend` | on | `app/reports.tsx` trend bars *(newly wired)* | ✅ |

**Deleted:** `itemizedOcr` (F-31 has no entry point), `dashboardCash`, `dashboardBudget`,
`dashboardDonut`, `dashboardBalances`, `dashboardSavings`, `budgetInsights`. Orphaned
`feature_*` AsyncStorage values simply stop being read — no migration needed.

This is now an **enforced invariant**, not a snapshot: `src/__tests__/featureFlags.test.ts`
scans `app/` and `src/` and fails if any key stops being read, or stops appearing in the
Features screen. Verified it bites by checking that all seven deleted keys would fail it.

Related dead import — **✓ RESOLVED (ISS-13)**: `app/(tabs)/index.tsx` imported `HealthBand`
and `EmptyState` and rendered neither; both removed. `HealthBand.tsx` is consequently
unreferenced and is a candidate for deletion.

### 4.4 Location tagging — a fourth mechanism, **by design**

`save_location` is **not** a feature flag; it lives in `settings` (AsyncStorage) yet is
presented in the Features screen alongside the flags. Toggling it on requests OS location
permission inline and refuses to enable if denied (`app/features.tsx`). Onboarding can also
set it (`Onboarding.tsx:639`). One user-facing switch list, two storage mechanisms.

**Investigated (F-30 / DEBT-04): this is correct, not an inconsistency.** A feature flag is a
display preference — `setFlag` is optimistic, fire-and-forget, and cannot fail. This toggle can
be *refused* by the OS, so it must await a permission result and then decline to turn on.
Folding it into `FeatureKey` would mean adding async validation to the flag API to serve one
case, making every other flag more complicated. The rationale is now recorded at the call site
so it stops being re-filed as a defect.

### 4.5 Onboarding

`OnboardingGate` (37 L) is mounted inside `LockGate` and reads `settings.onboardingDone()`;
on error it defaults to **showing** onboarding rather than skipping it. Completion writes
`onboarding_done` in a `try/finally` so the gate opens even if the write fails.

`Onboarding.tsx` (793 L — the largest component in the repo) walks 9 stages:

```
hero → intent → features(carousel) → name → income → money → budget → people → permissions
```

with the last five driving the progress dots (`SETUP_STEPS`). It collects: persona intent,
name, take-home income + payday, cash / investments / credit limit / credit used, monthly
budget, contacts, and permissions.

Commit is split in two:
- `finalizeOnboarding(db, …)` (`src/lib/onboarding.ts`) — name, a monthly `Salary` recurring
  income rule anchored via `paydayAnchor`, a `Total` monthly budget line, and contacts.
  Every step individually try/caught (BL-32).
- `setMoneyProfile(db, …)` called directly from the component for the four money-profile
  figures, also best-effort.

### 4.6 Onboarding selections → toggles — **✓ RESOLVED (Pass 4)**

`src/lib/personaDefaults.ts` is the mapping. `finalizeOnboarding` persists the intent *and* the
flags it implies (only the keys that deviate from `DEFAULTS`), and `OnboardingGate` calls the
provider's new `reload()` so it applies in the same session. A 13th flag, `splitting`, gives the
persona something structural to switch. The section below describes the state **as audited**.

**As audited: the persona question had no effect on any feature flag.**

- `Onboarding.tsx:171` persists the choice: `settings.setOnboardingIntent(intent)`.
- The code says so itself at `Onboarding.tsx:169-170`: *"Capture the persona as a soft
  preference. Not wired to feature flags yet — stored so a later pass can tailor default
  toggles to it."*
- `settings.onboardingIntent()` has **zero callers** outside `settings.test.ts`.

So a user who picks "Track my own spending" and a user who picks "Split with people" get an
identical app. The only onboarding choices that change behaviour are the ones committed
directly (name, salary rule, budget, contacts, money profile, and the location permission
at `Onboarding.tsx:639`).

Two other captured values are also write-only: `monthlyIncome` and `payday` are stored by
`finalizeOnboarding` and never read (BL-33 / ISS-05).

---

## 5. Third-Party Integrations (INT-XX)

### What is NOT here

There is **no Google authentication, no OAuth of any kind, no backend, no API client, no
analytics SDK, no crash reporter, no push service, no payment or subscription SDK**. There
are no `fetch`/`axios`/`XMLHttpRequest` calls to any application server. The app has no
accounts and no user identity beyond a local `person` row.

The only network egress in the entire app is **INT-08** (a one-time pdf.js download from a
public CDN), and it is optional and cached.

"Integrations" therefore means device/OS capabilities via Expo modules, plus one
first-party native module.

| ID | Integration | Package | Permission / scope | Where the flow lives | State | Error handling |
|---|---|---|---|---|---|---|
| INT-01 | **SQLite** | `expo-sqlite` | none | `src/db/schema.ts` (`openDB`), `SQLiteProvider` in `app/_layout.tsx:93` | working | DB-open failure caught in `_layout.tsx:52-55` → retryable `ErrorState`, never a stuck splash |
| INT-02 | **Biometric lock** | `expo-local-authentication` | iOS Face ID/Touch ID; Android `USE_BIOMETRIC`, `USE_FINGERPRINT` | `components/system/LockGate.tsx` (203 L), toggled in S-06 | working | Opt-in, default off |
| INT-03 | **Location** | `expo-location` | `NSLocationWhenInUseUsageDescription` (iOS), `ACCESS_COARSE/FINE_LOCATION` (Android) | `src/lib/location.ts`, `src/hooks/useLocationCapture.ts`; permission requested at `app/features.tsx:39` and `Onboarding.tsx:639` | working | Denial is explicit: the toggle refuses to flip on and shows an Alert pointing at OS Settings |
| INT-04 | **Local notifications** | `expo-notifications` | OS notification permission | `src/lib/notifications.ts`, `src/lib/reminders.ts`, `app/settings/notifications.tsx` | working | Permission requested only when a reminder is turned **on**; `runTest` swallows failure with a comment that Expo Go silently fails and local notifications need a dev build |
| INT-05 | **Camera / photo library** | `expo-image-picker` | camera + media-library permission | `src/lib/attachment.ts:20-52`, `src/lib/ocr.ts:24-45` | working | Returns `null` on denial; a failed file copy throws the typed `AttachmentStorageError` so the caller can still save the expense without the photo |
| INT-06 | **File system** | `expo-file-system` (new `File`/`Directory` API) | none | `src/lib/attachment.ts`, `src/lib/pdfjsCache.ts`, `app/reports.tsx` | working | `getAttachmentStorage` / `clearAllAttachmentFiles` are individually try/caught and degrade to zero rather than throwing |
| INT-07 | **Document picker** | `expo-document-picker` | none | `app/import.tsx:82-118` | working | Unreadable file → haptic + Alert naming the accepted formats |
| INT-08 | **pdf.js (CDN)** | `react-native-webview` + `cdnjs.cloudflare.com` | network (once) | `components/system/PdfTextExtractor.tsx`, `src/lib/pdfjsCache.ts` | working | Fetches the library; the PDF is parsed locally, so no user content leaves. See below. |
| INT-09 | **On-device OCR** | `modules/expo-ocr` (first-party) | camera/library via INT-05 | `modules/expo-ocr/ios/*.swift`, `src/lib/ocr.ts` | working | The `device` receipt-scan provider. See below |
| INT-13 | **Gemini Flash (via own proxy)** | `server/receipt-ocr-proxy` (Cloudflare Worker) → Google Generative AI | camera/library via INT-05 | `src/lib/ocrProviders/gemini.ts`, `server/receipt-ocr-proxy/index.ts` | working | **The only call that sends user content off-device** — the receipt photo. Default provider. See below |
| INT-10 | **Share sheet** | `expo-sharing` | none | `src/lib/shareCsv.ts`, `app/reports.tsx`, `app/(tabs)/settings.tsx` | working | `isAvailableAsync()` checked first; when unavailable, the file path is shown in an Alert instead of silently failing |
| INT-11 | **PDF generation** | `expo-print` | none | `app/reports.tsx:104-112` | working | Same fallback as INT-10 |
| INT-12 | **Haptics** | `expo-haptics` | none | `src/lib/haptics.ts` (14 L) | working | Fire-and-forget |
| INT-13 | **Fonts** | `@expo-google-fonts/*`, `expo-font` | none | `app/_layout.tsx:32-36` | working | Bundled, not fetched. App holds `BrandedLoader` until loaded |
| INT-14 | **Device info** | `expo-device` | none | used by `expo-notifications` paths | working | — |

### INT-08 — pdf.js, the only network dependency

`pdfjsCache.ts` pins **pdf.js 3.11.174** and downloads `pdf.min.js` + `pdf.worker.min.js`
from `cdnjs.cloudflare.com` into the app's document directory on first use, then inlines the
cached source into the extractor WebView. After one successful fetch, PDF import works
offline. The pin comment explains the choice: v3.x ships a real UMD build (global
`pdfjsLib`) that can be inlined into a classic `<script>`, while v4 is ES-module-only.

`PdfTextExtractor.tsx` has two load strategies — inline-from-cache (primary) and
CDN-`<script>` (fallback when caching failed) — and every failure path posts a **specific**
message back rather than a generic one, which `app/import.tsx:140-146` surfaces verbatim.
It also neutralises `</script>` in the minified source before inlining (`PdfTextExtractor.tsx:21`).

Risk as audited: the app inlines and executes remotely-fetched JavaScript inside a WebView.
The source was a pinned *version* from a well-known CDN over HTTPS, and the WebView is
off-screen and handed only a base64 PDF — but there was **no integrity check (no SRI, no hash
pin)** on the downloaded bundle, so the *content* at that URL was trusted implicitly.

**✓ RESOLVED (INT-08 / DEBT-10).** `pdfjsCache.ts` now pins the SHA-256 of both files and
verifies via `expo-crypto` on download **and** on every cache read, so a tampered cache entry
can't be executed either; a mismatch deletes the file and throws `PdfJsIntegrityError`.

Worth noting what nearly defeated this: the extractor's `.catch()` fell back to loading the
same bundle straight from the CDN via `<script src>`, so an integrity failure would have
downgraded to executing exactly the bytes that just failed. The fallback now carries an
`integrity` (SRI) attribute so the WebView enforces the pin, and an integrity failure refuses
to fall back at all — it surfaces a message telling the user to import CSV or paste text.

### INT-09 — expo-ocr, a working native module with no entry point

A complete first-party Expo module lives at `modules/expo-ocr/`:

- `ios/ExpoOcrModule.swift` + `ios/TextRecognizer.swift` implement recognition via Apple
  Vision (`VNRecognizeTextRequest`).
- As audited, `expo-module.config.json` declared **both** `apple` and `android` platforms while
  **there is no `android/` directory** — it pointed at `expo.modules.ocr.ExpoOcrModule`, which
  does not exist, so Android would have thrown at `requireNativeModule('ExpoOcr')`.
  **✓ RESOLVED (ISS-07)** — the `android` block was removed; the config now declares only what
  exists.

**No longer without an entry point.** As audited, `src/lib/ocr.ts` was marked
`@deprecated PARKED` and nothing imported `scanReceipt`: on-device OCR could read a bill's
*total* but not itemize it. `be5f795` (2026-08-01) rewrote `ocr.ts` and wrapped it as the
`device` provider behind `src/lib/ocrProviders/`, alongside a new `gemini` provider (INT-13).
The itemized wizard's **Scan receipt** button calls whichever `settings.ocrProvider()` names.

The `device` path is still the weaker of the two on two-line item layouts — which is exactly why
`ReceiptScanSheet` shows the raw recognized text alongside the parsed candidates. Making that
failure visible and hand-fixable was the deliberate alternative to hiding it. On the `gemini`
path there is no raw text to show (`rawText` is null), because the model returns structure.

### INT-13 — the receipt-OCR proxy, and the app's first data egress

`server/receipt-ocr-proxy/` is a stateless Cloudflare Worker (~113 L): it POSTs
`{imageBase64, mimeType}` to Gemini with a `responseSchema` and returns
`{items: [{name, qty, unitPrice}]}`. `GEMINI_MODEL = 'gemini-flash-latest'` is hardcoded. It
exists only to keep `GEMINI_API_KEY` out of the app bundle, and stores nothing.

Consequences worth stating plainly, because they change the app's privacy posture:
- **A receipt photo leaves the device** on the default path. INT-08 fetches a library; this
  sends user content.
- The free tier is **shared app-wide, not per-user**, and was cut 50–80% in late 2025. Fine at
  personal scale; watch quota before growth. A Mistral fallback is documented in
  `ocrProviders/index.ts` but **not implemented**.
- Users can opt out: the **Cloud Receipt Scanning** switch in Feature management selects
  `device` instead, and scanning keeps working offline.
- Deploy config lives only in the Worker's README (`wrangler secret put GEMINI_API_KEY`,
  `wrangler deploy`, then `EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL`).

### Permissions actually declared

From `app.json`:

- **iOS** — `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`, `ITSAppUsesNonExemptEncryption: false`.
  The camera and photo strings are **✓ RESOLVED (ISS-06)** — they were missing while INT-05
  requested both at runtime, which crashes rather than denies on iOS.
- **Android** — `USE_BIOMETRIC`, `USE_FINGERPRINT`, `ACCESS_COARSE_LOCATION`,
  `ACCESS_FINE_LOCATION`. No `CAMERA` entry is needed: it merges in from `expo-image-picker`'s
  own manifest.
- **Plugins** — `expo-sqlite`, `expo-sharing`, `expo-router` (root `app`), `expo-font`,
  `expo-local-authentication`, `expo-location`, plus **`expo-image-picker`** (with
  `microphonePermission: false`, so no unjustified `RECORD_AUDIO`) and **`expo-notifications`**
  — both **✓ RESOLVED (ISS-06 / INT-04)**, previously absent. The local `expo-ocr` module is
  still not listed, which is correct while it has no caller.

The location permission string is notably honest: *"This is off by default and never leaves
your device."*

---

## 6. State Management & Data Flow

The app is **local-first with no server**. SQLite (`budgetsplit.db`, WAL mode) is the only
source of truth for domain data. There is no Redux, no React Query, no in-memory mirror.

### 6a. Data model

`src/db/schema.ts` defines 13 tables in one `SCHEMA` string, then applies **30** idempotent
`ALTER TABLE ADD COLUMN` migrations (was 40; five `is_demo` columns were removed per ISS-10,
and the rest of the drop is the audit's own recount), two full-table rebuilds, and the one-time
data fixes — all on **every** `openDB()` call.

Two changes since the audit: the data fixes are now **guarded**, each recorded by key in the
`settings` table (ISS-01), and `SCHEMA` + `COLUMN_MIGRATIONS` are **exported** so tests can
build the real schema instead of a hand-written subset. That matters more than it looks — the
base `SCHEMA` string is *not* the current schema, because columns like
`category_budget.cadence` arrive only via the ALTERs.

#### Tables

| Table | Holds | Notes |
|---|---|---|
| `person` | People (me + contacts) | `is_me=1` marks the local user. No auth — contacts are name-only. `remote_uid` exists but is **never read or written** anywhere in the codebase. |
| `budget_group` | Groups, incl. the personal one | `is_personal=1` on exactly one row (a legacy repair, now guarded to run once). `limit_daily/monthly/yearly` and `carry_over` are legacy — budgets live in `category_budget`. As of BL-18 they have **no reader at all**: `getBudgetUsage`, the last consumer, was deleted. Nothing ever wrote them, so its carry-over branch was unreachable. |
| `group_member` | Group ↔ person join | Composite PK. `joined_at` drives "Joined {month year}". |
| `txn` | **The central table** — and it also stores recurring *rules* | See below. |
| `txn_payment` | Who paid, how much | PK `(txn_id, person_id)` → at most one row per person per txn. |
| `txn_share` | Who owes, how much | Same shape. `sum(payments) == sum(shares)` is the money invariant. |
| `line_item` | Itemized-bill lines | `assigned_to` is a JSON string array; `split_mode`/`split_values` persist per-item non-equal splits. |
| `category` | **Global** catalog, one row per `(name, kind)` | `group_id` is nullable and always NULL post-migration. |
| `category_budget` | Per-group per-category budget | `UNIQUE(group_id, category, period)`; `cadence` added by migration. |
| `recur_skip` | User-skipped occurrences | PK `(series_id, occurrence_date)`. |
| `audit_log` | Change history | Indexed on `created_at DESC` and `group_id`. |
| `savings_goal` | Goals | `sort_order` is the drag rank = funding order (lower funds first). `priority` still exists as a column but drag rank supersedes it. |
| `savings_txn` | Savings ledger | `deposit` / `allocate` / `withdraw`, `source` manual/auto. |
| `pending_txn` | Import staging | Never feeds balances or budgets until confirmed in Review. Carries the Review *draft* (`dest_group_id`, `split_draft`, `counterparty_id`). |
| `settings` | key/value | **Effectively dead as an app store** — see F-26 / DEBT-04. Its only live use is the `category_global_v1` migration flag (`schema.ts:418,440`). |

#### `txn` — one table, three roles

The same table stores three kinds of row, distinguished only by column state:

| Role | Discriminator |
|---|---|
| A real transaction | `recur_freq IS NULL AND parent_recur_id IS NULL` |
| A **recurring rule** (a template, not a real spend) | `recur_freq IS NOT NULL` |
| A **materialized occurrence** of a rule | `parent_recur_id IS NOT NULL` + `recur_override_date` |

Every read that means "actual money" must therefore filter `recur_freq IS NULL`. Missing
that filter double-counts a rule as spend. This is the single most load-bearing implicit
invariant in the schema (see BL-11).

#### Migration strategy — and its cost

Two tables are **rebuilt** (create-copy-drop-rename) because SQLite can't `ALTER` a `CHECK`:

- `txn`, to allow `recur_freq='yearly'` — detected by grepping the DDL for the literal
  `'yearly'` (`schema.ts:285-332`).
- `category`, to allow `kind='transfer'` — detected by grepping for `'transfer'`
  (`schema.ts:338-365`), then a *second* rebuild collapses per-group categories into a
  global catalog, guarded by the `category_global_v1` settings flag (`schema.ts:417-444`).

Both rebuilds are wrapped in bare `try {} catch {}` that leaves the old table intact on
failure and reports nothing. Indexes are created **after** the rebuilds (`schema.ts:370-385`)
precisely because a rebuild would drop them.

`openDB()` also applies six legacy **data** fixes (as opposed to schema changes): normalizing
the `wallet` icon, deleting pool-level `savings_txn` rows, reclassifying `Subscriptions` →
`Entertainment`, forcing `is_personal` onto the oldest group, backfilling a placeholder email
onto the local user, and reclassifying legacy income-named categories. These are declared as
data in `ONE_TIME_FIXES` and applied by `applyOneTimeFixes`, each guarded by its own key in the
`settings` table so it runs at most once per database. They previously ran unconditionally on
every launch (ISS-01, now fixed). See DEBT-01 for what remains.

#### Indexes

Seven, all on `txn`/`line_item`/`audit_log`/`savings_txn`/`pending_txn`, several of them
partial and each with a comment naming the exact query it serves — e.g.
`idx_txn_date ON txn(date) WHERE is_deleted=0 AND recur_freq IS NULL` for the
`getTransactionsInRange(groupId=null, …)` hot path. This is the best-documented part of the
schema.

### 6b. Query layer — `src/db/queries/` (12 modules)

All SQL lives here; screens never inline SQL. The rule holds — a grep for `getAllAsync`/
`runAsync` outside `src/db/` returns nothing.

| Module | Responsibility |
|---|---|
| `transactions.ts` (561 L) | Read/insert/update/soft-delete/restore txns, itemized txns, settlements, line items, attachments, duplicate detection. |
| `savings.ts` (484 L) | Goals CRUD + ledger + auto-funding + overspend raid + cash position + total money + afford snapshot + savings insights. **Doing far too much** — see DEBT-02. |
| `recurring.ts` (318 L) | Rule lifecycle (pause/resume/end), skips, occurrence materialization, series splitting. |
| `groups.ts` (162 L) | Group CRUD, archive/unarchive, safe-delete guards. |
| `categories.ts` (144 L) | Global catalog CRUD + uncategorized-name discovery + by-frequency ordering. |
| `balances.ts` (141 L) | `getGroupNet` / `getGlobalNet` / `getFriendBalances` / `getMyExposure`. |
| `persons.ts` (103 L) | People + group membership. |
| `pending.ts` (105 L) | Import staging rows + Review drafts. |
| `audit.ts` (73 L) | Append + filtered read of `audit_log`. |
| `categoryBudgets.ts` (63 L) | Per-category budget read/write. |
| `moneyProfile.ts` (51 L) | Opening cash / investments / credit — the manual money-profile inputs. |
| `cashQuery.ts` (29 L) | A single exported SQL string, `CASH_TOTALS_SQL`, with no imports — kept import-free specifically so `cashSql.test.ts` can run it against a real SQLite engine to prove it stays in lockstep with the JS `computeCash()`. |

`cashQuery.ts` is the cleanest pattern in the repo: the same computation exists in SQL (for
speed) and JS (for testability), and a test asserts they agree. Worth copying elsewhere.

#### Write discipline

Multi-table writes are wrapped in `db.withTransactionAsync()`. `insertTxnRows`
(`transactions.ts:218`) is deliberately factored to *not* open its own transaction so
`splitRecurringSeries` can commit a new rule and the old rule's cap atomically — expo-sqlite
can't nest transactions. `materializeDueOccurrences` wraps its whole run in one transaction
rather than one per occurrence, which the comment notes was previously ~90 fsync'd
transactions on a daily rule's first back-fill.

Audit entries are written **inside** the same transaction as the change they describe, so
the log can't drift from the data.

### 6c. Client state

| Layer | Where | What |
|---|---|---|
| Global store | `src/store/index.ts` (zustand, 1 file) | Only `me` and `groups`. Deliberately not a data mirror. Hydrated at the root by `StoreHydrator`, re-hydrated on the data-change signal. |
| Screen data | `useScreenData` (`src/hooks/useScreenData.ts`) | Owns `loading` / `error` / `refreshing`, focus refetch, cross-screen refetch, pull-to-refresh. |
| Cross-screen invalidation | `DataRefreshProvider` | After any write a screen calls `refresh()`, which re-runs every mounted `useScreenData` **and** re-hydrates the store. |
| Feature flags | `FeatureFlagsProvider` + AsyncStorage | See §4. |
| Preferences | `src/lib/settings.ts` + AsyncStorage | See §4. |
| Form state | Feature hooks (`useAddTxnForm`, `useItemizedForm`, `useSavingsTab`, …) | Local to the screen; screens are render-only. |

There is **no prop drilling of data** — the deepest prop chains are presentational
(colour/size), and cross-screen coordination goes through `refresh()` rather than
lifted state.

#### Feature hooks (`src/hooks/`, 8 modules)

The screen-thinness pattern: each heavy screen's state and write-handlers live in a hook, and
the route file becomes a render layer. All 8 are untested (they're React-bound; the pure
logic underneath them is in `src/lib` and *is* tested).

| Hook | LOC | Owns | Used by |
|---|---|---|---|---|
| `useScreenData.ts` | 122 | The one data-loading hook — loading/error/refreshing, focus refetch, cross-screen refetch, pull-to-refresh | 25+ screens |
| `useAddTxnForm.ts` | 417 | All Quick-Add state + the four save paths (expense/income, edit, recurring-rule edit, transfer) | S-07 |
| `useItemizedForm.ts` | 308 | The 4-step itemized wizard's state and save | S-08 |
| `useSavingsTab.ts` | 192 | Plan tab: goals, money profile, funding, reorder, overspend notice | S-05 |
| `useSavingsGoalScreen.ts` | 175 | Goal detail: add/withdraw/adjust/lock/delete, history paging, celebration | S-17 |
| `useTxnDetail.ts` | 137 | Transaction detail: load, receipt add/remove, delete | S-15 |
| `useGroupTxnActions.ts` | 59 | Shared delete/edit handlers for group transaction rows; routes a materialized occurrence to its rule instead of the editor (BL-30) | S-09, S-14 |
| `useLocationCapture.ts` | 30 | Foreground location capture + reverse geocode for F-30 | S-07 |

---

## 7. Business Logic Notes (BL-XX)

52 modules in `src/lib`. As audited, 13 had no test; the four that mattered — the screen-data
assemblers behind Home, Reports and Insights — are now covered (DEBT-07), leaving **9 genuinely
untested, all native-I/O adapters** (`haptics`, `avatar`, `location`, `attachment`,
`notifications`, `pdfjsCache`, `shareCsv`, `onboarding`, `txnDetail`). Note `reportsData`,
`insightsData` and `analytics` are covered by `screenData.test.ts` rather than a same-named
file, so a filename-matching count still reports 12.

Below, the engines that actually decide money outcomes.

### Money representation

**BL-01 — Integer paise everywhere.** `src/lib/money.ts`. Every amount in the DB and in
every engine is an integer number of paise. There is no float money anywhere.
`parseToPaise()` is the only entry point from user text; `formatRupees` / `formatCompact` /
`formatAxisShort` are the only exits.

- `parseToPaise` strips everything but digits and `.`, rounds, and **clamps to `MAX_PAISE`**
  = `(10^12 − 1) × 100` (`money.ts:104-131`). An over-long paste can't overflow layouts or
  arithmetic, and the clamp keeps values well inside `Number.MAX_SAFE_INTEGER`.
- `sanitizeAmountInput` caps the integer part at 12 digits and the decimal at 2 places
  *while typing*, so the clamp is rarely the thing that fires.
- **Edge cases handled:** `isFinite` guards on every formatter (NaN/Infinity → `₹0`),
  negative-safe sign extraction, `Math.round` before `toFixed` in `compactNum`.
- `formatChangeMagnitude` (`money.ts:39`) is the single source for the "%-vs-×" decision:
  past ±100 % it switches to a multiple (`230 % → 3.3×`) because "230% more" reads worse.
  Deliberately has no user toggle.

**BL-02 — Split remainder distribution.** `money.ts:146-173`. All three non-exact modes
floor each share and then hand out the leftover paise one at a time, so shares always sum
to exactly the total:

- `splitEqual`: `base = floor(total/n)`, first `remainder` people get `+1`.
- `splitByPercent`: floors `total × p / 100`, distributes the remainder.
- `splitByShares`: `sum === 0` → all zeros (division guard), else floors and distributes.

**`exact` mode is deliberately unbalanced**: `splitByMode` reads the user's inputs verbatim
and does *not* reconcile a shortfall (`money.ts:190-191`).

The audit flagged that the Review path refused such a row while Quick Add appeared not to
enforce the same equality. **On investigation the concern was overstated** (see ISS-12): the
Quick-Add guard lives in `canSave` (`remainder === 0 && paymentRemainder === 0`), and
`handleSave` returns early on `!canSave` — so no unbalanced expense could actually be saved.

**✓ RESOLVED anyway** — the rule was extracted to `validateShares(total, shares)` in
`splitMath.ts` and is now the single source used by both `canSave` and `planCommit`, plus a
defence-in-depth check immediately before `insertTxn`/`updateTxn`. It refuses and names the
shortfall; it never silently reconciles, because unbalanced `exact` is the user's remainder to
resolve.

**BL-03 — Payments default.** `splitMath.ts:54-65`. With no explicit payer, the current
user is recorded as having paid the whole total. Returns `[]` if there is no `meId` at all
rather than inventing a payer.

### Settlement math

**BL-04 — `simplify(net)`** (`settle.ts:7-33`). Greedy debt minimization: sort creditors and
debtors by magnitude descending, repeatedly match the largest debtor against the largest
creditor for `min(both)`. Terminates because every step zeroes at least one side. Produces
a minimal-ish (not provably minimum) transfer set — the standard trade-off, and the right
one for a UI. Zero-amount entries are filtered out.

**BL-05 — `rawDebts(txns)`** (`settle.ts`), used when a group's *Simplify debts* toggle is
off. Every share-holder owes each payer a slice of their share proportional to how much that
payer fronted. Reverse pairs (A→B and B→A) are netted at the end so both directions are never
shown.

*As audited:* a per-pair `Math.round` meant `rawDebts` figures could drift from `simplify`'s by
a paise on multi-payer transactions — the same group showing different numbers either side of
the toggle.

**✓ RESOLVED, and the fix needed two goes.** Allocating each share with the existing
`splitByShares` fixed the *row* sums (each share fully spent) but not the *column* sums: the
leftover paise always went to the first payer, so they accrued 601 of the 600 they fronted.
Slices are now allocated with **carried remainders**, so both margins are exact.

The invariant that actually matters here is **per-person net**, not the sum of transfers — the
two views legitimately differ in total, because `simplify` collapses chains (a→b→c becomes a→c)
while `rawDebts` shows direct debts. `settle.test.ts` asserts per-person net parity, including
a 200-case randomised property test.

**BL-06 — `oweView(net)`** (`owe.ts`). The single source for sign, colour, and wording of
any balance: `net > 0` = owed to me (green, `+`), `net < 0` = I owe (coral, `−`), `0` =
settled. Every owe/owed surface derives from it, which is why the app never shows
contradictory directions.

**BL-07 — Exposure netting.** `balances.ts:127-141`. `summarizeExposure` counts each person
**once**, by their single net figure — so a debt in one group and a credit in another for
the same person cancel out rather than both appearing. Exported separately from the DB call
specifically so it can be unit-tested. `getFriendBalances` intentionally does **not**
post-filter settled-up friends (`balances.ts:100-102` documents that the old guard was a
no-op).

**BL-08 — Transfer scoping.** `settleScope.ts`. Computes the pair balance between me and
another person both per shared group and globally, using the same `simplify`. When settling
"All groups", `planAllGroupsSettlement` distributes the amount largest-balance-first and puts
any excess on the last (smallest) group.

**Investigated — not a defect.** The audit read the excess placement as a bug that could
"over-settle" a group. But an overpayment must leave *some* group in credit, and a test named
*"puts an overpayment remainder on the last ranked group"* pinned this choice deliberately —
putting it on the smallest keeps the larger, more meaningful balances exact. No group is ever
allocated more than it owes unless the user pays more than the total outstanding.

The genuine inconsistency was documentation: the function's own doc comment claimed the
remainder lands on the *largest* group, contradicting both the code and the test. **✓ RESOLVED**
— the comment was corrected and now cites the pinning test.

**BL-09 — One-sided personal transfers.** `reviewCommit.ts:156-166` carries the clearest
comment in the codebase: a personal transfer records *only* the side that moved (payment
for outbound, share for inbound), because `computeCash` does `− settledOut + settledIn`.
Booking both sides would net to zero and silently hide the movement. `insertTxnRows`
mirrors this by reading the amount off the shares when there is no payment row, so the
audit log doesn't say "Settled ₹0" (`transactions.ts:254-262`).

### Cash & money position

**BL-10 — Cash available** (`cash.ts:34-51`):

```
available = openingCash + income − paidExpenses − settledOut + settledIn − savings
```

Crucially this is a **cash-timing** view (what you actually paid out of pocket), not a
share-based view — budgets use shares, cash uses payments. `savings` is floored at 0.

The same computation exists twice, deliberately: `computeCash()` in JS and `CASH_TOTALS_SQL`
in SQL, both funnelling into the shared `cashPositionFromTotals()`. `cashSql.test.ts` runs
the SQL against a real SQLite engine and asserts parity. This is the right pattern for a
duplicated computation and is worth copying (contrast DEBT-05).

**BL-11 — The `recur_freq IS NULL` invariant.** Both cash paths filter
`recur_freq IS NULL` (`cashQuery.ts:28`) because a recurring *rule* row is a template, not
a spend. Any new query over `txn` that forgets this filter will double-count. This is the
most dangerous implicit invariant in the codebase — it was enforced by convention and index
design, not by the schema.

**✓ RESOLVED (DEBT-14) — and it was already broken.** `src/__tests__/txnInvariant.test.ts`
scans every SQL literal in `src/db/queries` that selects `FROM txn` and requires one of: the
`recur_freq IS NULL` filter, an explicit rule-row intent (`IS NOT NULL`, `parent_recur_id`), a
single-row `WHERE id = ?` lookup, a delete cascade, or a commented allowlist entry. It also
checks the dynamically-built `WHERE` fragment in `transactions.ts`.

Writing it immediately surfaced **two live violations**: `getUncategorizedNames` and
`getCategoriesByFrequency` (`db/queries/categories.ts`) were both counting recurring rule
templates as real transactions — inflating the uncategorized-adoption counts shown to the user
and skewing category-picker ordering. Both fixed.

A schema `CHECK` would be stronger, but adding one to `txn` means rebuilding the app's central
table — the riskiest migration available here. The guard costs nothing at runtime and fails
loudly on the next forgetful query, which is the actual failure mode.

**BL-12 — Total Money** (`cash.ts:79-95`). `total = (cashAvailable + investments) +
creditAvailable`, where `creditAvailable = max(0, limit − used)`. Investments and credit
are manual user inputs. Credit is included for spending-power context but is never spent
from automatically. All three inputs are floored at 0.

### Savings engine

**BL-13 — Funding order is the drag rank.** `savingsEngine.ts:45-46`:
`rankKey = sort_order ?? PRIORITY_RANK[priority]`. The manual drag order wins; the legacy
High/Med/Low bucket is only a fallback for goals predating the change. Lower rank = funded
first.

**BL-14 — Scheduled auto-funding** (`planAutoAllocations`, `savingsEngine.ts:58-89`). Per
goal: `due = min(periodsElapsed × allocation, target − saved)`. Goals are funded in rank
order from available cash. The subtle part is the anchor advance
(`savingsEngine.ts:83`): if the goal was fully funded, advance **all** elapsed periods;
otherwise advance only `floor(amount / allocation)` — so a cash-short month **back-funds
gradually rather than silently skipping periods**. Idempotent: nothing happens until a
whole period elapses.

**BL-15 — Overspend raid** (`planOverspendRaid`, `savingsEngine.ts:101-115`). When cash goes
negative, pull from goals in **reverse** rank order (`rankKey(b) − rankKey(a)`) — lowest
priority raided first. Locked goals (`locked !== 1`) and goals with zero saved are excluded.
Investments are never touched. Runs at app open and on foreground via
`runSavingsMaintenance`, which swallows both sub-failures with `.catch(() => …)`
(`savings.ts:309-312`) — deliberate, since maintenance must never block launch.

Undo (`undoOverspendRaid`) re-funds the exact goals by the exact amounts, so it's a true
inverse rather than a recomputation.

### Budgets

**BL-16 — Per-cadence windows, no rollover.** `budget.ts:144-191`. Each budget line is
compared against spend in the current window of *its own* cadence: today / this month /
this year / all-time (`once`). Limits reset each period and unused amounts explicitly do
**not** carry over. One spend query is issued per *distinct cadence*, not per line.

**BL-17 — Two budget scopes.** `getCategoryBudgetStatus` measures one group's spend;
`getMyGlobalBudgetStatus` (`budget.ts:198-219`) measures budgets defined on the personal
group against **my share across all groups**. Passing `meId` switches
`getCategorySpending` from full-bill to my-share — a single parameter flips the entire
meaning of the number.

**BL-18 — Legacy group-level budget carry-over. ✓ RESOLVED (DEBT-08).** `getBudgetUsage`
implemented `carry_over` on the old `budget_group.limit_*` columns, giving the app two
contradictory answers to "does unused budget roll over?" (category budgets have none).

It was worse than legacy — it was **unreachable**. Nothing in the app ever writes
`limit_daily/monthly/yearly`, so `limit` was always null and the carry-over branch could not
execute. Its single caller (`app/group/[id].tsx`) then computed the result and discarded it
without rendering anything: a wasted query on every group open.

`getBudgetUsage`, `getSpentInRange`, `getPriorPeriodRange` and the `BudgetUsage` type are
deleted. Category budgets (BL-16) are the only budgeting mechanism, so there is one answer.

**BL-19 — Health thresholds** live in exactly one place: `budgetHealth(pct)`
(`budget.ts:27-30`), `≥100` red / `≥80` amber / else green, and `utilLabel(pct)`
(`budget.ts:36-40`) which renders `1.2×` past 100 %. Both comments record that these were
previously duplicated with a glyph drift (ASCII `X` vs `×`).

### Forecast & health

**BL-20 — Bühlmann credibility forecast.** `forecast.ts`. `projected = z·runRate +
(1−z)·priorMonth`, with `z = n/(n+K)`, `K = 7` pseudo-days. Deliberately concave rather
than a linear `n/daysInMonth`, so one rent-sized day early in the month can't blow up the
estimate. Requires `dayOfMonth ≥ 3` and `spentSoFar > 0`; guards `daysInMonth <= 0`,
`dayOfMonth > daysInMonth`, and non-finite inputs. Floored at `spentSoFar` — a month can't
end below what's already spent. This is the most carefully specified engine in the repo.

**BL-21 — Financial health.** `financialHealth.ts` (355 L). Five independent signals, each
producing a score *and* a plain-language `detail` string, combined into a band. Every input
is documented in the `HealthInputs` type. Its size is justified by the explanation strings.

### Parsers (F-17)

**BL-22 — Detection order matters.** `importDetect.ts:36-57`. Most-specific signature wins:
our own export (exact — it carries Category and Kind) → Paytm CSV → Paytm statement →
Google Pay → then the user's paste-source picker → finally the tolerant generic parser.
Detection is pure and unit-tested precisely so a picked file needs no format question.

The five parsers it routes to, all tested:

| Module | LOC | Handles |
|---|---|---|
| `paytmParse.ts` | 422 | Paytm CSV, text statement **and** xlsx workbook (three separate detect/parse pairs) |
| `importParse.ts` | 241 | The tolerant generic bank/UPI parser + our own CSV export round-trip (BL-23) |
| `emailTxnParse.ts` | 118 | Transaction-alert emails (paste-source `email`) |
| `gpayParse.ts` | 115 | Google Pay statements — tolerant of the scrambled line order pdf.js produces |
| `xlsx.ts` | 134 | Minimal xlsx reader (via `fflate`) feeding `parseAnyWorkbook` |

**BL-23 — Generic statement parsing is heuristic by design.** `importParse.ts`. It "never
throws: it extracts what it can and the Review inbox is the correction layer."

- *Delimiter detection* (`importParse.ts:38-52`) scores each candidate by consistency across
  lines, tie-breaking toward more columns so a stray comma inside `12,500` can't beat a
  real tab or pipe.
- *Direction* comes from a `dr`/`cr` marker, else a leading `(`/`-`, else the
  `[…debit, credit, balance]` column heuristic where the **last** money field is assumed to
  be a running balance.
- *Dates* try `dd/mm/yyyy` with a month-overflow check, then `Date.parse` — but **only** if
  the field contains a letter or looks ISO, so a bare number is never mistaken for a date.
  No date found → falls back to `Date.now()`.

The fragility here is inherent and correctly compartmentalised: nothing reaches the ledger
without passing through Review.

**BL-24 — Unknown workbooks degrade rather than fail.** `importDetect.ts:65-75`. A
non-Paytm spreadsheet has its **widest sheet** re-joined as CSV (with proper quote
escaping) and fed to the generic text parser, so an unrecognised export still imports
something.

**BL-25 — Category guessing is word-boundary aware.** `smartCategory.ts:43-84`. Both title
and keyword are normalized (lowercased, non-alphanumerics folded to single spaces,
space-padded), so matching is `t.includes(' ' + k + ' ')` — `"automatic"` no longer trips
`auto`, `"steam"` no longer trips `tea`, `"facebook"` no longer trips `book`. Scoring:
multi-word phrases beat single words by +1000, then earlier rule order wins, so
`"amazon prime"` resolves to Entertainment rather than Shopping. **A category is only ever
suggested if it exists in the user's catalog** (`smartCategory.ts:71`).

### Review commit

**BL-26 — Layered effective state.** `reviewCommit.ts:55-95`. A row's value is
`local edits → persisted draft columns → the parsed original`. `effectiveRow` also *sheds*
state that no longer applies: income is forced to personal, and a counterparty is dropped
unless the row is a group settlement — so a leftover pick can't follow a row into a
different shape.

**BL-27 — Commit refuses rather than guesses.** `planCommit` returns `{ok:false}` when
total ≤ 0, when a group split doesn't sum to the total, or when a group settlement's
counterparty isn't actually a member of that group (`reviewCommit.ts:146`). Being pure and
separately testable is the reason this validation is trustworthy.

### Itemized bills

**BL-28 — Adjustment scaling and remainder.** `itemized.ts:60-93`. Each item is split by its
own mode, then every share is scaled by `ratio = adjustedTotal / subtotal` so tax/tip
distributes proportionally. Afterwards the rounding drift is nudged one paise at a time
onto participants who already have a non-zero share, so shares sum to the exact total —
**but only when every item is assigned** (`itemized.ts:84`). With unassigned items the
reconciliation is deliberately skipped, since the bill isn't fully allocated yet.
`computeAdjustedTotal` floors the result at 0, so discounts can't produce a negative bill.

### Recurring

**BL-29 — Materialization is idempotent and horizon-capped.** `recurring.ts:150-205`. Due
occurrences become real editable rows linked by `parent_recur_id` + `recur_override_date`.
Occurrences are skipped if already claimed or user-skipped, and anything older than
`MATERIALIZE_HORIZON_MS` (92 days) stays virtual to avoid a huge first-run back-fill. The
whole run is one transaction, and splits/skips/claims are batch-loaded — the comments
record that both were previously N+1 / ~90 separate fsync'd transactions.

**BL-30 — Materialized occurrences are read-only.** `app/txn/[id].tsx:88-90` disables Edit
when `parent_recur_id` is set and routes the user to the Recurring screen to manage the
series instead. Prevents an edited occurrence from silently diverging from its rule.

**BL-31 — Duplicate `nextOccurrence` implementations. ✓ RESOLVED (DEBT-05).**
`app/group/[id]/recurring.tsx` hand-rolled its own occurrence walker while
`src/lib/recurrence.ts` exported `nextOccurrenceOnOrAfter`, which every other caller used — so
a recurrence fix in the library silently missed that screen.

The screen now **composes** the library primitive. Only the two things the library doesn't model
stayed local: the paused/ended check, and stepping past user-skipped occurrences (it calls
`nextOccurrenceOnOrAfter(rule, skipped + 1)` in a loop). `DEBT_TRACKER.md` had marked this
resolved while the duplication was still there, in the exact file its row named — that row is
now corrected (DRIFT-13).

### Onboarding

**BL-32 — Best-effort commit.** `onboarding.ts:42-88`. Every step is individually
try/caught so one bad contact can't block finishing onboarding; the whole thing returns a
boolean the caller maps to a haptic and then proceeds regardless. `paydayAnchor`
(`onboarding.ts:25-34`) clamps the pay day to the month's length (so day 31 works in
February) and pushes to next month if the date has already passed, so the seeded salary
rule doesn't immediately back-fill.

**BL-33 — Onboarding-captured figures are write-only. ✓ RESOLVED (ISS-05).**
`finalizeOnboarding` stored `monthlyIncome` and `payday` via `settings` and **nothing read
either**. The afford engine derives income independently from the last 30 days of income
transactions (`savings.ts`), which is the better source — it tracks what actually happens
rather than a number typed once during setup.

Both writes and all four `settings` accessors are removed. The seeded salary recurring rule
already records both facts: its amount *is* the income, and `paydayAnchor(payday)` *is* the pay
day. `payday` remains a parameter to `finalizeOnboarding` for exactly that reason — only the
storage was dead, not the input.

---

## 8. Known Issues (ISS-XX)

### The usual signals are clean

- **`0`** TODO / FIXME / HACK / XXX markers in `src/` and `app/`.
- **`2`** `console.*` calls, both deliberate `console.warn` on a caught error
  (`src/lib/ocr.ts:50`, `src/db/seedDemo.ts:254`). No stray debug logging.
- **`5`** uses of `any`, every one at an untyped third-party boundary and commented as such
  (`app/(tabs)/_layout.tsx:32-33` explicitly cites the AGENTS.md exemption; the others are
  a `react-native-svg` animated wrapper, a `ScrollView` ref, and RN's `borderStyle` union).
  No `any` in domain code.
- **`0`** literally empty `catch {}` blocks.

So the issues below come from behaviour, not from markers.

| ID | Severity | Status | Issue | Evidence |
|---|---|---|---|---|
| ~~**ISS-01**~~ | ~~high~~ | ✅ fixed | ~~**`openDB()` runs unconditional destructive data mutations on every single launch.**~~ Not migrations — data edits: `DELETE FROM savings_txn WHERE goal_id IS NULL`, the three `Subscriptions` statements, `UPDATE budget_group SET is_personal=1 WHERE id=(oldest)`, the default-email backfill, and the legacy income-category reclassification. These were one-time fixes with no completion flag, so a user who recreated a "Subscriptions" category had it silently deleted on the next launch. **✅ FIXED** — see below. | was `src/db/schema.ts:387-408` |
| **ISS-02** | high | ✅ fixed | **11 of 19 feature flags gate nothing, and 5 of them are live switches in the Features screen.** Toggling "Financial Health Score", "Savings Insights", "Reports & Charts" or "Scan Receipts" persists a value no code reads; the surfaces render unconditionally. | §4.3; `app/features.tsx:57-78` vs. no `flags.healthScore` / `flags.reportsDonut` / `flags.savingsInsights` / `flags.itemizedOcr` reference anywhere |
| **ISS-03** | medium | ✅ fixed | **Receipt-scan switch promises a feature that was deliberately removed.** S-24 offers "Snap a receipt to prefill the total automatically", but the entry point was deleted and `src/lib/ocr.ts` is marked `@deprecated PARKED`. | `app/features.tsx:78`, `app/add/itemized.tsx:48-50`, `src/lib/ocr.ts:1-8` |
| **ISS-04** | medium | ⏸ deferred | **The onboarding persona question has no effect.** The choice is stored to `onboarding_intent` and never read. The code acknowledges it. | `Onboarding.tsx:169-171`; no reader outside `settings.test.ts` |
| **ISS-05** | low | ✅ fixed | **`monthlyIncome` and `payday` are write-only.** `finalizeOnboarding` stores both; nothing reads them. The afford engine derives its own income figure from the last 30 days of transactions instead. | `src/lib/onboarding.ts:64-65` vs. `src/db/queries/savings.ts:428-437` |
| ~~**ISS-06**~~ | ~~medium~~ | ✅ fixed | ~~**Camera and photo-library permissions are requested at runtime but never declared in `app.json`.**~~ iOS `infoPlist` had only the location string, so an iOS build would crash (not just deny) on the first `requestCameraPermissionsAsync`. Affects F-29 attachments — a shipped feature. **✅ FIXED** — see below. | was `app.json` `ios.infoPlist` vs. `src/lib/attachment.ts:29,33` |
| **ISS-07** | medium | ✅ fixed | **`expo-ocr` declares an Android module that does not exist.** `expo-module.config.json` lists `expo.modules.ocr.ExpoOcrModule` under `android`, but the module has no `android/` directory — only `ios/`. `requireNativeModule('ExpoOcr')` would throw on Android. Currently harmless only because nothing imports it (ISS-03). | `modules/expo-ocr/expo-module.config.json`, `ls modules/expo-ocr/` |
| **ISS-08** | low | ✅ fixed | **Archiving a group is logged as `action: 'deleted'`.** The audit log then renders the label "Expense deleted" above the summary "Archived group · X", with a red `DEL` badge. Wrong noun and wrong verb for the action. | `src/db/queries/groups.ts:154-157` vs. `app/history.tsx:31-44` |
| **ISS-09** | low | ✅ fixed | **`deleteGroup` leaves orphans.** It removes txns, splits, line items, skips, members and budget lines, but not the group's `audit_log` rows, and never deletes attachment files referenced by the deleted transactions — those files stay on disk and keep counting toward the storage total in S-27. | `src/db/queries/groups.ts:123-147`; `src/lib/attachment.ts:62` |
| **ISS-10** | low | ✅ removed | **`is_demo` is set but never used.** Five tables get an `is_demo` column and `loadDemoData` stamps it, but no query filters on it. The schema comment admits this ("No exclusion logic uses it yet"). Demo data is therefore indistinguishable from real data in exports and reports. | `src/db/schema.ts:255-262`, `src/db/seedDemo.ts:352-356`; no reader in `src/lib/groupExport.ts` |
| **ISS-11** | low | ✅ fixed | **Feature flags flash before they load.** `FeatureFlagsProvider` renders children with `DEFAULTS` and swaps in stored values asynchronously. It exposes `ready` precisely so consumers can wait — **no consumer uses it**. A user who turned `recurring` off can briefly see recurring UI on every cold start. | `components/system/FeatureFlagsProvider.tsx:16-30`; no `ready` reference outside the provider |
| **ISS-12** | low | ℹ️ not a defect | **`exact` split isn't validated on the Quick-Add path.** `splitByMode` reads exact amounts verbatim and does not reconcile a shortfall (documented as intentional). The Review path guards this (`assigned !== total` → refuse), but Quick Add has no equivalent check in `handleSave` — so an expense whose shares don't sum to its payments can reach the DB. | `src/lib/money.ts:190-191`, `src/lib/reviewCommit.ts:172`, `src/hooks/useAddTxnForm.ts:343-357` |
| **ISS-13** | info | ✅ removed | **Two dead imports on Home.** `HealthBand` and `EmptyState` are imported and never rendered. | `app/(tabs)/index.tsx:19,31` |
| **ISS-14** | info | ✅ removed | **A hardcoded placeholder email is written to the local user.** `UPDATE person SET email='hello123@vortiqal.com' WHERE is_me=1 AND (email IS NULL OR email='')`, and the same literal in `seedIfNeeded`. Harmless (nothing reads `person.email`, and `person.remote_uid` is likewise never read), but it is a stray placeholder in a shipping data path. **Partially addressed** by the ISS-01 fix — it now runs once per database rather than on every launch — but the placeholder itself remains. | `src/db/schema.ts` (`fix_default_email_v1`), `src/db/seed.ts:18` |

### Error handling: swallowed vs. surfaced

As audited, 24 `catch` blocks and 27 `.catch(…)` handlers discarded their error, but the
pattern is disciplined rather than careless — nearly all are on **maintenance or best-effort**
paths where failing loudly would be worse:

- App-open maintenance (`materializeDueOccurrences`, `runSavingsMaintenance`,
  `rescheduleReminders`) — must never block launch (`app/_layout.tsx:50,62-64`).
- Flag/preference persistence — optimistic UI already updated.
- Per-item loops that must not abort the batch (`onboarding.ts:80` skips one bad contact).

The **user-facing** paths deliberately do the opposite and surface the real message:
`app/reports.tsx:96-98` ("silent 'Export failed' hid genuine bugs before"),
`app/import.tsx:129-146` (distinguishes empty extraction from unmatched text and shows the
first 200 chars), `app/afford.tsx:27-34` (refuses to swallow, because a zeroed snapshot
renders as a confident wrong "you can't afford it"), and `attachment.ts:47-51` (typed
`AttachmentStorageError` so the caller can save the expense without the photo).

**✓ RESOLVED (INT-04)** — one swallow was on the wrong side of that line: "Send a test
notification" caught everything and showed "Sent!" regardless, so a user on Expo Go (where local
notifications silently do nothing) could not distinguish working from broken. `sendTestReminder`
already returned a typed `'scheduled' | 'denied' | 'unavailable'` *for this purpose* and the
caller was discarding it. It now reports which happened. That was the only user-initiated path
among the swallows; the rest remain deliberate.

Two exceptions still worth flagging: the **schema rebuilds** at `schema.ts` (the `'yearly'` and
`kind='transfer'` rebuilds)
catch and continue silently, leaving the old table in place with no signal that
`recur_freq='yearly'` or `kind='transfer'` is now unavailable — a partial-capability state
the app can't detect. Same for the global-category migration at `schema.ts:442`.

---

## 9. Tech Debt / Risk Areas (DEBT-XX)

| ID | Risk | Status | Area | Why it makes change harder |
|---|---|---|---|---|
| **DEBT-01** | medium | ⏸ deferred | **`openDB()` is a 200-line accumulator.** `src/db/schema.ts` holds the schema, 40 `ALTER`s, two full table rebuilds, a third migration, six one-time data fixes, and the category seeding/backfill — all in a fixed order with cross-dependencies (indexes must come *after* the rebuild; the data fixes and section backfill must straddle the global-category migration). *Downgraded from high:* the data fixes are now keyed and run once (ISS-01 fix), which is a partial migration-ledger. The `ALTER`s and rebuilds still re-run every launch, and there is still no single schema-version number. | Every new migration must reason about the whole file's ordering. Cold-start cost still grows with each `ALTER`. The `settings` keys now record which *data* fixes landed, but not which schema version a given DB is at. |
| **DEBT-02** | high | ⏸ deferred | **`src/db/queries/savings.ts` (484 L) is four modules in a trench coat.** It owns goals CRUD, the savings ledger, auto-funding, the overspend raid, the *cash position*, *total money*, the *afford snapshot*, and *savings insights* — three of which have nothing to do with savings. | `app/afford.tsx` and the Plan tab both import from a "savings" module for non-savings data. Any change to cash math lands in the same file as goal CRUD. |
| **DEBT-03** | high | ✅ fixed | **Two screens render the personal group.** `app/personal.tsx` (384 L) and the `is_personal` branch of `app/group/[id].tsx` (311 L) are both reachable: the Groups list routes to `/personal`, every other deep link routes to `/group/{personalId}`. They have different tabs (Activity/Budget/Recurring vs. Expenses/Budget), different filters, and separately implemented export handlers. | A change to "the personal screen" must be made twice, and the two can silently drift. Neither is obviously the canonical one. |
| **DEBT-04** | medium | 🔒 by design | **Preferences live in three-and-a-half places.** Feature flags (AsyncStorage `feature_*`), `settings.ts` (AsyncStorage, 12 keys), reminder prefs (AsyncStorage JSON), plus the vestigial `settings` SQL table. `save_location` sits in the *second* store but is presented in the *flags* UI. | "Where is this preference stored?" has no single answer, and the Features screen mixes two mechanisms behind identical-looking switches. |
| **DEBT-05** | medium | ✅ fixed | **Duplicated occurrence math.** `app/group/[id]/recurring.tsx:35-54` hand-rolls `nextOccurrence` (with its own `guard < 2000` cap and its own skip handling) while `src/lib/recurrence.ts` exports `nextOccurrenceOnOrAfter`, used by `plan/recurring.tsx`, `txn/[id].tsx`, `groupDetail.ts` and `queries/recurring.ts`. Two implementations of the same rule, one of them untested. | A recurrence fix applied to the library silently misses the group screen. Contrast BL-10, where the intentional JS/SQL duplication is *locked together by a test*. |
| **DEBT-06** | medium | ⏸ deferred | **`app/category/[name].tsx` fetches a full year of every category's expenses** and filters client-side so period tabs are instant (`:90-105`). Correct today; the heaviest read in the app, and it grows linearly with history forever. | Will degrade silently as users accumulate data. No pagination or windowing escape hatch. |
| **DEBT-07** | medium | ✅ fixed | **13 of 52 `src/lib` modules have no test.** The engines are well covered (39/52), but the untested set includes the largest screen-data assemblers: `analytics.ts` (240 L), `homeData.ts` (218 L), `reportsData.ts` (178 L), `insightsData.ts` (125 L), `notifications.ts` (120 L), `onboarding.ts` (88 L), `attachment.ts` (81 L), plus `haptics`, `avatar`, `location`, `pdfjsCache`, `shareCsv`, `txnDetail`. | `homeData` and `reportsData` decide what the two most-viewed screens display, and both compose several tested engines in untested ways. |
| **DEBT-08** | medium | ✅ fixed | **Two coexisting budget-rollover semantics.** `getBudgetUsage` still implements `carry_over` on the legacy `budget_group.limit_daily/monthly/yearly` columns (BL-18), while category budgets explicitly have no rollover (BL-16). The legacy columns are still read by `getBudgetUsage`, which `app/group/[id].tsx:70` still calls. | Two answers to "does unused budget carry over?" depending on which path a screen took. |
| **DEBT-09** | medium | ✅ fixed | **19 flag keys, 8 real gates** (§4.3). Six `dashboard*` keys and `budgetInsights` have no UI *and* no consumer. | The `FeatureKey` union reads as a specification of the app's optional surfaces, but it is mostly aspirational — misleading to anyone using it as a map. |
| **DEBT-10** | medium | ✅ fixed | **Remote JS is fetched and executed without an integrity check.** `pdfjsCache.ts` downloads pdf.js from cdnjs over HTTPS and `PdfTextExtractor.tsx` inlines it into a WebView. Version is pinned; the *content* is not (no SRI, no hash). | A CDN compromise executes arbitrary JS in a WebView that is handed the user's financial PDF. Low likelihood, high blast radius, and cheap to fix with a hash check. |
| **DEBT-11** | medium | ⏸ deferred | **`app/review.tsx` is 977 lines** — the largest file in the repo, and 3× the project's own ~300-line screen-thinness rule in `AGENTS.md`. The pure logic *has* been extracted (`reviewCommit`, `reviewFilter`, `reviewViews`), so what remains is state and JSX: 20+ `useState`s, 8 sheet-visibility flags, bulk mode, focus mode, filters and saved views in one component. | Highest-complexity screen in the app with no sub-component decomposition. Any change requires understanding all four interaction modes at once. |
| **DEBT-12** | medium | ✅ fixed | **`Onboarding.tsx` is 793 lines** for nine stages in one component with ~15 `useState`s, and its commit is split between `lib/onboarding.ts` (name/income/budget/people) and an inline `setMoneyProfile` call. | Adding a step means touching a single 800-line file, and the split commit means "what does onboarding persist?" needs two files to answer. |
| **DEBT-13** | low | 🔒 policy | **Other files over the 300-line rule**: `app/add/itemized.tsx` (614), `app/reports.tsx` (438), `app/savings/[id].tsx` (437), `app/txn/[id].tsx` (436), `app/categories.tsx` (436), `app/category/[name].tsx` (418), `app/personal.tsx` (384), `app/insights.tsx` (378), `app/(tabs)/groups.tsx` (373), `app/group/[id]/budget.tsx` (362), `app/(tabs)/index.tsx` (352), `app/(tabs)/savings.tsx` (328), `app/(tabs)/settings.tsx` (321), `app/import.tsx` (313), `app/group/[id].tsx` (311). Several already delegate logic to a hook and are mostly JSX + `StyleSheet`. | Not urgent individually; collectively it means the rule in `AGENTS.md` is aspirational rather than enforced. |
| **DEBT-14** | low | ✅ fixed | **`txn` is three entities in one table** (BL-11). The `recur_freq IS NULL` filter that separates real spend from rule templates is enforced by convention and index design, not by the schema. | The single highest-consequence mistake a new query can make, and nothing catches it. A `CHECK` constraint or a view would. |
| **DEBT-15** | low | ✅ removed | **`is_demo` columns with no consumer** (ISS-10) — five columns of dead schema that look like a safety mechanism but aren't. | Anyone reading the schema will assume demo data is excluded somewhere. It isn't. |
| **DEBT-16** | info | 🔒 policy | **Two token systems coexist.** `src/theme/` is canonical; `src/constants/{colors,typography,layout}` are back-compat re-export shims. Most screens still import from `constants`, and `components/tokens.ts` is a third entry point. | Three import paths for the same values. Documented in `AGENTS.md` as intentional, so it's tracked debt rather than accidental. |

### What is *not* debt (and should be preserved)

Worth recording explicitly, because a cleanup pass could easily undo these:

- **`cashQuery.ts` + `cash.ts` + `cashSql.test.ts`** — the same math in SQL and JS, kept
  honest by a test that runs the SQL against a real engine. This is the correct way to
  duplicate a computation for performance.
- **The single-source engines** — `oweView` (sign/colour/wording), `budgetHealth` +
  `utilLabel` (thresholds), `formatChangeMagnitude` (%-vs-×), `splitByMode` (all split
  math), `simplify` (used identically by settle, reminders, friends and scopes). Each
  carries a comment recording the drift it was created to end.
- **Purity boundaries** — `src/lib` engines take plain data and no `db`, which is why 38 of
  them are unit-tested at all. `reviewCommit.ts` and `savingsEngine.ts` in particular were
  extracted from screens specifically to make money decisions testable.
- **The index comments in `schema.ts:370-385`**, each naming the exact query it serves.
- **Deliberate asymmetries** that look like bugs and aren't: one-sided personal transfers
  (BL-09), unbalanced `exact` splits (BL-02), `AppRefreshControl` exemptions, the Android
  BlurView opt-out (`(tabs)/_layout.tsx:62-64`), and the 450 ms skeleton floor in Reports.

---

## 10. Doc Drift

Kept in its own file to stop this one from bloating: **[AUDIT_DOC_DRIFT.md](./AUDIT_DOC_DRIFT.md)**.

It records where `ARCHITECTURE.md`, `DEBT_TRACKER.md` and `FEATURES_AND_FLOWS.md` disagree
with the code (21 findings, `DRIFT-01`…`DRIFT-21`), in both directions — doc-is-stale and
doc-claims-fixed-but-isn't. Headlines:

- `ARCHITECTURE.md` §10's feature-flag table is substantially wrong (names a flag that
  doesn't exist, credits three flags with gating surfaces they don't gate, and omits nine).
  §1–§6 of the same file are accurate.
- `DEBT_TRACKER.md` marks the duplicated `nextOccurrence` as resolved; it is still duplicated
  in the exact file the row names (AUDIT DEBT-05).
- `DEBT_TRACKER.md` reports 9 untested lib modules; there are 13 — the four missing ones are
  the screen-data loaders extracted during its own complexity paydown.
