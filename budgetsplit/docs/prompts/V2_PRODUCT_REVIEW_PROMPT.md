# Prompt — V2 Product Analysis & Final Feature Closeout

> **What this is.** A re-runnable prompt that produces [`docs/V2_PRODUCT_REVIEW.md`](../V2_PRODUCT_REVIEW.md).
> It exists as a file rather than a chat message so the review can be regenerated against a later
> commit and the two outputs compared.
>
> **Why it is long.** The generic version of this prompt ("act as a PM, review my app") produces a
> report that restates what four existing docs already say. Sections B–F below are the repo-specific
> guardrails that stop that happening. Do not skip them.
>
> **Last run:** 2026-08-05 against `main` @ `1d7f256`.

---

## A. Role & mandate

Act as a **Senior Product Manager, UX Researcher, and Competitive Intelligence Analyst.**

Perform a complete **V2 Product Analysis and Final Feature Closeout** of BudgetSplit.

You are allowed to use the internet whenever required to research competitors, best practices,
product patterns, UX trends, and missing features. Do not limit yourself to the information
provided if external research would improve the analysis.

Be **extremely critical and objective**. Challenge existing assumptions, identify hidden usability
issues, and recommend practical improvements based on modern product design and competitor
standards. Do not stop after finding obvious issues — continue reviewing until every major feature,
screen, and user flow has been analysed and a complete V2 closeout report is produced.

**Voice:** ruthless and ranked. This review is expected to recommend deleting features that were
already built. A review that finds nothing to cut has not done its job. Say "this should not exist"
when that is the honest answer, and say what is lost by cutting it.

---

## B. Required reading, in this order

1. **[`FEATURES_AND_FLOWS.md`](../FEATURES_AND_FLOWS.md)** — the spec. 26 sections. Treat as the
   authority on *what the app does*. Note its notation: `→` navigates to, *(sheet)* = bottom sheet,
   *(toggle)* = switch, 🔘 = pill/segmented control. Owns the `S-XX` (§3, 33 screens) and `FLOW-XX`
   (§15, 11 flows) namespaces. §20 is the per-route loading/error/empty/pull-to-refresh matrix.
2. **[`TAGS.md`](../TAGS.md)** — the triage ledger. `ID: KEEP|KILL|DEFER — note`, where a `✓` prefix
   means the follow-up landed. **Read this before proposing anything**: it records decisions already
   made. Re-opening a settled call is allowed, but you must say you are doing so and why the earlier
   reasoning was wrong. Silently re-litigating is not.
3. **[`DEBT_TRACKER.md`](../DEBT_TRACKER.md)** — open debt. Only a handful of rows are still open.
   Its rule applies to you too: *every row cites `file:line`; a claim without evidence gets deleted,
   not debated.*
4. **[`COMPETITIVE_ANALYSIS.md`](../COMPETITIVE_ANALYSIS.md)** — 46 apps across 5 categories.
   Read §3 (recommendations, with a Status column), §4 (don't-build list), §5 (business-logic
   critique), §6 (the strategic-lane question and its answer), §7 (the founder's point-by-point
   response, keyed ✅ agree / ⚠️ caveat / ❌ push back). §7 tells you which advice was already
   rejected and why — do not hand it back.
5. **[`ux-audit/UX_AUDIT.md`](../ux-audit/UX_AUDIT.md)** — ~30 screens driven live in an iOS
   Simulator with real taps, 97 screenshots, "What's good / Friction found" per screen, plus an
   "Explicitly NOT bugs" list. Read the NOT-bugs list carefully so you do not re-report a
   methodology artifact as a defect.
6. **[`ARCHITECTURE.md`](../ARCHITECTURE.md)** and **[`AUDIT.md`](../AUDIT.md)** — skim. AUDIT owns
   `F-XX` (features), `INT-XX` (integrations), `BL-XX` (business logic), `ISS-XX` (issues),
   `DEBT-XX`. ARCHITECTURE §7–§10 were deleted, not corrected — do not cite them.
7. **[`AGENTS.md`](../../AGENTS.md)** — the design system. §1–§12 are the *stated* rules; the UI/UX
   section of your report judges the app against these, not against your own taste.

Then **read the code for anything you are about to assert.** Screens live in `app/`, pure logic in
`src/lib/`, queries in `src/db/queries/`, components in `src/components/{ui,finance,system}/`.

---

## C. Anti-duplication contract

Five docs already exist. The report is only worth writing if it says something they do not.
It must **not**:

- Restate `UX_AUDIT.md`'s per-screen rendered-UI friction (touch-target sizes, truncation, overlap,
  chevron inconsistency, colour-semantic collisions). Reference the finding and move on. Your UI/UX
  section covers **systemic** design-system issues only.
- Reproduce `COMPETITIVE_ANALYSIS.md` §3's recommendation table. Reorganise competitive insight
  **by our feature** instead of by competitor, and only surface what that doc missed or what has
  changed since it was written.
- Re-list `DEBT_TRACKER.md`'s open rows as if newly discovered. Cite the ID.
- Re-describe behaviour that `FEATURES_AND_FLOWS.md` already documents. Assume the reader has it
  open. Describe only enough to support a judgement.

**The axis that is genuinely unclaimed, and therefore the point of this document:** for each
feature — *does it earn its place, who is it for, what is missing, and should it exist at all?*
No existing doc asks this. Stay on that axis.

---

## D. Grounding rule

Every factual claim carries evidence: a `file:line` reference, or an existing
`S-XX` / `FLOW-XX` / `F-XX` / `BL-XX` / `ISS-XX` / `DEBT-XX` ID.

Where the docs and the code disagree, **the code wins** and the disagreement is itself a finding.
Doc drift is a recurring problem in this repo (see `AUDIT_DOC_DRIFT.md`, `DRIFT-01…26`), so verify
rather than trust. A concrete example found on the 2026-08-05 run: `ARCHITECTURE.md:304` claims
`FeatureKey` holds 12 keys and `AUDIT.md` §4.6 implies 13; `src/lib/featureFlags.ts` actually holds
14.

Do not soften a finding to be polite, and do not inflate one to seem thorough. If a feature is
fine, say it is fine in one line and spend the space elsewhere.

---

## E. Invariants — deliberate decisions, not oversights

Recommendations that contradict these are wrong by construction. Each is a decision already made
for a stated reason:

| Invariant | Detail |
|---|---|
| **No premium tier** | No paywall, purchase SDK, entitlement check or restore-purchases path exists anywhere. `FEATURES_AND_FLOWS.md` §15 FLOW-03 is a flow slot reserved to record the absence *as intentional*. Feature flags are user preferences, not monetisation gates. Monetisation is a later phase. |
| **Local-first** | SQLite is the single source of truth. No Redux, no React Query, no in-memory data mirror, no sync backend. The only server in the repo is `server/receipt-ocr-proxy/` (a Cloudflare Worker). "Add cloud sync" is a strategy fork discussed in `COMPETITIVE_ANALYSIS.md` §5, not a bug report. |
| **Money is integer paise** | `parseToPaise()` in, `formatRupees()`/`formatCompact()` out. Never floats. |
| **Animations that are off-limits** | `LogoAssembly.tsx` and the onboarding hero ring/fan animation. Marked ⛔ in the docs. Never propose changing them. |
| **Budgets are per-group only** | There is no standalone budgets screen; it was deleted. Entry points route into a group's budget tab or editor. |
| **Subscriptions come from recurring rules** | Not auto-detected from a bank feed — there is no bank feed. The log-scanning detector was removed. |
| **Insights have exactly one home** | The global `/insights` screen. Removed from the group Budget tab, Plan tab, and Reports. Reports is factual history only. |
| **Savings priority is a manual drag rank** | `sort_order`, not High/Med/Low. There is no savings pool; `fundGoal` funds goals directly. |

If the honest conclusion is that an invariant is itself wrong, say so **in the Technical or
Competitor section as an explicit challenge to a locked decision** — do not smuggle it in as a
routine recommendation.

---

## F. External blockers — not choosable

Three items are blocked on third parties. Recommendations must sequence around them rather than
treat them as prioritisable work:

- **`F4`** — Google Pay import. Blocked: GPay's export format is unknown.
- **`F5`** — live email ingestion. Blocked: Google OAuth CASA security assessment.
- **Account Aggregator** — bank/UPI sync. Blocked: needs an AA partner integration.

Per project notes, the only two gates before going public are the AA partner integration and the
Gmail OAuth CASA pentest, with the intended sequence being: finish UI/UX → free Testing-mode OAuth
pilot → CASA/AA later. Your action plan should respect that ordering.

---

## G. The eight review lenses

### 1. User perspective
Analyse the app as a first-time user. Cover: the onboarding experience; discoverability of
features; whether every feature is intuitive; friction points; unnecessary steps; confusing naming
or navigation; accessibility; and empty, loading, error, confirmation and success flows. Suggest
improvements that reduce user effort.

### 2. Feature-by-feature
Review every feature. For each: **Purpose · Current implementation · User value · Missing
functionality · Edge cases · Technical debt (if visible) · UX issues · Performance concerns ·
Suggested improvements · Priority.** Do not skip any screen or feature.

### 3. Complete user flow analysis
Every journey start to finish. For each: **Entry point · User expectations · Steps · Decision
points · Possible failures · Recovery experience · Completion experience · Opportunities to reduce
clicks · Opportunities to automate · Missing validations · Missing feedback · Missing
confirmations.** Highlight where a flow feels slow, confusing, inconsistent, or unnecessarily
complex.

### 4. Competitor analysis
Research relevant competitors, using the internet where the existing analysis is thin or dated.
Compare features, UX, UI, navigation, onboarding, automation, analytics, speed, simplicity, visual
hierarchy, best practices. For every competitor advantage: **why it is better · whether we should
adopt it · a suggested implementation approach.** Do not copy competitors blindly — recommend only
what genuinely improves the product, and name what to deliberately *not* copy.

### 5. Missing features
Must-have · nice-to-have · power-user · admin · automation · AI · reporting · search · filtering ·
bulk actions · collaboration · settings · security.

### 6. UI/UX review
Layout consistency · typography · spacing · component consistency · visual hierarchy · colour usage
· accessibility · mobile responsiveness · empty/error/success/loading states · form validation ·
tables · charts · navigation · dialogs · drawers · filters · search · buttons · icons · overall
polish. Judged against `AGENTS.md` §1–§12. **Systemic issues only** — see §C.

### 7. Technical product review
Duplicate functionality · redundant screens · feature overlap · inconsistent behaviour · potential
scalability issues · maintainability concerns · areas that could become technical debt.

### 8. Prioritised V2 closeout
Grouped **Critical Before V2 Release** (blocking issues, missing validations, UX blockers, security
concerns, major bugs) · **High Priority** · **Medium Priority** · **Future Ideas**. Every
recommendation carries **Problem · Impact · Suggested solution · Priority · Estimated
implementation complexity.**

---

## H. Output contract

Write a single structured report to **`docs/V2_PRODUCT_REVIEW.md`** with these sections, in order:

| § | Section |
|---|---|
| — | Header: commit reviewed, date, method, and "what this doc is NOT" pointing at the sibling docs |
| 1 | Executive Summary |
| 2 | First-Time User Review |
| 3 | Feature-by-Feature Review **+ coverage table** |
| 4 | Complete User Flow Review |
| 5 | Competitor Comparison |
| 6 | Missing Features |
| 7 | Systemic UI/UX Improvements |
| 8 | Technical Product Review |
| 9 | The Cut List |
| 10 | V2 Closeout Checklist |
| 11 | Prioritised Action Plan |

### Vocabularies

- **Verdict:** `KEEP` · `FIX` · `MERGE` · `CUT` · `ADD`
  (deliberately distinct from `TAGS.md`'s KEEP/KILL/DEFER, which remains authoritative for audit IDs)
- **Priority:** Critical · High · Medium · Low
- **Complexity:** Low · Medium · High

### ID namespace

Mint **`V2-XX`** for recommendations only. Everything already numbered keeps its existing ID —
no parallel namespace for screens, flows, features, or debt.

### Coverage requirement

§3 groups screens into feature **areas** rather than one section per route, for readability. To keep
"do not skip anything" provable rather than asserted, §3 ends with a coverage table mapping **every
`S-XX` ID in `FEATURES_AND_FLOWS.md` §3 and every `FeatureKey` in `src/lib/featureFlags.ts`** to
exactly one area. Verify it by counting against the source lists, not by eye.

---

## I. Re-running this against a later commit

1. `git log -1 --format=%h` — record the commit in the report header.
2. Re-check the invariants in §E; if a project decision has changed, update §E **before** reviewing,
   or the report will argue against a decision that no longer exists.
3. Re-count `FeatureKey`s in `src/lib/featureFlags.ts` and the `S-XX` rows in
   `FEATURES_AND_FLOWS.md` §3 — the coverage table's denominators.
4. Check `TAGS.md` for items that moved to `✓`, and `DEBT_TRACKER.md` for rows that closed.
   Anything the previous run raised that is now fixed should be struck through in place with the
   resolving commit, following this repo's convention of never deleting resolved rows.
5. Keep the `V2-XX` numbering stable across runs. New findings take new numbers; do not renumber.
