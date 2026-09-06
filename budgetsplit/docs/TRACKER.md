# TRACKER.md — what is left

`Last verified: 2026-09-07 · Guarded by: trackerIntegrity.test.ts · countClaims.test.ts · docIdGraph.test.ts`

**178 items, 107 of them still open.** One row each: what it is, and where it stands.
Nothing else.

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
| §1 · Ship blockers | **14** | 18 |
| §2 · Complexity — `OV-` | **19** | 34 |
| §3 · Decisions — `DQ-` | **36** | 40 |
| §4 · Walk 1 — `W1-` | **17** | 39 |
| §5 · Sync — `SYNC-F` | **7** | 24 |
| §6 · Debt — `D-` | **12** | 12 |
| §7 · Accepted — `A-` | **2** | 11 |

---

## §1 · Ship blockers — `B-`

**18 items: 12 `OPEN`, 1 `DECIDE`, 1 `BLOCKED`, 4 `DONE`.** Nothing ships until every one is closed. Order of operations is in `FINDINGS.md` §1 — everything below `B-03` needs a phone.

| | What | Status |
|---|---|---|
| `B-01` | Set `DEV_TOOLS_ENABLED` to `false` | `OPEN` |
| `B-03` | Native rebuild | `OPEN` |
| `B-04` | `EXPO_PUBLIC_API_URL` present wherever release builds run | `OPEN` |
| `B-05` | `EXPO_PUBLIC_RECEIPT_OCR_PROXY_URL` likewise | `OPEN` |
| `B-06` | Confirm demo/seed data is off | `OPEN` |
| `B-07` | Rotate the Brevo API key | `OPEN` |
| `B-08` | Privacy policy + App Store listing | `OPEN` |
| `B-10` | App icon, splash, screenshots | `OPEN` |
| `B-11` | `VOICE_SHORTCUT_URL` is `null` | `OPEN` |
| `B-12` | Device-test Pass 4 | `OPEN` |
| `B-13` | Paste the store copy into App Store Connect and confirm the privacy answers | `OPEN` |
| `B-14` | Run §0a's no-enumeration diff | `OPEN` |
| `B-09` | India DPDP posture | `DECIDE` |
| `B-02` | Buy the Apple Developer Program | `BLOCKED` |

**Closed (4), detail in `FINDINGS.md`:** `B-15` `B-16` `B-17` `B-18`

---
## §2 · Complexity and overlap — `OV-`

**34 items: 8 `OPEN`, 6 `DECIDE`, 5 `PARKED`, 15 `DONE`.** Duplications, overloads and phantoms, each with a verdict. `FINDINGS.md` §2 carries the count, the blast radius and the risk for each.

| | What | Status |
|---|---|---|
| `OV-27` | Three buttons to one destination on one screen | `OPEN` |
| `OV-01` | Nine names for one row | `OPEN` |
| `OV-04` | Seven names over four shapes for a balance | `OPEN` |
| `OV-05` | Person, friend, member, roster member, contact | `OPEN` |
| `OV-18` | `Other` and `Others`, one character apart | `OPEN` |
| `OV-20` | Seven near-identical investment identifiers | `OPEN` |
| `OV-22` | Six vocabularies over daily/weekly/monthly/yearly | `OPEN` |
| `OV-11` | A group has three end states that get conflated | `OPEN` |
| `OV-06` | Categories are referenced by NAME, not by id | `DECIDE` |
| `OV-10` | backOr is used in 5 of 46 route files | `DECIDE` |
| `OV-14` | E-50 is recomputed on every read, with no memo boundary | `DECIDE` |
| `OV-15` | /personal is a stack route pretending to be a tab | `DECIDE` |
| `OV-19` | category_budget.period AND .cadence | `DECIDE` |
| `OV-23` | Dead and near-dead columns | `DECIDE` |
| `OV-02` | kind='settlement' means four different things | `PARKED` |
| `OV-07` | Budget is three concepts, two levels, and three strays | `PARKED` |
| `OV-08` | /add/quick: 11 params, 24 entry points | `PARKED` |
| `OV-17` | The tab bar owns sync, alerts, reconciliation and snapshots | `PARKED` |
| `OV-24` | SC-19 owns twelve sheet states | `PARKED` |

**Closed (15), detail in `FINDINGS.md`:** `OV-12` `OV-09` `OV-25` `OV-28` `OV-29` `OV-30` `OV-31` `OV-32` `OV-33` `OV-34` `OV-26` `OV-03` `OV-13` `OV-21` `OV-16`

---
## §3 · Open decisions — `DQ-`

**40 items: 29 `DECIDE`, 7 `BLOCKED`, 4 `DONE`.** A `DQ-` is a question only you can answer, so every unanswered one is `DECIDE` by definition. The default column is what ships if you never decide.

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
| `DQ-22` | `VOICE_SHORTCUT_URL` is `null` | `DECIDE` | Manual setup only, for a feature most people will not find |
| `DQ-23` | `expo-file-system` legacy API | `DECIDE` | Keep using it until it breaks |
| `DQ-29` | Partial acceptance | `DECIDE` | Binary |
| `DQ-30` | A tracking-only group mode | `DECIDE` | No such mode |
| `DQ-32` | Revocation and re-keying | `DECIDE` | Removal is local |
| `DQ-33` | Ownership: handover, and the group with no admin | `DECIDE` | Neither exists |
| `DQ-24` | Income that lands in an asset is not spendable | `DECIDE` | Every rupee of income counts as spendable |
| `DQ-25` | A person can never be removed, and cannot be archived either | `DECIDE` | The roster only grows |
| `DQ-27` | Should an asset keep a valuation history? | `DECIDE` | One current value per asset |
| `DQ-80` | Paid Apple Developer account, $99/yr | `BLOCKED` | Apple |
| `DQ-81` | Google OAuth **CASA Tier-3** for `gmail.readonly` | `BLOCKED` | Google |
| `DQ-82` | The GPay export format | `BLOCKED` | Google |
| `DQ-83` | An Account Aggregator partner integration | `BLOCKED` | A partner |
| `DQ-84` | UPI hand-off refused by PhonePe, Paytm, Amazon Pay, WhatsApp | `BLOCKED` | TPAPs / NPCI |
| `DQ-85` | R2 object storage | `BLOCKED` | A Cloudflare dashboard opt-in that asks for a card |
| `DQ-86` | Cloudflare Email Sending | `BLOCKED` | Workers Paid $5/mo + an owned domain |

**Closed (4), detail in `FINDINGS.md`:** `DQ-07` `DQ-26` `DQ-28` `DQ-31`

---
## §4 · Walk 1 — `W1-`

**39 items: 7 `OPEN`, 10 `PARKED`, 22 `DONE`.** The cold sweep: an unpopulated app, opened as a first-time user. 38 ids were assigned — W1-38 was never used — and the nineteenth split into two leaves.

| | What | Status | Un-parks when |
|---|---|---|---|
| `W1-06` | More pay methods, and better icons for them | `OPEN` |  |
| `W1-17` | Reports groups are not collapsible (`SC-21`) | `OPEN` |  |
| `W1-18` | Member and group-edit rows read as undesigned (`SC-09`, `SC-11`, `SC-13`) | `OPEN` |  |
| `W1-28` | *"Component placement comes and goes in a line/section and sizes change — feels broken."* The… | `OPEN` |  |
| `W1-29` | *"Transfer and Income have a bottom line, others don't."* **No divider asymmetry exists in… | `OPEN` |  |
| `W1-31` | Tags are already saved for reuse and ranked by frequency, derived from your own rows | `OPEN` |  |
| `W1-32` | The category chip is a `grow` chip with a chevron and may be clipped on the right | `OPEN` |  |
| `W1-02` | Features should adapt to the intent picked at onboarding | `PARKED` | The persona → flag-defaults pass |
| `W1-11` | A light "additional income" entry | `PARKED` | Weighed against `OV-08` — `/add/quick` already has… |
| `W1-16` | `SC-16` could suggest a top 3 before any spend exists | `PARKED` | Taste, cheap, no urgency |
| `W1-19b` | The policy | `PARKED` | `DQ-25` |
| `W1-24` | *"How is really: through which asset, so we can reduce from it."* This is `DQ-14` restated… | `PARKED` | `DQ-14` |
| `W1-30` | The calculator feels too complex — four operators, a custom keypad, a running total, a… | `PARKED` | You answer what to cut |
| `W1-34` | Settings option grouping and clarity (`SC-06`) | `PARKED` | Taste, cheap, no urgency |
| `W1-35` | Line-item editing could be cleaner (`SC-08`) | `PARKED` | Taste, cheap, no urgency |
| `W1-36` | Colours, view and position on `SC-18` | `PARKED` | Taste, cheap, no urgency |
| `W1-37` | `SC-42` needs a clearer outline | `PARKED` | Taste, cheap, no urgency |

**Closed (22), detail in `FINDINGS.md`:** `W1-01` `W1-03` `W1-04` `W1-05` `W1-07` `W1-08` `W1-09` `W1-10` `W1-12` `W1-13` `W1-14` `W1-15` `W1-19a` `W1-20` `W1-21` `W1-22` `W1-23` `W1-25` `W1-26` `W1-27` `W1-33` `W1-39`

---
## §5 · Sync — `SYNC-F`

**24 items: 7 `OPEN`, 17 `DONE`.** `SYNC-F1`–`F12` were written while designing, so a `DONE` there means the wall exists. `F13`–`F24` came from tracing the built code, where four were live defects.

| | What | Status | Note |
|---|---|---|---|
| `SYNC-F8` | Email is the only identity and cannot be changed or merged | `OPEN` |  |
| `SYNC-F15` | Any approved member can push a new version of an entry I authored | `OPEN` |  |
| `SYNC-F16` | Removing a member is local only | `OPEN` |  |
| `SYNC-F17` | The group key is never rotated | `OPEN` |  |
| `SYNC-F20` | A group with no admin is reachable by adoption and unrepairable | `OPEN` |  |
| `SYNC-F22` | `audit_log` has no structured author | `OPEN` |  |
| `SYNC-F24` | Sharing is admin-gated on the client and member-gated on the server | `OPEN` |  |

**Closed (17), detail in `FINDINGS.md`:** `SYNC-F1` `SYNC-F2` `SYNC-F3` `SYNC-F4` `SYNC-F5` `SYNC-F6` `SYNC-F7` `SYNC-F9` `SYNC-F10` `SYNC-F11` `SYNC-F12` `SYNC-F13` `SYNC-F14` `SYNC-F18` `SYNC-F19` `SYNC-F21` `SYNC-F23`

---
## §6 · Open debt — `D-`

**12 items: 6 `OPEN`, 2 `DECIDE`, 4 `PARKED`.** Real, evidenced, not blocking the pilot. **Verify a bullet against the tree before acting on it, and delete it the moment it lands.**

| | What | Status |
|---|---|---|
| `D-01` | CRED's `mode` vs `tr` was never isolated | `OPEN` |
| `D-02` | Amazon Pay and WhatsApp were both tested against the same `@kotak` handle | `OPEN` |
| `D-03` | Android UPI is entirely untested | `OPEN` |
| `D-04` | `help.tsx` is a third collapsible | `OPEN` |
| `D-10` | Migrations are forward-only, applied by hand, with no rollback and no staging | `OPEN` |
| `D-11` | Roster recovery self-heals only while the roster and the entry needing it fall inside one page… | `OPEN` |
| `D-05` | `TransactionRow` never displays pay method | `DECIDE` |
| `D-06` | Transfer has no `DetailChips` | `DECIDE` |
| `D-07` | `budget_group.limit_daily/monthly/yearly` still exist as columns | `PARKED` |
| `D-08` | The sweep has to know *where from*, and give it back to the same place | `PARKED` |
| `D-09` | Named accounts as entities | `PARKED` |
| `D-12` | Import restructure (remainder) | `PARKED` |

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

Twelve larger things deliberately not now, each with the trigger that un-parks it — multi-device
sync, App Intents, the widget, mic capture, the unified `SplitEditor`, and the rest. They carry no
id because none of them is a *finding*; they are scope. Listed in [`FINDINGS.md`](./FINDINGS.md) §8.
