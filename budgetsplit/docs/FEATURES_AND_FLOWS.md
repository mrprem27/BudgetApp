# BudgetSplit — Features & User Flows

> **The single source of truth for behaviour.** Every screen, every state, every component
> (top → bottom), every user action with its exact destination, every pill — plus the
> cross-cutting rules (validation, permissions, notifications, network) that don't belong to
> one screen. For how it's built, see [ARCHITECTURE.md](./ARCHITECTURE.md); for per-feature
> status IDs, [AUDIT.md](./AUDIT.md) §1.
>
> **Notation:** `→` = navigates to · *(sheet)* = bottom-sheet modal · *(toggle)* = switch,
> no nav · 🔘 = pill/segmented control. Pushed screens have a `‹` back chevron
> (`ScreenHeader`); tab screens have no back button; the two Add flows are `fullScreenModal`
> presentations (`ModalHeader`). Money is integer paise internally, shown via
> `formatRupees`/`formatCompact`. "Flag" = a `useFeatureFlags()` gate.
>
> **Status (reconciled 2026-08-04 against `main` @ `1d7f256`).** This pass made the doc the
> single behaviour reference: `AUDIT.md` §2 (screen inventory) and §3 (user flows) were
> absorbed here and reduced to pointers, so the `S-XX` / `FLOW-XX` IDs other docs cite now
> resolve to §3 and §15 below. Corrected against source: **receipt scanning is live**, not
> parked (§7.4) and ships with a **cloud OCR provider** that makes a network call (§19);
> **`/settings/backup`**, **`/review`**, **`/import`** and **`/report-transactions`** now have
> sections; there are **7 pay methods**, not 3; goal funding
> is `fundGoal` with **no pool**. Every route now carries a documented state set (§20).
>
> **Revised 2026-08-18** (pre-pilot consistency pass — see `RELEASE_CHECKLIST.md`):
> onboarding is now **9 stages**, of which one (`summary`) asks nothing; the feature
> carousel, the `payoff` beat and the `committing` stage are gone.

---

## Contents

**Screens, in navigation order**
1. [First run & onboarding](#1-first-run--onboarding)
2. [The navigation shell + graph](#2-the-navigation-shell--graph)
3. [Screen index (S-XX)](#3-screen-index-s-xx)
4. [Home / Dashboard](#4-home--dashboard)
5. [Groups](#5-groups)
6. [Group detail & sub-screens](#6-group-detail--sub-screens)
7. [Add flows](#7-add-flows)
8. [Plan tab & savings](#8-plan-tab--savings)
9. [Settle up](#9-settle-up)
10. [Import → Review](#10-import--review)
11. [Transaction & category detail](#11-transaction--category-detail)
12. [Analytics — Reports, drill-down, Insights](#12-analytics--reports-drill-down-insights)
13. [Settings & sub-screens](#13-settings--sub-screens)
14. [Optional modules](#14-optional-modules)

**Cross-cutting**
15. [Key user flows (FLOW-XX)](#15-key-user-flows-flow-xx)
16. [Validation rules](#16-validation-rules)
17. [Permissions](#17-permissions)
18. [Notifications](#18-notifications)
19. [Network & data egress](#19-network--data-egress)
20. [Every screen's states](#20-every-screens-states)
21. [System components & global behaviors](#21-system-components--global-behaviors)
22. [Every pill, in one table](#22-every-pill-in-one-table)
23. [Sheets & overlays, in one table](#23-sheets--overlays-in-one-table)
24. [Developer / QA tooling](#24-developer--qa-tooling)
25. [Component inventory](#25-component-inventory)
26. [Manual test flows](#26-manual-test-flows)

---

## 1. First run & onboarding

`OnboardingGate` checks AsyncStorage `onboarding_done`. If unset, it renders the **9-stage**
`Onboarding` flow (`src/hooks/useOnboardingForm.ts` owns the stage machine; `OnboardingStage`
is the authoritative list): `hero → intent → name → income → money → budget → people →
permissions → summary`. A single DB commit (`finalizeOnboarding`) happens at the very end —
nothing is written mid-flow except the persona flag defaults.

**One of the nine asks nothing.** `summary` reads back what the answers actually created —
the salary rule and where it shows, the budget and where it shows, the group and its members,
the backup reminder — then offers "Log your first expense". It replaced a forward-only
`payoff` beat and a `committing` stage whose three-phase checklist was ~1.7s of manufactured
waiting over a write that completes in milliseconds. Every other stage now changes something
the user can see; the four-slide feature carousel, which asked nothing and changed nothing,
was deleted (`RELEASE_CHECKLIST.md`, appendix).

**Shared chrome.** Every non-hero stage renders through `StepScaffold` (back + one progress bar
in a single top row, scrolling body, pinned `StepFooter`). Before this, the back chevron was
copy-pasted into seven stages, the footer into six, and there were **two** unrelated progress
systems shown on different subsets of steps. ⛔ The hero keeps its own layout, `styles.footer`
and `bottomPad` — those are tuned to `LogoAssembly`'s ~3.7 s run, so `StepFooter` **forks**
equivalent styling rather than sharing theirs.

| # | Stage | What the user does | Persisted |
|---|---|---|---|
| 0 | **Hero** | `LogoAssembly` brand animation plays (⛔ off-limits), wordmark + tagline fade in. Tap **Get Started** — or **Skip intro**, a sibling overlay that fades in ~1s so the first tap isn't gated behind the animation's ~4.8s reveal. | nothing |
| 1 | **Intent** | "What brings you here?" — pick *personal* / *split* / *household* / *both* (default both). The note beneath lists exactly what the choice **trims**, derived live from `personaTrims()`, so the copy can't drift from the flags. | `onboarding_intent` **and the flag defaults it implies** (`personaFlags` / `personaChangedKeys` in `src/lib/personaDefaults.ts`) |
| 2 | **Name** | Type your name (≤30). **Continue** or **Skip**. | committed in `finalize` |
| 3 | **Income + pay-day** | Take-home `₹` field + preset chips (30k/45k/60k/1L) + pay-day chips. Sub-copy states what the answer does: a salary entry on that day, visible under Plan → Recurring, powering "Can I afford this?". **Skip**. | committed in `finalize` |
| 4 | **Money** | Cash on hand leads; investments / credit limit / credit used sit in a quieter card beneath. **Skip**. | committed in `finalize` |
| 5 | **Budget** | Monthly cap field + presets **derived from the income just entered** (50/60/70% of take-home); shows "X% of your take-home — it shows as the pace bar on Home". **Skip**. | `budget_target`, read by Home's pace bar and the health engine when no category budgets exist |
| 6 | **People** | Add split-contacts inline (dedup by name), then name the group they form (Home / Trip / Friends / custom). **Skipped entirely when intent is *personal***. | contacts **and a real group** holding them, in `finalize` |
| 7 | **Permissions** | Prime **Notifications** (→ renewal reminders on grant) and **Location** (→ `save_location='true'`), plus the flag-gated Siri shortcut hand-off. States the local-only reality and the monthly backup nudge. | `save_location` on grant |
| 8 | **Summary** | Reads back what the answers actually created — each row names the artifact and where it now lives — then **Log your first expense** (arms `pending_first_add`) or **Go to Home**. Asks nothing. | `pending_first_add` on the primary CTA |

**Stage order** comes from `NUMBERED_STEPS = ['intent','name','income','money','budget','people','permissions']`,
filtered by intent (`numberedSteps()`); `summary` is a result, not a numbered question. Back
navigation uses `afterBudget` / `beforePermissions`, which skip `people` for the personal
persona in both directions. The progress indicator is known from the **first** question rather
than appearing three screens in, and the personal persona reads "5 of 6" rather than leaving a
gap where `people` would have been.

**`finalizeOnboarding()`** (`src/lib/onboarding.ts`, best-effort, each step isolated so
one failure never blocks finishing — covered by `finalizeOnboarding.test.ts`, including a
preservation case asserting that a skipped answer removes only its own artifact):
- `applyPersona(intent)` — the stored intent plus the flag defaults it implies.
- `updatePersonName(me)` if a name was entered.
- If income > 0: inserts a **recurring monthly Salary income** in the Personal group anchored
  by `paydayAnchor(day)` — the next occurrence of that day-of-month at 09:00, clamped to month
  length, so it never immediately back-fills. Visible day-0 on `/plan/recurring` (which shows
  income, not just expenses) and used as the afford engine's income floor.
- If budget > 0: writes the `budget_target` preference. **Not** a `category_budget` — inventing
  a `Total` category put a phantom Others row on Personal and offered "Total" for adoption in
  the editor. Home's pace bar and the health engine read the preference until real category
  budgets exist.
- Each contact → `insertPerson`; if any were added, `insertGroup` creates the group they named
  with `[me, ...contacts]` as members.
- `setMoneyProfile` writes cash / investments / credit.
- `setReminderPrefs({ backup: true })` — the monthly backup nudge defaults on, because with no
  sync a lost phone is total data loss and a skipped notification prompt used to mean no
  mitigation at all (`V2-02`).
- Calls `onDone()` → gate writes `onboarding_done='true'` in a `try/finally`, so the gate opens
  even if that write fails. The summary's primary CTA persists `pending_first_add='true'`
  (Home auto-opens Add once, then clears the flag).

**Replay:** Settings → "Replay welcome tour" removes `onboarding_done` and restarts this flow.

---

## 2. The navigation shell + graph

Custom bottom tab bar: **Home · Groups · [FAB] · Plan · Settings**.
- **FAB** (coral→teal gradient `+`) sits *inside* the bar so it always paints above content:
  one tap → `/add/quick?kind=expense` (light haptic — the one sanctioned nav haptic).
- Active tab tint = teal; inactive = muted. iOS gets a live `BlurView`; Android uses a
  near-opaque fill deliberately (BlurView recomposites every frame → scroll jank).
- **Slot 2 is conditional:** with `flags.splitting` off, "Groups" is replaced by **Personal**
  (`user` icon) pushing `/personal`, and the owe/owed strip and Transfer kind disappear too.
- Every list screen reserves `layout.fabHeight` of bottom padding so the FAB never covers the
  last row.

```
Tab bar:  Home · Groups · (＋FAB) · Plan · Settings

Home ──► Search, History, Review, Reminders, Settings, Insights, Category,
         Group budget, Groups, Friends, Add(expense/transfer)
Groups ──► Personal (pinned), Group detail, Add(transfer)
Personal ──► Txn (source), Budget editor, group Recurring
Plan ──► Goal detail, Insights, Recurring, Afford
Settings ──► People, Categories, Budget, Features, Notifications, Backup,
             Import, Reports, Help, History, Storage
Group detail ──► Txn, Budget, Members, Recurring, Edit, History, Add(expense/transfer)
Add(quick) ──► Itemized, Storage(attach)
Import ──► Review ──► Import
Reports ──► Report transactions ──► Txn
```

Only three routes get explicit `Stack.Screen` options (`app/_layout.tsx:108-111`): `(tabs)`
fades; `add/quick` and `add/itemized` present as `fullScreenModal` sliding from the bottom.
No route uses `presentation: 'modal'` or `'transparentModal'` — everything else is a plain
right-slide push.

---

## 3. Screen index (S-XX)

Absorbed from `AUDIT.md` §2 so the IDs cited elsewhere resolve here. 34 route files under
`app/`; expo-router registers each implicitly by filename.

### 3.1 Shell / layout (not user-visible screens)

| ID | File | Role |
|---|---|---|
| S-01 | `app/_layout.tsx` | Root. Fonts → `openDB()` → `seedIfNeeded` → `materializeDueOccurrences` → `runSavingsMaintenance` → `rescheduleReminders`; re-runs the last three on `AppState → active`. Provider stack: `SafeAreaProvider → GestureHandlerRootView → SQLiteProvider → FeatureFlagsProvider → FlagsGate → DataRefreshProvider → StoreHydrator → UndoProvider → LockGate → OnboardingGate → Stack`, with `PrivacyScreen` as a sibling overlay. DB-open failure renders a retryable `ErrorState`. |
| S-02 | `app/(tabs)/_layout.tsx` | Custom 5-slot tab bar (see §2). Route name `savings` renders the label **"Plan"**. |

### 3.2 Tab screens

| ID | Screen | File | Purpose | Exits |
|---|---|---|---|---|
| S-03 | **Home / Dashboard** | `app/(tabs)/index.tsx` | Period-scoped spend hero + category ranks + owe/owed + forecast + streak. Dedicated first-run empty state. | `/review` `/search` `/reminders` `/settings` `/history` `/add/quick` `/group/{personal}/budget` `/groups` `/friends` `/category/{name}` `/insights` |
| S-04 | **Groups** | `app/(tabs)/groups.tsx` | Groups list (Personal pinned first) with budget health + my net; swipe-left archive/restore; People balance chips. | `/group/{id}` (or `/personal`) · `/add/quick?kind=transfer&to=` |
| S-05 | **Plan** | `app/(tabs)/savings.tsx` | Available-Money card (+ net worth, credit headroom), overspend **consent** prompt, drag-rankable goals, upcoming bills, forecast. | `/insights` `/plan/recurring` `/afford` · `/savings/{id}` |
| S-06 | **Settings** | `app/(tabs)/settings.tsx` | Profile + **Account** (only with a server configured) / **Getting paid** (Your UPI ID · Show my UPI QR, behind `upiSettle`) / Manage / Preferences / Security / Notifications / Data & Help / About. Version ×7 unlocks S-27. | `/settings/account` `/friends` `/categories` `/group/{personal}/budget` `/groups` `/features` `/settings/notifications` `/settings/backup` `/import` `/reports` `/help` `/history` `/storage` |

### 3.3 Add / edit flows (full-screen modals)

| ID | Screen | File | Purpose |
|---|---|---|---|
| S-07 | **Quick Add** | `app/add/quick.tsx` | One form for expense / income / transfer, plus edit mode and recurring-rule edit mode. All state in `useAddTxnForm`; the file is render-only. |
| S-08 | **Itemized bill** | `app/add/itemized.tsx` | 4-step wizard (items → assign → payers → review) with per-item splitting, four adjustment types, and **receipt scanning** (§7.4). State in `useItemizedForm`. |

### 3.4 Group screens

| ID | Screen | File | Purpose |
|---|---|---|---|
| S-09 | **Group detail** | `app/group/[id].tsx` | Group hub; tabs differ by kind. `/group/{personalId}` `router.replace`s to `/personal`, so old deep links still resolve. |
| S-10 | **My Budget** | `app/budget.tsx` | The **global** budget: your limits across personal spending and your share of every group. Stored as the Personal group's `person_id IS NULL` lines. No level control — there are no levels here. Takes **no group id**, which is what removed the `?? groups[0]` fallbacks that let a personal-sounding entry point open a *shared* group's editor. |
| S-10b | **Group budget editor** | `app/group/[id]/budget.tsx` | A group's **default** (admin-only, what every member inherits) and **Mine** (your private per-category override). Switching to Mine asks first (`OwnBudgetSheet`) and only the categories you fill in become yours; blanks keep following the group. A personal group forwards to `/budget`. Both routes render `components/finance/budget/BudgetEditor`. |
| S-11 | **Members** | `app/group/[id]/members.tsx` | Add/remove/rename members, avatars, per-member net. Swipe-remove with Undo. |
| S-12 | **Group recurring** | `app/group/[id]/recurring.tsx` | Pause / resume / end / skip-next (with undo-skip). `?focus=<id>` highlights a rule for 2.6 s. |
| S-13 | **Edit group** | `app/group/[id]/edit.tsx` | Rename / re-icon / re-colour / default split + membership diff; archive and hard-delete. Shares `GroupForm` with the create sheet. |
| S-14 | **Personal** | `app/personal.tsx` | The unified personal screen: Activity / Budget / Recurring, filterable across personal-vs-group activity, CSV export. The **only** personal screen — S-09's `is_personal` branch was retired. |

### 3.5 Detail screens

| ID | Screen | File | Purpose |
|---|---|---|---|
| S-15 | **Transaction detail** | `app/txn/[id].tsx` | Hero amount, kind badge, per-person split, read-only line items, receipt attachment + full-screen viewer, audit history, Delete + Edit. |
| S-16 | **Category detail** | `app/category/[name].tsx` | One category across day/month/year: my-share totals, budget bar, transactions, related recurring rules and goals. Fetches **the whole year across all categories** and filters client-side so period tabs switch without a re-query — correct, but the heaviest single read in the app (DEBT-06). |
| S-17 | **Goal detail** | `app/savings/[id].tsx` | Ring progress, add/withdraw, adjust target/allocation/frequency/deadline, lock, delete, contribution history, completion celebration. |

### 3.6 Import / review

| ID | Screen | File | Purpose |
|---|---|---|---|
| S-18 | **Import** | `app/import.tsx` | Pick a PDF / xlsx / CSV / text file *or* paste text; format auto-detected; rows land in `pending_txn`. See §10.1. |
| S-19 | **Review** | `app/review.tsx` (**largest screen in the repo**) | The staging inbox — every pending row editable in place, draft auto-save, bulk actions, focus workspace, filters, saved views. See §10.2. |
| S-40 | **Waiting for you** | `app/approvals.tsx` | Entries **other people** wrote that are waiting on your approval. Grouped by author, with approve / not-mine per entry and "Trust <name>" per person. Unreachable today — nothing can author a peer entry until sync exists. See §10.3. |

### 3.7 Analytics

| ID | Screen | File | Purpose |
|---|---|---|---|
| S-20 | **Reports** | `app/reports.tsx` | Factual monthly history: donut, trend bars, per-group budget summaries, year stats, CSV + PDF export. Month selector cannot advance past the current month. |
| S-21 | **Report transactions** | `app/report-transactions.tsx` | Month-scoped transaction list with category / type / group / sort filters — the drill-down from a Reports category. |
| S-22 | **Insights** | `app/insights.tsx` | The single narrative-insight home: velocity hero, month-end forecast chart, category shifts, what-if slider, recommendations, savings insights. |
| S-23 | **Search** | `app/search.tsx` | Free-text search over 3 years, month-sectioned, 6 rows/section with a "more" expander. 150 ms debounce. Deliberately **no** pull-to-refresh. |

### 3.8 Settings sub-screens & utilities

| ID | Screen | File | Purpose |
|---|---|---|---|
| S-24 | **Feature management** | `app/features.tsx` | Non-toggleable "Core" pillars + the switchable modules in sections. Every switch here changes something. Location tagging sits in this list but writes to `settings`, not the flag namespace — deliberately, because it must await an OS grant and refuse if denied (§17). |
| S-25 | **Categories** | `app/categories.tsx` | Global category catalog (expense / income / transfer), sectioned. Create, rename, delete, and **adopt** an uncategorized name. Self-heals an empty catalog. |
| S-26 | **People / Friends** | `app/friends.tsx` | Name-only contacts, no accounts. Add, rename, avatar, per-person net, search. |
| S-26a | **Person detail** | `app/person/[id].tsx` | Everything shared with one person, across every group: the net (with the per-group breakdown behind it, from `computeTransferScopes`), how often they settle up, and every transaction you are **both** on — payer or sharer, expenses, settlements and income alike. Settle from here. Reached from S-26 and from the Groups-tab balance chips; personal-group rows are excluded, since a personal settlement is deliberately one-sided. |
| S-27 | **Storage (dev)** | `app/storage.tsx` | Hidden QA screen: attachment stats, clear attachments, **load demo data, erase all data**. Settings → version ×7. Kept separate from S-27a precisely so those two destructive actions are never one tap from Settings. |
| S-27a | **Storage** | `app/settings/storage.tsx` | User-facing: free space on the device (hero), what BudgetSplit uses broken out (receipts / cached exports / pdf.js reader / profile photos), and two safe reclaim actions — **Clear cached exports** and **Delete all receipt photos**. Nothing here can lose a transaction. Reached from Settings → Data & Help, and from the low-storage banner on Home. |
| S-35 | **Voice entry** | `app/settings/voice.tsx` | Sets up hands-free capture: what to say, which words route to a split, and the one-time Siri-shortcut setup (one-tap iCloud install when `VOICE_SHORTCUT_URL` is set, otherwise the four manual Shortcuts actions). Creates the `voice-inbox` folder the shortcut writes into, and shows how many captures are waiting. Gated on `voiceEntry`. |
| S-28 | **Audit log** | `app/history.tsx` | Paged (30/page) date-grouped log of created/updated/deleted/settled/paused/resumed/ended. `?groupId=` scopes it. |
| S-29 | **Help** | `app/help.tsx` | Static accordion of help copy, ordered by screen flow — Getting Started → Your Home Screen → Groups → **Settling Up & Paying** → Budgets → Savings → Recurring → Reports → Categories → Privacy → Tips. No data access. |
| S-30 | **Reminders** | `app/reminders.tsx` | Read-only "what's coming": bills due in 14 days + pending settle-ups involving me. |
| S-31 | **Notifications** | `app/settings/notifications.tsx` | Reminder prefs (renewals / daily log / backup nudge), OS permission handling, send-a-test. See §18. |
| S-32 | **Recurring (global)** | `app/plan/recurring.tsx` | All active recurring expense rules across groups, sorted by next occurrence, with a monthly-equivalent total. Per-row **Skip next · Pause · Stop** (shared `useRecurringActions`); row tap → `/group/{id}/recurring?focus={ruleId}`. |
| S-33 | **Afford check** | `app/afford.tsx` | Amount + optional category + optional necessity (*Need · Want · Can wait*) → Comfortable / Tight / No verdict with plain-English reasons, plus a **what this costs you** block (projected month-end, goal delay). Seven axes: cash, buffer, category budget, category norm, income share, month projection, typical-basket size. **Only cash produces a hard No**; necessity softens the buffer axis alone and never overrides it. The same `evaluateAfford` drives the one-line verdict in Add's `BudgetNudge`. |
| S-34 | **Backup & restore** | `app/settings/backup.tsx` | Passphrase-encrypted whole-DB backup out to the share sheet **or** to your account; restore **replaces all data**. See §13.3. |
| S-36 | **Account** | `app/settings/account.tsx` | Optional server account (`server/api`): sign in by email magic link — no password — see the profile the server holds, push this device's name/picture up, sign out. Exists only in a build with `EXPO_PUBLIC_API_URL` set; buys exactly one capability, off-device encrypted backups (§13.3). |
| S-38 | **Linked people** | `app/settings/linked.tsx` | Who you're linked with, who is **waiting for your approval**, and per-person "show them my number". Invite by link or QR. No search, no directory — a link you generated is the only way in. Server-configured builds only. See §13.5. |
| S-39 | **Invite landing** | `app/link.tsx` | Where a tapped invite link lands (`budgetsplit:///link?token=…`, bounced from the Worker's `/invite/open`). Claiming **asks**; it links nothing until the sender confirms. Deep-link target only. |
| S-37 | **Sign-in callback** | `app/auth.tsx` | Where a tapped magic link lands (`budgetsplit:///auth?token=…`, redirected from the Worker's `/auth/open`). Spends the token once, then replaces itself with S-36. Not reachable from any button — a deep-link target only. |

### 3.9 Reachability

Every route is reachable. Conditionally: S-32 and S-33 only appear when their flags are on
(`recurring: true`, `streak: false` by default), S-27 requires the 7-tap easter egg, S-36 only
appears in a build with a server configured, and S-37 / S-39 are only ever entered from a
link in an email or a message.

---

## 4. Home / Dashboard

**Route:** `app/(tabs)/index.tsx` · **Question:** "How am I doing financially right now?"

### States
- **Loading:** renders nothing (deliberate — avoids flashing an empty home).
- **Error:** `ErrorState` + retry.
- **Empty (first run):** no spend, no income, no category history → a `₹0` empty hero
  ("Nothing logged yet", **Log first expense** → `/add/quick?kind=expense`) + a GET STARTED
  tile list: budget (→ `/group/{personal}/budget`), group (→ `/groups`), friends (→ `/friends`).
- **Full:** hero + period pills + breakdown + balances + forecast + coming-up + streak.

### Layout (top → bottom) & actions
1. **Header** — greeting + first name, then the icon row: **inbox badge** *(only when `reviewCount > 0`, showing the count or "9+")* → `/review`; 🔍 → `/search`; 🔔 *(labelled with the upcoming count)* → `/reminders`; avatar → `/settings`.
2. **Catch-up banner** (conditional) — amber, when the app was closed 30+ days with active recurring rules. **Review entries** → `/history` (the only route to the audit log from Home); **Dismiss**.
3. **HeroCard** — XL period spend (SpaceMono); pace bar + "X% · ₹Y left" **only if a budget is set** (else number + delta vs previous period); SVG health ring *(flag `healthScore` — `index.tsx:80` nulls the score when off, and `HeroCard` hides the ring on a null score)* → **HealthSheet** *(sheet)*.
4. 🔘 **TabPills** — `Month · Today · Year` (re-runs the data load for that period).
5. **CategoryRankList** ("WHERE IT WENT") — top 3 category bars; row tap → `/category/{name}?period={tab}`; **+N more** expands. `everHadCats` keeps the card mounted across period switches so it never collapses.
6. **BalanceStrip** — shown if you owe / are owed > 0: "You owe / Owed to you" + **Settle** → `/add/quick?kind=transfer`. Hidden entirely when `flags.splitting` is off.
7. **ForecastCard** *(Month view only, when `forecast.ready`)* — **below the Owe/Owed strip**: month-end projection vs budget + pace bar; biggest-shift teaser; **See all insights** → `/insights`.
8. **ComingUpList** — next recurring bills (`buildUpcoming`); hidden when empty.
9. **StreakCard** *(flag `streak`)* — self-hides under 3 consecutive logged days.

**Data loaded** via `loadHomeData(db, groups, tab)`
(`src/lib/homeData.ts`), with `groups` read from the zustand store rather than re-queried.
Deps `[groups, tab]`. Budget is stored monthly and
**scaled to the active period** for the pace line: ÷ days for Today, × 12 for Year. On focus,
outside the loader: reads AsyncStorage `hide_amounts` (obfuscates the hero), `app_last_open`
(catch-up check), and the one-shot `pending_first_add` push into Quick Add.

---

## 5. Groups

**Route:** `app/(tabs)/groups.tsx` · **Question:** "Who/what do I split with, and where do my balances stand?"

### States
- **Loading:** none — renders stale store data until the reload lands.
- **Error:** `ErrorState` + retry.
- **Empty:** `EmptyState` "No groups yet" + New Group CTA; a **separate** `EmptyState`
  "No archived groups" for the archived view.
- **Full:** FlatList of group cards + a People balances footer.

### Layout & actions
1. **Header** — title flips "Groups"/"Archived"; archive-toggle (only if archived groups exist); **+ New** group (active view only) → GroupForm *(sheet)*.
2. **People balance chips** (`renderBalances`) — friends with non-zero net; tap → `/add/quick?kind=transfer&to={personId}`.
3. **Group card** (`renderGroup`) — swipeable (swipe-left → Archive/Restore, suppressed for Personal); icon, name, "member count · spend", **AvatarStack**, **BudgetBar** + utilization label + over-budget badge (in `colors.healthRed`, matching the budget-health scale rather than the expense colour), **BalanceChip** with a chevron beneath it when a balance exists. **Tap → `/group/{id}`**.
4. **New Group sheet** (`SheetModal` + `GroupForm`): emoji/icon, name, type, members, default split. **Create** → `insertGroup` → reload → `/group/{newId}`.

> **Personal card** (pinned first, "Everything involving you") → **`/personal`** (not
> `/group/{id}`): the unified view (`app/personal.tsx`) — Owe/Lent/Net header + 🔘 tabs
> **Activity · Budget · Recurring**. Activity = every txn involving me (`getMyActivity`) with
> 🔘 filters `Personal · Groups · All · {each group}`, my-share amounts, tap → source
> `/txn/{id}`. Recurring = collapsible, grouped by group. Budget links to the personal budget
> editor. It also carries what only the group hub used to have: swipe edit/delete, the FAB, the
> audit log and an overflow menu (Audit log · Export as CSV).
> See [PERSONAL_REDESIGN.md](./PERSONAL_REDESIGN.md).

**Data loaded:** all groups (→ store), archived groups, me, per-group analytics + members + net,
global net, all persons, friend balances via `simplify`.

---

## 6. Group detail & sub-screens

### Group hub — `app/group/[id].tsx`
**Reached from:** Groups list, Home group cards, Insights "See what to cut".
**Tabs (local state, haptic on switch):** non-personal → **Expenses · Recurring · Budget ·
Members**. A personal id never renders here — it `router.replace`s to `/personal`.

### States
- **Loading:** none (store-backed hero renders immediately).
- **Error:** `ErrorState` + retry.
- **Not found:** `EmptyState` "Group not found" / "This group may have been deleted or archived." + **Back to Groups**.
- **Empty per tab:** Expenses gets an `EmptyState`; Budget shows the "no categories" path from the editor.

### Layout
1. **Header** — breadcrumb back `‹ Groups › {name}`; **Insights** chart icon → the in-hub Insights view (`InsightsTab`); **⋯ options** *(sheet)*.
2. **Group hero** — icon + name + **AvatarStack** + "N members".
3. **Balance card** (`GroupBalanceCard`) — when your net ≠ 0: "YOU OWE / OWED TO YOU" + amount + counterpart name + **Settle up** → `/add/quick?kind=transfer&to={primaryPerson}`. When net **= 0** it renders an explicit **"All settled up"** card (check-circle, `colors.settle`) rather than nothing.
4. 🔘 **Tab pills** (see set above).

**Tab — Expenses:** **FilterBar** (collapsible 🔍 "Search note or category" + 🔘 `All · Expense · Income · Settlement`) → **SectionList** of **TransactionRow** in **TxnCell**, grouped by date ("Today" / "Yesterday" / "14 Jun" via `dateSectionLabel`); each date's rows share one card. Row tap → `/txn/{id}` (or → the recurring manager for a materialized occurrence). Swipe/delete: non-recurring → confirm + soft-delete + undo toast; recurring → 3-way Alert (rule only / rule + logged occurrences / cancel). Settlement rows render **both members' avatars**. **EmptyState** when none. **FAB** → `/add/quick?groupId={id}&kind=expense`.

**Tab — Budget:** "Budget" heading + **Edit** pill → `/group/{id}/budget`. Overview card (used / of total + **BudgetBar** + counts **over · near limit · on track**); recommendation pills; "Driving overspend" rows (worst-first) *or* "Every category within budget"; **"Who paid what" contributions** — a per-member fairness breakdown (ahead/behind their fair share) that the standalone budget-editor route never shows, and the reason both surfaces exist; 🔘 status filter `All · Over · Near limit · On track`; per-category **BudgetBar** cards.

**Tab — Members:** Group balances (Total spent · Your balance); member rows (avatar, name, "is owed / owes / settled"); **Invite someone** → `/group/{id}/members`; 🔘 **Simplify debts** *(toggle)* ("Fewest payments" ↔ "Every direct debt", persisted to the group row); **BalanceRow** settlement rows ("N payments to settle") → **Settle amount** → `/add/quick?kind=transfer&from=&to=&amount=&groupId=`.

**Tab — Recurring:** active / paused / ended rules; row → `/group/{id}/recurring?focus={ruleId}`; add → `/add/quick?groupId={id}&kind=expense`.

**Insights view** (header chart icon): per-member spend bars, top categories, recommendations, via `InsightsTab`.

**⋯ Options sheet:** **Audit log** (`/history?groupId={id}`) · **Export as CSV** · **Edit group** (`/group/{id}/edit`) · **Archive group** (confirm → `archiveGroupSafe` → back).

### Sub-screens
| Screen | Route | Purpose & key actions | States |
|---|---|---|---|
| **Budget editor** | `group/[id]/budget.tsx` | Per-category limit + 🔘 cadence *(sheet)*; collapsible sections; **Save** → `setCategoryBudgets` (only amounts > 0). `?category=` auto-focuses and scrolls to a row. Categories load by frequency-of-use; an empty catalog self-heals via `seedGlobalCategories`. `refetchOnDataChange:false` so a mid-edit reload can't wipe unsaved amounts. | Error + retry · `EmptyState` "No categories yet" · pull-to-refresh |
| **Edit group** | `group/[id]/edit.tsx` | `GroupForm`; **Save** diffs members (add/remove); Archive → `/groups`; Delete → `deleteGroup` (Personal can't be deleted). | Error + retry only — it's a form, deliberately no pull-to-refresh |
| **Members** | `group/[id]/members.tsx` | Avatar tap → photo picker; rename *(sheet)*; swipe-Remove (**blocked if net ≠ 0** — "Settle up first"); **Add or create person** via `PersonPicker` (multi-select + inline create). | Error + retry · pull-to-refresh · no empty state (you are always a member) |
| **Recurring** | `group/[id]/recurring.tsx` | Per-rule: **Skip** / **Undo skip** / **Pause·Resume** / **Stop** (confirm → `endRecurring`). `?focus=` highlights a card. | Error + retry · `EmptyState` "No recurring transactions" · pull-to-refresh |

---

## 7. Add flows

Both add screens are `fullScreenModal` presentations sliding from the bottom. Money parsed via
`parseToPaise`; saves wrapped in try/catch with haptic + Alert on failure. Neither gets
pull-to-refresh — they're wizards.

### 7.1 Quick Add — `app/add/quick.tsx`
**Purpose:** log one expense / income / settlement transfer (create or edit).
Body order, top to bottom:

1. **ModalHeader** — ✕ left, title centre, **Save** right (a tinted text button, kind-coloured, disabled until `canSave`). AGENTS §5's PrimaryButton rule has a recorded exception for modal headers.
2. 🔘 **Kind** — `TabPills` at `size="lg"` (full-width, 56pt): `Expense · Income · Transfer`. Transfer is hidden unless `flags.splitting` or you're editing an existing transfer; Income forces the Personal group.
3. **ContextPill** — one compact centred pill answering "what is this about?", used by **both** kinds. For an **expense** it shows the destination group + "N people · equal" / "just you" → **DestinationSheet** (every group, ordered by `getGroupsByRecentUse` — Personal pinned, then most-recently-used); **rendered even with one group**, unlike the old `GroupSelector` which was gated on `groups.length > 1`. For a **transfer** it shows which debt is being settled + its balance → **ScopeSheet** (All groups + each shared group, each with its outstanding amount). Transfer previously asked this a second time with its own chip row inside `TransferBody`.
4. **Amount input** (`type.amountXL` SpaceMono) — `sanitizeAmountInput` caps it live, `parseToPaise` on read. Once it holds a value, a **÷ disc** below the field opens `AmountCalculatorSheet`: a *sequential* calculator (not an expression parser — precedence would make "100 + 20 × 3" answer 160 when 360 was meant). `+`/`−` take an amount, `×`/`÷` take a plain factor, so "÷ 3" means split three ways. The accumulator is integer paise and the fraction-producing operators round **once**, explicitly, so the figure shown is the figure saved; non-even divisions warn (₹100 ÷ 3 leaves a paisa). Logic + 22 tests in `lib/amountCalc.ts`.
5. **Category + date chips** → `CategoryPicker` / `DatePickerSheet`. Both are `ui/Chip` with a trailing chevron — the *same* primitive as the "Other details" chips below, so the screen has one pill shape. Category `grow`s to fill the row (a long name truncates instead of pushing Date off-screen) and shows its own colour+glyph in an `IconCircle`; Date carries a `calendar` glyph it previously had none of.
6. **Transfer body** (`TransferBody`, transfer only): from/to people, scope (per-group or "all groups"), 🔘 pay method, note.
7. **Title/Note field** (`ui/Input`, `edit-3` glyph, focus ring), then the **budget nudge** ("₹X left in {cat} this month", from `getAffordSnapshot`).
8. **SplitSummary** *(shared expense, total > 0)* — split-with + paid-by. Sits **above** the optional details, so nothing can push it off-screen.
9. **Remainder warning** when payers or shares don't add up.
10. **DetailChips** under an "Other details" header — one named chip each for `Note`, `Receipt`, **Tags**, **Time**, `Location`, pay method, **Split by items** and `Repeat`. **Every chip shows its own glyph in both states** (`align-left`, `paperclip`, `map-pin`, `credit-card`/`download`, `list`, `repeat`); unset reads muted with the field name, set shows the value tinted with a ✕ to clear. The first version used a shared `plus` glyph while unset, so four different chips looked identical exactly when the user needed to tell them apart. Each opens a focused sheet (`NoteSheet`, `PayMethodSheet`, `RecurringSheet`) or acts directly (receipt → OS picker, location → capture, split-by-items → `/add/itemized`).

**Tags** *(`txn.tags`)* — one chip showing the count (`Tags` → `2 tags`), opening a multi-select `TagSheet` with create-as-you-type. Deliberately **orthogonal to categories**: one category, any number of tags. The vocabulary comes from `getTagsByFrequency`, derived from the rows that use it — no tag table, so nothing to keep in sync and no orphans. `lib/tags.ts` owns parse/serialize; `parseTags` is **total** (never throws, never null) because one malformed row must not break a whole list, and empty serializes to `NULL` rather than `"[]"` so "no tags" stays indistinguishable from every pre-tags row. Searchable from `/search`'s text field (typing a trip name finds it); shown read-only on `txn/[id]`. **Not** filterable in Review — `pending_txn` has no tags column.

**Time-of-day** — a chip showing `h:mm a`, opening the existing `TimePickerSheet`. `txn.date` was always epoch ms and Review always rendered the time; Add was the only place that discarded it. Always filled (the time is real whether or not it was chosen), and setting it preserves the calendar date while zeroing seconds.

**Income asks where the money landed.** The pay-method chip is the same `txn.pay_method` field read the other way round: for income the sheet is titled **"Where did it land?"** and offers only `INCOME_LANDING` (Bank · Cash · Wallet · UPI), defaulting to **Bank** — salary is the common case, and the spending default (UPI) isn't a place money arrives into. This is deliberately a view over the existing column, **not** an accounts model; accounts as real entities with balances is a separate open design (see `RELEASE_CHECKLIST.md` §5).

**The budget insight is one line.** `BudgetNudge` shows the /afford warning when there is one, otherwise "₹X left in {cat} this month" — a single tinted line under the category pills, not a bordered card. It used to stack two bordered strips with status dots, which made ordinary information look like two error states.

**Kind colour propagates through the whole form.** `kindAccent` / `kindGradient` / `kindAmountColor` (`src/lib/kindTheme.ts`) derive one colour from the kind — teal expense, green income, purple settlement — and it drives the switcher, amount, category dot, chips, split summary and save button. Previously only the switcher and amount responded, so Income showed a green number in an otherwise teal form.

**One pill vocabulary.** Every pill on the screen — and in its sheets — is `ui/Chip`, with `✕` meaning "clearable" and `⌄` meaning "opens a picker" (never both). Mutually exclusive choices are `TabPills` instead: the kind switcher, the split mode in `SplitEditor`, and frequency/ends in `RecurringControls`. Before this there were **seven** hand-rolled variants of one shape across the flow, differing only in padding and radius — `CategoryDatePills` and `NoteField` on the form, three inside `RecurringControls`, and `SplitEditor`'s tab strip. `add/ContextPill` is the one deliberate second weight (quiet context above the hero); see AGENTS §9.

**Overlays** all live in `QuickAddSheets` with a single `open` value, so two can never be open at once. The recurring end-date picker *swaps* with the recurring sheet rather than nesting (both are RN `<Modal>`s), and closing it returns you to the recurring sheet.

**Save** (gated by `canSave` — see §16): transfer → `handleSaveTransfer` (`planAllGroupsSettlement` largest-first, or a single group); edit → `updateTxn`; recurring-edit → `splitRecurringSeries` ("this & future", atomically capping the old rule and starting a new one); new expense → duplicate-check (`findRecentDuplicate`, ±24 h) → `insertTxn`. Then `haptic.success()` → `refresh()` → `router.back()`.

**Receipt attach** (`useAttachmentPicker`): iOS action sheet (camera/library), camera on Android; storage-full → Alert with a `/storage` deep-link; the expense still saves without the photo.

**Smart category** *(flag `smartCategory`, off by default)*: typing a title auto-picks a category via learned overrides → rules → "Other". When it's on, the top field is the Title and the secondary note becomes the `Note` chip; when off, the top field *is* the note and no note chip is offered.

Choosing a group **keeps the category you already picked** — `selectGroup` passes it to `loadGroup`, which re-resolves it by name in the new group's catalog. Without that it fell through to `cats[0]` and silently replaced your choice.

### 7.2 Income — handled by Quick (`kind='income'`)
There is no separate income screen — the old `app/add/income.tsx` folded into Quick (one code
path, unified category pill + picker). Selecting **Income** forces the Personal group, loads the
**income** category catalog, and saves with `payments:[{me,total}]`, `shares:[]`. Add / edit /
recurring-edit all run through Quick.

### 7.3 Itemized — `app/add/itemized.tsx`
4-step wizard with progress dots (`ITEMIZED_STEPS`, titles from `STEP_TITLE`):
1. **Items** ("Add items") — name/qty/price rows; live subtotal; **Scan receipt** (§7.4); four adjustment types.
2. **Assign** ("Assign items") — assign each item to people ("Split unassigned equally" shortcut); per-person totals; unassigned banner.
3. **Payers** ("Who paid?") — who paid how much; balanced/remaining indicator reading **"Must equal total ₹X"**.
4. **Review** ("Review & save") — category, note, location, your-share + paid-by cards. **Save** → `insertItemizedTxn` / `updateItemizedTxn`, which persists `line_item` rows (with `split_mode`/`split_values`) and an `adjustments` JSON blob so the bill round-trips on edit.

**Adjustments** are **Tax · Tip · Service · Discount** (`ADJUSTMENT_LABELS` in
`src/hooks/useItemizedForm.ts` — `service` renders as "Service Charge"), each flat or %, applied
via `computeAdjustedTotal` and floored at 0. Pure helpers (`computeAdjustedTotal`,
`computeItemSubtotal`, `computePerPersonShares`) handle the math, scaling every share by the
adjustment ratio and nudging the rounding remainder so shares sum exactly.

### 7.4 Receipt scanning (live, iOS)
Step 1 of the itemized wizard has a **Scan receipt** button (Feather `camera`) that opens an
`ActionSheetIOS` with **Take Photo / Choose from Library**. While a scan runs the label reads
"Reading receipt…" and `ScanningOverlay` blocks all interaction — including the manual "Add
item" — for the duration.

Flow (`useItemizedForm.handleScanReceipt`):
1. `pickAttachment(source)` — asks the OS for camera or media-library permission and returns
   `null` on cancel **or** denial (indistinguishable by design; the flow simply aborts).
2. A pre-flight `waitForFileReady(uri)` poll: a large camera photo can still be mid-flush when
   the picker resolves, so the file is retried until it reports non-zero size. If it never does,
   the scan sheet opens showing a `[Pre-flight check failed]` diagnostic that names the copy
   step explicitly rather than blaming the OCR.
3. `getReceiptExtractor()` picks the provider from `settings.ocrProvider()` and extracts line
   items.
4. **`ReceiptScanSheet`** *(sheet)* — a raw-OCR-text verification panel plus a checklist of
   candidate line items, all pre-selected. Uncheck what's wrong, then **Add** appends the rest
   to the item list. The raw-text panel is **device-provider only**: `rawText` is `null` on the
   cloud path, because the model returns structured items rather than flattened text.

**Two providers** (`src/lib/ocrProviders/`), documented in full at `ocrProviders/index.ts`:

| Provider | What it is | Privacy |
|---|---|---|
| `gemini` (**default**) | Sends the photo to Gemini Flash's free tier through `server/receipt-ocr-proxy`. Best free accuracy — the model sees the real 2-D layout instead of flattened OCR text. **Falls back to `device` automatically if the cloud call fails** (`V2-13`), and the sheet says so, because on-device reading misses more. | **The photo leaves the device.** See §19. |
| `device` | Apple Vision OCR (`modules/expo-ocr`) + the regex line-item heuristic in `src/lib/ocr.ts`. Weakest on two-line item layouts, which is exactly why the raw-text panel exists. | Fully offline; the photo never leaves the phone. |

**Choosing the provider:** Feature management → Smart capture → **Cloud Receipt Scanning**
*(toggle)*. On = `gemini`, off = `device`; it writes `settings.setOcrProvider`, not a feature
flag, because it selects between two implementations rather than showing/hiding a surface.
Neither direction warns — off is the private choice and needs no defence, and on is already the
default, so a confirm on returning to the default would be theatre. The row's caption changes
with the state and names the consequence either way, and it is **deliberately not dimmed when
off** (`dimWhenOff: false`): dimming would read as "scanning is disabled", which it isn't.

> Receipt scanning itself still has **no on/off switch** — it ships unflagged, so the Scan
> button can't be hidden. Tracked in [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) §5.

---

## 8. Plan tab & savings

### Plan — `app/(tabs)/savings.tsx` (route name stays `savings`)
**Question:** "What am I saving toward, and what will my month look like?"

### States
- **Loading:** none.
- **Error:** `ErrorState` + retry.
- **Empty:** goals list gets an `EmptyState` "No savings goals yet"; the rest of the screen still renders.
- **Full:** money card + insights + goals + upcoming + forecast. Pull-to-refresh throughout.

1. **ScreenHeader** "Plan" (large) + month pill.
2. **Header icons** (top-right, **not pills**): `Insights` *(flag `insights`, `/insights`)* · `Reports` *(flag `reports`, `/reports`)* · `Recurring` *(flag `recurring`, `/plan/recurring`)* · `Can I afford?` *(flag `affordCheck`, `/afford`)*. Reminders lives in Settings. Reports is **also** still in Settings → Reports & export; it was reachable *only* from there, which is where you look for an export, not for last month's numbers (`V2-08`).
3. **TotalMoneyCard** (`getTotalMoney`/`getMoneyProfile`) — hero is **Available Money** = spendable cash only. Below it: **Net worth** (cash + investments − credit *used*) and **Credit headroom**, labelled *"borrowing, not money"*. Tap **edit** → **MoneyEditorSheet**. (`V2-12`: the hero used to be one figure adding cash + investments + *unused credit*, so a ₹2L card limit read as ₹2L of money. Unused limit is neither an asset nor a debt, so it is now in neither figure.)
4. **Overspend consent prompt** — when cash is negative, `proposeOverspendRaid` names which unlocked goals *could* cover it and asks: **Use savings** / **Keep goals**. Nothing moves until you agree; `applyOverspendRaid` then writes exactly the withdrawals shown (never a recomputed plan), and a confirmation offers **Undo** → `undoOverspendRaid`. Declining leaves cash negative, which is the honest picture. (`V2-10`: this used to happen automatically during app boot with an after-the-fact notice.)
5. **Savings insights** card: opportunity-cost / habit nudges.
6. **Goals** *(flag `savingsGoals`)*: `DraggableList` (drag = funding priority → `reorderGoals` writes `sort_order`); each **GoalCard** → icon, name, deadline, saved/target bar, needed/contribution per month. Tap → `/savings/{id}`. **New** → goal sheet (name, target, icon, colour, allocation + frequency, target-date) → `insertGoal`. Completed goals sink below the active list with a distinct card.
7. **ComingUpList** "Upcoming this month".
8. **plan/ForecastCard** — month-end projection (a distinct component from the Home `home/ForecastCard`).

### Goal detail — `app/savings/[id].tsx`
SVG progress ring; Saved/Remaining/Goal tiles; monthly-contribution card with nudge;
overfunded banner; contribution history.
- **States:** skeleton while loading · `EmptyState` "Goal not found" · `EmptyState` "No contributions yet" for an unfunded goal · error + retry · pull-to-refresh.
- **Add funds** *(sheet)* → `fundGoal` (writes an `allocate` ledger row) + fires `GoalCelebration` at 100%.
- **Withdraw to cash** *(sheet)* → `withdrawFromGoal` (clamped to saved). **Adjust goal** *(sheet)* → `updateGoal`. **Protect** → `setGoalLocked`, explained by **LockExplainerSheet**. **Delete** → confirm → `/savings`, restorable via `restoreGoal`.

### Savings automation
`runSavingsMaintenance` (on boot + foreground): leftover-sweep → scheduled allocations
(`planAutoAllocations`, drag-rank order, advancing the anchor only for periods actually funded)
→ overspend **proposal** (`planOverspendRaid`, lowest-ranked **unlocked** goals first — applied only on consent) → reconcile.
Auto-sweep is opt-in (`auto_sweep_enabled`).

---

## 9. Settle up

**No standalone route** — `app/settle.tsx` is **deleted**. Settling is the **Transfer pill
inside Quick Add** (`TransferBody` + `src/lib/settleScope.ts`). It records a `kind:'settlement'`
txn (payment from → share to) with `pay_method`, into a shared group; it does **not** count as
spending. **Reached from** (all open `/add/quick?kind=transfer…`):
- Home **BalanceStrip** → `…&` (picks a counterpart in the flow)
- Groups **People chip** / Friends row → `…&to={personId}`
- Group detail **Balance card** → `…&to={primaryPerson}`
- Group **Members** settlement rows → `…&from=&to=&amount=&groupId=`
- **Reminders** settle-ups → `…&to={counterpart}`

**UPI handoff.** When the recipient has a `person.upi_vpa` and an amount is entered, `TransferBody`
shows **Pay ₹X via UPI** — `buildUpiUri` (`src/lib/upiIntent.ts`) builds a `upi://pay?pa=…&am=…&cu=INR`
URI and `Linking.openURL` hands it to the user's own UPI app. Money moves peer-to-peer between the
two people's accounts; the app never touches funds and **never records a settlement it did not
observe** — saving stays a separate, explicit step. No VPA → no button, and settling behaves as before.

**Capturing the handle: scan, don't type.** A person's UPI QR *is* a `upi://pay?pa=…&pn=…`
string — the same shape `buildUpiUri` produces — so `parseUpiQr` reads the handle **and their name**
straight off it. `UpiQrScanner` (live `CameraView`, QR only) opens from *"Scan their UPI QR instead"*
in `PersonNameSheet`; typing stays as the fallback. Typing `name@okhdfcbank` off someone else's
phone screen was the highest-friction step in the settle-up flow and the easiest to get subtly
wrong — a mistyped handle saves fine and then silently produces **no Pay button at all**.

`parseUpiQr` accepts a `upi://` (or any app's) URI and a bare VPA. It deliberately **rejects
EMV/BharatQR merchant codes** — a TLV binary format, not a URI. Those are for paying shops, and
half-parsing one risks extracting a wrong payee, which is the one error that must not happen when
the next step is sending money. An amount baked into the QR is ignored: this captures a *person*,
not their payment request.

### Scan & Pay — paying through the app so it records itself

**The problem this solves.** The largest friction in the app is typing in transactions you *already
made*. Both automated routes are blocked by third parties (`F4` GPay export format, `F5` Gmail OAuth
CASA) and an Account Aggregator needs a partner. Paying **through** BudgetSplit is the one moment it
can know a payment happened without any of them.

| Step | What happens |
|---|---|
| 1 | **Long-press the FAB** → `ScanPaySheet`. A coach mark teaches the gesture — shown **only to a just-onboarded user** (`scanPayHintPending`, armed in `finalizeOnboarding`, cleared the first time the FAB is touched either way). It defaults **off**, so an existing install is never taught a gesture it may already use, and the bubble can't sit on Home indefinitely for anyone who simply never long-presses. A hidden gesture with no teaching is the mistake `V2-08` and the afford screen both made; a permanent hint is the opposite one. |
| 2 | Scan any UPI QR. `parseAnyUpiQr` reads a **person's** `upi://` code *or* a **shop's** EMV/BharatQR (`lib/emvQr.ts`). |
| 3 | Amount: typed, or fixed by the code (EMV tag `54`) — a fixed amount is **not editable**, since changing it would send a figure the merchant did not ask for. |
| 4 | Hand off via the **same** `useUpiHandoff` path as settle-up. It owns the platform split, the remembered app and the picker, so the two flows cannot drift. |
| 5 | The attempt is persisted (`lib/pendingPayment.ts`) **before** the app switch — `openURL` resolves as iOS takes the foreground, so a write started afterwards races our own suspension, and losing it means the payment is never recorded at all. |
| 6 | On return, the app **asks once**: *"Did that payment go through?"* Yes → a `pending_txn` row with `source: 'upi_qr'`, `pay_method: 'upi'`, and a category guessed from the merchant name via the existing `matchCategory`. No → discarded. |

**Your UPI app is remembered.** The first payment asks; after that it opens straight into that app,
with the destination named on-screen (*"Opens CRED · Change"*) so it is never a surprise. The
preference is re-validated against what is installed on **every** use — an app can be deleted, and a
stale preference must fall back to asking rather than to opening nothing.

#### Record-only: when a shop code cannot be handed off

UPI 2.0 signs merchant QRs, and **PSPs verify that signature**. Two consequences, both fatal to a
rebuilt intent rather than merely awkward:

1. The signature sits in sub-tags `emvQr.ts` does not decode, so it cannot be forwarded.
2. It is computed over the other parameters — so **adding an amount to an open-amount code
   invalidates it**. That is arithmetic, not an engineering gap.

The PSP refuses *after* the user has chosen a bank and entered their PIN. Observed on device as
**"payment failed — UPI risk policy"**.

So `ScanTarget.canHandoff` is false for any merchant code carrying sub-tags we can't account for
(the signature's tag number isn't publicly documented, so this infers rather than guesses at one,
and fails closed). Those show **"Record ₹45.00"** instead of Pay: no hand-off, the row is written
straight to Review via `recordScannedPayment`, and the user pays in their own UPI app. The scan
still supplied payee, amount and category — the manual entry this feature exists to remove is still
removed. ~18% of Indian shop QRs are signed (March 2026), so most still hand off normally.

Record-only deliberately does **not** go through `pendingPayment`: there is no app switch to return
from, so arming the "did it go through?" prompt would ask about a payment we watched them not make.

**Nothing is written at hand-off.** The app never learns the outcome — it only opens someone else's
app — so recording optimistically would leave a phantom expense behind every cancelled payment. The
confirmed row still lands in **Review**, not the ledger, so category, group and split can be
corrected before it counts.

**When it declines to ask:** under 5 s away (they bounced straight back and cannot have paid —
asking would train people to dismiss the prompt) or over 6 h (they will not remember, and a
wrongly-confirmed expense is worse than a missed one, since a missed one can still be typed in).

**Merchant QR parsing fails closed.** `emvQr.ts` reads EMV `TT LL VALUE` triplets and returns `null`
on a length that overruns, a non-numeric tag, a missing `in.gov.upi` template, a VPA that isn't one,
or a non-INR code. A duplicated tag takes the **first** occurrence, so a trailing forgery cannot
override the real payee. ⚠️ Written from the spec, **not** validated against a broad sample of real
Indian QRs — a wrong VPA is the failure that matters, so test against real codes early.

**`parseUpiQr` stays strict on purpose.** Adding a friend (`PersonNameSheet`) must keep rejecting
merchant codes — you cannot settle up with a shop, and storing its VPA on a contact would be wrong.
Only Scan & Pay uses the permissive `parseAnyUpiQr`. Two callers, two different right answers.

**Choosing between several UPI apps works differently per platform, and that is not a style choice.**

| | Behaviour |
|---|---|
| **Android** | `upi://pay` is the NPCI-standard deep link, so the OS resolves it to every UPI-capable app and shows its **own** chooser — which remembers a default. `useUpiApps` returns `null` here, meaning "don't draw a picker": ours would be strictly worse. |
| **iOS** | There is **no chooser for custom URL schemes at all** — with two apps registered to one scheme, which wins is undefined by Apple. Worse, the Indian UPI apps on iOS mostly register their own scheme rather than claiming `upi://`, so the generic link can resolve to nothing with four UPI apps installed. So we are the picker: `useUpiApps` probes each **named** app with `canOpenURL`, and `TransferBody` opens the only match directly, action-sheets between several, and says plainly that none is installed when the list is empty. It does not probe `upi://` — a row that cannot name its destination is not offered. |

`canOpenURL` on iOS answers only for schemes listed in `LSApplicationQueriesSchemes` (`app.json` →
`ios.infoPlist`), so **adding a UPI app to `UPI_APPS` means adding its scheme there too** — an
undeclared scheme reads as "not installed" and the app silently never appears. `iosPermissions.test.ts`
enforces both directions, plus the 50-scheme cap: exceed it and iOS answers `false` for *everything*
rather than trimming the excess, disabling the picker wholesale.

**Wrong scheme and wrong path fail very differently, which is why the list is curated conservatively.**

| Mistake | Symptom | Cost |
|---|---|---|
| Wrong **scheme** | `canOpenURL` reports absent → the row never appears | Harmless, invisible |
| Wrong **path** | App launches to its home screen, payee and amount dropped | The user has left BudgetSplit and must type what they came here not to type |

CRED demonstrated both at once: `cred://` *is* a CRED scheme, so the row appeared and the app
opened — but CRED's UPI entry point is `credpay://`, so the parameters went nowhere. `slice`,
`groww`, `jupiter`, `imobileapp`, `payzapp` and `axispay` were removed as invented — absent from
every maintained UPI-intent list, so no path would have made them work.

#### The deep links we generate

The shape, with the optional parts marked. **`mode` is always ours — never the scanned code's**, and
`pn`, `mode` and `tr` each vary by app:

```
<prefix>?pa=<vpa>[&pn=<name>]&am=<rupees.00>&cu=INR[&tn=<note>][&mode=04][&tr=<ref>][&…passthrough]
```

Parameter order is load-bearing: `pa`/`pn`/`am`/`cu` are written first and anything carried off the
scanned code goes last, so a hostile QR can never displace the payee or the amount.

**The apps genuinely disagree, so each carries its own path and payload** (`UpiAppSpec.payload`,
`UpiPayloadQuirks`). One URI for all of them means breaking one app to fix another — proven, because
CRED and Airtel moved in *opposite* directions across the same change. The authoritative per-app
table is immediately below; there was a second, coarser prefix table here that drifted out of
agreement with it, so it is gone rather than maintained twice.

Every row records **`provenance`**, in the type rather than a comment, because the distinction kept
collapsing during this work — an inference was written up as a finding more than once, and a field
is harder to contradict than prose.

| App | Path | Payload | Provenance |
|---|---|---|---|
| **CRED** | `credpay://upi/pay` | no `mode`, no `tr` | **device** — paid |
| **Airtel** | `myairtel://upi/pay` | `mode` + `tr`, even on P2P | **device** — paid |
| Generic | `upi://pay` | default | **device** — populated. **Android hand-off only; not an iOS picker row** |
| Amazon Pay | `amazonpay://upi/pay` | default | **device** — populated + name resolved, then declined |
| WhatsApp | `whatsapp-consumer://upi/pay` | default | **device** — populated, cannot verify the handle |
| PhonePe | `phonepe://upi/pay` | default | documented |
| **Paytm** | **`paytmmp://pay`** | default | documented — vendor uses a bare `pay` |
| Google Pay | `tez://upi/pay` | default | documented — **but see `gpay://` below** |
| BHIM · Navi · MobiKwik · super.money · Kiwi | `<scheme>://upi/pay` | default | **unverified** — scheme sourced, path inferred |

Default payload = `mode` on, `tr` for merchant payments only.

**`device` means the path works, not that the payment completes.** Amazon Pay and WhatsApp are the
rows that separate the two, and keeping the distinction visible is the point of the field.

**Google Pay: if `tez://` fails, try `gpay://upi/pay`.** Google's own India in-app-payments guide
gives `gpay://upi/pay?pa=…` verbatim and never mentions `tez://`, which is the pre-2018 Tez brand
the app was renamed from; `gpay` also appears in the query-scheme lists real integrations ship.
Ours came from third-party SDK lists that still carry `tez`. It is **not switched yet** on purpose:
`tez://` was observed detecting Google Pay on device while `gpay://` has only been read in a
document, and Google Pay has never been tested at all — changing the scheme on its first run would
move two variables at once and a failure would say nothing about either, which is exactly the
confound Airtel already produced here. It is a one-line change once `tez://` has had its turn.

Only four apps have public iOS deep-link documentation. The UPI ecosystem is **Android-first** —
there the generic `upi://` intent plus a package name is the whole story, so per-app iOS paths were
never published. Amazon Pay's was not findable anywhere and was settled on-device instead.

**Long-pressing the Pay button opens `UpiUriSheet`**, showing the exact URI for every installed app
with its provenance tag. It exists because otherwise each unverified app costs a full
rebuild-and-test cycle to settle.

**It resolves through `upiLaunchUrl`, the same function the hand-off launches through** — a preview
that could disagree with reality would launder a guess into a reading. It *did* disagree, and the
shared function is the fix. The sheet used to call `buildUpiUri` for every app, so it advertised
`paytmmp://pay?pa=…&am=…` for Paytm while `useUpiHandoff` was really sending `paytmmp://scan`. The
bare open is intentional — blocked apps are deliberately handed no payment — but the preview was
the last thing still claiming otherwise, which made a deliberate design read as a broken deep link.
Rows that receive no payment now say so, quoting the app's own `blocked` reason.

`handoffVerb(opts)` supplies the matching wording in one place, because the picker row and the
destination line under the Pay button drifted too: both said *"enter it there"* even in Scan & Pay,
where the app is opened **on its scanner** with the code still in front of the user. There it now
reads *"scan it there"* — the accurate and easier instruction of the two.

Device results so far, and what each can actually prove:

| App | Platform | Build | Path | Payload | Result |
|---|---|---|---|---|---|
| CRED | iOS | `e7f2438` | `credpay://upi/pay` | `pa/pn/am/cu` | ✅ paid |
| CRED | iOS | `4cec88d` | `credpay://upi/pay` *(same)* | `+ mode + tr` | ✗ failed |
| Airtel | iOS | `e7f2438` | `myairtel://pay` | `pa/pn/am/cu` | ✗ failed |
| Airtel | iOS | `4cec88d` | `myairtel://upi/pay` *(changed)* | `+ mode + tr` | ✅ paid |
| Amazon Pay | iOS | `6d44884` | `amazonpay://upi/pay` | default, friend's `@kotak` | ✗ populated, name ✅ resolved, **declined after submit** |
| WhatsApp | iOS | `6d44884` | `whatsapp-consumer://upi/pay` | default, friend's `@kotak` | ✗ *"Couldn't verify UPI ID"* |
| WhatsApp | iOS | `6d44884` | `upi://pay` *(the spec)* | default | ✗ same verification failure |
| PhonePe | iOS | *open-amount* | `phonepe://upi/pay` | **no `am`** — amount typed in PhonePe | ✗ same gallery-QR refusal |
| Paytm | iOS | *open-amount* | `paytmmp://pay` | **no `am`** | ✗ same "UPI risk policy" |
| Amazon Pay | iOS | *open-amount* | `amazonpay://upi/pay` | **no `am`** | ✗ same "technical error" |
| *Android* | — | — | — | — | **never run — see below** |

**Every row above is iOS, and that is forced by the code rather than a gap in the testing.**
On Android `useUpiApps` returns `null`, so `useUpiHandoff.pay` calls `open(req, null, …)`: `spec` is
null, `spec?.blocked` can never be true, and no per-app prefix is ever used. PhonePe on Android has
therefore never received `phonepe://upi/pay` from this app — it receives the generic `upi://pay`
through the OS chooser, which is the mechanism the whole ecosystem ships on and the one Splitwise's
Paytm integration and FairShare's deep link both use. **The four "blocked" apps are, on the present
evidence, blocked on iOS only.** Until an Android build has run them, the `blocked` strings should
be read as iOS findings — which is all the picker they appear in can show, since it is iOS-only.

**Open tests, cheapest first:**

| Test | Why it is worth a build |
|---|---|
| Android: the four blocked apps via the generic chooser, ₹1 each | Settles whether the refusals are platform-specific. The single highest-value unknown left. |
| iOS: `gpay://upi/pay` vs `tez://upi/pay` | Google Pay is the largest UPI app by share and has never been run. See the note above on moving one variable at a time. |
| iOS: BHIM, Navi, MobiKwik, super.money, Kiwi | All `provenance: 'unverified'` — scheme sourced, path inferred. A wrong path opens the app to its home screen having dropped the payee. |

**The open-amount round exhausted the payload space, and it went 0 for 3.** `am` was the last
parameter with a plausible mechanism — the only one that changed *who supplied the amount* rather
than how the request was spelled — and every app returned the identical error it gave with the amount
pre-filled. The `omitAmount` option and its UI action were **removed** rather than left in place: an
unproven control on the payment path is worse than none. A test pins that `am` is always sent, so it
is not quietly reintroduced as a fix.

What remains in the spec — `mc`, `tid`, `sign` — are merchant fields, and `sign` is an RSA signature
over the other parameters requiring a PSP's private key. **There is no further URI to try.**

**CRED is a clean experiment; Airtel is not.** CRED's path was byte-identical across both builds,
so only the payload can explain it breaking — which is why `tr` became merchant-only. Airtel had
*both* variables change at once, so its recovery cannot be attributed to either, and it is not
evidence for the path change.

The two apps moved in **opposite directions across the same change**, which raises the possibility
that **no single payload satisfies every app**. If the next round confirms that, the answer is a
small per-app payload quirks table rather than another sweep.

`upi/pay` remains the better bet on the strength of `upi://pay` and `credpay://upi/pay` both
populating correctly while `whatsapp-consumer://pay` and `paytmmp://pay` opened blank — not on
Airtel.

#### Why a merchant app's hand-off works and ours often doesn't

| | Swiggy / Zomato | BudgetSplit |
|---|---|---|
| Who is paid | **Themselves** — their own registered merchant VPA | An arbitrary payee we scanned |
| Standing | Merchant via a payment gateway, or a licensed **TPAP** (Zomato, with ICICI) | None — no PSP partnership, no registered VPA |
| Intent | Built server-side by the gateway with `mc`, `tid`, `tr`, `mode`, and for verified merchants a `sign` | Built on-device, unsigned |
| Outcome | PSP verifies the merchant → trusted | PSP cannot verify who built it |
| Return to app | Gateway polls its own backend; the merchant learns from its server | We never learn the outcome — hence Review |

**This gap cannot be closed by editing a URI.** Becoming a merchant would mean payments going to
*us*, which is a different and licensed business.

#### Two escapes that were investigated and closed

**HTTPS universal links** — `https://phon.pe/…`, `https://paytm.com/…` and similar, on the theory
that the whitelisted web link would route where the custom scheme is refused. Closed without a
build:

- No such endpoint is documented for third-party payment parameters. `phon.pe` is PhonePe's link
  shortener. The published HTTPS surfaces for both vendors are merchant checkout links generated
  server-side *after* merchant onboarding — the same gate the custom scheme already hits.
- On iOS a universal link opens the app **only** if that app's `apple-app-site-association` file
  declares the path. An undeclared path opens **Safari**, which is strictly worse than today's
  scanner fallback: the user leaves for a browser rather than a camera.
- The suggested `mode=02` means *secure QR* — it asserts an NPCI signature over the payload. We
  have no PSP key, so it would be a claim rather than a description, which is the same error as
  forwarding a scanned code's `mode=01` into an intent. That one is already documented above as
  the cause of PhonePe's gallery-QR refusal.

**Payment-aggregator signed intents** (Razorpay / Cashfree / PayU) — on the theory that a gateway
could supply the `sign=` and `orgid=` that the strict apps want. Closed on the spec: NPCI's linking
specification has the **payee's PSP** sign the intent with its private key. A gateway can therefore
only sign for VPAs it controls — its own merchants' — never a friend's. Moving money A→B would mean
collect **plus** payout, making this app a party to the transfer holding float, which is the
payment-intermediary case the design note at the top of `upiIntent.ts` exists to stay out of.

#### Why the apps split the way they do

Worth stating because "NPCI blocks this" is the wrong model and leads to wasted payload rounds.
**No NPCI rule is being enforced.** A plain P2P `upi://pay?pa=…&am=…` is a legal intent and every
app is *permitted* to honour it; the `sign`/`orgid` gate covers **merchant** intents. The four
failures are three separate causes:

- **CRED, Airtel** implement the P2P deep link as specified and add no policy on top.
- **PhonePe, Paytm** added one. Both publish merchant-credential requirements for their deep-link
  surface and refuse callers they cannot attribute — a defensible position for the two largest
  targets of UPI deep-link abuse.
- **Amazon Pay, WhatsApp** refuse *nothing* at the URI layer. Both populated correctly and failed
  downstream inside their own PSP integration. Documented above.

A mechanism for why the split falls on an iOS line, tagged **`unverified`** because no vendor
documents it: an Android intent carries the calling package identity and PhonePe is known to
operate a whitelist against exactly that, while an iOS `openURL` on a custom scheme carries no
verifiable caller identity at all — leaving an attribution-checking app nothing to check and
"refuse by default" as its only option. Plausible, fits every observation, and not a finding.

**Consequence worth keeping in view: CRED and Airtel working is a policy accident, not a
guarantee.** Either can add source-scoring in any release and leave the hand-off with zero working
destinations. That is the standing argument for the request QR below, which depends on none of this.

**PhonePe and Paytm are closed, and every lever has now been pulled.** Their errors survived the
path change, `mode`, `tr`, `pn`, and finally **withholding `am` entirely** so the user typed the
amount in the app itself. PhonePe still calls a **₹2** transfer a gallery QR breaching a ₹2,000 cap;
Paytm still says "UPI risk policy".

Withholding `am` was the last hypothesis worth testing, because it was the only change that moved
*who supplied the amount* rather than how the request was spelled — and PhonePe's own message named
routes where the payer enters the details. It moved nothing. That message is a canned string, not a
clue. Both apps classify externally-supplied intents as untrusted before reading a single parameter:
a judgement about *who* is asking, which no parameter answers. Their docs said exactly this from the
start; the experiments only confirmed it. **Do not reopen without merchant credentials.**

#### Four apps are blocked and are not offered at all

**`UpiAppSpec.blocked`** decides **what we send an app, never whether it is listed.** A blocked app
appears in the picker like any other; it is opened with its bare scheme instead of a payment URI.

| Blocked | Why | Documented? |
|---|---|---|
| PhonePe | Merchant credentials required; unauthorised intents are bucketed as untrusted | Yes |
| Paytm | Deep link must be built by Paytm's server; risk policy scores the intent's source | Yes |
| Amazon Pay | Parses and validates our URI perfectly, then declines after submission | No |
| WhatsApp | Cannot verify the payee, even through the generic `upi://pay` spec URI | No |

The bar is **every lever pulled with an identical failure each time** — path, `mode`, `tr`, `pn`,
and finally withholding `am`. Vendor documentation is *not* required: an earlier version of this
rule demanded a citation and so held only PhonePe and Paytm, while Amazon Pay and WhatsApp publish
nothing and fail just as consistently. That served the documentation rather than the user.

**These apps were briefly filtered out of the picker, and that was the wrong fix.** It traded one
confusion for a worse one: PhonePe simply vanishing reads as a bug in our detection, and it is still
the app the user wants to pay from. What actually wasted a rate-limited UPI PIN attempt was *handing
PhonePe a payment it would reject* — so the fix is to stop building one and open the app instead.
Nothing is hidden, the picker lists everything installed, and every route files the expense first.

The picker marks them descriptively — *"PhonePe — enter it there"* — and the destination line under
the button says the same for a remembered one. It is a description, not a warning: the app opens and
the payment still works, you just type it there. Users learn which apps arrive pre-filled by using
them, which is a small and honest difference.

A test still asserts at least one app remains unblocked. Blocking no longer empties the picker, so
the failure it guards has changed shape: blocking everything would quietly turn every hand-off into
"open the app and type it yourself" — a real regression wearing a working UI.

#### The other direction: a QR they scan (`RequestQrSheet`)

Everything above is the **payer's** side, and it is the side that can be refused: we build an intent
and hand it to a UPI app, which then judges an intent it did not originate. `TransferBody` requires
`to.id !== me.id` for its Pay button, so **when the money was owed *to* you, the block rendered
nothing at all** — the one case a hand-off can never serve, since we cannot reach into someone
else's phone to open their UPI app.

`buildUpiRequestUri(vpa, name, amountPaise?)` builds a `upi://pay` payload for a QR **we display and
they scan**. It sidesteps the refusal rather than arguing with it: there is no inbound intent to
attribute and no caller to identify, because the payment starts inside the payer's own app when
their camera reads the code. That is the input path every UPI app must support, and it carries no
gallery-QR cap and no intent risk scoring — the same reasoning that already sends blocked apps to
their scanner. **It works on every app, on both platforms, with no merchant status**, and survives
a policy change that would break the deep link.

The cost is that both people must be in the same room. Real, and not liftable here — so this is an
addition, not a replacement.

| | Detail |
|---|---|
| Builder | `buildUpiRequestUri` → `composeUpiUri`, shared with `buildUpiUri` so the parameter assembly exists once |
| `mode` | **`UPI_MODE_QR` (`01`)**, not `04`. `mode` describes how the payment reached the receiving app, and that app's camera really did scan a QR. Never `02` — *secure* QR asserts a PSP signature we cannot produce |
| `tr` | Absent — person-to-person, per the existing `UpiRequest.kind` rule |
| Open amount | Omitting `am` is the ordinary case here (a standing "here's my handle"), unlike the pay path where a missing amount returns `null` so the caller hides the action |
| Entry points | `TransferBody` **GET PAID** block when `to` is you; Settings › **Getting paid** › *Show my UPI QR* (no amount) |
| Recording | Nothing is written. The app never observes the outcome, so saving stays the explicit step — the same rule as the pay direction |

**Your own handle had nowhere to live until this.** `friends.tsx` sets a VPA for everyone *except*
you (it filters `is_me`), so Settings › **Getting paid** › *Your UPI ID* was added, validated with
the same `isValidVpa` the pay path uses. Empty clears it.

**The QR renders black-on-white inside a white card, against the dark theme.** That is deliberate:
cameras want a light quiet zone and high contrast, and a QR drawn in theme colours is unreliable to
scan. It is the one place in the app where a raw hex is correct.

Screen brightness is *not* raised while the code is shown — `expo-brightness` is not installed, and
this is a candidate follow-up rather than a dependency worth adding unverified.

#### What the scan captures beyond payee and amount

**Category, from the merchant's own MCC.** A shop's EMV/BharatQR carries its ISO 18245 merchant
category code in tag `52`. That is the merchant's declaration to their acquiring bank, so it beats
anything read off a display name — `MCC_CATEGORY` in `src/lib/mcc.ts` maps it, and it is consulted
*before* `matchCategory`. Only codes with one defensible answer are mapped: 5999 "miscellaneous
retail", 5311 "department stores" and 5300 "wholesale clubs" are deliberately absent, because
mapping them to Shopping would be right often enough to look fine and wrong often enough to
mis-budget, while a name like "Krishna Medical Store" carries more signal than the code does. An
unmapped code falls through to the name guesser. `categoryForMcc` fails closed on anything that
isn't four digits — the value comes off a scanned QR, so it is attacker-controlled — and a test
asserts every mapped target is a real `DEFAULT_CATEGORIES` name, since a category string matching
nothing drops silently on the way into Review.

**Location, captured at the moment of the scan.** Scan & Pay is the only ingest route that runs
while the user is standing at the merchant, so the device's position *is* the transaction's
location rather than an inference. Timing is the whole point, and it constrains the design twice:

- **Started on recognition, never awaited.** The fix begins the moment a code parses, not when Pay
  is tapped. A GPS fix takes seconds, and this flow exists to be fast — awaiting one would put a
  stall between the tap and the UPI app for a bonus field. It is usually ready by the time the payee
  has been read and an amount typed; if it isn't, the payment goes without it.
- **Never prompts.** `getCurrentPlaceIfPermitted` uses the existing grant and returns null silently
  otherwise. A permission dialog in the middle of paying a shopkeeper hijacks the one flow whose
  purpose is speed, for something that is a bonus rather than the feature. Location is granted
  deliberately in Add Transaction or Settings; scanning then benefits from it.

`pending_txn` gained `lat`/`lng`/`place_label` (`txn` has held them since v2), and
`txnInputFromPlan` carries them into the real transaction. They are **carried, never recaptured** —
reading the device's position at commit time would stamp wherever the user is while reviewing, which
is usually later and elsewhere, and indistinguishable from the truth once written. Every other
importer leaves them null for the same reason: an emailed receipt parsed days later would otherwise
be stamped with the user's sofa.

#### One button

The sheet has a single action: **`Pay ₹X`** records the expense and opens a UPI app. Whether that
app arrives pre-filled is the app's decision, not a different feature.

It replaced three controls — a Pay button, a "Record it, I'll pay" row, and a "Record & open
PhonePe" variant of that row. All three served one intention (pay this person, and remember it), and
splitting them encoded *our* knowledge of which apps misbehave into the *user's* decision, where it
does not belong.

`useUpiHandoff.pay(req, hooks, bare?)` is the whole thing:

| | Sent | Result |
|---|---|---|
| Normal app | full URI from `buildUpiUri` | opens pre-filled |
| `blocked` app | bare probe scheme | opens; you enter the payment there |
| `bare = true` | bare probe scheme, for every app | signed merchant QR — see below |
| No app installed | nothing | the button records and stays put |

`hooks.before` files the expense before `openURL` in every branch, because after that call we are
racing our own suspension — and the record is the one thing that must survive whatever the payment
app decides.

**Opening a refusing app is the way round it, not a consolation.** PhonePe and Paytm reject
*externally-supplied* intents, while a live camera scan inside their own app is their most-trusted
input — no gallery-QR cap, no intent risk scoring. With the shop's code still in front of you,
scanning it there completes the payment their refusal blocked. Weaker with no code to scan: a
person-to-person transfer means re-entering the payee by hand, and we cannot even offer the handle
on the clipboard because no clipboard package is installed.

**`scanPath` aims at the app's scanner instead of its home screen. It is currently empty on every
app, and that is a result rather than an omission.** No Indian UPI app publishes a scanner deep
link — repeated rounds of searching found nothing, because the ecosystem is Android-first where an
intent covers this and no per-app URL was ever needed. PhonePe's docs cover `scanQRCode()`, a JS
call *inside* PhonePe Switch for merchants; Paytm's cover generating `upi://` QR images. Neither is
a URL openable from outside.

Two guesses shipped and a device settled both:

| Guess | Result |
|---|---|
| `phonepe://scan` | Opened PhonePe's **home screen** — no camera |
| `paytmmp://scan` | Opened a **stale internal route** — not a camera, and somewhere the user must navigate back out of |

Both are deleted, and both now fall back to `probe`. Paytm's is the useful correction: this
paragraph used to argue an unverified `scanPath` was free, because the worst case was the home
screen `probe` would have reached anyway. Paytm's guess was *worse* than the home screen, so that
argument is retired. The bar for adding one back is a device that lands on a camera.

`PayOpts.hasCode` gates it. Scan & Pay sets it because the code is still in front of the user;
settling up with a friend must not, because there is nothing to point a camera at and a scanner is
a *worse* landing than a home screen. A test also requires `scanPath` to share the app's own scheme
— the `cred://` vs `credpay://` mistake, where a real-but-wrong scheme opened the app and dropped
everything, already happened once here.

**`bare` is set for a signed merchant QR** (`canHandoff === false`). That code cannot be re-emitted
to anybody, so no app gets parameters and the footnote says to scan it again in your own app.

#### There is no "Other UPI app" row, and there should not be

`GENERIC_UPI_APP` is the **Android** hand-off and, on iOS, only the URI-preview baseline.
`useUpiApps` no longer probes it, so it never reaches the picker.

It was offered as an "Other UPI app" row, and the row was incoherent. The label promises a choice
among your remaining apps; iOS has no chooser for custom schemes, so `upi://` resolves to **exactly
one** app, chosen by the OS, and undefined when several claim it. The row therefore could not say
where it went. On a phone where WhatsApp claims `upi://` it went into an app we know refuses every
payment — a known failure dressed as a fallback.

Nor did it serve the case it existed for. A UPI app outside our twelve, typically a bank's own, was
no likelier to receive it than a listed app was. That user is served honestly by "Record it, I'll
pay", which promises nothing it cannot do. **A row whose destination we cannot name is not a
fallback, it is a coin flip.**

Android is untouched: there `upi://pay` reaches the OS chooser, which lists every UPI app and
remembers a default — better than anything we would draw, which is why `useUpiApps` returns `null`
there and we don't draw one.

**Amazon Pay and WhatsApp fail past the point a URI reaches, which is a different finding.** I had
filed Amazon Pay with the policy refusals and, before that, blamed its generic *"technical error"*
on a wrong path. Both readings were wrong. On a friend's handle it populated payee, handle and
amount, ran ValidateAddress, and displayed a green-ticked banking name that matched — every job the
deep link has, done — then was declined after submission with an offer to refund within 24 hrs.
That is Amazon's PSP, past anything we send.

WhatsApp is the cleaner proof. It fails *"Couldn't verify UPI ID"* on a third party's handle both
through `whatsapp-consumer://upi/pay` and through the generic `upi://pay` — and `upi://pay` **is**
the NPCI spec, claimed by WhatsApp itself, so a refusal there cannot be a malformed link of ours.
It reaches the payment sheet and then cannot resolve the handle it was given.

Two consequences. Neither app justifies further payload guessing, and Amazon Pay attempts cost a
real debit, so they should stop. And on a device where WhatsApp claims `upi://`, the old
"Other UPI app" row routed straight into this failure — which is part of why that row is gone; see
below.

**The scan sheet leads with the VPA, not the name.** A QR's `pn` is written by whoever made the
code and nothing on-device can check it — a swapped counter sticker can carry an honest-looking
name over a stranger's handle. NPCI reached the same conclusion and now requires UPI apps to
display only the bank-registered name resolved from the handle. BudgetSplit has no PSP access and
so cannot resolve it, which means it must not present an unverifiable name as the answer to "who
am I paying". The handle is shown prominently; the code's name appears below it, quoted and
attributed (*"Chai Stop" — as written on the code*).

**`pn` is sent only when it is real.** NPCI requires UPI apps to display the payee's
**bank-registered** name, resolved from the VPA via ValidateAddress; names from QR codes, contacts
or user labels may no longer be shown. We used to send the literal string `Payee` when a code
carried no name — a fabricated name on a real payment, which is reason enough to have removed it.

I also guessed it was the cause of WhatsApp's *"Couldn't verify UPI ID"*. **It wasn't** — WhatsApp
still fails that check with no fabricated name, on a real handle, including through the generic
spec URI. Passing the VPA and letting the app resolve the name remains right because it is what a
merchant hand-off does and what NPCI requires, not because it fixed anything.

**`mode` is always ours, never the scanned code's.** `mode` says how the transaction reached *the
app receiving it*, and that app receives an **intent** from us — whatever the details were
originally printed on. UPI QR codes routinely carry `mode=01` ("QR Code"), and we used to forward
it, which told the receiving app the payment came from a QR *it* had scanned. PhonePe believed us
and applied its QR rules, including the gallery-image cap that refused **₹2** against a ₹2,000
limit. So `parseUpiQr` reads the code's `mode` and discards it, and `buildUpiUri` always sends `04`
(intent).

**`tr` goes only on merchant payments.** It is documented mandatory there, and on a P2P transfer it
makes the intent merchant-shaped while carrying no `mc` and no `sign` — a malformed merchant
payment rather than a well-formed personal one. Device testing showed it neither fixed nor broke
anything, so the scoping is on correctness grounds: send the fields belonging to the transaction
you are actually making.

```
person QR    upi://pay?pa=…&pn=…&am=2.00&cu=INR&mode=04
merchant QR  upi://pay?pa=…&pn=…&am=45.00&cu=INR&mode=04&mc=5814&tr=BS7F3A9C21D045
```

**Record-only is offered on every payment, not only for unreproducible shop codes.** Any hand-off
can be refused by policy, nothing reports that back to us, and the user would otherwise be left
having made a payment with no record of it — precisely what this feature exists to prevent. The
scan already knows payee, amount and category, so *"Record it, I'll pay"* sits under the Pay button
throughout and writes the same row via `recordScannedPayment`. This is what makes the feature
independent of every policy decision we do not control.

**`mode` and `tr` are sent because their absence was punished.** PhonePe refused a **₹2** payment
citing a ₹2,000 gallery-QR cap — a limit ₹2 cannot breach. That message is a *generic* parse/typing
exception PSPs raise when a URI omits expected fields, and the documented causes are a missing
unique `tr` and an improperly flagged transaction type. So `mode` defaults to `04` (intent — a
description of what we do, not a claim; `05` would claim a signature we lack), and `newUpiRef()`
mints a fresh `tr` per **attempt** in `useUpiHandoff`, since PSPs read a repeated reference as a
duplicate of the earlier transaction. A scanned code's own `mode` wins over our default — a QR
declaring itself `01` is telling the truth about its origin.

`computeTransferScopes` builds the per-group and global pair balance using the same `simplify`
as every other balance surface. Scope can be a single group or "all groups"
(`planAllGroupsSettlement`, largest-balance-first, remainder onto the last group), then one
`recordSettlement` per plan row. **No shared group between the two people → an explicit Alert**,
not a silent failure.

---

## 10. Import → Review

The ingestion pipeline. Nothing an import produces touches balances, budgets or reports until
a row is confirmed in Review — `pending_txn` is a genuine staging table.

### 10.1 Import — `app/import.tsx`
**States:** no loading/error/empty states — it's a form, and every failure is a specific `Alert`
(see below). No pull-to-refresh.

1. **ScreenHeader** "Import transactions" + intro copy naming the accepted sources.
2. **Choose a file** — `DocumentPicker` limited to PDF · Excel (.xlsx/.xls) · CSV · text. Label flips to "Reading PDF…" while extracting.
   - **PDF** → base64 → the off-screen `PdfTextExtractor` WebView runs pdf.js → text back. (RN can't read a compressed/FlateDecode PDF directly, hence the WebView.)
   - **xlsx** → `readXlsx(bytes)` → `parseAnyWorkbook`.
   - **anything else** → read as text → `parseAnyText`.
3. **File result card** — format name, "N transactions found · M lines skipped", filename, and an `×` to clear. A picked file is **never** loaded into the paste box: detection already answered the format question, so there's nothing to decide.
4. 🔘 **Pasted-text source** — `Google Pay · Bank / UPI (CSV) · Email alert` (default `gpay`), consulted **only** for pasted text no detector claims. Each selection shows its own hint (how to copy a GPay statement; that one alert = one transaction).
5. **Paste box** (monospace, 200 pt min) → **Parse**.
6. **Add N to review** → `insertPending` → `refresh()` → `router.replace('/review')`.

Each row is enriched on the way in: category from the source when it carries one (our own CSV
export, a Paytm tag) else `matchCategory(description, catalog-for-that-kind)`; pay method from
`r.payMethod ?? detectPayMethod(r.raw) ?? null`. `parseAnyText` / `parseAnyWorkbook`
(`src/lib/importDetect.ts`) try parsers most-specific-first — Paytm (`paytmParse.ts`), Google
Pay (`gpayParse.ts`), transaction-alert emails (`emailTxnParse.ts`), then generic CSV.

**Failure messages are deliberately specific** — the three cases are distinguishable:
| Case | Message |
|---|---|
| Picked file parsed, 0 rows | "No transactions in that file" — names the detected format and suggests pasting instead. |
| PDF read, **0 characters** extracted | "pdf.js read the PDF but got 0 characters of text (it may be a scanned/image PDF). Open the statement, select all, and paste below." |
| PDF read, text but **0 rows matched** | "Extracted N characters but no transactions matched a known statement layout" — **plus the first 200 characters**, so the layout can be diagnosed. |
| pdf.js / WebView threw | "PDF read failed" + the **real** underlying message, not a generic one. |
| Picker or file read threw | "Could not read that file" + the accepted formats. |

### 10.2 Review — `app/review.tsx`
The staging inbox. One screen, no wizard: every pending row is fully editable in place, edits
auto-save as drafts, and **only Confirm/Save commits**.

The row card and every per-row overlay live in `components/finance/review/`, leaving the screen
as state + data + composition. **`ReviewRowCard` is at module scope on purpose** — declared
inside `ReviewScreen` it becomes a new component type on each render, remounting the row and
dropping keyboard focus mid-amount. The pay-method sheet is **Add's `PayMethodSheet`** (with
`onClear`), not a second implementation: Review previously listed its own `payOption` rows
selected in `colors.accent` while the destination sheet beside it selected in `colors.settle`,
so one screen showed two different "selected" colours in adjacent sheets.

### States
- **Loading:** four `SkeletonCard`s at 150 pt.
- **Error:** `ErrorState` + retry.
- **Empty (nothing pending):** `EmptyState` "Nothing to review" + **Import transactions** → `/import`.
- **Empty (filtered):** a *different* `EmptyState` "No matches" + **Show all** → clears focus, filters and the active view.
- **Full:** `SectionList` + sticky footer. Pull-to-refresh.

### Layout
1. **ScreenHeader** "Review" + right slot: **⋯** (overflow) normally, **Cancel** in selection mode. Hidden when nothing is pending.
2. **RecurringSuggestionBanner** *(flag `recurringSuggest`)* — appears **after a batch Save**, never on load, and never auto-creates anything. Tap → **RecurringSuggestionsSheet** to pick which candidates become monthly rules (`convertToRecurring`). Detection is scoped to the batch just committed (`detectRecurringCandidates`), skips manually-typed rows, and requires a category.
3. **Working-set banner** — when focused, filtered, or a saved view is active: the mode icon, "{name} · N of M", "· paid by {person}" when the view names a payer, and **Show all**. Uses `ui/Banner`, shared with the recurring-suggestion strip above it — the two were separate copies of one chrome.
4. **List header** — "TO REVIEW", "N transactions. Set each one, then Confirm to save. Changes are kept as you go.", and an **All to:** row of one-tap bulk-destination `ui/Chip`s (`Personal` + the first three shared groups). In selection mode this becomes "N selected" + **Select all / Clear**.
5. **Section headers** — rows are grouped by `source` in canonical `TXN_SOURCE` order, with an icon, label and count. **Headers only render when more than one source is present** — a single source needs no header.
6. **Per-row card** (see below).
7. **Sticky footer** — **Save all N** normally; in selection mode a bulk bar: **Focus** · **Group** · **Save N**. All four are `PrimaryButton`/`SecondaryButton` at 52 pt, so the footer no longer changes height when you enter or leave selection mode, and the list's bottom inset is **measured from the footer** (`onLayout` → `useContentInset({ footer })`) rather than the old `insets.bottom + 96` guess.

### The row
| Control | Behaviour |
|---|---|
| Description + timestamp | Read-only, `d MMM · h:mm a`. |
| Checkbox | Selection mode only. |
| Amount | Inline `TextInput`, digits and `.` only. Local on keystroke, flushed to the draft **on blur** (`onEndEditing`) — not per character. |
| 🔘 Kind | `Exp · Inc · Txfr` ("Transfer" is the UI name for a `settlement`). Switching kind **clears the category** (the picker's list changes with it, so the old name would be a stale chip) and forces non-expense rows to Personal. |
| 🗑 | Remove from the inbox — not saved anywhere — with Undo. |
| Category pill | → the shared `CategoryPicker` *(sheet, `forceOpen hideTrigger`)*, catalog chosen by the row's kind. |
| Destination pill | → "Personal or group" *(sheet)*. Hidden for income (always personal) and when there are no shared groups. |
| Direction pill | Transfers only: **Money in / Money out**, one tap to flip. Seeded from the statement, but not every export signs its amounts — and money arriving can be a transfer *to* you rather than income. |
| Counterparty pill | Group transfers only: "Who paid you? / Who did you pay?" *(sheet)*, listing the group's **other** members. Renders in `colors.expense` until set, because the row can't commit without it. A group with no other members says so instead of showing an empty list. |
| Pay-method pill | → "How was it paid?" *(sheet)* — all 7 methods with emoji, plus **Clear**. Pre-filled from detection when the source carried a cue. |
| Inline split | Group **expenses** only (a group transfer settles instead): `SplitEditor` with member toggles, mode, per-member values, and a live footer reading "Pick who shares this" / "Balanced" / "₹X unassigned" / "₹X over". |
| **Confirm** | Per-row commit. Disabled until `ready`; hidden in selection mode. |

**Category learning + fan-out:** setting a category calls `recordCorrection(description,
category)` — the same learner Add-expense auto-suggests from — then, if other pending rows look
like the same merchant (`isSimilarMerchant`), offers **"Apply to N"** vs **"Just this one"**.
Never silent, never automatic.

**Commit path.** `planCommit` (`src/lib/reviewCommit.ts`) resolves a row to its insert shape or
refuses it. A refusal is explained by amount-vs-split: "Add an amount" when ≤ 0, else "Balance
the split". `insertCommit` → `insertTxn` + `deletePending`, returning the pre-commit snapshot.
Every commit path has a true inverse:

| Action | Undo |
|---|---|
| **Confirm** one row | "Saved to {dest}" → `softDeleteTxn(txnId)` + `restorePending(snap)` |
| **Save all / Save selected** | Confirms the count and names how many were **skipped** and why, then "Saved N transactions" → reverses every row |
| **Remove** a row | "Removed from review" → `restorePending` |
| **Clear all** | Captures the latest drafts first, then "Cleared N transactions" → restores every one |

**Bulk & focus.** Selection mode drives three actions: **Focus** pulls the selected rows into an
ephemeral in-Review subset (no DB group, no persistence), **Group** bulk-assigns a shared group
(confirmed by Alert, and dropping each row's counterparty since it belonged to the old group),
and **Save N** batch-commits.

**Filters** (`src/lib/reviewFilter.ts`) narrow the working set by text, category (chips built
from the categories actually present), amount range and date range — ephemeral, via `FilterForm`.

**Saved views** (`src/lib/reviewViews.ts`, AsyncStorage) persist a filter plus an optional target
group and default payer. Applying one sets the filter, bulk-assigns its **expense** rows to its
group (income is always personal), and marks its payer active so commits attribute payment to
that person — the "someone else always pays for this group" case.

---

### 10.3 Waiting for you — `app/approvals.tsx`

**Not reachable today.** Nothing in the app can author an entry on your behalf —
there is no peer write path — so this queue is always empty until sync ships. It
is built now because the rule it enforces is much cheaper to establish before the
thing it defends against exists than after.

**What it is.** When someone else adds an expense in a group you share, that entry
is real: it appears in the **group ledger** immediately, because the group has to
agree on what happened. But it moves **none of your numbers** — not spend, not
budget, not cash, not owe/owed, not Safe-to-Spend, not the health score, and it
cannot trigger a savings raid — until you accept it here. See AGENTS §13.

**Why it is not part of Review.** Review holds `pending_txn` rows: imports *you*
created, where every field is editable because you are still shaping them. These
are assertions someone else made. You accept or refuse them; you never silently
rewrite them. One "Confirm" button meaning both would teach the wrong reflex on
the screen where it matters most.

**States:** empty (the normal one) · a card per author · error + retry ·
pull-to-refresh.

**Layout & actions**
1. **Grouped by author**, oldest unanswered person first — "who is asking" is the
   decision being made, so a burst from someone new cannot bury an older one.
2. Each entry reads as a **conditional sentence**: *"Aarav added ₹4,000 for food
   in Flat. Your share would be ₹1,000, and it says you paid ₹0."* The "it says
   you paid" clause is never implicit — someone else claiming you paid is the only
   shape that can move your cash.
3. **Approve** — applies at once. Not gated behind a dialog; accepting is ordinary.
4. **Not mine** — confirms first, removes it from your ledger, and says plainly
   that it stays on theirs.
5. **Trust <name>** — confirms, then applies to everything of theirs already
   waiting. After the third entry from the same person, the honest answer is trust,
   not repetition.

**Ordering** is by *arrival*, never by the entry's own date: the author chose that
date, and a back-dated entry must not bury itself at the bottom of the queue.

## 11. Transaction & category detail

### Transaction detail — `app/txn/[id].tsx`
**States:** error + retry · `EmptyState` "Transaction not found" · no pull-to-refresh (it
refetches on focus already — it's a detail + actions surface, not a feed).

Hero amount (kind-coloured) + category + note + cash line; meta card (When / Group / Paid via /
Added by / recurring link → `/group/{id}/recurring?focus=` / Location → opens Maps); receipt
section (preview / add / replace / remove; not for settlements) with a **full-screen attachment
viewer** (`Modal transparent animationType="fade"`); split summary; itemized line items
(read-only); audit-log timeline; **Delete** (soft-delete + undo → back).
- **Edit** (only if not a materialized recurring occurrence) → routes to the right add screen (itemized / transfer / income / quick).

### Category insights — `app/category/[name].tsx`
**States:** `Skeleton`/`SkeletonCard` while loading · error + retry · `EmptyState` "No
transactions" scoped to the period noun · pull-to-refresh.

Reached from Home category rows (`?period=` carries the active tab) and the Reports donut — a
comprehensive category page (all figures = **my share**). Period segment (Today/Month/Year);
budget card (prorated) or amount card + "set budget" → `/group/{personal}/budget?category=`;
**Where it goes** (personal vs each group); **Top places** (location-tagged); **Recurring** rules
in the category → `/group/{id}/recurring?focus=`; **Goals** tagged to it → `/savings/{id}`;
transaction list → `/txn/{id}`.

---

## 12. Analytics — Reports, drill-down, Insights

### Reports — `app/reports.tsx` (the analytics home)
**States:** `Skeleton`/`SkeletonCard` behind an **artificial 450 ms floor** so the skeleton never
flashes · error + retry · `EmptyState` "Nothing to report yet" · pull-to-refresh.

`ScreenHeader` "Reports" + CSV/PDF export (right slot). Month nav — **cannot advance past the
current month** (`reports.tsx:81`). SPENT/EARNED cards; then the synced breakdown: **top category
labels** (`CategoryRankList`) + a **donut** (`CategoryDonut`, no bottom legend, centre label
auto-shrinks to fit) + a **6-month trend** (`TrendBars`) — all two-way synced via `selectedCat`,
so picking a category in any one redraws the trend for it. Un-adopted category names fold into
one **"Others"** slice (`foldUncategorized`). Forecast line; year-in-review; export CSV / PDF.
Tapping a category opens the drill-down.

### Report transactions — `app/report-transactions.tsx`
**States:** error + retry · `EmptyState` "No transactions" · pull-to-refresh.

The month-scoped drill-down from Reports. Accepts `?month=yyyy-MM` and `?category=` (encoded),
which sets the window and pre-applies the filter. Filters by category / type / group + sort;
rows → `/txn/{id}`.

### Insights — `app/insights.tsx` (narrative only)
**States:** error + retry · `EmptyState` "No insights yet" · pull-to-refresh.

All figures are **my share**, on the same basis as Home (`getMyGlobalBudgetStatus` for the budget it
is compared against). A `SampleNote` under the eyebrow discloses how many transactions the
projections rest on. `loadInsightsData` takes an injected `now` so it is deterministic.

`ScreenHeader` "Insights" + month pill → eyebrow; **velocity hero** (only when projected to
overspend) → "See what to cut" (`/group/{personal}`); month-end **forecast line chart** (x-axis
labels sized so they don't truncate); **shifts vs last month**; 🔘 **what-if** `10% · 20% · 30%`;
recommendations; drivers; savings insights. Donut / trend /
owe-owed / recurring analytics live in **Reports**, not here — insights has one home.

---

## 13. Settings & sub-screens

### 13.1 Settings — `app/(tabs)/settings.tsx`
**States:** error + retry; `ActivityIndicator` on the export row while a CSV builds. No loading
state and no pull-to-refresh — it's a static config list. A persistent status-bar cover view
keeps content from painting under the clock/notch.

1. **Profile card** — avatar (→ photo picker), name (→ rename *(sheet)*), and a subtitle that
   reads the signed-in email when there is one, else "Offline-first · sign in to back up"
   (configured builds) or "Offline-first · no accounts" (the default build).
2. **Account** *(only when `EXPO_PUBLIC_API_URL` is set)* — one row: the signed-in email, or
   "Sign in — back up beyond this phone" → `/settings/account` (§13.4).
3. **Getting paid** *(flag `upiSettle`)* — **Your UPI ID** *(sheet, validated by `isValidVpa`; empty clears it)* · **Show my UPI QR** → amount-less `RequestQrSheet`. This is the only place your **own** `upi_vpa` can be set: `friends.tsx` filters out `is_me`, so before this the field was unreachable for you and the request-QR could never be built.
4. **Manage** — People → `/friends` · Categories → `/categories` · **My Budget** (monthly rollup, or "Not set") → `/budget`.
5. **Preferences** — Currency (`INR`, no-op) · Default budget cadence *(sheet)* · **Feature management** → `/features`.
6. **Security** *(toggles → AsyncStorage)* — Face/Touch ID lock · Privacy screen in app switcher · Hide amounts on home.
7. **Notifications** *(flag `reminders`)* — **Notifications & Reminders** ("Bills · daily log") → `/settings/notifications`.
8. **Data & Help** — **Backup & restore** ("Encrypted file") → `/settings/backup` · Import → `/import` · Export & reports → `/reports` · Help & Feedback → `/help` · Replay welcome tour *(resets `onboarding_done`)* · History & Audit log → `/history`.
9. **About** — version; tap **7×** → `/storage` (hidden debug entry).

Only the topmost section drops its top margin, and which one that is depends on what's enabled
above it (`sectionTop(isFirst)`) — Account when configured, else Getting paid, else Manage.

### 13.2 Settings sub-screens
| Screen | Route | What it does | States |
|---|---|---|---|
| **People** | `friends.tsx` | You card + contacts with balance chips, group counts, tap → `/add/quick?kind=transfer&to=`; add/rename person *(sheet)*. | Error + retry · `EmptyState` · pull-to-refresh |
| **Categories** | `categories.tsx` | Single **global catalog** (no group scoping). 🔘 `Expense · Income · Transfer` kind tabs; collapsible sections; add (name/icon/colour) / rename / delete; an **Uncategorized** section per kind (names on txns not in the catalog → **Add** to adopt, else counted under "Others"). Self-heals an empty catalog. | Error + retry · pull-to-refresh |
| **Feature management** | `features.tsx` | "Always on" pillars (no toggle) + module switches in four sections. Two rows are **not** feature flags and behave differently: **Location Tagging** asks OS permission and refuses if denied (§17), and **Cloud Receipt Scanning** picks the OCR provider (§7.4). Turning **splitting off** first names how many unsettled balances and what amount would disappear (nothing is deleted); turning it on is silent. | No loading/error state — flags are already in context |
| **Help** | `help.tsx` | Static FAQ accordion, ordered by screen flow, including **Settling Up & Paying** (UPI hand-off, which apps arrive pre-filled, request-QR). No data access. | None (static) |
| **Audit log** | `history.tsx` | Date-grouped change log with coloured dots, EDIT/DEL badges, "Load older" (30/page). Filters by `?groupId=`. | Error + retry · `EmptyState` "Nothing logged yet" · pull-to-refresh |
| **Search** | `search.tsx` | `Input` + 🔘 kind & source filters → `SectionList` of `TransactionRow` (→ `/txn/{id}`). Chip row has a gradient right-edge fade as a scroll affordance. | Error + retry · one `EmptyState` that switches copy between "Search your transactions" and "No matches" · **deliberately no pull-to-refresh** (the list *is* the query result) |
| **Storage** | `storage.tsx` | Receipt-photo disk usage + "Delete all attachments"; **TESTING:** Load demo data / Erase all data (see §24). | Error + retry |
| **Notifications** | `settings/notifications.tsx` | Reminder prefs + permission handling + test notification (§18). | Error + retry ("Couldn't load reminder settings") · no pull-to-refresh (it's a form) |
| **Backup & restore** | `settings/backup.tsx` | §13.3. | `ActivityIndicator` per row while busy; every failure is an Alert |
| **Account** | `settings/account.tsx` | §13.4. Absent entirely without `EXPO_PUBLIC_API_URL`. | Spinner while the stored session is read · inline error text (not an Alert — the retry is right there) |

### 13.3 Backup & restore — `app/settings/backup.tsx`
The highest-consequence flow in the app. There is still **no cloud sync**: this builds a
passphrase-encrypted snapshot and hands it either to the OS share sheet or, when signed in, to
your account. Both destinations get the identical envelope — the only difference is transport,
and the server cannot read what it stores (§13.4).

1. **Explainer card** — icon, a note that swaps for the signed-in case ("your transactions live
   on this device — signing in didn't change that"), and **Last backup: {date}** once one exists
   (`settings.backupAnchorAt()`).
2. **Create backup** ("Encrypted file") → **PassphraseSheet** *(mode `create`)* →
   `readAllTables` → `buildBackupPayload` → `encryptPayload` → write to cache as
   `.bsbackup` → `Sharing.shareAsync`. If sharing isn't available it reports the on-disk path
   instead of failing. Success stamps `setBackupAnchorAt(Date.now())`.
3. **Restore from backup** ("Pick a file") → `DocumentPicker` → JSON parse + a `ciphertext`
   shape check → **PassphraseSheet** *(mode `restore`)* → `decryptEnvelope` → a
   **destructive-style confirm Alert** naming the backup's date → `restoreAllTables`.
4. **Back up to your account** / **Restore from your account** *(signed in only)* — the same
   two actions over the network. Create runs the identical passphrase → `readAllTables` →
   `encryptPayload` path and then `uploadBackup(JSON.stringify(envelope))` instead of writing a
   file. Restore opens `ServerBackupSheet` (date + size per snapshot, newest first; trash icon
   deletes one; tap downloads it), then rejoins the *same* passphrase → confirm → `restoreAllTables`
   path a picked file takes. When a server is configured but nobody is signed in, one row
   ("Back up off this phone · Sign in") points at `/settings/account` instead.
5. **Standing warning** under the rows: "Restoring replaces ALL current data on this device.
   This cannot be undone."

**Restore replaces, it does not merge.** `restoreAllTables` toggles `PRAGMA foreign_keys=OFF`
(a no-op inside a transaction, so it's done outside one), then in a single transaction `DELETE`s
every one of the 15 `BACKUP_TABLES` in reverse dependency order and re-inserts the backup's rows
in forward order. Nothing is preserved from the current DB.

**The passphrase is never stored** (`src/lib/backup.ts:12`) — a Keychain-derived key would be
lost along with a lost phone, defeating the whole feature. **A forgotten passphrase makes its
backup permanently unrecoverable, by design.** Failure modes are typed and distinguished:
`BackupWrongPassphraseError` (shown inline in the sheet so the user can retry) vs
`BackupCorruptError` ("This backup looks corrupted", sheet dismissed). Wrong-passphrase and
not-a-backup are **deliberately indistinguishable** — an attacker shouldn't be able to tell
which one they hit.

---

### 13.4 Account — `app/settings/account.tsx` (optional, server-backed)

Exists only in a build with `EXPO_PUBLIC_API_URL` set (`serverConfigured()`); the default build
has no account UI at all, and nothing is uploaded. Backed by the Worker in `server/api`
(see its README for the route table and deploy steps).

**Sign-in is an email magic link, no password.**

1. **Signed out** — explainer card + email field → **Email me a sign-in link**
   (`POST /auth/request-link`). The response is the same whether or not that address already has
   an account: accounts are created at verify time, so there is no account-existence signal to
   leak.
2. **Check your inbox** — the email's button points at the Worker's `https://…/auth/open`, which
   **302s** to `budgetsplit:///auth?token=…` (S-37). Mail clients won't render a custom scheme as
   a tappable link, hence the bounce; `/auth/open` deliberately touches no database, so link
   scanners and mail-provider prefetchers can't burn the token before the human taps it. The
   email also prints the raw code, and this state has a **paste-the-code** field — the way in
   when the mail was opened on a laptop.
3. **Verify** — `POST /auth/verify` spends the token once (guarded `UPDATE … WHERE used_at IS
   NULL`, so a double-tap can't mint two sessions), finds-or-creates the user, and returns a
   session token stored in **`expo-secure-store`** — a bearer credential does not belong in
   AsyncStorage next to feature flags. 90-day rolling expiry; a row in `sessions`, not a JWT, so
   signing out genuinely ends it.
4. **Signed in** — profile card (device avatar/name + the server's email and created-on date),
   **Update profile from this device** (pushes `me.name`, then the local avatar as base64 —
   one-directional on purpose, the device profile is the one the user edits), **Backup & restore**
   → §13.3, and **Sign out** (confirm Alert; clears the local session even if the network call
   fails, because looking signed in while every action 401s is worse).

**What the account is for, and what it is not.** It buys off-device encrypted backups and nothing
else. The ledger stays local-first, there is no sync (that's phase S2) and no shared groups
(S3) — see `docs/RELEASE_CHECKLIST.md` §3.1 and §6. Backups are encrypted **on the phone** by
`lib/backup.ts` before upload, with a passphrase the server never receives, so a leaked bucket is
unreadable and a leaked D1 gives up email addresses and nothing about anyone's money. The
server keeps the newest **10** snapshots per account and prunes older ones on upload.

---

### 13.6 Sync — `app/settings/sync.tsx` (optional, server-backed)

One switch and four facts. It exists because the honest answers about sync are
*surprising*, and a user who assumes the opposite of any of them makes a decision
they would not otherwise have made:

1. **Only shared groups travel.** Personal spending, income, goals, budgets and net
   worth never leave the device.
2. **The server cannot read it.** Entries are sealed on the phone; the server holds
   blobs it has no key for.
3. **Nothing lands without your say-so** — an entry appears in the group but moves
   none of your numbers until you accept it, unless that person is trusted.
4. **It is not live.** Changes are exchanged when you open the app. There is no
   background task runner and push is behind Gate 0.

Turning it **on** is the consequential direction, so that is where the confirm
lives and where the count is named ("2 shared groups"). Turning it **off** is a
**pause**: nothing already uploaded is deleted, and nothing is removed from anyone
else's phone. The copy says so, because "off" is widely read as "and take it back".

Shows what is queued when sync is on, from `sync_outbox`. Disabled entirely
without `EXPO_PUBLIC_API_URL` or a signed-in account.

---

### 13.5 Linked people — `app/settings/linked.tsx` (optional, server-backed)

Linking two accounts so they can see details each has chosen to share. Today that is a name,
an email and — only if switched on — a phone number. It is **not** group sharing or sync
(S2/S3); nothing about anyone's money crosses a link.

**There is no username, no directory and no lookup** — not by email, not by phone. The only
way to reach an account is a link its owner generated. That is a deliberate product call
recorded in `RELEASE_CHECKLIST.md` §6: this is a personal-finance app first, and a
searchable handle is social furniture it does not need — with the side benefit that nobody
can check whether a number they hold belongs to someone using a finance app.

1. **Invite someone** → `POST /invites` → a sheet with a **QR** (`react-native-qrcode-svg`,
   the same dependency the UPI request-QR uses) and **Send link** (`Share.share`). Seven-day
   expiry, single use.
2. The recipient taps it → the Worker's `/invite/open` 302s to `budgetsplit:///link?token=…`
   → **S-39**, which calls `POST /invites/claim`. This **binds nothing** and says so
   ("Asked to link").
3. **Waiting for you** — the sender sees who claimed it, with the email, and answers
   **Link** or **Not them**. Only approval writes the link. This exists because an invite is
   *made to be forwarded*: first-tap-wins would hand a stranger a link to your account, and
   your number with it.
4. **Show them my number** — a switch per linked person, per side. Resolved live on every
   read, so switching it off stops future reads. The copy calls it a disclosure, never a
   recall: *"it can't take back a number they already have."*
5. **Unlink** — either side, removes it for both. Local `person` rows are untouched.

**A friend is still a local record.** Adding someone in People needs no account and no
network, and their phone number there is yours to set — if a linked account offers one, it is
offered *into* the field, never written over it. You may legitimately know a different number
for someone than the one they signed up with.

---

## 14. Optional modules

`DEFAULTS` in `src/lib/featureFlags.ts` defines **16** feature flags. All 16 gate a real surface
and appear in Feature Management; the `save_location` row below is a `settings` pref that
sits in the same list but is not a flag.

> This paragraph said **14** for two flag additions running, and the count scanner in
> `sourceCounts.test.ts` never caught it: that test only inspects lines matching
> `/feature[- ]flag|FeatureKey|flag table|gating/i`, and `featureFlags.ts` contains no space or
> hyphen so `feature[- ]flag` misses it, while the sentence said "gate" rather than "gating".
> Rewording it to "feature flags" is what puts the line under the scanner, so it can go stale
> silently again. Seven further keys
(`dashboardCash/Budget/Donut/Balances/Savings`, `budgetInsights`, `itemizedOcr`) were **deleted
on 2026-07-28** — they gated nothing, and five of them rendered as working switches that did
nothing. `src/__tests__/featureFlags.test.ts` fails if a key stops gating something or stops
being listed in the screen, so this table can't drift back.

| Module | Flag | Surface(s) | Status |
|---|---|---|---|
| Group splitting | `splitting` | Groups tab (→ Personal when off), Home owe/owed strip, Add **Transfer** kind | ✅ wired |
| Itemized bills | `itemized` | Quick-add **Split by items** → `add/itemized.tsx` | ✅ wired |
| Settle via UPI | `upiSettle` | Transfer sheet **Pay ₹X via UPI** (needs the payee's `upi_vpa`) *and* **Show QR to get ₹X** (needs your own), plus Settings › **Getting paid** | ✅ wired |
| Savings goals | `savingsGoals` | Plan tab, `savings/[id]` | ✅ wired |
| Financial health | `healthScore` | Home ring → `HealthSheet` (`index.tsx:80` nulls the score when off) | ✅ wired |
| Afford check | `affordCheck` | Plan header icon → `afford.tsx`, plus the inline verdict in Add | ✅ wired — **on** by default since the engine grew past a cash check |
| Insights | `insights` | Plan header icon → `insights.tsx` | ✅ wired |
| Reports | `reports` | Plan header icon **and** Settings → Reports & export → `reports.tsx` | ✅ wired |
| Recurring | `recurring` | Plan **Recurring** header icon → `plan/recurring.tsx` | ✅ wired — tracked rules only; the log-scanning detector was removed in P5 |
| Recurring suggestions | `recurringSuggest` | Review post-save banner → `RecurringSuggestionsSheet` | ✅ wired — **on** by default (never auto-creates) |
| Smart category | `smartCategory` | Quick-add title → category guess | ✅ wired — **on** by default (suggestion only) |
| Reminders | `reminders` | Settings → Notifications, `reminders.tsx`, OS notifications | ✅ wired (dev build needed for OS notifications) |
| Receipt scanning | `receiptScan` | Itemized **Scan receipt** button (iOS) | ✅ wired — closes DEBT `F7`, which was "no way to hide Scan" |
| Import & review | `importReview` | Settings → Import transactions → `import.tsx` / `review.tsx` | ✅ wired |
| Voice entry | `voiceEntry` | Add **mic disc** under the amount → `VoiceEntrySheet` (all three kinds), Settings → **Voice entry** → `settings/voice.tsx`, and the hands-free Siri capture drained by `lib/voiceDrain.ts` | ✅ wired — **on** by default; dictation is the OS keyboard/Siri, never a service |
| Tracking streak | `streak` (off) | Home `StreakCard` | ✅ wired (self-hides < 3 days) — **the only flag off by default** |
| Location tagging | `save_location` pref | Add flows + txn detail Maps link | ✅ wired — a `settings` pref, **not** a feature flag, despite sitting in the same list (§17) |
| Cloud receipt scanning | `ocr_provider` pref | Which provider `getReceiptExtractor()` returns (§7.4) | ✅ wired — also a `settings` pref, not a flag: it selects an implementation, not a surface |

**16 feature flags, and the count is now guarded.** `sourceCounts.test.ts` fails if any live doc
states a different number — it had drifted three times (12 → 14 → 15) before anything read it
(`V2-14`), and then drifted again in the §14 paragraph above, which was phrased in a way the
scanner's line filter did not match.

**Five chart-fragment flags were deleted** (`reportsDonut`, `reportsTrend`, `dashboardInsights`,
`forecast`, `savingsInsights`). Each gated a single chart or a sub-section of one card, which is
configuration nobody asked for: someone who doesn't want the donut doesn't open Reports. Those
surfaces are now unconditional, and the decorative ones self-hide when they have nothing to say —
which was always the right mechanism. What replaced them are the six real surfaces that had been
silently always-on: `itemized`, `upiSettle`, `insights`, `reports`, `receiptScan`, `importReview`.

**Personas compose these.** Each of the four onboarding intents applies a distinct combo
(`lib/personaDefaults.ts`), and **Feature Management → Your setup** re-applies one at any time —
that path writes *every* key, so it also undoes hand-toggles; onboarding writes only the
deviations, so untouched flags keep tracking `DEFAULTS`.

**Receipt OCR has no flag.** It is live and unflagged — see §7.4. The old `itemizedOcr` flag was
deleted in the 2026-07-28 purge, before scanning shipped, and was never re-added.

---

## 15. Key user flows (FLOW-XX)

Absorbed from `AUDIT.md` §3. Each step names the code that does it.

### FLOW-01 — First run / onboarding
| # | Step | Code |
|---|---|---|
| 1 | Fonts load, `openDB()` runs the schema + migrations + rebuilds + data fixes | `app/_layout.tsx:43`, `src/db/schema.ts` |
| 2 | `seedIfNeeded` creates the local `person` (`is_me=1`) and the `Personal` group | `src/db/seed.ts` |
| 3 | `materializeDueOccurrences` → `runSavingsMaintenance` → `rescheduleReminders` | `app/_layout.tsx:48-50` |
| 4 | `BrandedLoader` until fonts + DB ready; DB failure → retryable `ErrorState` | `app/_layout.tsx:71-88` |
| 5 | `LockGate` (biometric, default off) then `OnboardingGate` reads `onboarding_done` | `components/system/{LockGate,OnboardingGate}.tsx` |
| 6 | 9-stage questionnaire (§1) | `components/system/Onboarding.tsx`, `src/hooks/useOnboardingForm.ts` |
| 7 | Intent → `onboarding_intent` **and the feature flags it implies** | `lib/personaDefaults.ts`, `lib/onboarding.ts` |
| 8 | `finalizeOnboarding` writes name, the monthly `Salary` rule anchored by `paydayAnchor`, the `budget_target` preference, contacts **and the group holding them**, the money profile, and turns the backup reminder on — each step individually try/caught | `src/lib/onboarding.ts` |
| 9 | *(folded into step 8 — `setMoneyProfile` is part of the single commit)* | `src/lib/onboarding.ts` |
| 10 | `onDone()` → `settings.setOnboardingDone(true)` in a `try/finally`; the gate opens regardless | `OnboardingGate.tsx:19-25` |
| 11 | If the user chose "add my first expense", Home fires a one-shot push to Quick Add and clears the flag | `app/(tabs)/index.tsx:101-108` |

### FLOW-02 — Feature selection / toggle
| # | Step | Code |
|---|---|---|
| 1 | Settings → "Feature management" | `app/(tabs)/settings.tsx` |
| 2 | S-24 renders the non-toggleable "Core" pillars + the module switches in sections | `app/features.tsx` |
| 3 | Flipping a switch calls `setFlag(key, value)` from context | `components/system/FeatureFlagsProvider.tsx:25-28` |
| 4 | Local state updates optimistically; `AsyncStorage.setItem('feature_' + key, …)` is best-effort | `src/lib/featureFlags.ts:67-69` |
| 5 | Consuming screens re-render and gate with `{flags.x && …}` | e.g. `app/(tabs)/index.tsx` |
| 6 | On next launch `loadFlags()` multi-gets every key, `DEFAULTS` for unset | `src/lib/featureFlags.ts:56-65` |

Two toggles break the pattern deliberately: **location** must await an OS grant and can be
refused (§17), and **splitting** warns about hidden balances before turning off (§13.2).

### FLOW-03 — Premium upgrade
**Does not exist.** No premium tier, paywall, purchase SDK, entitlement check or
restore-purchases path anywhere. Every feature is available to every user. Recorded so the
absence is explicit rather than an oversight.

### FLOW-04 — Add an expense (the core flow)
| # | Step | Code |
|---|---|---|
| 1 | Tab-bar FAB → `/add/quick?kind=expense` (full-screen modal from bottom) | `app/(tabs)/_layout.tsx`, `app/_layout.tsx` |
| 2 | `useAddTxnForm(params)` loads me, groups, members, categories, flags | `src/hooks/useAddTxnForm.ts` |
| 3 | Amount typed → `sanitizeAmountInput` caps it live → `parseToPaise` | `components/finance/add/AmountField.tsx`, `src/lib/money.ts` |
| 4 | Category: manual pick, or auto-guessed from the title when `smartCategory` is on | `src/lib/smartCategory.ts` |
| 5a | Destination: always-visible `DestinationRow` → `DestinationSheet` (recency-ordered) | `components/finance/add/DestinationRow.tsx`, `DestinationSheet.tsx` |
| 5b | Optional details: note, receipt, location, pay method, recurrence — one named chip each | `components/finance/add/DetailChips.tsx` |
| 6 | Group with >1 member and total > 0 → `SplitSummary` opens `SplitSheet` / `PayersSheet` | `components/finance/add/SplitSummary.tsx` |
| 7 | Shares via `computeShares`, payments via `computePayments` (default: I paid it all) | `src/lib/splitMath.ts` |
| 8 | Budget nudge shows remaining in the category as you type | `components/finance/add/BudgetNudge.tsx` |
| 9 | Save → **duplicate check** for non-recurring expenses; a match prompts "Add anyway?" | `findRecentDuplicate` — and the Review commit path runs the same check via `findDuplicatesAmong` (`V2-20`) |
| 10 | `insertTxn` writes `txn` + payments + shares + audit inside one `withTransactionAsync` | `src/db/queries/transactions.ts` |
| 11 | `haptic.success()` → `refresh()` → `router.back()` | `useAddTxnForm.ts` |
| 12 | `refresh()` coalesces 32 ms and bumps a version; the focused screen reloads, background tabs mark dirty | `components/system/DataRefreshProvider.tsx` |

Editing takes the same path via `updateTxn`; a recurring-rule edit goes through
`splitRecurringSeries` so the old rule is capped and a new one starts, atomically.

### FLOW-05 — Split a bill by items
| # | Step | Code |
|---|---|---|
| 1 | Quick Add → "Split by items" chip (in **Other details**) → `/add/itemized` | `app/add/quick.tsx` → `add/DetailChips.tsx` |
| 2 | Step 1 **items**: name, qty, unit price → `computeItemSubtotal` = qty × unitPrice. Or **Scan receipt** (§7.4) | `src/lib/itemized.ts:49-53` |
| 3 | Step 2 **assign**: pick who shares each item; per-item split mode via `splitItemBase` | `src/lib/itemized.ts:24-26` |
| 4 | Adjustments (tax / tip / service / discount, flat or %) → `computeAdjustedTotal`, floored at 0 | `src/lib/itemized.ts:37-46` |
| 5 | Steps 3–4: `computePerPersonShares` scales every share by the adjustment ratio and nudges the rounding remainder so shares sum exactly | `src/lib/itemized.ts:60-93` |
| 6 | Save → `insertItemizedTxn` writes the txn, splits, `line_item` rows and `adjustments` JSON so it round-trips on edit | `src/db/queries/transactions.ts:321` |

### FLOW-06 — Settle up
| # | Step | Code |
|---|---|---|
| 1 | Entry: Home balance strip, Groups "People", group balance card, Friends, Reminders — all push `/add/quick?kind=transfer&to=…` | various |
| 2 | `computeTransferScopes` builds the per-group and global pair balance using the same `simplify` as everywhere else | `src/lib/settleScope.ts:30-54` |
| 3 | User picks a scope (one group, or "All groups") and an amount | `components/finance/add/TransferBody.tsx` |
| 4 | "All groups" → `planAllGroupsSettlement` distributes largest-first, remainder onto the last group | `src/lib/settleScope.ts:65-88` |
| 5 | One `recordSettlement` per plan row → `insertTxn` with `kind='settlement'` | `transactions.ts:296-303` |
| 6 | No shared group between the two people → explicit Alert, not a silent failure | `useAddTxnForm.ts:277` |
| 7 | Balances recompute from `getGroupNet`/`getGlobalNet`; the settlement cancels the debt naturally because it uses the same payment/share shape | `src/db/queries/balances.ts` |

### FLOW-07 — View the dashboard
See §4 — the layout list there is this flow's step 6, in order. The load path:
`useScreenData` → `loadHomeData(db, groups, tab, flags)`; deps
`[groups, tab]`; focus-time extras (`hide_amounts`,
30-day catch-up, one-shot first-add push) sit outside the loader.

### FLOW-08 — Import a statement → Review → committed transactions
| # | Step | Code |
|---|---|---|
| 1 | Settings → Import. Pick a file or paste text | `app/import.tsx` |
| 2 | PDF → base64 → `PdfTextExtractor` WebView runs pdf.js; xlsx → `readXlsx`; else read as text | `import.tsx:100-113` |
| 3 | `parseAnyText` / `parseAnyWorkbook` pick a parser most-specific-first | `src/lib/importDetect.ts` |
| 4 | 0 rows → one of three *specific* Alerts (§10.1) | `import.tsx:120-146` |
| 5 | Each row gets a category guess and a pay method | `import.tsx:153-168` |
| 6 | `insertPending` → `pending_txn`. **Nothing touches balances or budgets yet** | `src/db/queries/pending.ts:37` |
| 7 | `refresh()` → `router.replace('/review')`; Home shows an inbox badge | `import.tsx:170-171` |
| 8 | In Review each row is editable in place; edits auto-save to the row's draft columns | `app/review.tsx`, `updatePendingDraft` |
| 9 | `planCommit` resolves a row to its insert shape or refuses it | `src/lib/reviewCommit.ts` |
| 10 | Confirm → `insertTxn` → `deletePending`, plus `recordCorrection` to teach the category learner | `review.tsx:206-266` |
| 11 | Undo: `softDeleteTxn(txnId)` + `restorePending(snap)` — a true inverse from the pre-commit snapshot | `review.tsx:288-291` |
| 12 | Bulk confirm and clear-all get the same snapshot-and-undo treatment | `review.tsx:298-367` |
| 13 | Post-batch, `detectRecurringCandidates` may offer to convert rows into monthly rules | `src/lib/recurringSuggest.ts` |

### FLOW-09 — Set and track a budget
| # | Step | Code |
|---|---|---|
| 1 | Entry: Settings → Budget, Home get-started tile, group Budget tab, or a category's "Set budget" CTA (`?category=` + auto-scroll) | `app/group/[id]/budget.tsx:69-71` |
| 2 | Categories load by frequency-of-use; an empty catalog self-heals via `seedGlobalCategories` | `budget.tsx:98-102` |
| 3 | Per line: amount + cadence (once / daily / monthly / yearly). `refetchOnDataChange:false` so a mid-edit reload can't wipe unsaved amounts | `budget.tsx:104` |
| 4 | Save → `setCategoryBudgets` upserts `category_budget` rows | `src/db/queries/categoryBudgets.ts:47` |
| 5 | Tracking: `getCategoryBudgetStatus` compares each line against spend in the window of **its own** cadence, one query per distinct cadence, no rollover | `src/lib/budget.ts:160-179` |
| 6 | My Budget measures **my share across all groups** — one answer for every surface, `getMyGlobalBudgetSummary`; cross-group rollups map over `sharedGroupsOf` so the global cap is never also counted as a group's budget | `src/lib/budget.ts` |
| 7 | Health band from the single `budgetHealth` threshold source: ≥100 red, ≥80 amber | `src/lib/budget.ts:27` |

### FLOW-10 — Fund a savings goal
| # | Step | Code |
|---|---|---|
| 1 | Plan → New goal (name, target, icon, colour, allocation, frequency, deadline) → `insertGoal` | `src/hooks/useSavingsTab.ts`, `savings.ts:79` |
| 2 | Drag to reorder → `reorderGoals` writes `sort_order` = funding priority | `components/ui/DraggableList.tsx`, `savings.ts:101` |
| 3 | Manual: "Add funds" on a goal → `fundGoal` writes an `allocate` ledger row | `savings.ts:156` |
| 4 | Scheduled: on open / foreground, `runAutoFunding` → `planAutoAllocations` funds elapsed periods from available cash in rank order, advancing the anchor only for periods actually funded | `savingsEngine.ts:58` |
| 5 | If cash went negative, `proposeOverspendRaid` → `planOverspendRaid` *plans* a pull from the lowest-ranked **unlocked** goals. **Nothing is written.** | `savingsEngine.ts:101` |
| 6 | Plan asks before anything moves; on **Use savings**, `applyOverspendRaid` writes the shown withdrawals and offers Undo → `undoOverspendRaid` | `app/(tabs)/savings.tsx` |
| 7 | Reaching the target triggers `GoalCelebration`; completed goals sink below the active list | `app/(tabs)/savings.tsx:171-180` |

### FLOW-11 — Back up and restore
See §13.3. The one flow in the app that destroys data on purpose, and the only one whose
failure mode (a forgotten passphrase) is unrecoverable by design.

---

## 16. Validation rules

Every rule that can block or alter a save, with the copy the user actually sees.

| Field / rule | Rule | On failure |
|---|---|---|
| **Any amount** | `parseToPaise` → integer paise; `sanitizeAmountInput` caps the live input. Money is never a float. | Input can't be typed past the cap |
| **Quick Add `canSave`** | Amount > 0 **and** a category (expense/income) **and**, for a transfer, a from-person, a to-person and a shared group between them | Save button disabled; transfer with no shared group → explicit Alert |
| **Person name** | ≤ 30 chars; onboarding contacts dedup by name | Truncated / silently deduped |
| **Budget line** | Only amounts **> 0** are written by `setCategoryBudgets`; a zeroed line removes the budget | Silent (zero = "no budget", not an error) |
| **Split sum** | `computeShares` / `splitByMode` distribute the exact remainder so shares sum to the total with no rounding drift | Remainder warning in Add; Review row footer reads "₹X unassigned" / "₹X over" |
| **Itemized payers** | Payments must equal the adjusted total | Step-3 indicator: **"Must equal total ₹X"** |
| **Itemized assignment** | Items may be left unassigned | Unassigned banner + "Split unassigned equally" shortcut |
| **Adjustments** | `computeAdjustedTotal` floors the total at 0, so a discount can't produce a negative bill | Silent clamp |
| **Duplicate expense** | `findRecentDuplicate` matches on amount + group within **±24 h**, for non-recurring expenses only | "Add anyway?" prompt |
| **Review row commit** | `planCommit`: amount > 0; group expense split balanced; group transfer has a counterparty | Alert — **"Add an amount"** when ≤ 0, else **"Balance the split"** |
| **Review batch commit** | Unready rows are skipped, not blocked | Confirm names the count saved **and** the count skipped with the reason; all-unready → "Nothing ready to save" |
| **Member removal** | Blocked while that member's net ≠ 0 | "Settle up first" |
| **Goal withdrawal** | Clamped to the amount actually saved | Silent clamp |
| **Goal deletion** | Confirmed, then restorable via `restoreGoal` + the undo toast | — |
| **Group deletion** | The Personal group can never be deleted | Option absent |
| **Reports month** | Cannot advance past the current month | Forward arrow disabled |
| **Import file** | Must parse to ≥ 1 row | One of three specific Alerts (§10.1) |
| **Backup file** | Must be JSON with a `ciphertext` string | "Not a valid backup file — pick the .bsbackup file this app created." |
| **Backup passphrase** | Must decrypt to a valid payload | Wrong → inline sheet error, retryable. Corrupt/tampered → "This backup looks corrupted". The two are indistinguishable on purpose |
| **Attachment copy** | A failed copy (usually a full disk) throws `AttachmentStorageError` | Alert with a `/storage` deep-link; **the expense still saves** without the photo |

---

## 17. Permissions

Four OS permissions. None is requested at launch; each is asked for at the moment it's needed.

| Permission | Asked at | If denied | If revoked later |
|---|---|---|---|
| **Camera** | `pickAttachment('camera')` — attach-receipt and Scan-receipt; **also `UpiQrScanner`** for reading a friend's UPI QR (`useCameraPermissions`, which unlike the picker exposes `canAskAgain`, so a permanent denial gets a Settings-shaped message instead of silence) | Returns `null`. The flow aborts silently: a denial and a cancel are indistinguishable to the caller by design (both mean "no photo"). No Alert, no Settings link | Same — the next attempt re-prompts or aborts |
| **Photo library** | `pickAttachment('gallery')` | Same as camera | Same |
| **Notifications** | Onboarding stage 8 (priming), and again the first time any reminder toggle is switched on | `settings/notifications.tsx` sets `permStatus='denied'` and leaves the toggle off | A **denied banner** appears at the top of the Notifications screen — "Notifications are off / BudgetSplit can't send you reminders until you allow it" — with **Open Settings to allow** → `Linking.openSettings()` |
| **Location (foreground)** | Onboarding stage 8, the Feature-management **Location tagging** toggle, and each capture in an add flow | Feature-management shows "Location off / Allow location access for BudgetSplit in your phone's Settings to tag where you spend" and **leaves the toggle off**. A capture inside an add flow returns `null` and the transaction saves without a place | The next capture just returns `null` — location is always best-effort |

**Permission status is re-read, not cached.** The Notifications screen loads
`Notifications.getPermissionsAsync()` inside `useScreenData`, so every focus and every
cross-screen write re-syncs to OS truth; a local optimistic `granted`/`denied` only survives
until the next load. It distinguishes three states — `granted`, `undetermined` (`canAskAgain`),
and `denied` — and only the third shows the banner, because re-prompting is still possible in
the second.

**Why location isn't a feature flag.** Flags are optimistic, synchronous and can't fail; this
toggle can be *refused by the OS*, so it must await a result and then decline to turn on.
Folding it into `FeatureKey` would mean adding async validation to the flag API for one case.
It lives in `settings` (AsyncStorage) instead and appears in the same Feature-management list —
that split is intentional and commented at the call site (`toggleSaveLocation` in
`app/features.tsx`, which cites AUDIT F-30 / DEBT-04 where it was originally filed as an
inconsistency).

**Biometrics are not a permission** but behave like one: `LockGate` handles the
hardware-present-but-nothing-enrolled case explicitly with "Face ID not set up", an **Open iOS
Settings** button, and an escape hatch — **Disable lock in BudgetSplit** — so a user can never
be locked out of their own data.

---

## 18. Notifications

All local, on-device scheduling. **No push, no server** (`src/lib/notifications.ts`).

**Three reminder types**, all configured on `/settings/notifications` and persisted as one
`ReminderPrefs` JSON blob (`src/lib/reminders.ts` — the fourth preference store in the app,
alongside AsyncStorage flags, `settings`, and the `settings` table):

| Type | Pref | Config |
|---|---|---|
| Bill / renewal reminders | `renewals` | Lead days + time-of-day (`TimePickerSheet`) |
| Daily log reminder | `daily` | Time-of-day |
| Backup nudge | `backup` | Monthly, counted from `settings.backupAnchorAt()` — **anchored to `Date.now()` the first time it's enabled**, and re-anchored on every backup *and* restore, so it can never nag right after a real backup |

**Scheduling.** `rescheduleReminders` runs on boot and on every `AppState → active`
(`app/_layout.tsx`), plus after any prefs change. It reads the prefs, builds the plan with
`buildReminderPlan` (`src/lib/reminderPlan.ts`) from active recurring rules and pending
settle-ups, `limitReminders` caps the count, and each entry is scheduled by
`scheduleReminderAt(id, date, title, body)`. That helper **cancels the same id first** so
rescheduling can't duplicate, and **no-ops on a past date or any error** — so a stale plan
degrades to silence rather than a burst of notifications.

**No push entitlement, deliberately.** Every notification is scheduled locally, so the app needs
neither the Push Notifications capability nor `aps-environment` — there is no `getExpoPushToken`,
`getDevicePushToken` or push-token listener anywhere. The `expo-notifications` config plugin adds
`aps-environment` regardless, which **breaks signing on a free/personal Apple developer team**
(those cannot create a profile with Push Notifications), so `plugins/withoutPushEntitlement.js`
strips it back out. It must be registered **before** `expo-notifications` in `app.json` — Expo
composes mods by wrapping, so the last registered runs first, and getting this backwards fails
silently: prebuild succeeds and the key is still there.

**Permission.** `requestNotificationPermission()` checks first and only prompts when not
already granted, so it's safe to call repeatedly. Everything is wrapped so Expo Go (where the
notification module is unavailable) degrades to a no-op rather than throwing — OS notifications
need a dev build.

**Test notification.** The Notifications screen can fire one immediately, which is the only way
to confirm the whole chain on a device without waiting for a real due date.

**Tap-to-open.** A tapped reminder lands on what it was talking about (`V2-15`, fixed
2026-08-05 — this section previously read *"worth adding, not currently present"*).

| Reminder id | Opens |
|---|---|
| `renew_{ruleId}_d{n}` | `/plan/recurring?focus={ruleId}` — the rule, scrolled to and highlighted |
| `daily_log` | `/add/quick` — the thing it is asking you to do |
| `backup_nudge` | `/reports`, where the export lives |
| anything else | nothing. A wrong destination is worse than none: it moves you away from what you were doing |

The route is derived from the **identifier** (`lib/notificationRoutes.ts`), not from a payload,
because those ids are already this app's contract for a reminder's source — so reminders scheduled
*before* this shipped route correctly, with no payload migration and no second source of truth.
`app/_layout.tsx` registers `addNotificationResponseReceivedListener` and also checks
`getLastNotificationResponseAsync`, which covers a tap that cold-started the app.

---

## 19. Network & data egress

The app is local-first: SQLite on device, no sync, no telemetry, no analytics SDK. Three paths
can leave the device, all listed below, and **only one is on by default**.

| # | What | Sends | When |
|---|---|---|---|
| 1 | **Receipt OCR, cloud provider** — `server/receipt-ocr-proxy` → Gemini Flash | **The receipt photo**, base64-encoded | Scanning a receipt while `settings.ocrProvider()` is `gemini` — **the default** |
| 2 | **Account, linking + server backup** — `server/api` (`src/lib/serverApi.ts`) | Your **email address**, a device label ("iPhone 15"), optionally your name, profile picture and phone number, who you are **linked** with, and **encrypted backup blobs** the server cannot read. No transaction, group, budget or goal ever goes up | Only in a build with `EXPO_PUBLIC_API_URL` set, and only after the user signs in and taps a backup, invite or approve action (§13.4, §13.5) |
| 3 | **pdf.js**, loaded in the off-screen `PdfTextExtractor` WebView to read a compressed PDF | Nothing — the library is **bundled** in the app (`src/assets/pdfjs/`, integrity-checked in `src/lib/pdfjsCache.ts`) and the PDF is parsed locally | Importing a PDF statement |

### The proxy
[server/receipt-ocr-proxy/](../../server/receipt-ocr-proxy/) is a stateless **Cloudflare
Worker** — `index.ts`, ~113 lines, and the repo's only server component. It POSTs
`{imageBase64, mimeType}` to Gemini with a `responseSchema` and returns
`{items: [{name, qty, unitPrice}]}`. `GEMINI_MODEL = 'gemini-flash-latest'` is a hardcoded
constant, not an env var. It stores nothing.

Its only reason to exist is holding `GEMINI_API_KEY` server-side, out of the app bundle. Its
README puts it plainly: *"this one small stateless function is the whole 'backend'."*

**Config** (README, not in the app): `wrangler secret put GEMINI_API_KEY` → `wrangler deploy` →
set `EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL` in `budgetsplit/.env` or the EAS environment.

**Quota caveat.** Gemini's free tier is shared across the whole app, not per-user, and was cut
50–80% in late 2025. Fine for personal scale; watch it (or move to a paid tier) before any real
user-base growth. `ocrProviders/index.ts` documents Mistral as a possible automatic fallback —
documented, **not implemented**.

### The account/backup Worker
[server/api/](../../server/api/) is the second Worker: D1 for identity (`users`, `magic_links`,
`sessions`) and backup metadata, and a blob store for the encrypted snapshots —
**KV today**, because the `[[r2_buckets]]` block in `wrangler.toml` is commented
out. That matters: KV caps a value at 25 MiB and the free plan allows ~1k writes a
day, where R2's ceiling is far higher. It never sees a transaction, and never sees a
backup passphrase — `lib/backup.ts` encrypts on the phone first, so the stored bytes are opaque
to it. Phase **S1** only: no sync (S2), no shared groups (S3).

**Config**: `wrangler d1 create` → `d1 migrations apply` → `r2 bucket create` → an email
provider (see below) → `wrangler deploy` → set `EXPO_PUBLIC_API_URL`.

**It runs free.** Workers (100k req/day), D1 (5 GB) and R2 (10 GB, once wired) are all on Cloudflare's
free plan. The one exception is Cloudflare's *own* Email Sending, which is Workers Paid
($5/mo) and needs a domain you own — so `server/api/mailer.ts` defaults to an HTTP provider
with a free tier and single-sender verification, and falls back to the Cloudflare binding
when it is configured. Which one is live is reported by `GET /health`.
Leave that env var unset (the default) and none of this code path is reachable: no Account row,
no server backup rows, no requests.

### What this means for the privacy claims
The default OCR provider is `gemini`, so out of the box a scanned receipt photo does reach a third
party. **Feature management → Smart capture → Cloud Receipt Scanning** turns that off and keeps
everything on the phone (§7.4). Because of that, and now because signing in is possible at all,
any absolute in-app claim ("zero network calls", "nothing ever leaves your device") would be
false as written. The strings in `app/help.tsx`, `app/(tabs)/settings.tsx`, `app/storage.tsx` and
`VOICE_SHORTCUT_PRIVACY` are scoped instead: local-first, no tracking, no analytics, nothing
uploaded **unless you ask** — with receipt scanning and server backup named as the two
exceptions, and the way out named for each (the OCR toggle; not signing in).

---

## 20. Every screen's states

The codebase is deliberately inconsistent about states, and the inconsistencies are the
content. Derived from source, cross-checked against `AUDIT.md` §8 ("Error handling: swallowed
vs. surfaced").

| Route | Loading | Error | Empty | Pull-to-refresh |
|---|---|---|---|---|
| `/` Home | none (deliberate) | `ErrorState` + retry | first-run hero + 3 tiles | ✅ |
| `/groups` | none (stale store data) | `ErrorState` + retry | "No groups yet" **+** separate "No archived groups" | ✅ |
| `/savings` Plan | none | `ErrorState` + retry | goals: "No savings goals yet" | ✅ |
| `/settings` | none (static list) | `ErrorState` + retry | n/a | ✖ static config |
| `/add/quick` | none | try/catch → haptic + Alert | n/a | ✖ wizard |
| `/add/itemized` | `ActivityIndicator`; `ScanningOverlay` during a scan | try/catch → haptic + Alert | n/a | ✖ wizard |
| `/afford` | none | `ErrorState` — **never swallowed**, see below | n/a | ✖ form |
| `/categories` | none | `ErrorState` + retry | self-heals instead | ✅ |
| `/category/[name]` | `Skeleton` + `SkeletonCard` | `ErrorState` + retry | "No transactions" (period-scoped copy) | ✅ |
| `/features` | none (flags in context) | none | n/a | ✖ |
| `/friends` | none | `ErrorState` + retry | `EmptyState` | ✅ |
| `/group/[id]` | none | `ErrorState` + retry | "Group not found"; per-tab empties | ✖ |
| `/group/[id]/budget` | none | `ErrorState` + retry | "No categories yet" | ✅ |
| `/group/[id]/edit` | none | `ErrorState` + retry | n/a | ✖ form |
| `/group/[id]/members` | none | `ErrorState` + retry | n/a (you're always a member) | ✅ |
| `/group/[id]/recurring` | none | `ErrorState` + retry | "No recurring transactions" | ✅ |
| `/help` | n/a | n/a | n/a | ✖ static |
| `/history` | none | `ErrorState` + retry | "Nothing logged yet" | ✅ |
| `/import` | button label → "Reading PDF…" | 5 specific Alerts (§10.1) | n/a | ✖ form |
| `/insights` | none | `ErrorState` + retry | "No insights yet" | ✅ |
| `/personal` | none | `ErrorState` + retry | "Nothing here yet" **+** "No recurring items" | ✅ |
| `/plan/recurring` | none | `ErrorState` + retry | "No recurring items yet" | ✅ |
| `/reminders` | none | `ErrorState` + retry | "Nothing due" | ✅ |
| `/report-transactions` | none | `ErrorState` + retry | "No transactions" | ✅ |
| `/reports` | `Skeleton` behind a **450 ms floor** so it can't flash | `ErrorState` + retry | "Nothing to report yet" | ✅ |
| `/review` | 4 × `SkeletonCard` (150 pt) | `ErrorState` + retry | "Nothing to review" **+** a distinct "No matches" for a filtered-empty set | ✅ |
| `/savings/[id]` | `Skeleton` + `SkeletonCard` | `ErrorState` + retry | "Goal not found" **+** "No contributions yet" | ✅ |
| `/search` | none (150 ms debounce) | `ErrorState` + retry | one `EmptyState`, copy switches "Search your transactions" ↔ "No matches" | ✖ **deliberate** — the list *is* the query |
| `/settings/backup` | per-row `ActivityIndicator` | Alert per failure, typed (§13.3) | n/a | ✖ form |
| `/settings/notifications` | none | `ErrorState` "Couldn't load reminder settings" | n/a | ✖ form |
| `/storage` | none | `ErrorState` + retry | n/a | ✖ |
| `/txn/[id]` | none | `ErrorState` + retry | "Transaction not found" | ✖ refetches on focus |
| `_layout` (boot) | `BrandedLoader` | `ErrorState`, Retry re-runs DB init | n/a | n/a |

**The clearest statement of intent in the codebase** is `app/afford.tsx:27-34`: load errors must
**not** be swallowed here, because a zeroed snapshot would render as a confident "₹0 available" —
a wrong answer stated with certainty. Screens that answer a question surface their errors;
screens that decorate (streak, forecast teaser, insights nudges) self-hide instead.

**Pull-to-refresh has one rule** (from [AGENTS.md](../AGENTS.md)): a screen gets
`AppRefreshControl` iff it loads DB data via `useScreenData` **and** owns its scroll container.
The `✖` rows above are the documented exemptions — query-driven (`search`), forms (`afford`,
`group/[id]/edit`, `settings/notifications`, `import`, `settings/backup`), details
(`txn/[id]`) and wizards (`add/*`).

---

## 21. System components & global behaviors

| Behavior | Component | Notes |
|---|---|---|
| Biometric lock | `LockGate` | Face ID on background; truth in AsyncStorage `biometric_enabled`. Handles not-enrolled with an Open-Settings button and a disable-lock escape hatch (§17). |
| App-switcher privacy | `PrivacyScreen` | Branded cover over the snapshot. |
| Undo deletes | `UndoProvider` / `UndoToast` | 5 s toast above nav; survives `router.back()`. |
| Cross-screen refresh | `DataRefreshProvider` | `refresh()` coalesces 32 ms and bumps a version; the focused screen reloads via `useScreenData`, background tabs mark dirty. |
| Goal celebration | `GoalCelebration` | Full-screen confetti at 100% (auto-dismiss). |
| Health detail | `HealthSheet` | Score ring + 3 dimensions + factors + projected improvement. |
| Boot splash | `BrandedLoader` | Logo + spinner during DB init. |
| Boot failure | `_layout` `ErrorState` | Isolated; Retry re-runs DB init. |
| Recurring catch-up | `materializeDueOccurrences` | On boot + foreground; surfaces the Home catch-up banner. |
| PDF text extraction | `PdfTextExtractor` | Hidden WebView running pdf.js; mounted only while reading a PDF. |
| OCR progress | `ScanningOverlay` | Absolute-fill; blocks all interaction during a receipt scan. |
| Pull-to-refresh | `useRefresh` / `AppRefreshControl` | See §20 for the exact set. |
| Brand animation | `LogoAssembly` | ⛔ **Never modify** (also the onboarding hero ring/fan). |

---

## 22. Every pill, in one table

| Screen | Pill set | Options |
|---|---|---|
| Home | Period | Month · Today · Year |
| Groups | View | Active · Archived |
| Add | Kind | Expense · Income · Transfer *(Transfer gated by `splitting`)* |
| Add (expense) | Destination | `DestinationRow` → `DestinationSheet`, all groups, Personal first then most-recently-used |
| Add | Other details | Note · Receipt · Location · Pay method · Repeat *(chips, set ones show their value)* |
| Add (shared) | Split mode | Equal · Exact · % · Shares |
| Add (any kind) | Pay method | UPI · Card · Cash · Bank · Wallet · Autopay · Other |
| Itemized | Step dots | Add items · Assign items · Who paid? · Review & save |
| Personal | Tabs | Activity · Budget · Recurring |
| Personal › Activity | Scope filter | Personal · Groups · All · {each group} |
| Group | Tabs | Expenses · Recurring · Budget · Members |
| Group › Expenses | Kind filter | All · Expense · Income · Settlement |
| Group › Budget | Status filter | All · Over · Near limit · On track |
| Review | Row kind | Exp · Inc · Txfr |
| Review | Row direction | Money in · Money out *(transfers only)* |
| Review | All-to chips | Personal · first 3 shared groups |
| Import | Pasted-text source | Google Pay · Bank / UPI (CSV) · Email alert |
| Search | Kind / Source | All · Expense · Income · Settlement / All · Personal · Groups |
| Insights | What-if | 10% · 20% · 30% |
| Categories | Kind | Expense · Income · Transfer |
| Settings | Cadence *(sheet)* | One-time · Daily · Monthly · Yearly |
| Features › Smart capture | Cloud Receipt Scanning *(toggle)* | on = cloud OCR (`gemini`) · off = on-device (`device`) |

**Not pills:** Plan's `Insights · Recurring · Can I afford?` are **header icons** (§8), and
Reports is not among them.

---

## 23. Sheets & overlays, in one table

Every sheet routes through `ui/SheetModal` (an RN `<Modal transparent>` wrapping
`DraggableSheet`) unless noted.

### Reusable sheet components
| Sheet (title) | File | Opened from |
|---|---|---|
| "Money Health" — `HealthSheet` | `finance/HealthSheet.tsx` | Home `HealthBand`/ring tap |
| "Your money" — `MoneyEditorSheet` | `finance/plan/MoneyEditorSheet.tsx` | Plan `TotalMoneyCard` → Edit |
| "What protecting does" — `LockExplainerSheet` | `finance/plan/LockExplainerSheet.tsx` | Goal detail protect toggle |
| "Category" — `CategoryPicker` | `finance/CategoryPicker.tsx` | Quick Add, Itemized, **Review** (`forceOpen hideTrigger`) |
| "Where does this go?" — `DestinationSheet` | `finance/add/DestinationSheet.tsx` | Quick Add `DestinationRow` |
| "How was it paid?" — `PayMethodSheet` | `finance/add/PayMethodSheet.tsx` | Quick Add pay-method chip |
| "Repeat this" — `RecurringSheet` | `finance/add/RecurringSheet.tsx` | Quick Add repeat chip |
| "Note" — `NoteSheet` | `finance/add/NoteSheet.tsx` | Quick Add note chip |
| "Add a friend" / "Rename" / "Your name" — `PersonNameSheet` | `finance/PersonNameSheet.tsx` | Friends (add + rename), group Members (rename) |
| "Who paid?" — `PayersSheet` | `finance/add/PayersSheet.tsx` | Quick Add payers row |
| "Split" — `SplitSheet` | `finance/add/SplitSheet.tsx` | Quick Add split row |
| "Who paid?" / "Who received?" — `TransferSlotSheet` | `finance/add/TransferSlotSheet.tsx` | Quick Add transfer from/to slots |
| "Scanned receipt" — `ReceiptScanSheet` | `finance/add/ReceiptScanSheet.tsx` | Itemized, after an OCR scan |
| "Set a backup passphrase" / "Enter passphrase" — `PassphraseSheet` | `finance/backup/PassphraseSheet.tsx` | Backup & restore (**two instances**: create + restore) |
| "Looks recurring?" — `RecurringSuggestionsSheet` | `finance/review/RecurringSuggestionsSheet.tsx` | Review suggestion banner |
| "Select date" — `DatePickerSheet` | `ui/DatePickerSheet.tsx` | Quick Add (txn date, recurring end date), Review `FilterForm` |
| Time picker (dynamic title) — `TimePickerSheet` | `ui/TimePickerSheet.tsx` | Notifications (renewal + daily times), Review `FilterForm` |
| FAB action menu | `ui/FAB.tsx` (own `<Modal>`) | Only when `actions` is passed; group detail and Personal use single-tap mode |

### Inline `SheetModal`s declared in screens
| Sheet title | Screen |
|---|---|
| "New Group" (`GroupForm`) | `app/(tabs)/groups.tsx` |
| "Add to {goal}" · "New goal" | `app/(tabs)/savings.tsx` |
| "Your name" · "Default budget cadence" | `app/(tabs)/settings.tsx` |
| "Add Tax" / "Add Tip" / "Add Service Charge" / "Add Discount" | `app/add/itemized.tsx` |
| "{group.name}" options (Audit log · Export as CSV · Edit group · Archive group) | `app/group/[id].tsx` |
| "How often?" (per-category cadence) | `app/group/[id]/budget.tsx` |
| "Add to group" (`PersonPicker`) | `app/group/[id]/members.tsx` |
| "Personal" options (Audit log · Export as CSV) | `app/personal.tsx` |
| "Personal or group" · "Who paid you?/Who did you pay?" · "How was it paid?" · "Assign N to a group" · "Filter" · "Review options" · "Saved views" · "Save view" | `app/review.tsx` (**8**) |
| "Add funds" · "Withdraw to cash" · "Adjust goal" | `app/savings/[id].tsx` |

### Non-sheet overlays
| Overlay | File | Shown when |
|---|---|---|
| Onboarding flow | `system/Onboarding.tsx` | First launch, via `OnboardingGate` |
| Lock screen | `system/LockGate.tsx` | Lock enabled + returning to foreground |
| Privacy blur | `system/PrivacyScreen.tsx` | App backgrounded |
| Branded splash | `system/BrandedLoader.tsx` | Fonts/DB not ready |
| DB-open error | inline `ErrorState` in `app/_layout.tsx` | `openDB()` throws |
| Undo toast | `system/UndoToast.tsx` | Global `useUndo()` |
| PDF text extractor | `system/PdfTextExtractor.tsx` | `/import` PDF parse |
| `ScanningOverlay` | `finance/add/ScanningOverlay.tsx` | Receipt scan in flight |
| `GoalCelebration` | `finance/GoalCelebration.tsx` | Goal hits 100% |
| Attachment viewer | inline `Modal` in `app/txn/[id].tsx` | Receipt thumbnail tap |

---

## 24. Developer / QA tooling

Reached via **Settings → tap the version row ×7 → `/storage`**.

- **Load demo data** — wipes the DB and rebuilds a dataset that exercises every component
  state. Also flips **all feature flags on** and preserves your name & avatar.
  Source: `src/db/seedDemo.ts → loadDemoData`. Coverage:
  - **6 people · 8 groups** (Personal, Roommates, Goa, Office, Family, Manali, an **empty** group
    "Weekend Plans" for empty-tab states, and an **archived** "Old Flat") · ~70 transactions / 3 months.
  - **Splits:** equal · exact · shares/weights · itemized (tax + tip + discount). **Settlements:** partial (live balances) + fully-settled, all pay methods. **simplify-debt OFF** on Goa.
  - **TransactionRow states:** note-primary, **category-primary (no note)**, attachment clip, lent/borrowed attribution, income, settlement (two avatars).
  - **Recurring:** active / paused / ended across daily→weekly→monthly→yearly→**custom**; plus **near-due rules** (1–3 days out) so **Home "Coming up"** + **Plan "Upcoming"** populate.
  - **Budgets:** over / near / under, every cadence (once/daily/monthly/yearly).
  - **Savings — 7 goals:** locked@40% · reached 100% (deadline) · over-funded 120% · partial · 0% empty · withdrawal history · **overdue** (deadline past) · manual + auto funding.
  - **Pending rows:** seeded `pending_txn` from multiple sources so Review's sectioned inbox populates.
  - **Edge cases:** ₹65k large, ₹5 tiny, soft-deleted txn, location-tagged + attachment rows.
- **Erase all data** — `resetToEmpty`: wipes everything to an empty app (name/avatar kept) for
  testing empty states.
- **Delete all attachments** — clears receipt photo files + DB refs.

**Doc coverage guard.** `src/__tests__/docCoverage.test.ts` walks every route file under `app/`
and fails if one isn't mentioned in this document. A new screen can't ship undocumented, which
is the failure mode that produced this rewrite.

---

## 25. Component inventory

Every component in `src/components/**`, with what it is and where it's used. Folder rule:
`ui/` = generic primitives (no domain knowledge); `finance/` = budget/txn/member/settle
widgets; `system/` = onboarding, gates, privacy. `ui/` never imports from `finance`/`system`.

### `ui/` — generic primitives
| Component | What it is / where |
|---|---|
| `AmountText` | Money text in SpaceMono, kind-coloured, obfuscation-aware. Balances, forecast, goals, reports. |
| `AppRefreshControl` (+ `useRefresh`) | Themed pull-to-refresh for scroll/list screens (§20). |
| `Badge` | Small labeled pill. Reports/insights/history/settings. |
| `BalanceChip` | Owe/owed chip on group cards (Groups list). |
| `DatePickerSheet` | Bottom-sheet date picker (Add flows, Review filter). |
| `DraggableList` | Gesture-handler reorderable list — drag = savings funding priority (Plan). |
| `DraggableSheet` | Low-level draggable-sheet primitive used internally by `SheetModal`. |
| `EmptyState` | Icon circle + title + body + CTA. Every list's empty state. |
| `ErrorState` | Error icon + message + Retry. |
| `FAB` | Floating action button — `aboveTabBar` (tab-bar centered) or bottom-right; optional action-menu mode. |
| `FadeIn` | Staggered fade-in wrapper for list/section mounts. |
| `FilterBar` | Search box + chip filter groups; collapsible mode. Group Expenses/Budget, Search, History. |
| `IconCircle` | The canonical icon-in-a-coloured-dot (replaced ~40 hand-rolled copies). |
| `Input` | Design-system text input (bgInput, focus border, amount mode, secure mode for passphrases). |
| `ModalHeader` | Header for modal sheets (title + close). Add flows. |
| `PressableScale` | Spring-scale tappable wrapper for cards/rows. |
| `PrimaryButton` | Gradient primary CTA (52 px). All primary actions. |
| `ScreenHeader` | Safe-area header (back chevron + title + right slot) for every **pushed** screen. |
| `SecondaryButton` | Bordered secondary button. |
| `SectionCard` | Card wrapper for a titled section. |
| `SettingsRow` (+ `settingsRowDivider`) | Icon + label + value + chevron row. Settings, options menus, Review overflow. |
| `SheetModal` | The reusable gesture-handler **bottom sheet** used everywhere. |
| `Skeleton` / `SkeletonCard` | Skeleton loaders (Reports, Category, Goal detail, Review). |
| `TabPills` | Segmented pill control (Home period; reused for in-screen segments). |
| `TimePickerSheet` | Bottom-sheet time picker (Notifications, Review filter). |

### `finance/` — domain widgets
| Component | What it is / where |
|---|---|
| `AvatarStack` | Overlapping member avatars (Groups cards, group hero). |
| `BalanceRow` | "A owes B" row + **Settle amount** CTA (group Members settlements). |
| `BudgetBar` | Animated utilization bar, health-coloured. Budgets, group cards, category detail. |
| `CategoryChip` | Selectable category chip (Afford check). |
| `CategoryDonut` | SVG donut of category spend (Reports); centre label auto-shrinks. |
| `CategoryPicker` | Searchable category grid *(sheet)* + inline create. Add flows, Review. |
| `GoalCelebration` | Full-screen confetti at 100% goal (auto-dismiss). |
| `GroupForm` | Create/edit group form — icon, name, type, members, default split. Shared by the create sheet and Edit group. |
| `HealthSheet` | Financial-health detail sheet (ring + dimensions + factors). |
| `InsightText` | Rich/parsed insight text with emphasis. |
| `MemberAvatar` | Circular avatar (initials or photo), tappable for photo pick. |
| `PayMethodSelector` | Pay-method chip row — all **7** methods (UPI/card/cash/bank/wallet/autopay/other) from `PAY_METHOD`. Shared by Add expense/income/transfer. |
| `PersonNameSheet` | Add / rename a person *(sheet)*. Friends, group Members. |
| `PersonPicker` | Searchable multi-select person list + inline create (Members add). |
| `TransactionRow` | Transaction list row — title/category, amount, attribution, attachment clip, settlement avatars. |
| `TransferBody` | Transfer/settle body — from/to people, scope, pay method, note (Quick-Add Transfer). |
| `TrendBars` | 6-month spend bars (Reports). |

### `finance/home/` — Dashboard widgets
| Component | What it is |
|---|---|
| `HeroCard` | Hero period spend + pace bar + prev-delta + health ring (hidden on a null score). |
| `CategoryRankList` | "Where it went" top-category bars, expandable. Reused by Reports. |
| `BalanceStrip` | Owe/Owed summary + Settle. |
| `ForecastCard` (home) | Month-end forecast + budget pace + biggest-shift teaser → Insights. |
| `ComingUpList` | Upcoming recurring bills. |
| `StreakCard` | Logging-streak calendar (self-hides < 3 days). |
| `HealthBand` | Health band strip — **dead code**: exists on disk, imported by nothing. `HeroCard`'s ring replaced it. |

### `finance/group/`, `finance/plan/`, `finance/add/`, `finance/review/`, `finance/backup/`
| Component | What it is |
|---|---|
| `group/GroupHero` · `group/GroupBalanceCard` · `group/TransactionsTab` · `group/BudgetTab` · `group/MembersTab` · `group/RecurringTab` | Group-detail sub-views extracted from `group/[id].tsx`. `GroupBalanceCard` also renders the "All settled up" zero state. `BudgetTab` offers **Re-plan the rest of this month** on an over-budget category (`V2-07`). |
| `group/RebalanceSheet` | The re-plan proposal: which limits move and by how much, before anything is written (`V2-07`). |
| `group/InsightsTab` | In-hub group Insights view (member spend bars, top categories, recommendations). |
| `plan/ForecastCard` | Plan-tab month-end forecast card (distinct from `home/ForecastCard`). |
| `plan/GoalCard` | Savings goal card — progress bar, deadline, contribution/needed per month. |
| `UpiQrScanner` | Live camera sheet that reads a friend's UPI QR into their contact. |
| `ScanPaySheet` | Scan → amount → UPI-app hand-off, for Scan & Pay. |
| `plan/TotalMoneyCard` | Available Money hero + net worth + credit headroom (`V2-12`). |
| `plan/MoneyEditorSheet` | Editor *(sheet)* for the figures behind Total Money. |
| `plan/LockExplainerSheet` | Explains what protecting a goal does. |
| `add/AmountField` · `add/CategoryDatePills` · `add/ContextPill` · `add/DetailChips` · `add/BudgetNudge` · `add/AttachmentRow` · `add/LocationRow` · `add/SplitSummary` · `add/SplitSheet` · `add/SplitEditor` · `add/PayersSheet` · `add/TransferSlotSheet` | Add-flow sub-views driven by `useAddTxnForm`. `SplitEditor` is also used inline by Review. |
| `add/RecurringControls` | The recurring block inside `RecurringSheet` — collapsed toggle, or the expanded card: frequency, next charge (`nthOccurrenceMs`), and ends **never / on a date / after N**. Frequency and Ends are `TabPills` (mutually exclusive choices), driven by `RECUR_FREQ_ADD_CHOICES` / `RECUR_END_MODE`. |
| `add/TagSheet` | Multi-select tag picker *(sheet)* with create-as-you-type; the only multi-select picker in the app, which is why it doesn't reuse `ListRow`'s single-select idiom. |
| `add/AmountCalculatorSheet` | Sequential amount arithmetic (split / tip / tax) over integer paise. |
| `add/ReceiptScanSheet` · `add/ScanningOverlay` | Receipt-scan result sheet and blocking progress overlay (§7.4). |
| `review/ReviewRowCard` | One editable pending row. **Module scope is load-bearing** — see §10.2. |
| `review/DestOption` · `review/FChip` · `review/FilterForm` · `review/SaveViewForm` · `review/RecurringSuggestionBanner` · `review/RecurringSuggestionsSheet` · `review/ReviewDestSheet` · `review/CounterpartySheet` · `review/BulkGroupSheet` · `review/ReviewOverflowSheet` · `review/SavedViewsSheet` | Review sub-views (§10.2). |
| `system/onboarding/StepScaffold` · `StepFooter` · `StepProgress` · `StepBack` · `StepAmountField` · `MoneyRow` · `SummaryStage` | Onboarding step chrome (§1). `StepFooter` **forks** the hero's footer styling rather than sharing it. |
| `backup/PassphraseSheet` | Passphrase create/unlock sheet (§13.3). |

### `system/` — global behaviors
| Component | What it is |
|---|---|
| `BrandedLoader` | Boot splash (logo + spinner) during DB init. |
| `DataRefreshProvider` (+ `useDataRefresh`) | Version-bump context so screens reload after a write elsewhere. |
| `FeatureFlagsProvider` (+ `useFeatureFlags`, `FlagsGate`) | Feature-flag context (AsyncStorage-backed). |
| `LockGate` | Biometric lock on background, with the not-enrolled escape hatches (§17). |
| `LogoAssembly` | Brand assembly animation — ⛔ **never modify**. |
| `Onboarding` (+ `onboarding/*` step chrome) | The **9-stage** onboarding flow (§1). |
| `OnboardingGate` | Gates onboarding via AsyncStorage `onboarding_done`. |
| `PdfTextExtractor` | Off-screen WebView running pdf.js for PDF import. |
| `PrivacyScreen` | App-switcher privacy cover. |
| `StoreHydrator` | Hydrates the zustand store (`me`, `groups`) at the root. |
| `UndoToast` (+ `UndoProvider`, `useUndo`) | 5-second undo toast above nav. |

> **Two `ForecastCard`s exist:** `home/ForecastCard` (Dashboard, with the shift teaser) and
> `plan/ForecastCard` (Plan tab). Different props, different screens.

---

## 26. Manual test flows

The **interactive** behaviours static data can't show on its own — the demo seed (§24)
pre-stages the data so each is one or two taps from completing. After **Load demo data**:

| # | Flow / component to see | Pre-staged data | Steps to complete |
|---|---|---|---|
| 1 | **GoalCelebration** (100% confetti) | "Weekend Getaway" goal at **97.5%** (₹19.5k/₹20k) | Plan → Weekend Getaway → **Add funds** ₹500 → confetti fires. |
| 2 | **Undo toast** (`UndoToast`) | Personal txn noted **"Delete me — tests the Undo toast"** | Open it → Delete → tap **Undo** within 5 s. |
| 3 | **Settle up** (Transfer pill) | Live balances in Roommates / Goa / Family / Manali | Home **Owe/Owed → Settle**, or Group → Members → **Settle amount** → pick method → Save. |
| 4 | **"All settled up" card** | **Office Lunch** is fully settled | Open it — the balance card shows the check-circle state instead of nothing. |
| 5 | **Recurring skip / pause / stop** | Active rules incl. **near-due** ones (1–3 days) | Group/Personal → Recurring → a rule → **Skip next / Pause / Stop**. |
| 6 | **Member remove — blocked vs allowed** | Roommates members have balances; Office Lunch is settled | Group → Members → swipe-remove: blocked in Roommates ("settle first"), allowed in Office Lunch. |
| 7 | **Empty states** (within a populated app) | **"Weekend Plans"** group (members, 0 txns) | Open it → empty Expenses & Budget tabs. (Whole-app empty → **Erase all data**.) |
| 8 | **Import → Review** | seeded `pending_txn` rows from multiple sources | Home inbox badge → **Review**: rows **grouped by source**, each with amount, kind chip, category, destination and pay method → Confirm one, then **Save all** → Undo. |
| 9 | **Review focus + saved view** | ≥ 10 pending rows | Review → ⋯ → **Select** → check a few → **Focus**; then ⋯ → **Save current view** with a group + payer → ⋯ → **Saved views** → apply it. |
| 10 | **Review "apply to similar"** | several rows from the same merchant | Set one row's category → the "Apply to N?" prompt appears. |
| 11 | **Import failure messages** | — | `/import` → paste gibberish → Parse ("No transactions found"); pick a scanned/image PDF → the 0-characters message. |
| 12 | **Backup → restore round-trip** | any populated app | Settings → **Backup & restore** → Create backup (passphrase) → share to Files → Erase all data → Restore → same file → correct passphrase. Also try a **wrong** passphrase (inline error) and a non-backup file ("Not a valid backup file"). ⚠️ Restore **replaces** everything. |
| 13 | **Receipt scan** *(iOS, needs camera/library)* | a real receipt photo | Add → expense → Split by items → **Scan receipt** → Take Photo / Choose from Library → `ScanningOverlay` blocks input → `ReceiptScanSheet` → uncheck a bad row → **Add**. Run it once on each provider — Features → Smart capture → **Cloud Receipt Scanning** off to compare, which is also the only way to see the raw-text panel (it's null on `gemini`). Check the row is **not** dimmed in the off state. |
| 14 | **Coming up / Upcoming** | 3 near-due recurring rules (1–3 days out) | Home **"Coming up"** + Plan **"Upcoming this month"** already show them. |
| 15 | **Smart-category learning** | flag ON; many noted txns | Add expense → type a title (e.g. "Uber") → category auto-suggests; correct it once → it learns. |
| 16 | **Itemized split + Service charge** | groups with members | Add → expense → **Split by items** → items → **Service** adjustment → assign → payers (watch "Must equal total ₹X") → review → Save. |
| 17 | **Budget over/near/under live** | Groceries **over**, Eating Out **near**, Fuel **under** | Personal → Budget tab; or add a Groceries expense to watch a bar flip red. |
| 18 | **Goal withdraw / protect / adjust / delete** | funded goals (Emergency locked, Laptop partial) | Plan → a goal → Withdraw to cash / Protect (read the explainer sheet) / Adjust / Delete. |
| 19 | **Overspend consent + Undo** | an **unlocked** goal with money, cash drivable negative | Log a large expense until cash goes negative → Plan asks *"Cover it from X?"* → **Keep goals** leaves the goal untouched; **Use savings** moves it and offers **Undo**. A *locked* goal must never be offered. |
| 20 | **Group create / edit / archive / delete** | existing groups | Groups → **New**; or Group → ⋯ → Edit / Archive. |
| 21 | **Export CSV / PDF + drill-down** | 3 months of data | Settings → Export & reports → **CSV / PDF**; tap a donut category → **Report transactions** → a row → txn detail. |
| 22 | **Notification permission denial** | — | Deny notifications, then Settings → Notifications → the denied banner + **Open Settings to allow**. Send a **test notification** once granted. |
| 23 | **Location denial** | — | Deny location, then Features → **Location tagging** on → the "Location off" Alert, toggle stays off. |
| 24 | **Biometric not-enrolled path** | device with no Face ID enrolled | Enable the lock → background → foreground → "Face ID not set up" + **Disable lock in BudgetSplit**. |
| 25 | **Replay onboarding** | — | Settings → **Replay welcome tour** → fully reopen the app. Try both the *personal* intent (People stage skipped) and *both*. |
| 26 | **Privacy** (hide amounts / biometric) | amounts present | Settings → Security toggles; Home amounts mask to ••••. |
