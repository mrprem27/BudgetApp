# SYNC-AUDIT-2026-09 — what the sync layer actually is, read from the code

> **§0–§6 written 2026-09-24 (`T18`), §7 added the same session (`T19`).** §0–§6 trace the sync
> architecture as it exists in the tree today — not a design document. Every claim in them cites a
> `file:line` and was read from the source in this session — none of it is carried over from
> `SYNC-MODEL.md`, `TRACKER.md` or a prior attempt, because the prior attempt's findings were lost
> (see the checkpoint memory this session resumed from). Where §0–§6 disagree with `TRACKER.md` §5,
> that disagreement is called out explicitly in §5, and `TRACKER.md` is not edited here — this
> file's job is to say what is true, per `SPEC.md` §7's file scope.
>
> §7 is `T19`, a proposed server-side model. **§8 records the decision (2026-09-24): option B, not
> the recommended A.** **FROZEN 2026-09-24.** A record of what the sync layer was and why it was
> replaced. Never edited to keep a test green. Live successor: `SPEC-SERVER.md`, then the rewritten
> `docs/SYNC-MODEL.md`.

---

## 0 · The shape of it, in one paragraph

Sync is end-to-end encrypted, per-shared-group, at-least-once, pull-on-open. The server (`server/api`,
a Cloudflare Worker over D1) is a **blind, ordered mailbox**: it stores ciphertext it cannot open,
decides who may read which group's mailbox, and enforces optimistic concurrency on a version number
it can see but not interpret. Every decision about *whether an incoming entry counts as your money* —
trust, approval, balance validation — happens **on the receiving device**, in `ingestPeerTxn`
(`src/db/queries/peerIngest.ts`), never on the wire and never on the server. `src/lib/syncEngine.ts`
is the transport; it "decides nothing about money" (its own header comment, line 35).

---

## 1 · Entities

### 1.1 Client (SQLite, on-device — `src/db/schema.ts`)

| Table | Key columns | What it's for |
|---|---|---|
| `person` | `id`, `is_me`, `remote_uid`, `email`, `trust_state` (`'trusted'\|'review'`, default `review`), `trust_state_at` | One row per human the ledger knows about. `remote_uid` is the binding to a server account — the only thing that makes a person reachable by sync (`src/lib/trust.ts:42`). `is_me` marks exactly one row as this device's own identity. |
| `person_group_trust` | `person_id`, `group_id`, `trust_state` | The per-person, per-group override (`schema.ts:403-406`). Absent → falls back to `person.trust_state`. Never a group-level switch — `AGENTS.md` §13. |
| `budget_group` | `id`, `is_personal`, `is_archived`, `simplify_debt`, `default_split`, `created_by` | `is_personal = 1` groups never sync (`peerIngest.ts:147`). `created_by` is set once, never overwritten, and is the sole basis for admin rights on a group with no resolvable roster history (`db/queries/permissions.ts`, `syncDoc.ts:803-806`). |
| `group_member` | `group_id`, `person_id`, `role` (`'admin'\|'member'`), `deleted_at` | Soft-deleted on removal/leave — the row survives so a removal can be *carried* by the next roster (`syncDoc.ts:440-448` comment). |
| `txn` | `id`, `group_id`, `kind`, `author_person_id` (NULL = me), `sync_version`, `is_deleted`, `source` (`'peer'` for ingested rows) | The shared ledger row. `sync_version` is compared against the server's version on push and against the incoming envelope's `version` on ingest (`peerIngest.ts:205`). |
| `txn_payment` / `txn_share` | `txn_id`, `person_id`, `amount` | Deleted and re-inserted wholesale on every edit — including a peer edit (`peerIngest.ts:317-318`) — which is exactly why approval cannot live on these tables (`AGENTS.md` §13). |
| `txn_approval` | `txn_id`, `state` (`'pending'\|'approved'\|'rejected'`), `pending_delete`, `dispute_state`, `decided_at`, `landed_pay_method` | My decision about someone else's entry. Absence of a row for an applied entry means "never needed to ask" — a row is created only when the entry waits, or a retraction/rejection needs a durable record (`peerIngest.ts:365-392`). |
| `txn_dispute` | `txn_id`, `by_uid`, `version`, `created_at`, `cleared` | An objection *about my entry*, told to me by the server. Never edits the entry (`syncDoc.ts:365-378`). |
| `sync_outbox` | `entry_id`, `group_id`, `queued_at` | The push queue. Only entries I authored and am not currently waiting on approval for are ever queued — enforced in the `INSERT` itself (`db/queries/syncOutbox.ts:70-85`), not trusted to callers. |
| `settings` (keyed rows) | `sync.cursor.<groupId>`, `sync.cursor.<groupId>#disputes`, `sync.roster.dirty.<groupId>`, `sync.roster.version.<groupId>` | Per-group pull cursors and the roster's own dirty flag/version counter, piggy-backed on the generic `settings` k/v table (`syncDoc.ts:210-240`, `834-892`). |
| *(keychain, not SQLite)* | device secret, device id, device "owner" (account id) | This device's sync identity — see §2. Never in the app database (`src/lib/deviceKey.ts`). |

### 1.2 Server (D1 — `server/api/migrations/0004_sync.sql`, `0005`, `0006`)

| Table | Key columns | What it's for |
|---|---|---|
| `device_key` | `device_id` PK, `user_id`, `public_key`, `label`, `seen_at` | One row per device per account. `public_key` is the X25519 public half; the server never sees the private half. |
| `sync_group` | `id` PK (the **client's** uuid — adopted, not minted), `owner_user`, `deleted_at` | A tombstone column, never a hard delete (`0004_sync.sql:43`). |
| `sync_member` | `(group_id, user_id)` PK, `state` (`'pending'\|'approved'`), `removed_at` | The membership/access table. `'pending'` grants nothing — every read/write gate checks `state = 'approved' AND removed_at IS NULL` via `approvedMember` (`server/api/index.ts:1443-1450`), one function for every route. |
| `sync_wrap` | `(group_id, device_id)` PK, `wrapped_key` | The group key, wrapped per device. The server stores and serves these; it cannot open one. |
| `sync_entry` | `(group_id, entry_id)` PK, `version`, `ciphertext`, `author_user`, `is_deleted`, `updated_at` | One row per entry, current version only — no history table. `version` is the only cleartext field that describes the payload at all. |
| `sync_dispute` | `(group_id, entry_id, by_user)` PK, `version`, `created_at`, `cleared_at` | One row per objector per entry — a second rejection updates it rather than piling up. |

Not sync tables, but load-bearing for the flows below: `users`, `sessions` (`0001_init.sql`), `link`
(`0003_links.sql`, `0007_link_end.sql`) and `friend_request` (`0008_friend_requests.sql`) — a group
can only be shared with someone you're already **linked** with (`inviteSyncMember`,
`index.ts:1663-1665`; `listDeviceKeys`, `index.ts:1416-1418`). Linking itself is out of this audit's
scope; it is a prerequisite, not one of the 7 flows.

---

## 2 · Keys and crypto (`src/lib/deviceKey.ts`, `src/lib/groupCrypto.ts`)

- **Device identity**: 32 random bytes generated once per install, held only in the platform
  keychain (`deviceKey.ts:47-57`). Those bytes double as an X25519 private key — the curve clamps
  them itself. The device id is `sha256("id:" + secret)`, truncated — an identifier, not a
  credential (`deviceKey.ts:71-86`).
- **Account binding**: `bindDeviceToAccount` (`deviceKey.ts:104-117`) ties this device identity to
  the signed-in account and resets it (mints a fresh identity) only on a genuine change of owner —
  the fix for a phone changing hands (see its own long comment). `claimMyAccount`
  (`db/queries/persons.ts:203-239`) does the equivalent binding at the ledger level: it sets
  `person.remote_uid` on the `is_me` row and merges any phantom row that was minted before the bind
  existed.
- **Group key**: 32 random bytes, minted once by whoever first shares the group (`newGroupKey`,
  `groupCrypto.ts:24-26`). **Never rotated, ever** — see F17 in §5.
- **Wrapping** (`wrapGroupKey`/`unwrapGroupKey`, `groupCrypto.ts:42-79`): ephemeral-static X25519.
  A throwaway keypair is minted per wrap, ECDH'd against the recipient device's public key, hashed
  (SHA-256) into an AES key, and used to AES-256-GCM-encrypt the group key. One wrap per
  `(group, device)` pair — a key wrapped to a person cannot be opened by their second phone.
- **Sealing an entry** (`sealEntry`/`openEntry`, `groupCrypto.ts:105-157`): AES-256-GCM with the
  group key, and **`(groupId, entryId, version)` as additional authenticated data** — covered by
  the tag, never encrypted, which is what lets the server compare-and-set on `version` while unable
  to read the entry, and is also what makes a sealed blob non-transplantable: it cannot be replayed
  under a different id or an older version and still decrypt.

The server never holds a group key, an unwrapped key, or a device secret. What it holds: `device_key.
public_key` (useless without the matching private half) and `sync_wrap.wrapped_key` (useless without
the recipient device's private half). This is the concrete basis for `SYNC-MODEL.md`'s "the server
cannot read a single entry" claim, and it checks out.

---

## 3 · The seven flows, traced to the code

### Share — `shareGroup` (`syncEngine.ts:561-656`)

1. Permission check: sharing is granting membership, gated on `canAddMember` = `isAdmin`
   (`syncEngine.ts:585-587`, `permissions.ts:100`).
2. Fetch both sides' registered devices (`listDeviceKeys`, twice — mine and theirs,
   `syncEngine.ts:590-593`). Refuses with `no-devices` if the invitee has an account but has never
   registered a device (`:600`).
3. **Key reuse, not a fresh mint**: if the group is already published, this device unwraps its own
   existing copy of the key rather than calling `newGroupKey()` again (`:618-628`) — the comment
   there documents the exact bug this fixed (a second share used to mint a key nobody else could
   open).
4. `publishSyncGroup` (server: `index.ts:1461-1517`) — creates `sync_group` + an `'approved'`
   `sync_member` row for the owner, on first publish; on a re-publish it's a no-op on the group row
   but **still re-runs the wraps** (`:1476-1490`), which is what lets a reinstalled owner-device
   recover a wrap.
5. `inviteSyncMember` (server: `index.ts:1649-1680`) — creates a `'pending'` `sync_member` row and
   the invitee's device wraps. Gated only on `approvedMember` (**any** member, not admin) — this is
   half of `SYNC-F24`, see §5.
6. The roster is pushed as a sealed entry at a reserved id (`pushRoster`, `syncEngine.ts:666-683`) —
   without it every entry the invitee later pulls is refused as `not-a-member`.

### Join — `acceptGroupInvite` (`syncEngine.ts:757-764`) / `joinSyncGroup` (server: `index.ts:1683-1694`)

Client-side this is one call. Server-side it's a single guarded `UPDATE ... WHERE state = 'pending'`
for the caller's own `user_id` — nobody can accept on someone else's behalf, and accepting twice is
a no-op (`meta.changes !== 1` → 404). The group's entries are **not** transferred here; they arrive
on the very next ordinary pull, because a cursor of zero already means "everything"
(`syncEngine.ts:755`).

### Push — `drain` (`syncEngine.ts:257-319`)

1. `pendingUploads(db, sendableGroupIds)` (`syncOutbox.ts:140-152`) — bounded to 50 rows per drain,
   and filtered to groups this device currently holds a key for, so an unshared group's backlog
   cannot starve a shared one (the fix for the old `SYNC-F18`).
2. `readEntryDoc` (`syncDoc.ts:120-163`) rebuilds the wire document from `txn`/`txn_payment`/
   `txn_share`, claiming `sync_version + 1` as the version to push.
3. `sealEntry` with the group key and the `(groupId, entryId, version)` AAD (§2).
4. `pushSyncEntry` → server `pushEntry` (`index.ts:1709-1773`): membership check, a
   **per-account rate limit** (`SYNC_WRITES_PER_WINDOW` in the last hour, `:1734-1740` —
   the *only* rate-limited sync write route, noted in its own comment at `:1340-1345`), then a
   guarded `INSERT ... ON CONFLICT DO NOTHING` for v1 or `UPDATE ... WHERE version = ?` for an edit
   — classic compare-and-set, `meta.changes` tells the caller who won.
5. On success: `markSynced` then `markDelivered`, in that order, so a crash between the two re-sends
   an already-accepted entry (refused as stale) rather than silently dropping one that failed.
6. On `409`: the entry **stays queued**, its id is reported as a conflict, and the following pull
   is what brings the winning version in — never merged, never resolved automatically
   (`syncEngine.ts:300-311`).

### Pull — `pullAll` (`syncEngine.ts:419-529`) / `pullEntries` (server: `index.ts:1785-1814`)

1. Per-group cursor read (`sync.cursor.<groupId>`), bounded to 5 pages per sync
   (`MAX_PULL_PAGES`, `:433,539`).
2. **Roster entries in the page are applied before any other entry** (`:444-453`) — an entry naming
   an unknown person is refused, so the person has to arrive first.
3. Each remaining entry: `openEntry` (bad seal → advance the cursor past it, *permanent* failure,
   `:484`), then `personResolver` + `toPeerEnvelope` (unresolvable person → **stall**, cursor holds
   *before* it, `:492` — *recoverable*, heals itself once the roster lands), then `ingestPeerTxn`
   (§4). `not-a-member` from ingest is treated the same as unresolvable — also a stall.
4. Disputes are pulled **after** all entries, on their own cursor (`disputeKey`, `:537`) — applying
   an objection before the version it names has arrived would file it against a figure this device
   has not seen yet.

### Approve — `ingestPeerTxn` (arrival-side default) + `approval.ts` (user-triggered decision)

- **On arrival**, `requiresMyApproval` (`trust.ts:100-114`) decides `applied` in one of three ways:
  not my money → never waits; a payment/settlement naming me → always waits, whatever the trust
  setting; otherwise → `appliesImmediately` (trust). An occurrence of an already-accepted recurring
  rule is a fourth, narrower path that skips asking again (`peerIngest.ts:254-260`).
- **When it doesn't apply immediately**, a `txn_approval` row is written with `state = 'pending'`
  (`peerIngest.ts:382-387`), and the entry is visible in the group ledger but excluded from every
  money figure via `NOT_AWAITING_APPROVAL` (`db/queries/approvalSql.ts`, enforced by
  `approvalInvariant.test.ts` reading real SQL).
- **The user's decision**: `approveTxn` / `rejectTxn` / `reopenApproval` (`approval.ts:67-223`).
  Approving a **retraction** (`pending_delete = 1`) applies the delete; approving an ordinary pending
  entry just flips `state`. Rejecting queues a `dispute_state = 'raise'` row, which `drainDisputes`
  (`syncEngine.ts:403-416`) turns into a server-side objection the author will see.

### Remove — `removeMemberFromGroup` (`db/queries/persons.ts:427-465`)

Permission-checked (`canRemoveMember` refuses the creator, always), then **entirely local**:
`UPDATE group_member SET deleted_at = ...`, an audit row, and `markRosterDirty`. There is **no server
call anywhere in this function**, and no server route exists to remove someone else's `sync_member`
row — the only server-side membership-ending routes are `leaveSyncGroup` (self) and
`deleteSyncGroup` (owner, whole group). This is `SYNC-F16`, confirmed exactly as filed (§5).

### Leave — `announceGroupExit(mode: 'leave')` (`syncEngine.ts:732-748`) / `leaveSyncGroup` (server: `index.ts:1908-1923`)

1. `publishRosterNow` is called **first**, deliberately, because the moment the server marks
   `removed_at` every further write from this device — including the roster that would tell the
   others — is refused (`syncEngine.ts:688-696` comment).
2. `leaveSyncGroup`: sets `sync_member.removed_at` for the caller, deletes that caller's
   `sync_wrap` rows (so a re-added-later flow starts clean), leaves every `sync_entry` untouched.
3. Receiving side, on the others' next sync: `reconcileVanished` → `archiveVanishedGroup`
   (`syncDoc.ts:430-448`) sets `budget_group.is_archived = 1` locally, drops the outbox and cursor
   rows for that group. **What was spent is never touched** — only this device's future
   relationship to the group ends.

(`announceGroupExit(mode: 'delete')` is the owner-only sibling — `deleteSyncGroup`,
`index.ts:1938-1951` — a tombstone on `sync_group.deleted_at` rather than a hard delete, reconciled
the same way on every member's next sync.)

---

## 4 · What a shared entry looks like on the wire

`EntryDoc` (`syncDoc.ts:41-85`) names every person by **both** their account id (`uid`, global,
resolves once linked) and the author's local id (`pid`, resolves once the roster is adopted) — a
group can contain someone with no account at all, and dropping either field would silently
misattribute their share. `RosterDoc` (`syncDoc.ts:493-519`) carries the group's identity, its full
member list **including everyone who has left** (`removedAt`, so a removal can be told rather than
inferred from absence), each member's role, and the creator's account id. Both are sent as ordinary
sealed entries at a reserved id (`ROSTER_ENTRY_ID = '__roster__'`) — the server needs no schema change
to carry a roster and never learns a single name.

---

## 5 · The seven open `SYNC-F` items — re-verified against the tree in this session

`TRACKER.md` §5 lists seven as `OPEN`: `SYNC-F8`, `F15`, `F16`, `F17`, `F20`, `F22`, `F24`. All seven
were re-checked directly against current source rather than trusted from the tracker. Six check out
exactly as filed. One — `F22` — is more nuanced than the tracker currently says, and that nuance is
worth your attention before T19.

| id | Filed as | Verified against | Verdict |
|---|---|---|---|
| `SYNC-F8` | Email is the only identity, cannot be changed or merged | `patchMe` (server `index.ts:434-489`) accepts `name`, `phone`, `avatarUrl` — no `email` field exists anywhere in the route. No merge route exists either. | **Confirmed, unchanged.** |
| `SYNC-F15` | Any approved member can push a new version of an entry I authored | `peerIngest.ts:190-193` looks up `existing` by **`id` alone**; the `UPDATE txn ... WHERE id = ?` at `:301-313` carries no `group_id` and no `author_person_id` predicate. | **Confirmed — and slightly worse than filed.** The lookup isn't just missing an authorship check, it's missing a **group** check too: nothing in `ingestPeerTxn` verifies that `existing`'s actual `group_id` matches `env.groupId` before the row is rewritten. The membership check at `:158` only confirms the *author* and *me* are both members of `env.groupId` — it says nothing about which group the target row is really in. |
| `SYNC-F16` | Removing a member is local only | `removeMemberFromGroup` (`persons.ts:427-465`) — confirmed, see §3. | **Confirmed, unchanged.** |
| `SYNC-F17` | The group key is never rotated | No rotation function exists anywhere in `groupCrypto.ts` or `serverApi.ts`; `shareGroup`'s own comment (`syncEngine.ts:602-616`) explains why re-keying is refused rather than attempted. | **Confirmed, unchanged.** |
| `SYNC-F20` | A group with no admin is reachable by adoption and unrepairable | `adoptGroup`'s `mayGrantRoles` gate (`syncDoc.ts:668-690`) — a roster can only grant rank from a publisher who is *already* the known creator or an active admin **on this device's existing data**. No repair path exists for a group that reached this state through some other route (e.g. every admin leaving). | **Confirmed, unchanged.** |
| `SYNC-F22` | `audit_log` has no structured author | See below — **not clean-confirmed.** | **Partially fixed; functionally still open.** |
| `SYNC-F24` | Sharing is admin-gated on the client, member-gated on the server | Client: `shareGroup` checks `canAddMember` = `isAdmin` (`syncEngine.ts:585-587`). Server: `inviteSyncMember` checks only `approvedMember` — any approved member, admin or not (`index.ts:1652`). | **Confirmed, unchanged.** A modified client (or a direct API call) can invite as a plain member. |

### `SYNC-F22`, in detail — a doc/code disagreement worth flagging before T19

`FINDINGS.md` §5 describes this as: *"The one sync-aware call bakes the name into a free-text
summary… An author column. The summary is for reading, not for identity."* That description no
longer matches the schema. `actor_person_id` **is** a real column
(`src/db/schema.ts:177`, added via migration at `:649`), `logAudit` writes it
(`db/queries/audit.ts:48-56`), and `peerIngest.ts:409` populates it with the real author's person id
on every peer-originated audit row. Git history dates this fix to commit `03e3300`
("fix: a roster is a claim, and rank is the part worth checking"), **2026-09-04** — three days
*before* the 2026-09-07 register split that produced the current `TRACKER.md`/`FINDINGS.md`, which
still marks it `OPEN` despite that split's own claim that "every status was re-verified against the
source tree, not copied."

That said, marking it `OPEN` is not simply wrong — the *consequence* the finding cares about is still
real, just for a different reason:

- The column exists and is populated for peer-authored rows.
- But `AuditFilter` (`db/queries/audit.ts:60-68`) has no `actorPersonId` field, and nothing in the
  app — no screen, no query — ever reads `actor_person_id` back out. `getAuditLog` selects `*` and
  nothing downstream joins it to a name.
- So **"what has Aarav changed?" still has no answer anywhere in the product**, which is the exact
  sentence the finding was written to fix. The data the answer would be built from now exists; the
  answer itself does not.

This file does not edit `TRACKER.md` — that's outside T18's scope (`tasks/todo.md`'s `Files:` line
for T18 names only this document) — but whoever picks up `SYNC-F22` next should re-word it rather
than re-fix it: the fix already landed, the feature it was meant to enable did not.

---

## 6 · What T19 needs to answer

This audit found the sync engine internally coherent and the encryption claim ("the server cannot
read a money figure") solid end to end. What it is *not* is finished, and the six confirmed-open
items plus the `F15` group-check gap are the concrete gaps a server-side redesign (`T19`) has to
either inherit deliberately or close:

1. **`F15` + the group-check gap** — the compare-and-set on `sync_entry.version` protects against a
   *stale* write, but nothing protects against a write to the *wrong entry* by a member of some
   *other* group that entry never belonged to. A redesign that keeps client-decided trust has to
   decide whether this check belongs on the device (cheap, but a modified client bypasses it) or on
   the server (the server would need to know an entry's group and original author — which today it
   deliberately does not, since it never opens the ciphertext to find out; it would have to be
   carried in the clear, alongside `version`).
2. **`F16`/`F17` together** — removal has no server leg and the key is never rotated, so "remove
   someone" and "they can no longer read anything new" are not the same event today, and can't be
   made the same event without a re-keying design that answers what happens to every entry already
   published under the old key (`F17`'s own blocker).
3. **`F20`** — whether a repairable "no admin" state is worth building, or whether an egalitarian
   mode (anyone may act) is the honest alternative for the case where nobody has standing.
4. **`F24`** — whichever admin-gating rule for sharing is correct, it has to be enforced
   server-side; the client check alone is advisory, same as every other client-side permission check
   AGENTS.md §1 already says is a courtesy, not a control.
5. **`F22`'s real gap** — not a data-model question, a feature one: does "what has Aarav changed"
   need to exist as a UI surface, and if so where.
6. Everything `SYNC-MODEL.md` Part 10 already lists as blocking release sits downstream of this
   decision, most concretely the two-phone test — nothing above has ever been run against a second
   real device.

---

## 7 · `T19` — a proposed server-side model

### 7.0 The actual choice

Two directions were live going into this:

- **A · Harden in place.** Keep the server exactly as blind as it is today — it never reads an
  amount, a category, a note, a payer or a split — and close the five confirmed gaps from §5 with
  the smallest amount of new cleartext that each one strictly needs.
- **B · Make the server readable.** Give the server enough plaintext to arbitrate trust, roles and
  conflicts itself, the way most consumer sync products work.

### 7.1 Why not B

B looks like it simplifies things — one authority instead of every device deciding for itself — but
it trades away the one sentence this whole product's privacy story rests on, and it buys none of
the five fixes that were actually found.

- **It spends the headline promise.** *"Can the server read my money? No. Everything is locked
  before it leaves your phone"* (`SYNC-MODEL.md` Part 7) is not an implementation detail — it is the
  answer already written for users. B makes that sentence false and needs a new one.
- **None of `F15`/`F16`/`F17`/`F20`/`F24` needs the server to read an entry.** Every one of them is
  about **who may do what** (edit, remove, invite, administer), not about **what an entry says**.
  §7.3 closes all five without the server ever decrypting a byte. Readable content would be solving a
  problem this audit did not find.
- **It raises an open risk instead of settling it.** India DPDP posture is already an undecided
  tracker item (`DQ-05`, `B-09`, both `DECIDE`) — today the server holds email addresses and
  ciphertext. B would put every shared ledger in plaintext on a server you operate *before* that
  question has an answer.
- **What B genuinely buys isn't on the table for the pilot.** Server-side merge, content-bearing push
  notifications, server-side search over shared history — nothing in `SPEC.md`, the roadmap or
  `RELEASE_CHECKLIST.md` asks for any of them.

**So: A.** The rest of this section is what A costs, precisely.

### 7.2 The one new piece of cleartext A needs — `sync_member.role`

`F16` (removal is local-only) and `F24` (sharing is admin-gated only on the client) have the same
root: **the server cannot enforce "admins only" because it does not know who the admins are.** Roles
live inside the sealed roster (`RosterDoc.members[].role`, `syncDoc.ts:481`), which is exactly why
the one server rule that *does* exist today, `deleteSyncGroup`, had to be **creator**-only
(`sync_group.owner_user`, `index.ts:1942-1944`) rather than admin-only.

The fix is to tell the server one word per member:

```sql
-- 0011_member_roles.sql — additive only, safe against the deployed Worker (FINDINGS D-10)
ALTER TABLE sync_member ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK(role IN ('member','admin'));
```

No separate `'owner'` value: the creator is `sync_group.owner_user`, and the server treats them as an
admin exactly as `permissions.ts`'s `isAdmin` already does (`isCreator(ctx) || role === 'admin'`,
`permissions.ts:58-60`) — one rule, stated once on each side.

**What this discloses.** The server already knows, per group, every member's account id
(`sync_member`) and who created it (`owner_user`). Which of those accounts is an admin is a small
step on data already disclosed — not a new *kind* of data. It is not a name, not an amount, not
the group's name, not anything in any entry.

**What it costs on the client.** Roles are pushed only to *other devices* today, inside the sealed
roster. With this column, `setMemberRole` (`db/queries/groups.ts:652`) also has to tell the server,
and `shareGroup`'s invite has to carry the role the invitee starts with. Both best-effort, same
pattern as `announceGroupExit` (`syncEngine.ts:732-748`): the local write is the decision and the
server call enforces it for everyone else.

### 7.3 Closing each confirmed gap

| Gap | Fix | Where | New cleartext |
|---|---|---|---|
| `SYNC-F15` (+ the group-check gap in §5) | Scope the `existing` lookup and the `UPDATE` to `AND group_id = ?`, and **refuse any version bump unless `existing.author_person_id = author.id`**. A NULL `author_person_id` means *mine*, and no peer may ever edit it. That is the rule `AGENTS.md` §13 already states — *"no admin may rewrite what another person recorded either"* — just enforced at the wire, where it was missing. | `peerIngest.ts:190-205`, `:301-313` | None. Client-only. |
| `SYNC-F16` | New `DELETE /sync/groups/:id/members/:userId`. The caller must be `owner_user` or an admin; the target can never be `owner_user` (the same creator protection as `canRemoveMember`, `permissions.ts:108-111`). Sets the target's `removed_at` and deletes their wraps, like `leaveSyncGroup` does for yourself. `removeMemberFromGroup` calls it after its local write. | new route beside `leaveSyncGroup` (`index.ts:1908`); `persons.ts:427-465` | `role` (§7.2) |
| `SYNC-F17` | **Rotate forward, never re-seal.** When a removal is confirmed by the server, the acting device mints a new group key and wraps it to every *remaining* device; entries pushed from then on are sealed under it. A cleartext `key_epoch` on `sync_entry` and on `sync_wrap` tells a receiving device which key to use. Entries published *before* the removal stay under the old key — the removed person keeps what they already had, and gets nothing new. | `groupCrypto.ts`, `syncEngine.ts` drain/pull; `sync_entry` + `sync_wrap` gain `key_epoch` | `key_epoch` (an integer) |
| `SYNC-F20` | **Fall back to `owner_user`.** When `adoptGroup` cannot resolve `RosterDoc.createdBy` locally (`syncDoc.ts:792-807`), the group's permanent admin of last resort becomes the account the server already records as its owner, fetched once. It is never null and never changes, so no group can end up with nobody able to administer it — the case `DQ-33` names. | `syncDoc.ts:668-690`; a small `GET /sync/groups/:id` (or the owner is added to `listSyncGroups`'s response — it already returns `owner`, `index.ts:1627`) | None — `owner_user` is already there |
| `SYNC-F24` | `inviteSyncMember` requires the caller to be an admin or `owner_user`, not merely `approvedMember`. That matches the client's `canAddMember = isAdmin`, and makes the server the rule and the client the courtesy — the order `permissions.ts`'s own header asks for. | `index.ts:1652` | `role` (§7.2) |

**Why F17 rotates forward instead of re-sealing.** Re-sealing history means every remaining device
downloads every entry, opens it with the old key, seals it with the new one and uploads it again —
a coordinated multi-device ceremony, with money rows in flight, over a network this app assumes can
drop at any point. And it still wouldn't take anything back: the removed person's phone already
holds the plaintext. Rotating forward protects exactly what can still be protected — everything
written after they left — and the limit is the same one the app already states for a shared phone
number (`SYNC-F2`: worded as *"shared with Rohan on 12 Aug"*, never as a permission that can be
revoked). The removal screen should say it the same honest way: *"They keep what was already shared
with them. Nothing new reaches them."*

**Not in this table: `SYNC-F8` and `SYNC-F22`.** `F8` (email as the only identity) is an account
and identity question, not a sync-model one — a change-email flow sits on `users`/`sessions` and is
orthogonal to everything above. `F22`'s real gap (§5) is a missing *screen*, not missing data. Both
stay on the tracker where they are.

### 7.4 Migration

- **One additive migration, `0011_member_roles.sql`**, with `role` on `sync_member` and `key_epoch`
  on `sync_entry` and `sync_wrap`, each `NOT NULL DEFAULT` so every existing row is valid and the
  currently deployed Worker, which never reads them, keeps working. That matters because `deploy`
  and `migrate` are separate manual commands and nothing orders them (`D-10`).
- **No backfill.** `T19`'s own description says dev data may be wiped, and sync has never carried a
  real user's ledger (`SYNC-MODEL.md`'s banner: never run on two phones). Existing dev rows take
  `'member'` and epoch `0`. The first `shareGroup` or `setMemberRole` after the upgrade writes
  the real role.
- **Order of work, if you approve A:** `F15` first (client-only, no migration, and it closes the one
  gap that can still move numbers). Then `0011` + `F24` + `F16` together, since they share the new
  column and the new route. Then `F20`, which is small. `F17` last, and on its own spec: it is the
  only piece that changes the wire format (the epoch) and the crypto path, and it deserves its own
  two-phone test.

### 7.5 Privacy and DPDP — what *this* proposal changes

It does **not** settle `DQ-05`/`B-09`. Those are still open and still yours to decide. What A adds to
that question is small and specific:

| Newly visible to the server | Already visible today |
|---|---|
| Which member accounts in a group are admins | Every member account id, who created the group, when each joined or left |
| A key-epoch integer per entry and per wrap | A version integer per entry, its author account, its timestamps, its size |

Neither new field is financial, and neither is a name. `SYSTEM.md` §1's egress table — *"Email
address, encrypted backup blob, sealed group entries, device public key"* — would gain **"group
member roles"**. That edit belongs to whoever implements §7.2, not to this file. It is also the line
any privacy policy written for `B-08` should copy.

### 7.6 What stays exactly as it is

- **The server never reads an entry.** Amount, category, note, date, payer, split, tags: all sealed,
  as `SYNC-MODEL.md` Part 1 and Part 7 already promise.
- **Trust and approval stay on the device.** `trust.ts` and `ingestPeerTxn` are unchanged apart from
  `F15`'s guard. The server still decides only *who may write to a group*, never *whether an entry
  counts as my money*.
- **Compare-and-set, the outbox, the cursors, the roster, disputes, and archive-on-vanish** — none of
  them change.
- **Keep, don't replace.** §0–§6 found the engine internally coherent, and its failure-handling
  (at-least-once push, stall-don't-skip pull, roster-before-entries) is the expensive part to get
  right. A rewrite would re-earn all of it for the sake of five gaps that each have a local fix.

### 7.7 The decision

**Recommended direction: A — harden in place.** Keep the zero-knowledge server and the current
engine. Add one role column and one key-epoch integer, and close `F15`, `F16`, `F17`, `F20` and `F24`
as §7.3 lays out.

**What I need from you:** accept or reject **A**. In particular, confirm you are comfortable with
the server knowing **which members of a group are admins** (§7.2). That is the only new thing it
learns, and without it `F16` and `F24` can only be closed as *creator*-only rules, which demotes every
admin other than the creator to a local-only title.

Nothing in §7 becomes a spec or code until you answer. After that, per `tasks/todo.md`, the decision
gate unblocks `SPEC.md` §3's restore (`DQ-89`) and a new sync spec. Implementing §7.3 is that spec's
work, not this file's.

---

## 8 · The decision — 2026-09-24

**Option B was chosen, not A.** In the user's words: *"for now let's keep privacy aside and have a
real working application like a real world web app."* The server becomes readable and
authoritative. §7's recommendation (harden the zero-knowledge engine) is **not** being built. It
stays here because its reasoning is the reason the new spec keeps approvals on the device's side
of the argument and treats every "trust" rule as the server's job.

Four follow-up answers, recorded as `DQ-93`:

- **Everything goes to the server**, not only shared groups.
- **The phone stays offline-first.**
- **The approval and trust model stays.**
- **iOS only.**

A later request added proper, clearly named server entities and relations. The work is specified in
`SPEC-SERVER.md`. `DQ-89` (restore on sign-in) and `DQ-32` (revocation and re-keying) are answered
by this decision.

**This file is now frozen.**
