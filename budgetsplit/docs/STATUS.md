# Status — 18 Aug 2026

Where the project actually stands, on one page. Every line links into the
detailed doc rather than restating it.

- Detail on anything pre-launch → [`V2_LAUNCH_CHECKLIST.md`](./V2_LAUNCH_CHECKLIST.md)
- What each screen does → [`FEATURES_AND_FLOWS.md`](./FEATURES_AND_FLOWS.md)
- Known debt with evidence → [`DEBT_TRACKER.md`](./DEBT_TRACKER.md)
- The device walkthrough → [`UI_UX_SWEEP.md`](./UI_UX_SWEEP.md)
- The pre-pilot consistency pass → [`PILOT_READINESS_REVIEW.md`](./PILOT_READINESS_REVIEW.md)

---

## Live now — deployed and verified

| What | Where | How it was verified |
|---|---|---|
| **Accounts + backup API** | `budgetsplit-api.budgetsplit.workers.dev` | `/health` → `{"ok":true,"mail":"brevo","storage":"kv"}` |
| Sign-in by email link | Cloudflare Worker + D1 | Real email delivered; `magic_links` row confirmed in D1, unused, 15-min expiry |
| Backup upload / download / delete | Worker + KV | Round-trip against the live server: downloaded blob **byte-identical** to what was uploaded |
| Profile + linking endpoints | Worker + D1 | `PATCH /me` normalised a phone; invite minted; session dead after logout |
| Receipt OCR proxy | `receipt-ocr-proxy.budgetsplit.workers.dev` | Live since July; re-checked today |
| App test suite | `budgetsplit/` | **97 suites / 1517 tests**, `tsc --noEmit` clean in app *and* Worker |

Cost: **₹0**. Workers, D1 and KV are free-plan; email is a free-tier HTTP
provider. No card on file anywhere. See [`server/api/README.md`](../../server/api/README.md).

## Built, not yet seen on a device

Everything below is committed on `feat/accounts-and-identity` (11 commits, **not
pushed**) and has never rendered on a phone. This is what
[`UI_UX_SWEEP.md`](./UI_UX_SWEEP.md) Block A exists to check.

- Account screen, linked people, invite link/QR, sign-in landing
- Server backup/restore rows in Backup & restore
- Goals as three Emergency/Need/Want sections, with the tag driving funding *and* raid order
- "Can I Afford This" — real upcoming bills, purchase frequency, owed-to-you line
- Attachment reaper, bundled pdf.js, dev-screen gate, Review banner fix, Transfer sheet move

**Plus everything on `feat/pre-pilot-consistency`** (see
[`PILOT_READINESS_REVIEW.md`](./PILOT_READINESS_REVIEW.md)) — none of it device-tested:
- **Home's hero now leads with Safe-to-Spend**, the single biggest visual change
- **Health score rebuilt** on four equal-weighted pillars with a minimum-data gate; new
  users see a locked ring and an unlock checklist instead of a manufactured 59/100
- **Onboarding rebuilt** — 9 stages, every answer visibly lands somewhere, real group
  creation, honest summary in place of the fake commit wait
- **Card-bill payment** on the Plan money card (`creditUsed` can finally go down)
- Recurring on one skip-aware, my-share basis; afford fed all groups and every occurrence

**Blocked on one thing:** a native rebuild.
`npx expo prebuild --clean && npx expo run:ios` — `expo-secure-store` is a new
native module, so the current binary crashes at launch without it (now
[handled gracefully](../src/lib/serverApi.ts), but the feature still needs the rebuild).

## Deferred — with the reason, and what would un-defer it

| Item | Why it's parked | Un-defers when |
|---|---|---|
| **Multi-device sync (S2)** | Only `txn` has `updated_at`/`is_deleted`; 9 tables have neither, so it opens with a migration across every write path | You want it enough to spend weeks — plan and pre-mortem are in §6b |
| **Shared groups (S3)** | Hardest rung: identity merging + multi-writer money | S2 is running and boring |
| **Per-method money baselines** | Money-correctness risk; deserves its own reviewed pass | Next money-model pass. Card repayment **landed 2026-08-18**; accounts-as-entities and investments-as-transfer are still waiting with it |
| **Monetisation** | A tier boundary drawn before anyone uses the app is a guess | After the pilot |
| **Widget** | Scope genuinely undecided — balance? today's spend? quick-add? | You answer that, and Gate 0 clears |
| **WhatsApp composer** | Framing decided, phone field already shipped; only the compose step is left | Any time — it's small |
| **Goals surplus sweep** | Scoped as opt-in, sized L | Any time |
| **R2 object storage** | Needs a dashboard opt-in that can ask for a card; KV covers it | You want backups with receipt photos >25 MiB |
| **Cloudflare Email Sending** | Workers Paid ($5/mo) + a domain you own | Deliverability from a Gmail sender becomes a problem |
| **CASA / Account Aggregator** | Dropped for the pilot, not deferred | Going properly public |

## Pending — by owner

**You (10 minutes)**
- Rebuild the app, then walk [`UI_UX_SWEEP.md`](./UI_UX_SWEEP.md) Block A
- Rotate the Brevo API key (it was pasted into a chat transcript)
- Say the word to `git push` — 11 commits are local-only

**You (real work)**
- Privacy policy + India DPDP posture — **newly sharp**: a server now holds email addresses
- App icon, splash, screenshots — never audited
- Confirm `EXPO_PUBLIC_*` are set wherever release builds actually run

**Your Apple account ($99, "Gate 0")**
- Push notifications, App Intents, in-app mic, widget, TestFlight itself

**Your phone**
- UPI on Android (never run), Google Pay on iOS (never tested), 5 unverified iOS URL schemes
- `emvQr.ts` against a real QR, `en-IN` dictation, Review's saved views
- Everything in "Built, not yet seen on a device" above

**Me, on your word**
- Card repayment + investments as Transfer destinations *(decided today; largest remaining money-model gap)*
- WhatsApp reminder composer
- Fixes from your sweep feedback

## Decisions closed today

Recorded with their reasoning in §6b and §2 of the checklist, so they don't get
reopened from memory: phone unverified · **no username, no directory** — invite
link/QR only · sender approves the claim · a friend's local number wins ·
per-data-type sync · sync among joined members · conflicts rejected, never
silently merged · receipts never sync · restore refused while sync is on ·
card repayment and investments become Transfer destinations · monetisation
parked · D3 (health engine) closed as already-resolved.

Also recorded: a **nine-item pre-mortem** (F1–F9) of ways this design could go
wrong, each with the wall that stops it. The sharpest — the `settings` table
holds one-time migration flags, so syncing it wholesale would make a device skip
a migration and record it as done.
