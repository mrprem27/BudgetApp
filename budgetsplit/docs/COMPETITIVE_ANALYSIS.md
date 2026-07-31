# BudgetSplit — Competitive Analysis & Business-Logic Audit

> **Methodology (2026-07-28):** 12 research/synthesis agents, web-search-grounded, run against
> 46 competitor apps across 5 categories (global expense-splitters, global personal budgeters,
> couples/household apps, India-specific fintech apps, and adjacent/indirect competitors),
> followed by 5 concept-by-concept deep-dive comparisons against the most directly relevant
> rivals, then two synthesis passes (business-logic critique + prioritized recommendations).
> The synthesis agents had access to the actual codebase (not just a feature summary), so
> several findings below cite real files (`src/lib/settle.ts`, `docs/DEBT_TRACKER.md`, etc.).
> **Confidence varies per entry** — several competitor facts (exact pricing, some app
> identities) could not be fully verified and are flagged inline. Treat this as a critique to
> argue with, not a verdict to accept wholesale.

> **Correction (2026-07-28, post-audit):** every "GPay ingestion is mocked/blocked" claim below
> is wrong. `src/lib/gpayParse.ts` — a real, tested parser for Google Pay's PDF transaction
> statement — is already implemented and wired end-to-end into `app/import.tsx` (pick or paste
> a statement → parsed → lands in the Review inbox), with test coverage built from verbatim
> slices of real GPay PDFs, including page-break and column-interleaving edge cases. The
> research agents took `docs/FEATURES_AND_FLOWS.md`'s "queued, blocked on format" framing at
> face value instead of reading the actual source — a reminder that even codebase-grounded
> agents can trust stale docs over code. This affects the ingestion-gap findings in §2 (vs.
> Money View/INDmoney and Jupiter/ET Money) and the GPay recommendation in §3, struck through
> below — treat both as **closed**, not open.

> **Update (2026-07-29):** the two remaining open "Big Bets" — itemized-receipt OCR and
> encrypted backup/restore — are both shipped now too. OCR ended up broader than originally
> scoped: alongside the on-device path (Apple Vision + a tuned line-item heuristic, the
> original scope), there's now an opt-in cloud path — the photo is sent directly to a free-tier
> vision model, which sees the real 2-D receipt layout instead of flattened OCR text and avoids
> the on-device path's column-scrambling failure mode on two-line item layouts. The two live
> behind a swappable provider factory (`src/lib/ocrProviders/`), defaulting to cloud for
> accuracy with the on-device path staying fully free/offline as a fallback. This is the app's
> first-ever network call, made through a small serverless proxy that holds the API key
> server-side (never shipped in the app bundle). Backup/restore shipped as a manual
> passphrase-encrypted file export/import via the OS share sheet — not native iCloud/Drive APIs
> as originally speculated below, simpler and works identically across Files/iCloud Drive/
> Google Drive/AirDrop since the share sheet handles the destination. Both rows are struck
> through and marked ✅ Done in §3's Big Bets table; the OCR-related Don't-Build entry in §4 is
> also corrected.

> **Third correction (2026-07-29):** the "Quick wins" table below has the same problem the GPay
> claim did — most of it was already shipped before this audit ran, and the research agents
> didn't check against actual code. Verified directly just now: **5 of the 6 quick wins are
> already done** (staleness/confidence badges, the backup reminder nudge, the goal
> "lock"→"protect" relabel + explainer, the recurring-suggestion wiring into Review, and the
> undoable savings auto-raid toast). Only the couples/household onboarding framing is genuinely
> still open. Status + evidence added to each row below — this table should not be read as a
> live backlog without checking it against current code first, the same lesson as the GPay/OCR/
> backup corrections above.

---

## Executive Summary

- Local-first is a coherent, marketable identity for the **splitting** half of the product,
  but it is quietly losing to itself on the **budgeting** half — every named budgeting
  competitor (YNAB, Monarch, Copilot, plus every Indian neobank) has converged on automatic
  bank/UPI ingestion as table stakes, and manual entry is the single most-cited churn driver
  for budgeting apps specifically.
- **No cloud sync means no backup — that is an unmitigated data-loss risk**, not a
  philosophical trade-off. `docs/DEBT_TRACKER.md` files "no cloud backup" under *Won't fix /
  by design* next to things like dead schema columns — that's the wrong bucket. A lost or
  dead phone destroying a year of financial history deserves an active mitigation (at minimum
  a forced periodic export), not a shrug.
- **"My-share" budgeting is the right architectural call.** It's the only model that lets a
  personal budget and a group ledger coexist without inventing envelope semantics for money
  the user doesn't unilaterally control — and it's already been validated once: the schema's
  dead `budget_group.limit_daily/monthly/yearly` columns show group-total budgeting was tried
  and deliberately abandoned. That's evidence, not a guess.
- **Manually-entered "Total Money" is a bad foundation for a confidently-presented health
  score.** `moneyProfile.ts` stores the four figures with no `updated_at` at all — Insights
  builds a ring, a narrative, and 10/20/30% projections on top of numbers that could be weeks
  stale, with no way to detect or disclose that.
- **There is no monetization surface today, and no data model to build one on** (no auth, no
  server, no entitlement table). A one-time unlock (Splid's model) is architecturally trivial
  for a single-device app; a recurring subscription is architecturally awkward and culturally
  inconsistent with "no accounts, no cloud" positioning.
- **The savings auto-raid** (`src/lib/savingsEngine.ts`, silently pulling from the
  lowest-priority unlocked goal on overspend) is the single riskiest UX decision in the app —
  no competitor in this research does anything like it, so there's no external precedent for
  whether users find it reassuring or alarming.
- **Real household/couples sharing — arguably the highest-retention use case in this whole
  category** (rent/groceries/utilities every month = habitual, daily-checked usage) — **is
  structurally impossible today.** "Hand the phone over" is not a feature; it's an admission
  that one person is doing bookkeeping on behalf of two people.
- The one lever that could close a meaningful chunk of the ingestion gap **without**
  compromising the local-first identity — on-device Android SMS parsing, the way Money View
  does it (nothing ever leaves the phone, no license, no OAuth) — is sitting unbuilt while
  GPay import stays blocked on export-format and email import stays blocked on OAuth/CASA.

---

## 1. Competitor Landscape (46 apps)

> Bank/UPI Sync = does the app automatically ingest transactions from a linked bank/UPI
> source (any mechanism — Plaid, Account Aggregator, SMS parsing, etc.), not just a manual
> settlement rail. Cloud/Multi-device = does user data live off-device / sync across phones.

### Expense-splitting apps

| App | Bank/UPI Sync | Cloud/Multi-Device | Pricing | Strength vs. BudgetSplit | Weakness vs. BudgetSplit |
|---|---|---|---|---|---|
| **Splitwise** | ✅ (settlement rails only — Pay-by-Bank/Tink in UK/FR/DE/AT, Splitwise Pay in US; not full expense auto-import) | ✅ | Freemium; Pro ~$4.99/mo or ~$40-50/yr (figure varies by source/region) | Real-time cross-device sync + in-app bank-linked settlement — a group can actually move and reconcile money together | Purely a who-owes-whom ledger — no personal budget, savings goals, recurring-bill tracking, or health score/forecast |
| **Tricount** | ❌ | ✅ | Free, unlimited; Premium ~$9.99/yr (stats, export, no ads) | Real per-transaction multi-currency (150+ currencies) auto-conversion, genuinely unlimited free tier | Pure splitter/ledger — no budget, goals, recurring automation, or insights |
| **Settle Up** | ❌ | ✅ (genuine real-time multi-user sync) | Freemium; Premium ~$1-11/mo or one-time "Group Premium" | Live collaborative editing + voice-assistant expense entry | Deliberately paywalled recurring-expense automation in its 2025 overhaul — BudgetSplit ships this free |
| **Splitser (WieBetaaltWat)** | ❌ | ✅ | Appears free; no confirmed premium tier | Native iDEAL/Bancontact/Wero one-tap payment requests (NL/BE) | No personal budgeting, goals, or recurring tracking at all |
| **Splid** | ❌ | ✅ | Free for 1 group; one-time ~$4.99-9.99 unlocks unlimited groups — **no subscription** | Closest philosophical match to BudgetSplit (no signup, fully offline-capable, one-time price); 150+ currencies | Session/trip-oriented — no persistent budget, goals, recurring, or insights |
| **Piggy** *(low confidence — name collision across unrelated apps)* | ❌ | ❌ | Unclear | Lightweight IOU-only tracking, lower overhead for casual friend debts | No budgeting, recurring, or insights; possibly unmaintained |
| **Zaddy** *(unverifiable — could not confirm this app exists)* | — | — | — | — | — |
| **Divvy** *(low confidence — 5+ unrelated apps share this name, distinct from the B2B Divvy/Bill.com product)* | ❌ | ✅ | Unclear, likely freemium | AI receipt scanning that itemizes price/tax/tip per line — more advanced than BudgetSplit's dormant OCR | Pure splitter; name collision makes it a low-trust choice |
| **GroupBudget** *(low confidence — site unreachable during research)* | ❌ | ✅ | Not found | Framed around ongoing group budgets rather than one-off trips | No personal budgeting, goals, recurring, or insights found |
| **Spliddit** *(different category — academic tool, not a maintained app)* | ❌ | ❌ | Free (non-profit, spliddit.org) | Mathematically provable envy-free allocation for one-off fairness problems | Not an ongoing tracker at all — no accounts, no history, no mobile app |

### Global personal budgeting apps

| App | Bank Sync | Cloud/Multi-Device | Pricing | Strength vs. BudgetSplit | Weakness vs. BudgetSplit |
|---|---|---|---|---|---|
| **YNAB** | ✅ (Plaid, 12,000+ banks) | ✅ | $14.99/mo or $109/yr, no permanent free tier | Automatic import removes all manual entry burden | No splitting/settle-up at all; recurring paid subscription; bank coverage is US/Canada-centric (irrelevant for India anyway) |
| **Copilot Money** | ✅ | ✅ | $13/mo or $95/yr | AI auto-categorization + real net-worth tracking | Apple-only, no splitting, couples need 2 separate subscriptions ($190/yr combined) |
| **Monarch Money** | ✅ | ✅ | Core $99.99/yr, Plus $199/yr | Built-in "Household" shared dashboard + AI assistant + cash-flow projections | No itemized splitting/debt-simplification; data lives in Monarch's cloud, not on-device |
| **Rocket Money** | ✅ | ✅ | Free tier; Premium "pay what's fair" ~$7-14/mo | Auto-detects and can negotiate/cancel subscriptions for you | No splitting feature; requires linking real bank credentials |
| **PocketGuard** | ✅ | ✅ | Plus $12.99/mo or $74.99/yr; free tier capped at 2 accounts/categories | Live "safe-to-spend" figure computed automatically | No splitting; free tier basically a demo; US-centric bank coverage |
| **Goodbudget** | ✅ | ✅ (up to 5 devices) | Free (20 envelopes, 2 devices); Premium $10/mo or $80/yr | Genuine real-time sync across up to 5 devices for a shared household budget | One shared pooled envelope, not per-person share/settle-up; no itemized splitter |
| **EveryDollar** | ✅ | ✅ | Free (manual); Premium $17.99/mo or $79.99/yr | Bank sync + broader Ramsey-ecosystem coaching | No splitting; even paid tier requires manually dragging transactions into categories |
| **Simplifi by Quicken** | ✅ | ✅ | $3.99-5.99/mo, no free tier | Auto-recalculating spending plan from real bank transactions | No splitting/settle-up; no free tier at all; US/Canada-centric |
| **Empower Personal Dashboard** | ✅ | ✅ | Free (monetized via 0.49-0.89% AUM advisory fee) | Genuinely free automatic net-worth/investment aggregation | Weak category budgeting, zero splitting; "free" is a lead funnel for paid advisory |
| **Cleo** | ✅ | ✅ | Free tier; Plus/Pro/Builder $5.99-14.99/mo | Conversational AI proactively surfaces insights | No splitting; monetizes via cash-advance fees and a credit-builder card |
| **Wallet by BudgetBakers** | ✅ | ✅ | Free (1 wallet); Premium ~$3-5.50/mo | 15,000+ bank connections + a "shared wallet" for families | Shared wallet is one pooled ledger, not per-person settle-up; no itemized splitter |
| **Spendee** | ✅ | ✅ | Plus $14.99/yr; Premium $22.99/yr | Cheap shared-wallet plan + crypto tracking | Shared wallet is single pooled balance, not per-person tracking; inconsistent bank-sync reliability |
| **Fudget** | ❌ | ✅ | Free tier; Plus $14.99/6mo or $19.99/yr | Closest in philosophy to BudgetSplit (manual-first, no bank linking) + reaches Mac/Windows | No splitting, no recurring engine, no insights/health-score — just running lists |
| **Toshl Finance** | ✅ (Plaid + Salt Edge) | ✅ | Pro ~$3-6/mo or $24-60/yr | Broader non-US bank coverage via dual aggregators; unlimited accounts even on entry tier | No splitting/settle-up; playful "monster" gamification is a different design philosophy |

### Couples / shared-finance apps

| App | Bank Sync | Cloud/Multi-Device | Pricing | Strength vs. BudgetSplit | Weakness vs. BudgetSplit |
|---|---|---|---|---|---|
| **Honeydue** | ✅ (Plaid, 13,000+ institutions) | ✅ | Free (ad-supported + optional $1-10/mo tip) | Auto-aggregates both partners' accounts with real-time shared visibility, per-account privacy tiers, in-transaction chat | Depends on continuous Plaid linking (2026 reliability complaints); monetizes via ads/affiliates |
| **Zeta** *(conflicting sources — some 2026 sources claim it shut down May 2025, others present it as live)* | ✅ | ✅ | Free base; Zeta+ $9.99/mo ($6.99 annual) | Actual joint FDIC-insured bank account with debit cards, not just a tracker | US-only; requires depositing real money into a fintech; status genuinely unclear — verify directly |
| **Plenty** *(discontinued)* | ✅ | ✅ | N/A — shut down | When live: real joint investment/advisory planning for couples | Acqui-hired by Wealthsimple and wound down May 2025 — a live cautionary tale of couples-fintech platform risk |
| **Lunch Money (household mode)** | ✅ | ✅ | $10/mo, or pay-what-you-want annual ($60/yr min) | Genuine cloud multi-user household mode, full edit access for all members, bank import + net worth | Subscription-only, web/desktop-first not mobile-first, requires handing bank credentials to a cloud service |

### India-specific fintech / budgeting apps

| App | Bank/UPI Sync | Cloud/Multi-Device | Pricing | Strength vs. BudgetSplit | Weakness vs. BudgetSplit |
|---|---|---|---|---|---|
| **Walnut / HDFC "My Money"** *(composite — Walnut itself is effectively defunct)* | ✅ (RBI Account Aggregator) | ✅ | Free (bundled with HDFC app) | Password-free multi-bank aggregation via regulated AA | No splitting; tethered to holding an HDFC account |
| **Money View** | ✅ (Android SMS parsing) | ✅ | Free (monetizes via loans/cards/investing) | Zero-effort automatic expense capture across 40+ banks via SMS, no manual logging | No splitting/per-person budgeting; SMS-parsing misses cash and some UPI-app confirmations; not true bank-API sync |
| **INDmoney** | ✅ (RBI AA via Finvu) | ✅ | Free core; paid advisory tier ~₹2,500-5,000/yr | Genuine AA bank-linking auto-syncing transactions, EPF, net worth — zero manual entry | Expense tracking is secondary to an investing/brokerage platform; no splitting, no offline-first design |
| **ET Money** | ✅ (Android SMS; iOS has no expense tracking at all) | ✅ | Free core; "Genius" advisory ~₹747/quarter (may have changed) | Automatic SMS-based expense tracking + tax/MF tooling in one app | Android-only expense tracking; no splitting feature |
| **Jupiter Money** | ✅ (linked neobank account) | ✅ | Free account/UPI/card; freemium neobank | Native automatic budgeting ("Pots", Spend Insights) against a real linked account + net-worth aggregation | Full value requires opening a Jupiter-linked bank account (KYC); no splitting feature |
| **Fold Money** | ✅ (RBI AA) | ✅ | Freemium; Fold Plus ~₹1,999/yr; lifetime ~₹25,000 | Broad AA aggregation (banks, cards, investments, credit score, EPF, NPS) + AI receipt scanning | No splitting; several useful tools gated behind paid tier |
| **Niyo (NiyoX / Global)** | ✅ (own account/card only) | ✅ | Free zero-balance account; forex card free/low-fee | Zero-effort tracking on its own multi-currency card, strong for travel spend | Only tracks its own account — no aggregation of other banks; no budgeting depth; no splitting |
| **Groww** | ❌ (investing-only) | ✅ | Free account, zero-commission MF, discount brokerage | Lets users actually execute investments — a use case BudgetSplit deliberately doesn't touch | No expense tracking, no budgets, no splitting at all |
| **CRED** | ✅ | ✅ | Free (credit-score-gated, ~750+); invite-only "Sovereign" tier | Strong automatic multi-card bill tracking + rent/utility bill-pay | Gated by credit-score eligibility; no splitting or true category budgeting — bill/rewards-first |
| **Paytm (Spend Summary)** | ✅ (Paytm-only) | ✅ | Free, built-in | Fully automatic categorization + monthly summary, zero manual entry | Only sees spend through Paytm itself; no budgets/goals/splitting |
| **PhonePe** | ❌ (no budgeting feature today) | ✅ | Free | Sheer UPI payment ubiquity/volume | Explicitly lacks any category-wise/visual expense analysis — a functional gap BudgetSplit's whole premise fills |
| **Fi Money (epiFi)** *(winding down as of March 2026)* | ✅ | ✅ | Was free; platform being discontinued | Historically clean automatic categorization + goal-based "Smart Deposits" | Winding down entirely, users redirected to Federal Bank's app — a longevity warning vs. an app the user fully owns |

### Adjacent / indirect competitors

| App | Bank Sync | Cloud/Multi-Device | Pricing | Strength vs. BudgetSplit | Weakness vs. BudgetSplit |
|---|---|---|---|---|---|
| **ICICI iMobile Pay ("Know Your Spends"/My Money)** | ✅ (ICICI-only) | ✅ | Free (bundled) | Auto-categorizes + budget alerts, zero manual entry | Locked to ICICI accounts; no cash tracking, no splitting, no offline mode |
| **HDFC PayZapp** | ✅ (PayZapp/HDFC-only) | ✅ | Free (bundled) | Automatic categorization + monthly insights | No splitting, no data outside PayZapp/HDFC, not offline-first |
| **Tiller Money** | ✅ (21,000+ institutions) | ✅ | $79/yr Foundation, $129/yr Pro | Real transactions into a fully customizable, formula-editable spreadsheet daily | No native mobile app, no splitting, ongoing cost, Indian bank coverage unclear |
| **Free Google Sheets budget templates** | ❌ | ✅ (via Google account) | Free | Inherently cloud-synced/multi-device via any Google account | Purely manual, no reminders, no splitting logic, requires spreadsheet discipline |
| **Apple Wallet spend summary** | ✅ (Apple Card only, US-only product) | ✅ | Free | Fully automatic zero-setup categorization the instant a transaction posts | No custom categories/budgets/splitting; Apple Card doesn't exist in India — not directly relevant to this market |
| **Google Pay (India) spend insights** | ✅ (GPay/UPI only) | ✅ | Free | Auto-sorts every UPI payment + per-category limits with overspend alerts, matching India's UPI-heavy habits | Only sees GPay/UPI transactions (misses cash, cards, other wallets); no group/shared-expense ledger at all |

---

## 2. Deep-Dive Concept Comparisons

### vs. Splitwise (+ Settle Up on recurring/monetization)

| Concept | BudgetSplit Today | Competitor Approach | Gap | Notes |
|---|---|---|---|---|
| Splitting math (Equal/Exact/%/Shares) | `computeShares()` dispatches by mode, integer-paise math; `validateShares()` refuses to save unless assigned paise === total exactly | Identical 4 modes, same hard sum constraint | **None** | Straight functional parity. Neither app lets you mix modes within one expense — an open, unresolved Splitwise feature request. |
| Itemized bill splitting | 4-step manual splitter (line items → assign → per-item split mode → tax/tip/discount proration); 100% manual, no OCR shipped | Same concept, but Splitwise Pro (~$40/yr) scans a photographed receipt via OCR to auto-populate items/prices | **Minor** | BudgetSplit's per-item split-mode flexibility may exceed Splitwise's (which just splits each item equally), but that's undercut by having zero automated entry. Since the OCR module already exists dormant in-repo, this is the more actionable of the two itemizing gaps. |
| Debt simplification | `settle.ts simplify()` — greedy largest-debtor/largest-creditor match; `settleScope.ts` nets across ALL groups and allocates partial/overpaid settlements largest-balance-first | Same greedy heuristic (documented as NOT a true min-transaction optimum — that's NP-hard); same per-group toggle | **None** | Core algorithm is genuinely equivalent. BudgetSplit is arguably **ahead**: its multi-group partial/overpayment allocator covers a case Splitwise users are requesting and Splitwise hasn't shipped. |
| Settlement execution / pay-method | `pay_method` is descriptive metadata only — the app never moves real money | Splitwise partnered with Tink (Pay-by-Bank, live only in UK/FR/DE/AT) and has Splitwise Pay (US) — money actually moves | **Major** *(but currently theoretical for this market)* | Splitwise's own feedback board has an **open, unresolved** UPI-integration request for India — so for BudgetSplit's actual market, both apps are ledger-only today. This would become a real gap fast if Splitwise ships a UPI rail. |
| Recurring bills | Full lifecycle: pause/resume/stop, per-series skip ledger, materialized future occurrences, free for every user | Splitwise's recurring clone is reportedly hard to find/tap-heavy, no explicit pause/skip primitive; Settle Up moved recurring **behind its 2025 paywall** | **None** | A genuine BudgetSplit strength — more complete primitives than Splitwise, free where Settle Up charges. Lean into this in positioning. |
| Monetization | None — no paywall, no IAP, no server entitlement anywhere | Splitwise: freemium with a real daily-expense cap + Pro ~$40-50/yr; Settle Up: paywalling recurring+categories in 2025 drove **+30% YoY revenue** | **Minor** (reframed) | BudgetSplit currently gives away, free and uncapped, several things both rivals meter. The real signal: Settle Up's own data shows users pay specifically for recurring automation + categories — useful evidence for scoping a future premium tier, not a reason to change anything today. |

### vs. YNAB / Monarch Money / Copilot Money

| Concept | BudgetSplit Today | Competitor Approach | Gap | Notes |
|---|---|---|---|---|
| Budgeting philosophy | Per-share attribution against personal + optional per-group budgets; no envelope/rollover, no re-plan tool | YNAB: strict zero-based "give every dollar a job," rollover, "Edit Plan" re-plan tool, Age of Money metric. Monarch/Copilot: category-cap models much closer to BudgetSplit | **Minor** | My-share is architecturally closer to Monarch/Copilot than YNAB, which is defensible — true envelope budgeting doesn't map onto expenses split across people outside the budget. Real gap: no YNAB-style "re-plan" surface when a category blows up mid-month, and no rollover semantics. If BudgetSplit ever markets itself as "like YNAB," that's inaccurate. |
| Bank-sync / auto-categorization | None — manual entry or Paytm CSV only; GPay/email ingestion mocked; smart-category-learning flag exists but unshipped/unverified | All three sync 10,000-12,000+ institutions via Plaid, with ML categorization (Copilot reaches "near-perfect" after ~30 corrections) | **Major** | Intentional (Plaid has no meaningful Indian coverage anyway) but still a real functional gap — every transaction/category is manual labor competitors automated away. |
| Forecasting / insights | Month-end forecast, health score, spend-shift narrative, 10/20/30% what-if, all free on one global screen | YNAB deliberately does **not** forecast forward (Age of Money is backward-looking by design). Monarch's what-if scenario modeling is a **paid Plus-tier** feature. Copilot has no comparable health-score UI | **None** | BudgetSplit's strongest concept relative to the field — its free what-if projection matches Monarch's paid tier, and its health-score/narrative combo has no direct analogue in YNAB or Copilot. Caveat: accuracy is bounded by manual-entry completeness in a way Monarch's live feed isn't. |
| Savings-goal mechanics | Ranked drag-to-reorder priority; auto-sweep of leftover cash; auto-raid lowest-priority goal on overspend | Monarch/Copilot/YNAB all require an explicit manual "allocate" action — **none** auto-transfer between goals | **None** (capability edge) | BudgetSplit's automation is ahead of all three, but it's also the app's biggest silent-behavior risk — no competitor auto-claws-back, so there's no external precedent for whether users find this reassuring or alarming. |
| Recurring bill / subscription detection | User-created recurring rules only; a dormant auto-detector exists but has no bank feed to run against | Monarch auto-detects ~80% of recurring bills from live transaction history; Copilot auto-flags + alerts on price changes | **Major** | Same root cause as bank-sync. Achievable narrowing: point the dormant detector at already-imported Paytm history (merchant + amount + interval matching) to suggest "this looks recurring — create a rule?" without needing OAuth. |
| Shared-expense splitting (structural) | Full P2P layer: groups, my-share attribution, simplify-debts, itemized splitter, pay-method tagging | **None of the three** support splitting an expense across people or a settle-up/debt-simplification concept at all | **None** | This is BudgetSplit's actual point of novelty — the honest budgeting-side comparison is Splitwise, not YNAB/Monarch/Copilot. Positioning against YNAB alone undersells the combined my-share + settlement mechanic none of them attempt. |
| Pricing / monetization | Entirely free, no plan on record beyond a one-line note | YNAB $109-180/yr, Monarch $100-200/yr, Copilot $95-156/yr — **zero free tiers** among the three | **Major** | Market has fully converged on $95-110/yr subscription pricing for this feature set — willingness-to-pay is well-validated. Monarch's Core/Plus split (gating forecasting/scenario tools behind Plus) is a ready-made template for a future tier. |

### vs. Honeydue (household/couples angle)

| Concept | BudgetSplit Today | Competitor Approach | Gap | Notes |
|---|---|---|---|---|
| Sync architecture (foundational) | Single on-device SQLite DB, no accounts, no backend — a "group" with two Person rows is two rows in one local DB on one phone | Two independent phones stay in sync; each partner links accounts via Plaid/Finicity (20,000+ institutions, 5 countries), both see the same live data | **Major** | Not a missing feature — a missing architecture. Everything else in this comparison is downstream of it. |
| Partner visibility / privacy permissions | No concept of a second real user to grant/deny a view to | Three tiers per linked account: share-all, balance-only, fully hidden (more granular than Monarch's blunt all-or-nothing) | **Major** | If a second-device path is ever built, Honeydue's three-tier model is the bar — a naive binary toggle would be a regression. |
| Shared vs. personal money separation | "My-share" — a group expense counts only the current user's split against their own budget | Honeydue separates by *account* (individual private/balance-only/hidden vs. joint fully-shared) | **Minor** | My-share may actually suit couples who aren't fully financially merged better, avoiding the "which accounts do we joint" decision — but the math is only correct if **both** partners' spend actually gets entered, and today only one of them can. |
| Ingestion of shared transactions | Manual entry or Paytm CSV import; GPay/email mocked only | Live Plaid/Finicity linking — both partners' spend appears automatically | **Major** | For two people who each swipe their own card at the same store, Honeydue captures both automatically; BudgetSplit requires one partner to notice and hand-log the other's spend. |
| Splitting math / settle-up | Equal/Exact/%/Shares + itemized splitter + multi-group min-cashflow simplification | Single running net balance, "settle up" hands off to Venmo/PayPal — no itemized splitting, never moves money itself either | **None** | BudgetSplit is unambiguously ahead on mechanics here — the caveat is this sophistication only matters once both partners' phones can drive it. |
| Joint budgeting with dual alerts | Single canonical budget-health function, visible only on the phone holding the local DB | Category limits alert **both** partners as they approach it | **Major** | The budget-health math is well-factored, but "notify both partners" has no channel to travel through — no second device exists. |
| Bill reminders reaching both partners | Rich recurring lifecycle (skip/pause/stop) but reminders only ever reach the one device | Simpler due-date nudge, but delivered to **both** partners — reviewers call this a genuine strength | **Minor** | Feature-for-feature BudgetSplit's engine is more capable; for the couples angle the differentiator is reach, not sophistication. |
| In-app chat/comments on transactions | None | Built-in chat + emoji reactions directly on a transaction | **Major** | Deliberately out of scope given single-user architecture — worth naming plainly rather than treating as an oversight. |
| Onboarding / relationship framing | Generic personal/split/both intent; no couple/household persona | Couples-specific from screen one: invite partner, link accounts, set shared-vs-private immediately | **Minor** | More positioning gap than technical gap — a "household" group type already works mechanically. Cheap to fix with copy, but only meaningful once sync exists. |

### vs. Money View & INDmoney (India bank/UPI aggregation)

| Concept | BudgetSplit Today | Competitor Approach | Gap | Notes |
|---|---|---|---|---|
| Automatic bank/UPI ingestion | Fully manual; Paytm CSV/XLSX only; no SMS reading anywhere | Money View: Android SMS parsing (no license, no bank login, real-time) via pattern matching. INDmoney: RBI Account Aggregator via a licensed NBFC-AA/TSP (Setu/Perfios/Finvu), consent-token based | **Major** — the headline gap | SMS parsing needs **no RBI license** and can run entirely on-device, so it doesn't even conflict with the local-first architecture. This is the lowest-hanging fruit BudgetSplit is leaving on the table. |
| Net worth tracking | "Total Money" card is 100% manually typed | INDmoney's core product is an AA-linked auto-updating net-worth view. (Money View has no comparable net-worth feature either — it's an SMS expense tracker + lending marketplace) | **Major** | This isn't a 3-way tie — BudgetSplit's manual card is behind INDmoney specifically, not "the category" broadly. |
| Investment tracking (MF/stocks/EPF/NPS) | None beyond one manual number | INDmoney pulls CAS data from NSDL/CDSL or broker APIs, EPFO/UAN-linked tracking | **Major** *(likely a deliberate non-goal)* | Out of scope for a splitter+budgeter, not a wealth platform — flag but may not warrant closing. |
| RBI Account Aggregator regulatory architecture | Not applicable — no data ever leaves the device | AA framework (NBFC-AA Directions 2025, DEPA/Sahamati registry): 17 licensed AAs, 2.61B accounts enabled, 252.9M linked users as of Dec 2025 | **None** | Regulatory context, not a feature gap — if real bank-linking is ever wanted, AA via a TSP is the compliant path, not screen-scraping. |
| Credit card / credit tracking | Single manual number | Money View is credit/lending-first (native credit score + card recommendations); INDmoney surfaces credit score via AA | **Minor** | Lower priority — credit-bureau tracking is outside BudgetSplit's stated mission. |
| Multi-bank / unified balance view | No concept of "a bank account" in the data model at all | Both show one list of balances across N linked accounts | **Major** | Underlies the net-worth gap — without an account entity, BudgetSplit can't represent "balance across accounts" even manually. |
| Data freshness | Days-to-weeks stale (manual re-export/re-import) | Money View: effectively real-time (SMS arrives, transaction logs). INDmoney: near-real-time to same-day AA pulls | **Major** | Even a perfect Paytm import is a batch/snapshot model vs. both competitors' event-driven or continuous models. |
| Import vendor/format coverage | Single vendor, single format (Paytm CSV/XLSX) | Money View's SMS parsing is vendor-agnostic by construction; INDmoney's AA coverage spans most major banks/AMCs regardless of UPI app | **Major** | Matches BudgetSplit's own roadmap notes — GPay queued but blocked on format, email blocked on CASA — while competitors solved "which app did you pay through" structurally. |
| Privacy/security trade-off | No data ever leaves the device — no OAuth, no consent chain, no third-party breach exposure | Both carry a trust chain the user must accept (SMS-read permission; AA/FIU/consent-renewal friction) | **None** *(BudgetSplit's favor)* | "No bank login ever leaves your phone" is a real, defensible claim neither competitor can fully make. Worth using explicitly in marketing. |

### vs. Jupiter Money & ET Money (India neobank/budgeting-tab angle)

| Concept | BudgetSplit Today | Competitor Approach | Gap | Notes |
|---|---|---|---|---|
| Onboarding friction | 8-stage flow, zero KYC/OTP, fully usable offline in minutes | Jupiter requires a real Federal-Bank-partnered account (min/full KYC, OTP consent for AA). ET Money's core signup is lighter but investing features gate on KYC/PAN | **None** | BudgetSplit genuinely wins on friction-to-first-value — but this is a "cheap to start, expensive to maintain forever" trade-off vs. "expensive to start, free to maintain," not an unexamined win. |
| Ingestion / import | Paytm CSV/XLSX only live; GPay/email mocked | Jupiter: RBI AA, one-time OTP consent, no manual export ever again. ET Money: Android SMS parsing near-real-time (iOS has the same manual-entry gap as BudgetSplit) | **Major** — the single biggest structural convenience gap | Not fixable without breaking the no-backend architecture — a known, permanent trade-off. Flagged as the most likely source of week-one drop-off (manual-logging fatigue is the #1 budgeting-app churn driver). |
| Categorization automation | Manual on every Add; smart-category-learning flag only learns from typed notes, no merchant-level signal | Jupiter auto-tags via merchant-level signals; ET Money's SMS engine does the same for Android | **Major** | Direct consequence of the ingestion gap — a much weaker signal than real merchant strings. |
| Budgeting model (per-share vs. individual) | Novel "my-share" mechanic combining shared-expense math with individual budget enforcement | Neither has any shared-expense-pool concept — both are single-user/household net-worth views | **None** | BudgetSplit's clearest differentiation — Jupiter's own community explicitly asked for bill-splitting years ago; never shipped. The wedge worth protecting. |
| Splitting math / group expenses | Full splitter + itemized + dual settlement views | Neither has shipped group splitting (Jupiter's forum shows repeated unfulfilled requests since 2022-23) | **None** | Confirms the Splitwise-style engine is uncontested ground among these two. |
| Recurring bills / subscriptions | User-created rules only; dormant detector has no feed | Jupiter's Smart Auto-Pay both **executes** recurring payments and discovers them from real transaction history | **Major** | Same root cause as ingestion — every BudgetSplit recurring rule is a chore the user must remember to set up. |
| Savings goals | Numeric trackers only — funding a goal just changes a stored number, no real money moves | Jupiter Pots hold real set-aside money in the linked account; ET Money channels savings into real SIP/MF purchases | **Major** *(different category of feature, not a UX gap)* | Can't be closed without becoming a financial institution — should be framed to users as "goal **tracking**," not "goal **funding**," to avoid an expectation mismatch (a user could assume "lock" means the money is actually inaccessible). |
| Notifications / reminders | Proactive-scheduling only (known due dates); can't react to real-world spend it doesn't know about yet | Both react to live transaction data the moment it clears | **Major** | An "about to overspend" nudge can only be as fresh as the user's last manual entry — often days behind actual spending, undermining the alert exactly when it matters most. |
| Insights / forecasting / health score | Comparable or more thoughtfully designed UI (single home, explicit narrative) | Jupiter computes a comparable score off a complete, automatically-captured dataset | **Minor** | The risk is data completeness, not design — a score from manually-logged, inevitably-incomplete history is less trustworthy even with an equally good UI. Needs a "based on N logged transactions" disclosure. |
| Net worth / investment tracking | Manual "Total Money," never reconciles itself | Both aggregate live balances/NAV automatically | **Major** | One of the more deceptive-by-omission risks if not handled — a stale manual figure sitting next to a live-feeling health score can look more authoritative than it is. |
| Sync architecture / data durability | Single device, no cloud backup, no encryption beyond OS defaults | Both backed by real institutional/custodial infrastructure — data survives a lost phone by construction | **Major** | A genuine, sharp-edged risk that should stay visible to users (e.g., a periodic export nudge), not quietly accepted as "fine because it's intentional." |
| Monetization | None | Jupiter: interchange + lending/NBFC interest + premium tiers + AUM distribution (~40% of FY24-25 revenue from lending/salary-advance). ET Money: free direct MF investing + "Genius" advisory (~₹249/mo) + insurance/loan referral commissions | **Minor** | Both competitors' "free" insights layer is a lead-gen funnel into higher-margin lending/insurance — commercially incentivized nudges, not neutral advice. BudgetSplit's zero-monetization stance means zero conflict-of-interest — a real trust advantage, but also zero revenue path today. |

---

## 3. Prioritized Recommendations

### Quick wins

| Recommendation | Why | User Impact | Dev Effort | External Cost | Status (2026-07-29) |
|---|---|---|---|---|---|
| Add a staleness/confidence layer to the Total Money card and Insights health score — a "last updated Xd ago" badge, and a "based on N transactions logged in the last 30 days" confidence note | Jupiter, INDmoney, and Monarch all compute health scores off complete, live-synced data; a confident-looking score next to stale manual figures is deceptive by omission | Medium | S (2-3 days) — UI badge, no new data model | None | ✅ **Done.** `TotalMoneyCard.tsx` shows an "Updated Xd ago"/"Never updated" badge; `HealthSheet.tsx` shows a "Based on N transactions…" note when the sample is thin (<5). |
| Add a periodic "back up your data" nudge (local file export reminder) since there is no cloud backup and losing the phone destroys everything permanently | Every named competitor survives device loss because data lives with a bank/cloud account; this is BudgetSplit's sharpest unmitigated risk | High | S-M (3-5 days) — reuse existing CSV/PDF export plumbing + a scheduled local notification | None | ✅ **Done.** `lib/reminders.ts` schedules a real "Back up your data" local notification anchored to `settings.backupAnchorAt()`, reset on every real export (`reports.tsx`, `settings/backup.tsx`) and initialized when the reminder is toggled on (`settings/notifications.tsx`). |
| Relabel savings-goal "Lock" language + a one-time explainer that goals are tracking/allocation only, not real fund segregation | Jupiter Pots and ET Money SIPs move real money; BudgetSplit's goals never do, and "lock" invites an expectation mismatch no competitor's UI creates | Medium | S (1-2 days) — copy + one explainer sheet | None | ✅ **Done.** UI copy already says "Protect"/"Protected," not "Lock" (`app/savings/[id].tsx`); a one-time `LockExplainerSheet` is gated on `settings.lockExplainerSeen()`. |
| Wire the existing (dormant) recurring/subscription auto-detector against already-imported Paytm history to surface "this looks recurring — create a rule?" suggestions after import | Monarch auto-detects ~80% of recurring bills from history; Jupiter's Smart Auto-Pay does the same — BudgetSplit already has the detector code and the import pipeline, just not wired together | High | M (1-2 weeks) — detector exists, needs wiring + a suggestion-to-rule UI step | None | ✅ **Done, but opt-in.** `app/review.tsx` calls the detector on freshly-imported rows and surfaces suggestion UI — gated behind `flags.recurringSuggest`, which defaults to `false`. Functionally complete; not on for new users by default. |
| Add couple/household-specific onboarding framing — a "household" group subtype with copy for two people living together, distinct from a one-off trip group | Honeydue's onboarding is couples-specific from screen one; BudgetSplit's group model already works mechanically for this case, but nothing in copy calls it out | Low | S (2-3 days) — copy/persona tag only | None | ❌ **Still open.** Onboarding's persona picker only has personal/split/both, with "split" described generically ("Groups, roommates, couples"); no distinct couple/household persona. (A "🏡 Household" vs "✈️ Trip" choice exists, but only in general group-creation, not onboarding.) |
| Verify (and if missing, add) an explicit, undoable toast whenever the savings auto-raid claws back from a lower-priority goal | No competitor (Monarch, Copilot, YNAB) auto-transfers between goals at all — there's zero external precedent that silent auto-clawback reads as reassuring rather than alarming | Medium | S (2-4 days) — likely partially built, needs an audit pass | None | ✅ **Done.** `app/(tabs)/savings.tsx` renders an overspend card with explicit "Undo"/"Dismiss" actions, persisted across restarts (`lib/overspendNotice.ts`). |

### Big bets

| Recommendation | Why | User Impact | Dev Effort | External Cost | Status (2026-07-28) |
|---|---|---|---|---|---|
| Build on-device Android SMS-parsing to auto-capture bank/UPI transactional SMS into the Review inbox as suggested entries (manual accept step, no OTP, no credentials) | Money View's entire ingestion model is exactly this — no RBI license needed since parsing and storage both stay on-device; the lowest-hanging automatic-ingestion fruit that doesn't conflict with the offline architecture | High | L (3-5 weeks) — SMS permission flow, per-bank/UPI regex templates, dedupe against manual entries, Review-inbox integration. iOS gets nothing (OS blocks SMS read — same limitation ET Money hits) | None — OS-level permission only, no API/license | ⏸ **Deferred** — the founder is prioritizing iOS for now, and this is Android-only by an unliftable Apple platform restriction (not a "not yet"). Also carries a real risk worth checking before scoping: `READ_SMS` sits in Google Play's restricted-permissions bucket and requires a Play Console justification. |
| ~~Finish the dormant itemized-receipt OCR using **on-device** ML Kit Text Recognition as the primary path, reserving a cloud fallback only if accuracy proves insufficient~~ | ~~Splitwise Pro's headline feature is receipt-photo OCR removing manual per-line typing — this is the same dormant module already in the repo, not a green-field build~~ | — | — | — | ✅ **Done — broader than scoped.** Two swappable providers behind `src/lib/ocrProviders/`: `device` (Apple Vision OCR + a tuned regex line-item heuristic — the original scope, kept as the free/offline fallback) and `gemini` (opt-in cloud — sends the photo directly to a free-tier vision model via a small serverless proxy, avoiding the on-device path's column-scrambling failures on two-line item layouts). Defaults to `gemini` for accuracy. A raw-text debug panel (device path) and a full-screen scanning overlay ship alongside it; Tax/Tip/Discount gained a 4th "Service Charge" type in the same pass. Verified 2026-07-29 against a real receipt on-device. |
| ~~Add an opt-in encrypted backup/restore to the user's own iCloud (iOS) or Google Drive (Android) app-scoped storage — not a shared backend, a personal-account safety net~~ | ~~Every competitor's data survives device loss because it lives with an institution/cloud account; this closes that risk without building full multi-device sync~~ | — | — | — | ✅ **Done — simpler mechanism than scoped.** Ships as a manual passphrase-encrypted export/import (`src/lib/backup.ts` + `app/settings/backup.tsx`), not native iCloud/Drive app-data APIs — the encrypted file goes through the OS share sheet, so it lands wherever the user picks (Files/iCloud Drive/Google Drive/AirDrop/etc.) with no per-platform native-API work. Whole-DB replace on restore (wipe + reinsert), not a merge. The passphrase is user-typed and never stored on-device by design — forgetting it makes that backup permanently unrecoverable, the necessary tradeoff for actually surviving a lost phone. Closes the audit's #1 flagged risk. |
| ~~Complete the queued Google Pay transaction-history import~~ | ~~BudgetSplit's own roadmap already queued this — blocked only on a reliable GPay export format~~ | — | — | — | ✅ **Already done, not queued.** `src/lib/gpayParse.ts` parses GPay's PDF transaction statement (not a Takeout export — simpler than this recommendation assumed) and is fully wired into `app/import.tsx`: pick or paste a statement → auto-detected → lands in Review. Test coverage is built from verbatim real-PDF slices, including page-break and column-interleaving edge cases. Verified 2026-07-28 against a real user-supplied statement PDF (3 transactions, all fields matched: date, payee, UPI ID, amount). See the correction note at the top of this doc. |

### Later / strategic forks

| Recommendation | Why | User Impact | Dev Effort | External Cost |
|---|---|---|---|---|
| Scope (don't yet build) a future premium tier modeled on Monarch's Core/Plus split — e.g. gating what-if scenarios and/or health-score depth | Monarch/YNAB/Copilot have converged on $95-110/yr for a comparable feature set; Settle Up's paywalling of recurring+categories drove +30% YoY revenue — validates willingness-to-pay for features BudgetSplit gives away free | Low | M (2-3 weeks for entitlement flags + IAP wiring) — when this phase is greenlit, per existing "premium tier later" note | Apple/Google IAP cut (15-30%), or RevenueCat for cross-platform entitlement (free to $2.5k/mo tracked revenue, then ~1%) |
| Investigate India Account Aggregator bank-sync (via a TSP like Setu/Finvu/Perfios) — as a deliberate strategic decision, not a default roadmap item | INDmoney, Jupiter, and Money View (via SMS) all treat automatic ingestion as table stakes; AA is the compliant path for true bank-agnostic sync | High | XL (2-3+ months) — TSP integration, consent-flow UX, compliance review, becoming an FIU counterparty. An architecture-level decision, not an incremental feature | ~₹10-25 per successful data pull (Setu-class per-fetch pricing), plus platform/integration fees ranging from lakhs to crores/year by volume tier. **Directly contradicts the current no-backend positioning** |
| Investigate a genuine multi-device/two-person live sync architecture (accounts, backend, per-account visibility permissions) — only if couples/household becomes a priority segment | Honeydue's entire value prop is structurally impossible on a single-device app — the single biggest capability gap vs. any competitor, but a missing architecture, not a missing feature | High | XL (2+ months min) — accounts/auth, sync backend, conflict resolution, 3-tier visibility permissions (not a naive binary), push infra for dual alerts | Supabase Pro (~$25/mo base + usage) or Firebase (~$50-100+/mo at modest scale) + an auth provider. **Most in tension with "no backend, no accounts"** — a product-strategy decision, not a dev estimate |
| Add in-app transaction comments/reactions — sequence strictly **after** multi-device sync exists | Honeydue markets in-transaction chat/reactions as replacing an awkward statement-review conversation — meaningless without a second real participant | Low | M (2-3 weeks), but only after the multi-device foundation exists | None beyond whatever sync backend the item above requires |
| Add optional multi-currency support (per-transaction currency + conversion) | Tricount/Splid offer unlimited free multi-currency splitting, friendlier for casual international trip groups — though INR-only is a deliberate scope choice, not an oversight | Low | M (2-3 weeks) — currency field, rate-lookup, display/rounding across split math | Free-tier FX API (~1,500 free req/mo) or ~$10-20/mo paid tier; could stay fully offline with manual rate entry |
| **Do not** build a web/desktop companion app at this stage | Fudget/Tiller offer cross-platform reach BudgetSplit lacks, but a web client only becomes valuable once a sync layer exists to keep it current — building it first just creates a second, stale, disconnected copy of the data | Low | XL (months), largely wasted without sync existing first | Hosting is negligible — the sync backend dependency is the real blocker |

---

## 4. Don't-Build List

| Item | Reason |
|---|---|
| Splitwise's Pay-by-Bank/Tink integration or Splitwise Pay (in-app real money movement) | Requires becoming a financial intermediary with licensing/custodial risk — the clearest violation of the local-first/no-backend identity. Also moot today: this rail doesn't exist for India/UPI yet, so there's no live pressure to match it. |
| Honeydue-style joint bank-account linking or true multi-device live sync, bolted on incrementally | Not a v1 feature, a different product architecture. Treating it as an incremental UI addition would produce a half-working sync layer without the account/consent model that makes Honeydue's version trustworthy. Must be a deliberate, separately-scoped v2 decision. |
| ~~Resurrecting full receipt-OCR line-item parsing to chase Splitwise Pro/Divvy-style AI itemization (as a green-field re-attempt)~~ | ~~Already tried and shipped-then-abandoned in this codebase — it couldn't reliably parse line items. Re-attempting without a concretely better approach (or one requiring cloud photo upload, breaking the privacy story) would either fail again or quietly compromise the local-first claim.~~ **Correction (2026-07-29):** this was resurrected, and does now support cloud photo upload — but as an explicit, ranked, opt-out toggle (`device` vs `gemini` in `src/lib/ocrProviders/`), not a forced or silent default, so the local-first claim stays accurate ("cloud is opt-in, not required") rather than quietly compromised. See the corrected Big Bets row in §3. |
| CRED-style credit-eligibility gating, or Jupiter/lending-marketplace cross-sell (loans, cards, insurance commissions) | Directly conflicts with BudgetSplit's one real trust advantage: zero conflict-of-interest in its insights, unlike competitors whose "health score" nudges are commercially incentivized toward a loan or fund. Monetizing this way poisons the app's only structural moral high ground. |
| Becoming an actual bank/investment account, Zeta or Plenty-style | Catastrophic regulatory/custodial scope creep (RBI licensing, becoming a financial institution). Plenty's own shutdown (acqui-hired and wound down by Wealthsimple in 2025) is a live cautionary tale of exactly this category of overreach. |
| Cleo-style AI chatbot interface funded by cash-advance/lending fees | Same conflict-of-interest problem as the CRED/Jupiter item, plus an entirely new interaction paradigm and maintenance burden with no evidence users want a conversational UI. |
| Chasing Money View/INDmoney's Account Aggregator integration wholesale, as an incremental feature | Full AA integration means becoming a licensed FIU behind an NBFC-AA consent chain — a heavy regulatory/compliance lift wildly out of proportion to a normal feature addition. If ever wanted, it must be a deliberate, separately-resourced initiative. |
| Copying Settle Up's 2025 paywall move on recurring expenses and categories | Those features are currently free and are actively part of BudgetSplit's "more generous than rivals" story. Paywalling them now would read as a bait-and-switch to existing users, not the confident incumbent move it was for Settle Up. |
| Multi-currency support as a near-term priority | INR-only is a deliberate positioning choice for an India-focused app. Adding this now is scope bloat aimed at a use case (international trip splitting) with no evidence of demand from the stated target market. |

---

## 5. Business-Logic & Architecture Critique

### 5.1 Local-first / no-accounts / no-cloud-sync: defensible or fatal?

It's both, and the split is clean along the product's two halves.

**For splitting**, local-first is genuinely defensible. A one-off group of friends splitting a
trip doesn't need real-time cross-device sync badly enough to accept an account system, and
Splid's whole business (no signup, offline-capable, one-time unlock) proves there's a real
market that prefers exactly this trade-off. BudgetSplit's zero-server-cost, zero-KYC,
minutes-to-first-value onboarding is a legitimate structural advantage over every bank-linked
competitor, Indian or Western — none of them can honestly claim "nothing ever leaves your
phone," including Money View (broad SMS-read permission) and INDmoney (consent delegated to a
licensed third party by design).

**For budgeting, and especially for anything "shared and ongoing" (couples, roommates,
family), it is not defensible — it's a structural ceiling.** Honeydue's entire value
proposition is two independent phones staying in sync on one shared financial picture, with
per-account visibility tiers, dual bill alerts, and in-transaction chat. None of that is a
missing *feature* in BudgetSplit — it's a missing *architecture*. A "group" with two Person
rows is two rows inside one local database on one physical phone. For a couple who actually
live together and split rent every month (the single most habitual, highest-retention use
case this category has), BudgetSplit today requires one partner to be the sole data-entry
clerk for both people. That's strictly worse than Splitwise's live multi-account sync for the
one thing a *shared* expense app should be best at.

The backup situation compounds this. `docs/DEBT_TRACKER.md` lists "no cloud backup...losing
the phone loses all data" under **Won't fix / by design**, in the same table as dead schema
columns and a `PRAGMA foreign_keys` decision. That's a category error. A dead column is inert;
a phone falling in a lake is not — it is total, unrecoverable loss of the exact data category
(money, debts, goals) users trust the app with most. "Intentional" and "risk-free" are not the
same thing. At minimum this needs an active mitigation — a nagged, easy, one-tap
encrypted file export/backup ritual — not silent acceptance. Today there's nothing in the
codebase (no reminder, no backup prompt, no encryption beyond OS defaults) that treats this as
a live risk rather than a settled decision.

**Verdict:** local-first is a genuine, defensible differentiator for solo personal budgeting
and casual/occasional splitting. It is a real, currently-unaddressed liability for (a) data
durability and (b) the couples/household segment specifically. Don't fix (b) by bolting on a
backend as scope creep — that has to be a deliberate v2 architectural decision, if ever. Do fix
the backup gap now; it's cheap, it's honest, and leaving it unaddressed is negligence dressed
as philosophy.

### 5.2 Is "my-share" budgeting the right call?

Yes, and the codebase itself is proof: `budget_group.limit_daily/monthly/yearly` exist as real
schema columns that are now dead and unread (per DEBT_TRACKER's Won't-fix table), meaning
group-total budgeting was built, tried, and abandoned in favor of my-share. That's a validated
decision, not an untested guess.

Structurally, my-share is the *only* coherent way to unify a personal budget with a group
ledger: a group-total model would either double-count group spend against a personal budget
the user doesn't fully control, or require building full envelope semantics for money that
isn't unilaterally theirs (a roommate's portion of dinner). None of YNAB, Monarch, or Copilot
even attempt this — they're single-user/household net-worth tools with zero P2P concept — so
there's no direct precedent to benchmark against, which cuts both ways: it's genuine novelty,
but also means BudgetSplit is flying without a competitor's field-tested edge cases to learn
from.

Two real gaps sit underneath the otherwise-sound model:
- **No re-plan mechanic.** YNAB's "Edit Plan"/"Cost to Be Me" exists specifically for the
  moment a category blows up mid-month. My-share budgeting makes this *more* likely to happen
  unpredictably, not less — an itemized bill can silently assign you a much bigger share than
  expected — and there's no explicit "rebalance the rest of the month" surface, just a category
  going red.
- **No audit trail between what you paid and what your share was.** Itemized assignment
  accuracy directly determines your budget hit, and nothing surfaces a reconciliation ("you
  paid ₹2,000, your computed share was ₹650") back on the budget screen. Not fatal, but it's a
  quiet integrity gap in a feature whose entire value proposition is "trustworthy attribution."

### 5.3 Is manually-entered "Total Money" sustainable?

Against pure splitters (Splitwise, Tricount, Splid) — irrelevant, none of them have this
concept, so there's no comparison to lose.

Against Western budgeting apps (YNAB, Monarch, Copilot) — manual entry alone isn't
disqualifying (YNAB's whole philosophy is manual discipline over automation and it's the
category's revenue leader), but manual entry **combined with zero staleness signal** feeding a
confidently-presented health score is the actual defect. `moneyProfile.ts` stores
`openingCash`, `investments`, `creditLimit`, `creditUsed` in a flat KV table with no timestamp
column whatsoever. The Insights screen then builds a health-score ring, a spend-shift
narrative, and 10/20/30% what-if projections on top of numbers that could be three weeks
stale, and nothing in the code can even detect that, let alone disclose it. That's a
trust/design mismatch: the UI presents algorithmic confidence the underlying data cannot
support.

Against India-specific automatic apps (Money View's SMS parsing, INDmoney's Account
Aggregator, Jupiter's linked-account Pots) — this is a clean, structural loss. Those apps
track real balances with zero manual burden; BudgetSplit's Total Money card is a number that
goes stale the instant the user stops updating it, with no mark-to-market of any kind.

**Sustainable** as the anchor of a rough personal-net-worth glance for a privacy-first user who
doesn't want any account linked. **Not sustainable** as the input to a feature (Insights) that
markets itself with a score, a ring, and a narrative — that presentation implies a rigor the
data-entry model can't deliver. Minimum fix: a visible "last updated" timestamp on the Total
Money card, and a confidence indicator or the exclusion of stale manual figures from the
health-score calculation, so the UI's certainty is capped by the data's actual freshness.

### 5.4 Is monetization possible without a backend — what could actually be charged for?

Yes, but the shape has to match the architecture, not fight it.

**What's viable:** a one-time IAP unlock, à la Splid — no subscription, no server, no account,
pay once. This is architecturally trivial for a single-device app: there's no cross-device
entitlement problem to solve (there's only one device), so App Store/Play receipt validation
alone is sufficient; no custom backend is needed even for that. Good candidates for the paid
unlock: on-device OCR/AI split-suggestion (if it can be made to actually work), unlimited
multi-group settlement history/export, advanced CSV/PDF report formats, theming, a genuine
encrypted backup/restore-via-file feature.

**What's structurally awkward:** a recurring subscription. Without any account system, a
subscription has to be gated 100% client-side (more crackable, no server-side entitlement to
fall back on) and it's culturally inconsistent with "no accounts, no cloud" as a selling point
— charging monthly for a product whose entire pitch is "nothing lives on our servers" invites
the obvious question of what, exactly, the subscription is renewing.

**What's a trap:** literally copying Settle Up's 2025 move of paywalling recurring expenses and
categories, even though it drove +30% YoY revenue for them. Those two features are *currently
free and load-bearing* in BudgetSplit's own story — "we give away more than rivals, uncapped"
is presently true and worth something. Retroactively paywalling them would be a bait-and-switch
existing users would notice and resent, for a revenue signal generated in a completely
different competitive position (Settle Up paywalled from a position of already being the
incumbent; BudgetSplit would be paywalling its own differentiator).

**The couples/household angle and monetization are the same unsolved problem twice** — you
can't sell a "household" premium tier until the sync architecture that makes "household" real
actually exists. Chasing that revenue line without first solving the architecture gap in §5.1
would mean selling a feature that doesn't structurally work yet.

---

## 6. Open Strategic Question

**Should BudgetSplit pick one lane (pure splitter or pure budgeter) or is
split+budget+local-first+India-focused a defensible niche?**

Pick the niche, but stop treating local-first as a passive excuse and start treating it as an
active constraint to be sharpened. Neither half survives alone against a focused specialist: a
pure splitter loses to Splitwise/Splid on raw splitting polish and multi-currency reach; a pure
budgeter loses to YNAB/Monarch/every Indian neobank the moment bank-sync becomes the baseline
expectation, which it already has. But the intersection of three constraints — shared-expense
math, personal budgeting, and local-first/India-only — is precisely the kind of stacked niche a
small independent app can hold that no incumbent will chase: Splitwise won't build YNAB-style
budgeting (different competency, different DNA), YNAB won't build debt-simplification
splitting (same reason), and neither will build it INR-first with UPI-shaped habits in mind.
That's a real moat, and the research confirms it directly — zero named budgeting competitor
(YNAB, Monarch, Copilot, Jupiter, ET Money) has shipped anything resembling my-share group
splitting, and zero named splitting competitor (Splitwise, Tricount, Settle Up, Splid) has a
health score, a forecast, or a savings-priority engine.

If a cut has to be made, cut budgeting depth before cutting splitting: YNAB-parity
envelope/rollover semantics are "nice to have" polish on a feature category that's already
differentiated enough (my-share + category-cap), whereas splitting + settlement is the only
piece of the product with zero direct competitor overlap. Splitting is the moat; budgeting is
what makes the moat sticky (a splitter gets opened occasionally, a budget gets checked daily);
local-first is the trust story that has to be marketed loudly and actively defended with real
backup/staleness mitigations — not quietly relied on while its actual failure modes (data loss,
no couples sync, stale Total Money feeding a confident health score) sit unaddressed.

---

## 7. Founder Response & Roadmap Reactions (2026-07-28)

> The founder reviewed this audit and responded point-by-point with an intended roadmap.
> Captured here so the reaction lives with the audit instead of only in chat history.
> **Assessment key:** ✅ Agree · ⚠️ Agree with a caveat / open question · ❌ Push back.

| Audit finding | Founder's response / plan | Assessment | Note |
|---|---|---|---|
| Budgeting suffers from manual entry | Intentionally deferred sync to keep V1 simple/offline. Near-term: CSV, bank-statement, email import. Later: Account Aggregator (India) / Open Banking / partner APIs by region | ✅ | Matches the audit's "Big bet" recommendations directly. |
| "Everything stays on my phone" is a real strength | Wants to preserve this philosophy even once cloud features exist | ⚠️ | The claim gets *weaker*, not stronger, once cloud is optional-but-present ("stays on your phone unless you opt into sync" is a different, softer claim than today's). Write the exact App Store wording now, before the architecture is built around a vaguer version of it. |
| No clear monetization path | Later premium tier: cloud sync, multi-device, AI insights, OCR, shared budgeting, advanced analytics — instead of forcing accounts | ✅ | Matches the audit's "one-time IAP is architecturally clean" direction. Caveat below. |
| Regional ingestion options | India: AA, SMS (Android), email, CSV, future bank partnerships. Outside India: Plaid (US/CA), TrueLayer (UK/EU), Tink (EU), Salt Edge (global), Yapily (EU), Finicity/MX (US) | ❌ | Six separate compliance regimes, each with its own registration and ongoing per-call cost. The app is INR-only/India-focused today — shelve every non-India integration until the India ingestion story (SMS + AA) is actually proven. Listing them now risks the roadmap hardening around scope the audit's "don't build" list already warns against. |
| "Every popular budgeting app auto-imports" | Agreed — surveyed how Walnut/CRED/Jupiter/Fi/INDmoney (India) and Monarch/Copilot/Simplifi/Lunch Money (US) and Emma/MoneyWiz/Wallet/Spendee (EU/UK) each solve it; confirmed as planned, "not in V1" | ✅ | Correct triage — matches the audit's own landscape research almost exactly. |
| No cloud backup is a serious risk | Before cloud sync: regular backup reminders, scheduled encrypted exports, simple restore. Later: optional encrypted cloud backup | ✅ | This was the audit's #1 quick win — do this first, it's cheap and doesn't require any server. **Shipped 2026-07-29** — passphrase-encrypted export/import via the OS share sheet; see the corrected Big Bets row in §3. |
| Server sync plan | Login, secure cloud sync, multi-device, shared budgeting, encrypted backups — offline stays the default, cloud is opt-in | ✅ | Correct framing: default-local, cloud strictly additive. This is the version of the "still private" claim from row 2 that's actually defensible — make sure the marketing matches this precisely, not a looser version of it. |
| "My-share" budgeting is the right call | Extending it: group has an admin-set default budget; members inherit it; once a member customizes their own copy, future admin changes don't silently overwrite it unless the member re-syncs | ⚠️ | The non-overwrite instinct is right, but an unsignaled fork recreates the same silent-behavior problem flagged with the goal auto-raid below. Needs a visible "your budget differs from the group default" indicator + an explicit "sync to latest" action — not silent divergence in either direction. |
| Health score may be mislead by stale data | Later: record when savings/investments were last updated, warn on staleness, reduce prediction confidence on outdated data | ✅ | Exactly the audit's #1 recommendation (staleness badge + confidence note). Cheap — do this soon, doesn't block on anything else. |
| No clear way to make money | Monetization planned for V3; privacy and subscriptions tied together; premium = cloud sync, multi-device, AI insights, OCR, shared budgeting, advanced analytics; offline version always fully usable | ⚠️ | Sequencing is right (defer to V3). But cloud sync/multi-device are recurring infra costs while OCR/AI insights are metered usage costs — bundling all of it into one flat tier now risks that mismatch hardening into the eventual pricing model by default. Not urgent, just don't let the current list become the final answer. |
| Auto-raiding savings on overspend is risky | Goals should support locking; a locked goal is never touched by auto-overspend logic | ⚠️ | Right fix for locked goals. Open question: does an *unlocked* goal still get silently auto-raided as today, or does the raid now require confirmation regardless of lock state? If unlocked stays silent, "unlocked" becomes a trap default that still does the risky thing. |
| "Total Money" conflates cash, investments, and credit | Reconsidering: Available Money = actually spendable (excludes investments and credit limit); Investments (MF/stocks/crypto/gold) contribute only to Net Worth; goals may reference investment accounts but redemption must be explicit, never automatic | ✅ | Genuine improvement over what's shipped — this is the right mental model (PocketGuard's "safe to spend," YNAB's "on hand" draw the same line). Unlike almost everything else on this list, **this doesn't need a server** — it's a reclassification of numbers already collected manually. Worth shipping in the next release, decoupled from the V2/V3 cloud roadmap. |
| Only way to share finances is handing the phone over | Planned: shared group budgets *and* individual budgets inside a group; transactions support Paid By / Split Between / Individual ownership | ✅ | Right direction, and correctly flagged as needing careful flow design before implementation — this is the same permission-model complexity Honeydue solved with 3 visibility tiers, not a small addition. |
| SMS parsing is the best privacy-friendly ingestion method | Agreed; Apple blocks SMS read on iOS, so parity is impossible. Android: SMS + email + CSV. iOS: email + CSV + future banking integrations | ✅ | Correct workaround for a real platform constraint, not a gap in the plan. |
| Multi-currency | Store original amount + original currency + exchange rate at time of transaction + converted value; reports use the stored historical rate, not today's rate | ✅ | Textbook-correct. This is exactly how real accounting systems avoid historical reports silently changing when FX rates move. Get this right from day one if multi-currency ever ships. |
| Voice-assistant expense entry | V3 feature — Gemini/Google Assistant (Android), Siri App Intents/Apple Intelligence (iOS) | ✅ | Correctly low priority. |
| AI receipt scanning | V3 feature — full extraction (merchant, date, total, tax, tip, line items), deferred partly due to OCR/AI cost | ✅ | Matches the audit's OCR "Big bet," correctly pushed past V1. **Shipped 2026-07-29, not deferred to V3** — a free-tier cloud vision model made this viable now without the anticipated per-scan cost; see the corrected Big Bets row in §3. |
| Envy-free allocation (Spliddit-style) | Interesting research concept, unnecessary — Equal/Exact/%/Shares/Paid By are simpler and more understandable | ✅ | Correct call — this would violate the app's own "minimum friction" principle by asking users to express preferences instead of just picking a split mode. |

### Two items that don't need to wait for the cloud/server roadmap

1. **Add `updated_at`/`created_at` consistently across tables, plus soft-delete tombstones
   instead of hard deletes, now.** This is the same underlying need as the health-score
   staleness fix above *and* as future sync conflict resolution (which needs to know "what
   changed when" to merge two devices' edits). Retrofitting this onto years of existing rows
   later is a much bigger migration than adding the columns while the schema is still young.
2. **Ship the Available Money vs. Net Worth split now.** It's a reclassification of numbers
   already collected manually, with no server dependency — cheaper to do before more users
   have muscle-memory around the current combined "Total Money" figure.
