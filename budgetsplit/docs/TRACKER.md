# TRACKER.md — what is left

`Last verified: 2026-09-30 (§0, §1, §9–§11 and every row whose status changed; the rest as of 2026-09-07) · Guarded by: trackerIntegrity.test.ts · countClaims.test.ts · docIdGraph.test.ts`

**266 items, 104 of them still open.** One row each: what it is, and where it stands.
Nothing else. **This is the V1 tracker** — start at §0.

**The evidence is not here.** Why each item exists, what it costs, what breaks if you touch it, and
the argument behind every verdict live in [`FINDINGS.md`](./FINDINGS.md) under the same id. This
file is for answering *"what is left"* at a glance; that one is for answering *"why"* once you have
picked something. They are guarded against disagreeing — every id here has an entry there, and no id
is defined in two places.

| Status | Means |
|---|---|
| `OPEN` | Needs work. Has a next action. |
| `DECIDE` | Needs an answer from you before any code. The **default if you never decide** is in the last column. |
| `BLOCKED` | Waiting on something outside this repo. |
| `PARKED` | Deliberately not now. The **trigger** that un-parks it is in the last column. |
| `DONE` | Closed. Kept, not deleted — see `FINDINGS.md`. |

| Section | Open | Total |
|---|---|---|
| §1 · Ship blockers | **12** | 19 |
| §2 · Complexity — `OV-` | **13** | 34 |
| §3 · Decisions — `DQ-` | **39** | 57 |
| §4 · Walk 1 — `W1-` | **12** | 39 |
| §5 · Sync — `SYNC-F` | **0** | 24 |
| §6 · Debt — `D-` | **10** | 11 |
| §7 · Accepted — `A-` | **2** | 11 |
| §9 · Deferred from V1 — `V-` | **7** | 7 |
| §11 · Open from the last pass, and your feedback — `U-` | **9** | 64 |

§8 (parked scope) and §10 (built but easy to forget) carry no ids.

---

## §0 · V1 — the road to release

V1 is the pilot: a TestFlight build for you and a few friends, not the public App Store. The order
below is the plan; every line points at rows further down, where status lives.

1. **Your phone pass** — `U-10` (the list for tomorrow), `B-12`, the sweep in
   `RELEASE_CHECKLIST.md` §2 and the sync checks in §3.1. Everything it finds becomes a `U-` row in §11.
2. **Answer the open questions** — `V-06` cash last confirmed · `V-07` Android before or after V1.
3. **Fix what 1 and 2 turn up**, then the tidy-ups `U-07` and `U-08`, and measure `U-02`.
4. **Ship steps** — `B-19` merge to `main` · `B-07` rotate the Brevo key · `B-02` the Apple
   Developer Program (a free Apple ID already covers your own phone) · `DQ-95` Workers Paid before
   the first sign-in that isn't you · `B-14` the no-enumeration
   check · `B-04` / `B-05` the build env on whichever machine archives.
5. **Before inviting anyone** — `B-08` privacy policy · `B-09` DPDP · `B-10` icon, splash,
   screenshots · `B-13` store copy and privacy answers.
6. **Not V1** — `B-01` (dev tools off) is for the public App Store. §9 is what was deferred on
   purpose; §8 is larger scope parked with its trigger.

---

## §1 · Ship blockers — `B-`

**19 items: 10 `OPEN`, 1 `DECIDE`, 1 `BLOCKED`, 7 `DONE`.** Nothing ships until every one is closed. Order of operations is in `FINDINGS.md` §1 — everything below `B-03` needs a phone.

| | What | Status |
|---|---|---|
| `B-01` | Set `DEV_TOOLS_ENABLED` to `false` | `OPEN` |
| `B-04` | `EXPO_PUBLIC_API_URL` present wherever release builds run | `OPEN` |
| `B-05` | `EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL` likewise | `OPEN` |
| `B-07` | Rotate the Brevo API key | `OPEN` |
| `B-08` | Privacy policy + App Store listing | `OPEN` |
| `B-10` | App icon, splash, screenshots | `OPEN` |
| `B-12` | Device-test Pass 4 | `OPEN` |
| `B-13` | Paste the store copy into App Store Connect and confirm the privacy answers | `OPEN` |
| `B-14` | Run §0a's no-enumeration diff | `OPEN` |
| `B-19` | Merge the working branch into `main` (76 commits behind) | `OPEN` |
| `B-09` | India DPDP posture | `DECIDE` |
| `B-02` | Buy the Apple Developer Program | `BLOCKED` |

**Closed (7), detail in `FINDINGS.md`:** `B-03` `B-11` `B-06` `B-15` `B-16` `B-17` `B-18`

---
## §2 · Complexity and overlap — `OV-`

**34 items: 2 `OPEN`, 6 `DECIDE`, 5 `PARKED`, 21 `DONE`.** Duplications, overloads and phantoms, each with a verdict. `FINDINGS.md` §2 carries the count, the blast radius and the risk for each.

| | What | Status |
|---|---|---|
| `OV-05` | Person, friend, member, roster member, contact | `OPEN` |
| `OV-22` | Six vocabularies over daily/weekly/monthly/yearly | `OPEN` |
| `OV-06` | Categories are referenced by NAME, not by id | `DECIDE` |
| `OV-10` | backOr is used in 6 of 44 route files | `DECIDE` |
| `OV-14` | E-50 is recomputed on every read, with no memo boundary | `DECIDE` |
| `OV-15` | /personal is a stack route pretending to be a tab | `DECIDE` |
| `OV-19` | category_budget.period AND .cadence | `DECIDE` |
| `OV-23` | Dead and near-dead columns | `DECIDE` |
| `OV-02` | kind='settlement' means four different things | `PARKED` |
| `OV-07` | Budget is three concepts, two levels, and three strays | `PARKED` |
| `OV-08` | /add/quick: 11 params, 24 entry points | `PARKED` |
| `OV-17` | The tab bar owns sync, alerts, reconciliation and snapshots | `PARKED` |
| `OV-24` | SC-19 owns twelve sheet states | `PARKED` |

**Closed (21), detail in `FINDINGS.md`:** `OV-27` `OV-12` `OV-09` `OV-25` `OV-28` `OV-29` `OV-30` `OV-31` `OV-32` `OV-33` `OV-34` `OV-26` `OV-03` `OV-13` `OV-21` `OV-16` `OV-18` `OV-20` `OV-11` `OV-04` `OV-01`

---
## §3 · Open decisions — `DQ-`

**57 items: 32 `DECIDE`, 7 `BLOCKED`, 18 `DONE`.** A `DQ-` is a question only you can answer, so every unanswered one is `DECIDE` by definition. The default column is what ships if you never decide.

| | What | Status | Default if never decided |
|---|---|---|---|
| `DQ-01` | What is the monetisation shape? | `DECIDE` | Free forever, funded by nobody |
| `DQ-02` | "Safe to Spend" as a name | `DECIDE` | Visible copy stays "yours to spend"; identifiers keep… |
| `DQ-03` | Aggregate use of spend data | `DECIDE` | Never done |
| `DQ-04` | The non-engineering cost of running a server | `DECIDE` | Absorbed personally, unpriced |
| `DQ-05` | India DPDP posture | `DECIDE` | Unaddressed |
| `DQ-06` | Widget scope | `DECIDE` | No widget |
| `DQ-08` | Email is the only identity | `DECIDE` | The typo wins |
| `DQ-09` | CRED's `mode` vs `tr` | `DECIDE` | Both stay off |
| `DQ-10` | Amazon Pay and WhatsApp were tested against the same `@kotak` handle | `DECIDE` | Recorded as "refused" on possibly-wrong evidence |
| `DQ-11` | Android UPI is entirely untested | `DECIDE` | The whole feature silently does nothing on Android |
| `DQ-12` | Three red surfaces can stack on one Home open | `DECIDE` | Three at once |
| `DQ-13` | Transfer has no `DetailChips` | `DECIDE` | Two note fields |
| `DQ-14` | Named accounts as entities | `DECIDE` | Buckets forever; `INCOME_LANDING` stays a view over… |
| `DQ-15` | The sweep's source-asset round trip | `DECIDE` | The sweep works; where the money came from is approximate |
| `DQ-16` | Global categories, undeletable once shared | `DECIDE` | Categories stay deletable and references stay strings |
| `DQ-17` | `help.tsx` is a third collapsible pattern | `DECIDE` | Three patterns |
| `DQ-18` | `TransactionRow` never displays pay method | `DECIDE` | Not shown |
| `DQ-19` | `PRAGMA foreign_keys` is OFF | `DECIDE` | Off |
| `DQ-20` | Voice auto-save has no off switch | `DECIDE` | No switch |
| `DQ-21` | `DEV_TOOLS_ENABLED = true` | `DECIDE` | It stays true and the guard keeps complaining, which is… |
| `DQ-23` | `expo-file-system` legacy API | `DECIDE` | Keep using it until it breaks |
| `DQ-29` | Partial acceptance | `DECIDE` | Binary |
| `DQ-30` | A tracking-only group mode | `DECIDE` | No such mode |
| `DQ-33` | Ownership: handover, and the group with no admin | `DECIDE` | Neither exists |
| `DQ-24` | Income that lands in an asset is not spendable | `DECIDE` | Every rupee of income counts as spendable |
| `DQ-25` | A person can never be removed, and cannot be archived either | `DECIDE` | The roster only grows |
| `DQ-27` | Should an asset keep a valuation history? | `DECIDE` | One current value per asset |
| `DQ-87` | Does invest-mode Add still record as a transfer to an asset, or count as spending? | `DECIDE` | Transfer to an asset — net worth stays flat |
| `DQ-90` | Does the Upcoming screen (was Reminders) keep the bell icon? | `DECIDE` | Yes, relabelled |
| `DQ-92` | Home's "Coming up" list is gone (a badge count only); bring it back, or finish removing it from docs/demo expectations? | `DECIDE` | Leave it removed — a badge only, no card |
| `DQ-95` | Workers Paid ($5/mo) before the pilot, now that D1 Free hard-stops at 100k rows written/day? | `DECIDE` | Free while developing; Paid before the first non-you sign-in |
| `DQ-96` | May a group member edit someone else's transaction (Splitwise's model)? | `DECIDE` | No — author-only; approve/reject answers someone else's entry |
| `DQ-80` | Paid Apple Developer account, $99/yr | `BLOCKED` | Apple |
| `DQ-81` | Google OAuth **CASA Tier-3** for `gmail.readonly` | `BLOCKED` | Google |
| `DQ-82` | The GPay export format | `BLOCKED` | Google |
| `DQ-83` | An Account Aggregator partner integration | `BLOCKED` | A partner |
| `DQ-84` | UPI hand-off refused by PhonePe, Paytm, Amazon Pay, WhatsApp | `BLOCKED` | TPAPs / NPCI |
| `DQ-85` | R2 object storage | `BLOCKED` | A Cloudflare dashboard opt-in that asks for a card |
| `DQ-86` | Cloudflare Email Sending | `BLOCKED` | Workers Paid $5/mo + an owned domain |

**Closed (18), detail in `FINDINGS.md`:** `DQ-07` `DQ-22` `DQ-26` `DQ-28` `DQ-31` `DQ-32` `DQ-88` `DQ-89` `DQ-91` `DQ-93` `DQ-94` `DQ-97` `DQ-98` `DQ-99` `DQ-100` `DQ-101` `DQ-102` `DQ-103`

---
## §4 · Walk 1 — `W1-`

**39 items: 3 `OPEN`, 9 `PARKED`, 27 `DONE`.** The cold sweep: an unpopulated app, opened as a first-time user. 38 ids were assigned — W1-38 was never used — and the nineteenth split into two leaves.

| | What | Status | Un-parks when |
|---|---|---|---|
| `W1-28` | *"Component placement comes and goes in a line/section and sizes change — feels broken."* The… | `OPEN` |  |
| `W1-29` | *"Transfer and Income have a bottom line, others don't."* **No divider asymmetry exists in… | `OPEN` |  |
| `W1-32` | The category chip is a `grow` chip with a chevron and may be clipped on the right | `OPEN` |  |
| `W1-11` | A light "additional income" entry | `PARKED` | Weighed against `OV-08` — `/add/quick` already has… |
| `W1-16` | `SC-16` could suggest a top 3 before any spend exists | `PARKED` | Taste, cheap, no urgency |
| `W1-19b` | The policy | `PARKED` | `DQ-25` |
| `W1-24` | *"How is really: through which asset, so we can reduce from it."* This is `DQ-14` restated… | `PARKED` | `DQ-14` |
| `W1-30` | The calculator feels too complex — four operators, a custom keypad, a running total, a… | `PARKED` | You answer what to cut |
| `W1-34` | Settings option grouping and clarity (`SC-06`) | `PARKED` | Taste, cheap, no urgency |
| `W1-35` | Line-item editing could be cleaner (`SC-08`) | `PARKED` | Taste, cheap, no urgency |
| `W1-36` | Colours, view and position on `SC-18` | `PARKED` | Taste, cheap, no urgency |
| `W1-37` | `SC-42` needs a clearer outline | `PARKED` | Taste, cheap, no urgency |

**Closed (27), detail in `FINDINGS.md`:** `W1-01` `W1-02` `W1-03` `W1-04` `W1-05` `W1-07` `W1-08` `W1-09` `W1-10` `W1-12` `W1-13` `W1-14` `W1-15` `W1-19a` `W1-20` `W1-21` `W1-22` `W1-23` `W1-25` `W1-26` `W1-27` `W1-33` `W1-39` `W1-31` `W1-17` `W1-18` `W1-06`

---
## §5 · Sync — `SYNC-F`

**24 items: 24 `DONE`.** `SYNC-F1`–`F12` were written while designing, so a `DONE` there means the wall exists. `F13`–`F24` came from tracing the built code, where four were live defects.

| | What | Status | Note |
|---|---|---|---|

**Closed (24), detail in `FINDINGS.md`:** `SYNC-F1` `SYNC-F2` `SYNC-F3` `SYNC-F4` `SYNC-F5` `SYNC-F6` `SYNC-F7` `SYNC-F9` `SYNC-F10` `SYNC-F11` `SYNC-F12` `SYNC-F13` `SYNC-F14` `SYNC-F15` `SYNC-F16` `SYNC-F17` `SYNC-F18` `SYNC-F19` `SYNC-F20` `SYNC-F21` `SYNC-F22` `SYNC-F23` `SYNC-F24` `SYNC-F8`

---
## §6 · Open debt — `D-`

**11 items: 4 `OPEN`, 2 `DECIDE`, 4 `PARKED`, 1 `DONE`.** Real, evidenced, not blocking the pilot. **Verify a bullet against the tree before acting on it, and delete it the moment it lands.**

| | What | Status |
|---|---|---|
| `D-01` | CRED's `mode` vs `tr` was never isolated | `OPEN` |
| `D-02` | Amazon Pay and WhatsApp were both tested against the same `@kotak` handle | `OPEN` |
| `D-03` | Android UPI is entirely untested | `OPEN` |
| `D-04` | `help.tsx` is a third collapsible | `OPEN` |
| `D-05` | `TransactionRow` never displays pay method | `DECIDE` |
| `D-06` | Transfer has no `DetailChips` | `DECIDE` |
| `D-07` | `budget_group.limit_daily/monthly/yearly` still exist as columns | `PARKED` |
| `D-08` | The sweep has to know *where from*, and give it back to the same place | `PARKED` |
| `D-09` | Named accounts as entities | `PARKED` |
| `D-12` | Import restructure (remainder) | `PARKED` |

**Closed (1), detail in `FINDINGS.md`:** `D-10`

---
## §7 · Known and accepted — `A-`

**11 items: 2 `PARKED`, 9 `DONE`.** Recorded so nobody re-discovers them as bugs. These are decisions, not neglect — `DONE` here means the decision is made, not that the behaviour changed.

| | What | Status |
|---|---|---|
| `A-01` | Three red surfaces stack on every Home open | `PARKED` |
| `A-11` | `expo-file-system` legacy API | `PARKED` |

**Closed (9), detail in `FINDINGS.md`:** `A-02` `A-03` `A-04` `A-05` `A-06` `A-07` `A-08` `A-09` `A-10`

---
## §8 · Parked with no id

Fourteen larger things deliberately not now, each with the trigger that un-parks it — multi-device
sync, App Intents, the widget, mic capture, the unified `SplitEditor`, nearby-friend suggestions,
achievements, and the rest. They carry no
id because none of them is a *finding*; they are scope. Listed in [`FINDINGS.md`](./FINDINGS.md) §8.

---
## §9 · Deferred from V1 — `V-`

**7 items: 2 `DECIDE`, 5 `PARKED`.** Your ideas and asks that were weighed and held back on purpose. The reason and the trigger are in `FINDINGS.md` §9.

| | What | Status | Un-parks when |
|---|---|---|---|
| `V-06` | "Cash last confirmed · Update" on Money | `DECIDE` | You decide it is worth a new stored input |
| `V-07` | The Android port — before V1, or after it | `DECIDE` | You confirm or move the 2026-08-19 order |
| `V-01` | Refunds lower spend | `PARKED` | You ask for it — spec first |
| `V-02` | A hand-logged bill after its automatic occurrence already posted | `PARKED` | It shows up as a real duplicate on the phone |
| `V-03` | Shop names from UPI handles (`razorpay@hdfcbank` → the shop) | `PARKED` | A names source exists |
| `V-04` | Android: open a chosen UPI app directly | `PARKED` | The Android port (`V-07`) |
| `V-05` | AI narration of your month | `PARKED` | A spec and an options pass |

---
## §10 · Built, but easy to forget — no ids

Everything here exists and works today. It is listed because it is reached by a gesture, sits behind a
switch that starts off, or lives one screen deeper than you would look — so it is easy to forget when
testing or describing the app. Where one needs action, the id says where.

| Feature | How you reach it | State |
|---|---|---|
| Scan & Pay — any UPI or merchant QR, pay, then record it | **Long-press the + button**; a one-time hint teaches it | On |
| Request money by QR (push, never a collect request) | Settings → Show my UPI QR · Add → Transfer | On, needs your UPI ID |
| WhatsApp reminder to someone who owes you | The chat icon on their row in Friends, their page, or Upcoming | On, needs their number |
| Voice entry | The mic on Add's amount row | On |
| Hands-free Siri capture | A Siri shortcut already installed opens Add with the phrase | Shortcuts setup retired 2026-09-30; App Intents replace it (§8) |
| Itemized bill — line items, tax, tip, discount | Add → Itemize | On |
| Receipt scan: cloud (Gemini) or on-device | Feature Management → Cloud Receipt Scanning | Cloud on |
| Smart category, learning from your corrections | Add, as you type the note | On |
| Duplicate warning (same amount within a day) | On save, and on a Review commit | On |
| A hand-paid bill counts as its recurring occurrence | Automatic: same kind and category, ±10%, up to 4 days | On |
| Recurring catch-up note | Home, after 30+ days away | On |
| Recurring suggestions | Review, after a commit | On |
| Budget re-plan for the rest of the month | Group → Budget → an over-budget line, if you can edit its budget | On |
| Cover an overspend from goals — asks first, with Undo | Money → Overview, when a month is short | On |
| Surplus sweep into goals | Feature Management → Sweep Surplus Into Goals | **Off** |
| Location tagging | Feature Management → Location Tagging | **Off** |
| Streak | ⚡ count beside your name from 2 days; the calendar card is a switch | **Card off** |
| Face ID lock · privacy screen · hide amounts | Settings | **All off** |
| Asset register — "Moved to / from" | Money → Assets | On, never on a phone |
| Per-group CSV export that re-imports | Group ⋯ → Export as CSV | On |
| Export all data | Insights → Export all data | On |
| Paste import — bank SMS, email alert, GPay text | Import → paste | On |
| Paytm statement import (CSV, xlsx, PDF) | Import | On |
| Review: saved views, bulk actions, focus | Review ⋯ | On, never on a phone |
| Trust per person, and per person per group | A person's page | On |
| Write off what someone owes (stops it covering a raid) | A person's page | On |
| Combine two entries for the same person | A person's page, when names match | On |
| Merge duplicate people after signing in | Settings → Account | On |
| Audit log | Settings → Audit log · group ⋯ → Audit log | On |
| Encrypted backup to a file | Settings → Backup | On |
| Storage — free space, clear caches, delete receipts | Settings → Storage | On |
| Re-pick your setup (the onboarding answer) | Feature Management, top card | On |
| Replay the welcome tour | Settings | On |
| A tapped reminder opens what it is about | Renewal → its rule · daily → Add · backup → Backup | On |
| Long-press for a whole name | Any cut-off row or chip | On |
| Long-press a friend to rename | Friends | On |
| Dev tools — demo data, four personas, erase everything | Settings → tap the version 7× | On for the pilot (`B-01`) |
| UPI link inspector | Long-press Pay | Dev tools only |

---
## §11 · Open from the last pass, and your feedback — `U-`

**64 items: 7 `OPEN`, 1 `BLOCKED`, 1 `PARKED`, 55 `DONE`.** From the 2026-09-30 pass (`SPEC-BUGSCAN.md` Pass 2) and your answers and feedback the same night. Evidence in `FINDINGS.md` §11.

| | What | Status | Default if never decided |
|---|---|---|---|
| `U-02` | Screens reload in full on every focus — measure on the phone | `OPEN` |  |
| `U-09` | Friends: "name missing when I owe" | `OPEN` |  |
| `U-10` | Your phone pass, and the feedback it produces | `OPEN` |  |
| `U-16` | Screens built as stacks of button rows and selection rows, not composed | `OPEN` |  |
| `U-18` | Take Fold as the reference for simple, calm screens — its calculator included | `OPEN` |  |
| `U-19` | The PDF is poor — fix later | `PARKED` |  |
| `U-20` | Spacing is uneven in many places | `OPEN` |  |
| `U-24` | Product analytics (Mixpanel): built, with an opt-out; needs your project token | `BLOCKED` |  |
| `U-31` | Sorting is not right — which lists? (the money card now orders largest first) | `OPEN` |  |

**Closed (55), detail in `FINDINGS.md`:** `U-01` `U-03` `U-04` `U-05` `U-06` `U-11` `U-12` `U-17` `U-21` `U-14` `U-25` `U-26` `U-27` `U-28` `U-29` `U-30` `U-32` `U-15` `U-33` `U-35` `U-36` `U-37` `U-34` `U-38` `U-39` `U-40` `U-41` `U-42` `U-43` `U-13` `U-44` `U-45` `U-46` `U-22` `U-23` `U-07` `U-08` `U-47` `U-48` `U-49` `U-50` `U-51` `U-52` `U-53` `U-54` `U-55` `U-56` `U-57` `U-58` `U-59` `U-60` `U-61` `U-62` `U-63` `U-64`
