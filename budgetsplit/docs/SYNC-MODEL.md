# SYNC-MODEL.md — what happens when more than one person can change your numbers

`Last verified: 2026-09-25 · Every claim here was read from the code, not remembered`

This explains how BudgetSplit behaves once you sign in and share a group with friends. It covers
who is allowed to change what, whose numbers move, what waits for your approval, and what happens
when there is no internet.

**It is written to be read by anyone.** No background needed. If a sentence needs a technical term,
the term is explained the first time it appears.

> ⚠️ **Read this first.** All of this is built, and each flow has a test that runs the real server
> code against two simulated phones. **It has never been run on two real phones.** Two phones, two
> accounts, one shared group is the test that turns it from a claim into a fact.

---

## Part 1 · The big idea

### One copy on the server, a working copy on your phone

This changed on 2026-09-24 (`DQ-93`). **The earlier model is gone.** That model said everyone keeps
their own notebook and the server only passes along sealed boxes it cannot open. Here is the model
that replaced it:

- **The server holds a real, readable copy of everything your account has.** That means your
  shared groups, and also your personal spending, income, budgets, savings goals, assets, friends
  and settings.
- **Your phone keeps a full working copy.** Every screen reads the phone's own database, never the
  server. So the app works exactly the same with no signal.

```
   YOUR PHONE                       SERVER                        AARAV'S PHONE
   ──────────                       ──────                        ─────────────

   you add an expense
   (it shows at once)
          │
          │  goes up within seconds
          ▼                    ┌──────────────────┐
                               │ checks the rules:│
                               │ are you in the   │
                               │ group? is it     │
                               │ yours to change? │
                               │ does it add up?  │
                               └────────┬─────────┘
                                        │ stores it, and notes
                                        │ who has to approve it
                                        ▼
                                                            his phone pulls it
                                                                    │
                                                  shown in the group, and either
                                                  counts for him or waits for him
```

Three things follow from this, and they explain most of the app's behaviour:

1. **Offline still works completely.** A change is saved on the phone first and waits in a queue.
   It goes up once there is a connection.
2. **The server is the referee.** Whatever an app sends, the server checks whether you are in the
   group, whether the entry is yours to change, and whether the amounts add up. It uses the app's
   own rule functions, imported rather than rewritten. A check on the phone is only a courtesy now.
3. **Approval is still personal.** Every member sees the same entries in a group. Each person
   decides separately whether someone else's entry counts in their own numbers.

### The money rule

This one rule explains almost every number in the app.

> **What you spent is your share — not the bill.**

You pay ₹300 for a pizza. Three of you eat it.

```
   You paid          ₹300     ← money that left your pocket
   You ate           ₹100     ← THIS is your spending
   Others owe you    ₹200     ← this is money coming back, not spending
```

The app records **₹100 of spending.** Your budget goes down by ₹100. Your monthly total goes up by
₹100. Not ₹300, because you did not eat ₹300 of pizza.

Now flip it. **Aarav** pays the ₹300 instead.

```
   You paid            ₹0
   You ate           ₹100     ← still exactly the same
   You owe Aarav     ₹100
```

**Your spending is identical either way.** Whose card got tapped changes who owes whom. It never
changes what you consumed. (This is the rule called `IV-08`, and a test checks that every screen
agrees about it. See Part 9.)

The server stores entries and never a balance. Balances, cash, net worth and Safe-to-Spend are
still worked out on the phone, from those entries, by the same code as before.

---

## Part 2 · Signed in, or just this phone

There are two states. There is **no sync switch** any more: signing in joins, signing out leaves.

```
  NOT SIGNED IN                                              ← the default
  ┌────────────────────────────────────────────────┐
  │  Nothing leaves the phone. The whole app works. │
  │  New phone? Export a file and import it.        │
  └────────────────────────────────────────────────┘

  SIGNED IN
  ┌────────────────────────────────────────────────┐
  │  Everything goes to your account.               │
  │  Shared groups work.                            │
  │  New phone? Sign in, and it all comes back.     │
  └────────────────────────────────────────────────┘
```

### The first sign-in joins this phone to the account

| This phone | The account | What happens |
|---|---|---|
| Has data | Empty | **Upload.** Everything on the phone is queued and sent. The app stays usable while it goes. |
| Empty | Has data | **Restore.** A progress bar, then Home. |
| Has data | Has data | **Ask.** "Use my account" writes this phone's data to a file first, then replaces it. "Not now" changes nothing. The two are never merged (`DQ-94`). |

Restore and "Use my account" are all-or-nothing. If either fails partway, the phone is put back
exactly as it was.

**Months of use with no account still count.** Upload sends everything you have already written.

### Signing out empties the phone (`DQ-97`)

The account holds everything, so a signed-out phone keeps nothing:

- **Signing out runs one sync first.** If nothing is left waiting, the phone is emptied back to a
  fresh install.
- **If changes still haven't gone up** (no signal, or a failed upload), you are warned first.
  **Sign out anyway** writes an export file before anything is removed.
- **A phone that was never joined** to the account ("Not now") keeps everything, because that data
  exists nowhere else.

**Your name tag is your email.** That is how the server knows you are you. One catch, and it is a
real one: **if you type your email wrong, you get a second, empty account, and nothing can fix or
merge it** (`DQ-08`, `SYNC-F8`).

---

## Part 3 · Trust — believe them, or check first?

For each person, you pick one of two things:

```
   CHECK FIRST  (the default)          BELIEVE THEM
   ┌──────────────────────────┐        ┌──────────────────────────┐
   │ Their entries that name   │        │ Their entries count for  │
   │ you wait in your inbox    │        │ you as soon as they      │
   │ until you say yes.        │        │ arrive.                  │
   └──────────────────────────┘        └──────────────────────────┘

   Either way:  an entry that names you nowhere never waits, because
                it cannot move one of your numbers.
   Either way:  "you paid this", and any transfer that names you,
                always asks, however much you trust them. Those are
                claims about your bank.
```

The server makes this decision now. It runs the app's own `requiresMyApproval` against **your**
trust settings, and records the result as an approval row that belongs to you.

Four things worth knowing:

- **It is per person, never per group** (`IV-10`). A group-wide switch would automatically trust
  whoever joins that group next, without you ever deciding. So a person you have never decided
  about is always "check first".
- **You can make an exception for one group.** "I trust Aarav about the flat bills, but not about
  the holiday." That is allowed because it is still about *a person*. You can clear it again, or
  "trusted except here" would be a one-way door. The server checks the group answer first and falls
  back to the general one.
- **A friend with no account can't reach you at all.** They cannot sign in, so they cannot send
  anything, and the server never asks them anything.
- **Changing trust applies to what arrives next.** Entries that already count keep counting. The
  inbox has a **Trust and approve** button that also approves what is already waiting from that
  person, except money said to have reached you, which you still confirm one at a time.

### While something waits in your inbox

It is **shown, but counted nowhere.**

```
   waiting  →   appears in the group list, marked as waiting
            →   ✗ not in your budget
            →   ✗ not in your monthly total
            →   ✗ not in what you owe or are owed
            →   ✗ not in your cash

   you say yes  →  it counts everywhere, all at once
```

The app does not hide it on purpose. Hiding it would leave an entry you could not see and could
not act on.

Your answers are yours alone. **Approve**, **reject** and **take back an answer** can only be sent by
the person being asked. The server refuses them from anyone else, and the phone won't queue an
answer to your own entry.

---

## Part 4 · So who can change your numbers?

This is the whole thing in one table. `MW-` numbers are labels so other documents can point at a
specific row.

| | Someone adds… | What happens |
|---|---|---|
| `MW-01` | You add anything yourself | Counts immediately. The server records you as the author, whatever the app sends. |
| `MW-02` | A friend with no account | Never reaches you. They have no way to send anything. |
| `MW-04` | *"Check first"* person: an expense you owe a share of | **Waits in your inbox.** |
| `MW-07` | *"Believe them"* person: an expense you owe a share of | Goes in. Your spending and what you owe both move. **This is most group expenses, and it is fine.** |
| `MW-08` | *"Believe them"* person: **"you paid for this"** | **Waits.** Trusting someone never means believing them about your own bank. |
| `MW-09` | Anyone: *"I paid you back ₹5,000"* | **Always waits for you.** No amount of trust skips this. |
| `MW-10` | A payment between two *other* people | Goes in. It names you nowhere and moves none of your money. |
| `MW-03` | *"Check first"* person: an expense not involving you | Goes in. It moves none of your numbers, so asking would buy nothing. |
| `MW-11` | Income, or an investment | Can't be in a shared group at all. The server accepts them only in your personal group, which only you can read. |
| `MW-12` | A monthly repeat | Each month's copy is a new entry, written by the author's phone, and it is asked about the same way. Trusting the author is how you stop being asked. |

**And one thing nobody else can do:** write to your savings goals, your assets, your personal
group or your settings. Those belong to your account alone, and the server refuses a write to them
from anyone else, even someone you fully trust.

### When someone changes or removes an entry

| | They… | What happens |
|---|---|---|
| `MW-21` | edit something you **already approved** | **You are asked again.** A changed entry is a new question. From a "check first" person it goes back to your inbox, so an entry you approved at ₹4,000 that comes back as ₹40,000 moves nothing until you look again. From someone you trust, it goes straight in, unless it says your money moved. |
| `MW-22` | edit something you **said no to** | **You are asked again, whoever they are.** Your "no" outranks trust: even from someone you trust, the edit comes back as waiting, at the new figure, and counts for nothing until you answer. Trust only decides whether a *new* entry waits. `approvals.test.ts` covers it. |
| `MW-23` | you try to edit **their** entry | Refused by the server, even if the request comes from outside the app. You can say no to it; you cannot rewrite it (`SYNC-F15`, `DQ-96`). |
| `MW-24` | **delete something you already approved** | **It waits, like an edit.** The entry keeps counting until you agree. Agreeing lets it go; refusing keeps it (`DQ-31`). If you had not answered yet, it simply goes. |
| `MW-25` | send a new version of an entry **you** wrote | Refused. Only the author can send a new version (`SYNC-F15`). |

---

## Part 5 · Groups: who is in, and who decides

Every rule here is checked **on the server**, using the app's own permission functions
(`canAddMember`, `canRemoveMember`, `canChangeRole`). Before, only the phone checked them
(`SYNC-F24`).

### Adding people

- **Someone with an account is invited.** An admin adds them, and they accept or decline on their
  own phone.
  - Until they accept, the server gives them **nothing** from the group: no entries, no members.
  - They can already be **named in a split**, because adding a friend and splitting the bill is one
    motion. Any entry that names them waits for their approval like any other. Their questions
    arrive together with the group, once they accept.
  - The admin's phone shows them as **Invited** until then.
- **A name with no account** (a placeholder) is a member straight away, on every phone.
- **Only an admin can add anyone.**

### When a placeholder friend signs up

Say Aarav was added by name only, and later makes an account that you link with.

- **The server merges his placeholder into his account.** Every reference is repointed in one
  batch: his memberships, what he paid, his shares, itemised lines, trust settings, budget lines and
  friend entries.
- **Every entry that named the placeholder is sent to every phone again.** Aarav is asked about each
  one, as with any entry that names him.
- **Only certain people can ask for this.** It must be someone who made the placeholder or shares a
  group with it, **and** someone with a live link to that account. The link is the consent; without
  that rule, anyone could attach a stranger's money to an account.
- **Every other phone folds its own copy of him into one.** Nobody is left with a second, ghost
  Aarav.

### Removing, leaving, roles

| | Who can | What happens |
|---|---|---|
| **Remove someone** | An admin, and **never the owner** | Their next sync lists the group as ended. Their phone archives it and tells them once, and nothing they spent is deleted (`SYNC-F16`). |
| **Leave** | Only you, for yourself. **The owner can't leave**; they delete the group instead | The group archives on your phone. |
| **Change a role** | An admin. The **owner's role never changes** | A role is now a fact on the server, not a claim a phone makes (`SYNC-F19`). |
| **Delete the group** | Only the owner | It ends on every phone, marked as deleted. |

- **There is always an admin** (`SYNC-F20`). The owner always counts as an admin, and nobody can
  change who owns a group — except that if the owner deletes their account, the group passes to an
  admin, or else the longest-standing member with an account, who becomes admin.
- **No keys to rotate** (`SYNC-F17`). Nothing is sealed any more. Removing someone ends their access
  on the server, and that is the whole of it.
- **The group's feed records who did what** (`SYNC-F22`). The server writes each activity row itself,
  with the account that made the change, in the same step as the change. A transaction's
  **History** shows every version, such as *"Aarav changed ₹400 → ₹450"*. Only people who can read
  the transaction can load it.

---

## Part 6 · The one sentence behind the trust rules

Two old bugs are why the trust rules are shaped the way they are: `SYNC-F13` (`MW-08`) and
`SYNC-F14` (`MW-24`). Both were fixed on 2026-09-04. The reasoning outlived the old sync, so it is
kept here:

> **Trust means "I believe what you say we spent." It never means "I believe what you say my money
> did."**

Those are different claims. They saw what we spent. What your money did is a fact about your bank
that they cannot see. A payment can fail for reasons that have nothing to do with honesty: a
declined UPI, a wrong VPA, a bank hold. So trust is the wrong test for it. Three rules follow:

1. **Not your money → never waits.** If neither a payment nor a share names you, it just appears.
2. **They said your money moved → always asks**, however much you trust them.
3. **Any change asks again**: a new amount, a new split, **or a delete** of something you accepted.

These rules live in one function, `requiresMyApproval`. **The server imports that same function
rather than a copy**, so a change to a rule reaches both at once.

---

## Part 7 · When two changes clash, or one is refused

- **Money is never merged.** A change to an entry, a budget, an asset or a goal is sent with the
  version it was based on. If someone else changed that thing first, the server refuses the late
  change instead of silently keeping the last one (`SYNC-F3`). A merged figure would be one that
  nobody typed.
- **For an entry, you choose.** The entry shows **both versions side by side** and asks *"Keep
  yours or theirs?"* An open clash is also flagged in Review. Keep yours sends yours again, on top
  of theirs, so every phone ends up with yours. Keep theirs simply stops asking.
- **For a budget, asset or goal, the server's copy wins**, and the clash is recorded on the phone.
- **Names, colours, membership and preferences** go by whichever change arrives last. A lost rename
  costs nothing.
- **A refused change reverts and says why.** For example, *"This wasn't saved: you're no longer in
  Goa Trip."* The phone takes back the server's copy and keeps the reason, so the screen can explain
  it. Nothing is lost silently.

---

## Part 8 · What we can honestly promise

Plain answers to the questions worth asking.

| Question | Answer |
|---|---|
| **Does the app work without internet?** | **Completely.** Every screen reads the phone's own copy. Only sending and receiving wait. |
| **Can something I wrote get lost?** | It waits in a queue that survives closing the app until the server confirms it. If the server refuses it, you are told why. Signing out with changes still unsent warns you first and writes an export file. |
| **Can the same thing arrive twice?** | It can be *sent* twice, for example after a dropped connection. Each change carries a number, and the server skips any it has already applied. Nothing is double-counted. |
| **How fast does a friend's change reach me?** | ⚠️ **Only while the app is open.** Sync runs when the app opens, when you come back to it, and a couple of seconds after any change. There is no live connection and no notification (`DQ-80`). *"A ledger doesn't need to be a chat."* |
| **What if two people change the same thing at once?** | See Part 7. Money is never merged, and on an entry you choose. |
| **Will two phones always show the same numbers?** | **The group's entries are the same on every phone. Each person's own figures can differ, on purpose.** If you refuse an entry, it keeps counting for its author and not for you. The author sees your objection, so the disagreement is **visible to both** instead of papered over. |
| **Can the server read my money?** | **Yes.** Your account's copy is stored as it is, not sealed, and whoever runs the server can read it. That is what lets the server check who may change what in a shared group, and bring everything back on a new phone. |
| **What stays on the phone?** | Receipt photos (`SYNC-F4`) and phone-only state such as the queue and sync progress (`SYNC-F7`). The server also never stores a computed balance. |
| **New phone?** | Sign in, and the restore brings everything back. |
| **What if my phone is lost?** | Your data is safe on the account. The lost phone still holds its own copy and its sign-in, and app lock is what protects it. There is no "sign out my other phones" today. |
| **What does deleting my account do?** | It erases the account's copy of everything that was yours alone: your own data, your answers and trust settings, and every group you own that nobody else was in or invited to. A friend with no account counts as somebody. **A shared group keeps its record**, because it is already on other people's phones; your membership just ends. The account's email and name are wiped. The phone keeps its data. |

**What this document does not promise.** It says nothing about encryption on the server, how long
data is kept, or who else may see it. Neither the code nor the spec makes any such promise, so
none is made here. Those answers belong to the privacy policy and the store listing (`B-08`,
`B-13`), and to the India data-protection question (`B-09`), which became real the moment a second
person signs in.

---

## Part 9 · Is the app consistent with itself?

This is a separate question from everything above. It is worth answering, because the honest
answer is encouraging.

The rule is: **if one number moves, every number showing the same thing must move with it.** A
screen that disagrees with another screen is worse than both being wrong, because nothing tells you
which one to believe.

**We tested it.** One ₹300 expense, split three ways, in a shared group:

```
   Home screen         +₹100   ✅
   Reports             +₹100   ✅
   Budget bar          +₹100   ✅
   My Budget           +₹100   ✅
   Owed to you         +₹200   ✅

   ...and the answer is identical whether you paid or Aarav paid.   ✅
   ...and deleting it puts all five back to zero, together.         ✅
```

A test holds this (`crossSurfaceConsistency.test.ts`). It still passes unchanged after approvals
moved to the server, which is the point: the phone's money queries did not change. Only where the
approvals come from did.

So when the app *feels* inconsistent, the numbers are not the cause. These are, and they are
already written down:

- **The same action working differently in different places.** There are four different filter
  designs (`OV-34`). Some things are created in a popup but edited on a full screen (`OV-26`). One
  screen has three buttons that do the same thing (`OV-27`).
- **The same thing looking different in different places.** The "nothing here yet" panel is drawn
  four different ways (`OV-32`).

---

## Part 10 · Open questions and failures → `TRACKER.md`

This document describes behaviour and tracks no status. Sync failures (`SYNC-F`) have their row in
[`TRACKER.md`](./TRACKER.md) §5 and their evidence in [`FINDINGS.md`](./FINDINGS.md) §5. Open
decisions (`DQ-`) are in [`TRACKER.md`](./TRACKER.md) §3, with the reasoning in
[`FINDINGS.md`](./FINDINGS.md) §3. Each decision states what happens if nobody decides, because that
is what ships. The decisions behind this document are `DQ-93`, `DQ-94`, `DQ-96`, `DQ-97`, `DQ-28`
and `DQ-31`.

---

## Part 11 · What proves it

**The two-phone test** proves everything in this document. It needs the server deployed and the app
build shipped, then two phones, two accounts and one shared group:

- an expense on A appears on B;
- "I paid you" waits on B;
- B's rejection shows on A;
- removing B stops B's syncing;
- B cannot edit A's transaction.

Until then, every statement here was read from the code and checked by tests that run the real
server code against a local database, with no network. These include `groupFlows.test.ts`,
`approvals.test.ts` and `placeholderMerge.test.ts`, plus the server's own suites for members,
shared transactions and account erasure.
