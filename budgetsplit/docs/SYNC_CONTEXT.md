# Sync, backup and restore — copy-paste context

Paste this whole file into a fresh session to work on sync, backup, restore or the
database without re-deriving any of it. Everything here is checked against the code,
not remembered.

**Stack:** Expo SDK 56 / RN 0.85, expo-router. Local-first SQLite (`expo-sqlite`).
Server is a Cloudflare Worker + D1 + KV at `server/api`, deployed to
`https://budgetsplit-api.budgetsplit.workers.dev`. Money is **integer paise**, always.

---

## 1 · The one rule everything else serves

> **The group ledger records what happened. Your personal ledger records what it
> cost you.** They are separate, and only you write the second one.

An entry takes effect immediately for whoever created it, and **waits for approval
from everyone else it touches**. You can always make yourself worse off, never
someone else.

A peer entry lives in `txn`. Its approval state lives in `txn_approval`. It is
**shown in the group ledger while it waits** and moves none of your numbers until
you accept it.

---

## 2 · Local schema (20 tables)

```
person · budget_group · group_member · person_group_trust
category · category_tombstone · category_budget
txn · txn_share · txn_payment · txn_approval · txn_dispute · line_item · recur_skip
savings_goal · savings_txn · pending_txn · audit_log · settings · sync_outbox
```

Sync-relevant columns and tables:

| Thing | Purpose |
|---|---|
| `txn.sync_version` | Version for compare-and-set. 1 = create; higher replaces exactly its predecessor. |
| `txn.author_person_id` | Who wrote it. `NULL` = me. |
| `txn.source` | `'peer'` for entries that arrived over sync. |
| `person.remote_uid` | Binds a local person to a **server account**. Written by exactly one thing: matching on Linked people (`setRemoteUid`). |
| `person.trust_state` | `'trusted'` \| `'review'`. Global. |
| `person_group_trust` | Per-person, per-**group** override. Absent = the global answer. |
| `txn_approval` | My decision about *their* entry. Also carries `dispute_state`, a one-column outbox. |
| `txn_dispute` | *Their* objection about **my** entry (F10). The mirror image. |
| `sync_outbox` | Delivery queue. Only shared-group entries — enforced **in the SQL**. |

⚠️ **`settings` is a key-value table** and also holds sync cursors
(`sync.cursor.<groupId>`), roster flags (`sync.roster.dirty.<id>`,
`sync.roster.version.<id>`) and one-time migration markers (`fix_*`).

---

## 3 · Sync architecture

### Keys

1. **Device identity** (`src/lib/deviceKey.ts`) — 32 random bytes in the keychain,
   which *are* the X25519 private key. Public key = the curve point. `deviceId` is
   hash-derived and separate: an identifier, not a credential.
2. **Group key** (`src/lib/groupCrypto.ts`) — 256 bits per shared group, wrapped
   **per device** using ephemeral-static X25519 (throwaway keypair per wrap → ECDH →
   SHA-256 → AES key). Per device, not per person: a key wrapped to a person cannot
   be opened by their second phone.
3. **Entries** are sealed AES-256-GCM with the group key.

**AAD binding** is `{groupId, entryId, version}`, length-prefixed. Encryption stops
the server *reading*; the AAD stops anyone *moving* an entry — replaying a cheap
blob over an expensive one, or re-serving an old version as current.

### The roster — how a group arrives at all

Travels as an **ordinary sealed entry** under the reserved id `__roster__`. It
therefore inherits versioning, CAS, AAD and encryption, and **the server needs no
change and learns no names**.

`adoptGroup` applies three rules in order:
1. A local person carrying that `remote_uid` **is** them — nothing created.
2. Otherwise **adopt the publisher's person id as the primary key** — that is the id
   their entries name. A fresh uuid would leave entries referencing nobody.
3. A new row whose name matches somebody already here is **reported, never merged**
   (`NameCollision` → a prompt → `mergePerson`).

Republished on every membership change, member rename or group rename
(`markRosterDirty` → `dirtyRosters` → `drainRosters`, which runs **before** the entry
drain).

### The loop (`src/lib/syncEngine.ts`, `runSync`)

```
reconcileVanished → drainRosters → drain → drainDisputes → pullAll
```

`SyncOutcome = { pushed, pulled, conflicts[], vanished[], collisions[], changed, skipped? }`

`skipped` ∈ `disabled` | `not-configured` | `no-device-key` | `signed-out` | `offline`.

**`runSync` never throws.** A background sync must not put a dialog in front of
someone who did not ask for one. The cost is that silently doing nothing looks
identical to working — which is what Settings → Sync → **Sync activity**
(`app/settings/sync-log.tsx`) exists to repay.

### Two modes

| Switch | What travels | Conflict model |
|---|---|---|
| **Keep shared groups in sync** | Entries in shared groups only | Per-entry compare-and-set; `409` on stale |
| **Keep a copy of everything** | Whole-DB encrypted snapshot (`syncSnapshot.ts`), ≥6h apart | Newest-wins, and the UI says so |

---

## 4 · Invariants — breaking any of these loses money

- **Only shared groups are ever queued.** Enforced inside `queueEntry`'s SQL
  (`WHERE EXISTS (… is_personal = 0)`), never at call sites — a writer that has to
  remember cannot be relied on to.
- **Nothing awaiting my approval is broadcast.** `NOT_AWAITING_APPROVAL`
  (`db/queries/approvalSql.ts`); `approvalInvariant.test.ts` reads the real SQL and
  fails on any new statement over `txn` that neither carries it nor is allowlisted
  with a reason.
- **Delivery is at-least-once.** Forget an entry only *after* the server accepts it.
- **Never silent last-write-wins on money, and never an auto-merge.** A `409` returns
  the current row for a human to resolve.
- **A transfer that NAMES ME always needs approval**, however much you trust the
  sender, in every group. No per-group override may waive it: an incoming transfer
  fails for reasons neither party controls, and *"I paid you ₹5,000"* erases a real
  debt in the same write. `touchesMe` is the boundary and it is deliberate — a
  settlement between two *other* people moves none of my money (only which of them
  `simplify()` suggests I pay, which re-derives on every read), so it follows the
  ordinary trust rule instead.
- **`remote_uid == null` ⇒ inert.** No account, no write path. Checked *before* any
  trust or override.
- **Approval must never live on `txn_share` / `txn_payment`** — both are DELETEd and
  re-INSERTed on every edit, so an ordinary edit would erase the decision.
- **The pull cursor only advances over what it could handle** (§6).

---

## 5 · Backup and restore

- **Cipher v2** = AES-256-GCM + PBKDF2-SHA256 at `KDF_ITERATIONS = 50_000`, fresh
  salt per backup, cost stored in the envelope. **v1 (crypto-js AES-CBC, one MD5
  round) stays readable forever** — there is no re-encryption pass.
- `canReadCipher()` is the **single** source of truth for "can this build open it",
  used by the decryptor and both pick-time guards. A copy of that list once said
  v1-only while writes were v2 — restore was dead for everyone.
- **PBKDF2 yields to the event loop** (`src/lib/pbkdf2.ts`) so it does not freeze the
  screen. Output is **byte-identical to `CryptoJS.PBKDF2`**, asserted against CryptoJS
  itself — a one-byte drift would not fail loudly, it would tell users their
  passphrase is wrong for a file that is fine.
- **The passphrase is never sent.** For unattended snapshots it lives in the device
  keychain; a fresh device asks the human.
- `BACKUP_TABLES` is FK-ordered (parents first); restore DELETEs in reverse and
  INSERTs forward, with `foreign_keys=OFF` during and ON after.
- `NEVER_BACKED_UP` documents deliberate exclusions. **`backupCoverage.test.ts`
  fails if any schema table is in neither list**, and checks FK ordering.
- Restore is **refused while sync is on** (F9) — it would push a snapshot over
  everyone else's copy.
- `restoreOffer.ts` offers a restore at launch **only on a phone with no
  transactions**. That rule is what makes an unasked wipe-and-replace prompt safe.

---

## 6 · Traps that have actually bitten

1. ⛔ **Backticks inside the `SCHEMA` template literal terminate the string.** Use
   `--` comments with no backticks. Hit three times.
2. **The pull cursor.** Advancing over an entry that could not be resolved leaves it
   *behind the cursor forever* — fetched once, dropped, never seen again. Failures
   are split:
   - *Permanent* (bad seal, unbalanced, stale, my own) → cursor advances.
   - *Recoverable* (unresolvable person, `not-a-member`) → **cursor holds**, group
     stops. The retry re-fetches; a republished roster carries a newer timestamp so
     it lands in the same page; rosters apply before entries; the entry succeeds.
   - ⚠️ Bound: self-heals only while roster and entry fall within one page (200).
3. **Rosters are applied before entries within each page**, and the person resolver
   is rebuilt **per entry** — a roster earlier in the same page may have just created
   the people a later entry names.
4. **Two RN `<Modal>`s presented at once on iOS** leave an invisible view that eats
   every touch. `SheetModal` keeps its child mounted 240ms after closing, so swapping
   sheets overlapped and froze the app. `src/lib/sheetStage.ts` makes a sheet claim
   the stage and evict the rest.
5. **`expo-sqlite` cannot nest transactions.** `withTransactionAsync` is *deferred*;
   restore uses `withExclusiveTransactionAsync`.
6. **Two DB connections exist** — the root layout's and `SQLiteProvider`'s. A restore
   holds one exclusively; `restoreGuard.ts` stops foreground maintenance writing on
   the other.
7. **Native modules are lazily `require`d and cached** (`serverApi`, `deviceKey`,
   `syncSnapshot`). A top-level import once crashed the app at launch.
8. **Device identity is rebound per account** (`bindDeviceToAccount`) — otherwise a
   phone that changes hands can never sync again, because the server refuses to let
   one account overwrite another's device key.

---

## 7 · Server (`server/api`)

Migrations `0001_init` · `0002_profile` · `0003_links` · `0004_sync` ·
`0005_sync_limits` · `0006_disputes` · `0007_link_end` · `0008_friend_requests` ·
`0009_backup_kind` · `0010_account_deletion`.
**Forward-only, by hand, no rollback.**

Tables: `users` `magic_links` `sessions` `backups` `invites` `links`
`device_key` `sync_group` `sync_member` `sync_wrap` `sync_entry` `sync_dispute`
`friend_request` `friend_block`

| Route | Notes |
|---|---|
| `DELETE /me` | Close the account. Scrubs the identity, deletes every session, device key, wrap and backup blob; **does not** delete entries in shared groups — they are the group's record, not the account's. Membership ends, live links are tombstoned with `ended_by`. |
| `POST/GET /friend-requests`, `/:id/accept` \| `/decline` \| `DELETE` | Addressed by email. **Always `202`**, never `429` — a differing response is the directory this design refuses to be. |
| `POST/GET /sync/devices` | Register / look up public keys. Refuses a device id owned by another account. |
| `GET/POST /sync/groups` | List (reports `deleted`/`removed`, does not hide them) / publish |
| `POST /sync/groups/:id/members` \| `/join` \| `/leave` | Invite, accept, leave |
| `DELETE /sync/groups/:id` | Owner only. Tombstone, not a DELETE. |
| `PUT/GET /sync/entries` | **CAS on version**, `409` returns the current row. 500/account/hour. |
| `PUT/GET /sync/disputes` | Objections, own cursor |

- **KV** holds blobs (backups, avatars); 25 MiB/value, ~1k writes/day. R2 is
  preferred when bound, with KV as a **read fallback that promotes on read**.
- No directory: device keys readable only for someone already linked.
- Auth is opaque bearer sessions; sign-in is a magic link.

---

## 8 · Known gaps (deliberate or recorded)

- **Receipt photos never sync** (F4). A restore nulls a URI it cannot honour.
- **Itemized line items do not sync.** Totals and shares are correct — *the money is
  right* — but the per-item breakdown is not on `EntryDoc`, so the other phone shows
  one expense. Cosmetic, not financial.
- **Budgets, goals, money profile** are personal; they travel only in the snapshot.
- **F5 is not the live defect it was recorded as.** The note said `seed.ts` could
  mint two `is_me` rows; no path actually does, so the `ambiguous-me` count check
  guards something unreachable. The producible shape was the opposite one — a
  SECOND row carrying your uid with `is_me = 0`, minted by `adoptGroup` before
  your own row could hold a uid — which a count of `is_me` rows cannot see.
  `claimMyAccount` handles it directly: it looks for that holder and merges it
  into the `is_me` row before binding. The count check stays as a refusal, since
  guessing which of two selves you are is worse than stopping.
- **F8 half-open**: no change-email / merge flow.
- **A closed account's shared entries stay.** `DELETE /me` scrubs the identity and
  destroys every key, but `sync_entry` rows they authored survive under an opaque
  id. That is deliberate — see `0010_account_deletion.sql` — and it is the same
  rule removal follows everywhere: it ends a relationship, never a record. Their
  own devices can no longer read those groups, because the wraps are gone.
- **CSV exports carry a `Direction` column** (`GROUP_EXPORT_HEADER`). Files written
  before it still import, via `GROUP_EXPORT_HEADER_V1`, and fall back to inferring
  direction from the kind — which is right for everything except an inbound
  settlement, and that is the best those files can support.
- **Never run on a phone.** Everything is verified against the deployed Worker or by
  tests. That is not the same thing.

---

## 9 · Where things live

```
src/lib/        deviceKey · groupCrypto · syncEngine · syncSnapshot · restoreOffer
                backup · backupStatus · restoreGuard · pbkdf2 · trust · bytes · sheetStage
src/db/queries/ syncDoc · syncOutbox · peerIngest · approval · backup · approvalSql
app/settings/   sync · sync-log · backup · account · linked
server/api/     index.ts · lib.ts · storage.ts · types.ts · migrations/
docs/           FEATURES_AND_FLOWS.md §13 · RELEASE_CHECKLIST.md §0
```

`ingestPeerTxn` refusals: `unknown-author` `author-is-me` `ambiguous-me`
`not-a-member` `personal-group` `unbalanced` `stale`.

**Verify:** `cd budgetsplit && npx tsc --noEmit && npx jest --runInBand`
(1867 tests, 131 suites). Server: `cd server/api && npx tsc --noEmit`.
