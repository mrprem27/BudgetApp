# SYNC-MODEL.md — what happens when more than one person can change your numbers

`Last verified: 2026-09-04 · Every claim here was read from the code, not remembered`

This explains how BudgetSplit behaves when you share a group with friends: who is allowed to change
what, whose numbers move, what waits for your approval, and what happens when the internet is not
there.

**It is written to be read by anyone.** No background needed. If a sentence needs a technical term,
the term is explained the first time it appears.

> ⚠️ **Read this first.** All of the sharing machinery is built — but **it has never been run on two
> real phones.** Everything below is read from the code. Two phones, two accounts, one shared group
> is the test that turns it from a claim into a fact.

---

## Part 1 · The big idea

### Everyone has their own notebook

Think of the app on your phone as **your own notebook**.

Nobody else can write in it. Not your friends, not the server, not us. When you share a group with
Aarav, his app does not reach into your notebook. It **sends you a note**. Your app then decides
what to do with that note.

```
   AARAV'S PHONE                                    YOUR PHONE
   ─────────────                                    ──────────

   he writes an entry
          │
          │   locked before it leaves his phone
          ▼
    ┌───────────┐
    │  server   │   holds a locked box.
    └───────────┘   It does not have the key
          │          and cannot read a single entry.
          │
          ▼
                                            the note arrives
                                                   │
                                          your app decides
                                                   │
                                         ┌─────────┴─────────┐
                                         ▼                   ▼
                                  goes straight in      waits in your
                                                          inbox
```

Three things follow from this, and they explain most of the app's behaviour:

1. **Your app works with no internet, no account, and no server.** Sharing is an extra. If it
   breaks, nothing else does.
2. **Nothing anyone else does can secretly rewrite your history.** Notes arrive; your app applies
   them. The gap between those two things is where all your control lives.
3. **Two phones can honestly end up holding different things.** If Aarav says an expense happened
   and you say it did not, you are not going to agree — and the app shows the disagreement instead
   of hiding it.

### The money rule

This one rule explains almost every number in the app.

> **What you spent is your share — not the bill.**

You pay ₹300 for a pizza. Three of you eat it.

```
   You paid          ₹300     ← money that left your pocket
   You ate           ₹100     ← THIS is your spending
   Others owe you    ₹200     ← this is money coming back, not spending
```

Your notebook says **you spent ₹100.** Your budget goes down by ₹100. Your monthly total goes up by
₹100. Not ₹300 — you did not eat ₹300 of pizza.

Now flip it. **Aarav** pays the ₹300 instead.

```
   You paid            ₹0
   You ate           ₹100     ← still exactly the same
   You owe Aarav     ₹100
```

**Your spending is identical either way.** Whose card got tapped changes who owes whom — it never
changes what you consumed. (This is the rule called `IV-08`, and there is now a test that checks all
four screens agree about it — see Part 8.)

---

## Part 2 · Three levels of sharing

You choose how much leaves your phone. All three already exist in the app today.

```
  LEVEL 1 — Just my phone                                       ← the default
  ┌────────────────────────────────────────────────┐
  │  No email. No account. Nothing leaves.         │
  │  The whole app works.                          │
  │  New phone? You export a file and import it.   │
  └────────────────────────────────────────────────┘

  LEVEL 2 — Share groups                            switch: "Sync"
  ┌────────────────────────────────────────────────┐
  │  Only SHARED GROUP entries travel, locked.     │
  │  Your personal spending, income, savings       │
  │  goals, budgets and net worth stay here.       │
  │  New phone? Still export and import.           │
  └────────────────────────────────────────────────┘

  LEVEL 3 — Keep a copy of everything     switch: "Keep a copy of everything"
  ┌────────────────────────────────────────────────┐
  │  Level 2, plus a locked copy of your whole     │
  │  notebook, opened only by your passphrase.     │
  │  New phone? Sign in and restore.               │
  └────────────────────────────────────────────────┘
```

The two switches are completely separate. You can have either without the other.

**A nice thing that already works:** you can use the app for months with no account at all, then
sign in and share a group — and **everything you already wrote in that group goes across.** The app
has been quietly keeping a queue since day one. The screen even tells you: *"N changes recorded
here. They'll go if you share this group."*

**Your name tag is your email.** That is how the app knows you are you. One catch, and it is a real
one: **if you type your email wrong, you get a second, empty account, and there is no way to fix or
merge it.** (`DQ-08`.)

---

## Part 3 · Trust — believe them, or check first?

For each person, you pick one of two things:

```
   CHECK FIRST  (the default)          BELIEVE THEM
   ┌──────────────────────────┐        ┌──────────────────────────┐
   │ Anything of yours they    │        │ Their entries go         │
   │ touch waits in your inbox │        │ straight into your       │
   │ until you say yes.        │        │ notebook.                │
   └──────────────────────────┘        └──────────────────────────┘

   Either way:  an entry that names you nowhere never waits — it
                could not move one of your numbers.
   Either way:  "you paid this" always asks, however much you
                trust them. That is a claim about your bank.
```

Four things worth knowing:

- **It is per person, never per group** (`IV-10`). If trust were a group switch, then whoever gets
  added to that group next would be trusted automatically — without you ever deciding. So a **new
  member always starts on "check first"**, every time. (`MW-18`)
- **You can make an exception for one group.** "I trust Aarav about the flat bills, but not about
  the holiday." That is allowed because it is still about *a person*. And you can clear it again —
  otherwise "trusted except here" would be a one-way door. (`MW-16`, `MW-17`)
- **Someone with no account cannot reach you at all**, no matter what their trust setting says.
  There is simply no route. (`MW-13`)
- **Un-trusting someone only affects what comes next.** Things that already went in stay in. That is
  deliberate, and it is what you would want — going back and re-opening months of settled entries
  because you changed your mind about someone would be worse. (Trusting someone works the other way
  round: it clears out everything of theirs already waiting.)

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

The app deliberately does not hide it. Hiding it would mean an entry existed that you could not see
and could not act on.

---

## Part 4 · So who can change your numbers?

This is the whole thing in one table. `MW-` numbers are just labels so other documents can point at
a specific row.

| | Someone adds… | What happens today |
|---|---|---|
| `MW-01` | You add anything yourself | Counts immediately. It is your notebook. |
| `MW-02` | A person with no account | Never reaches you at all. |
| `MW-04` | *"Check first"* person: an expense you owe a share of | **Waits in your inbox.** |
| `MW-07` | *"Believe them"* person: an expense you owe a share of | Goes in. Your spending and what you owe both move. **This is most group expenses, and it is fine.** |
| `MW-08` | *"Believe them"* person: **"you paid for this"** | ✅ **Waits.** Trusting someone never means believing them about your own bank. Fixed 2026-09-04. |
| `MW-09` | Anyone: *"I paid you back ₹5,000"* | **Always waits for you.** No amount of trust skips this. |
| `MW-10` | A payment between two *other* people | Follows the normal trust rule. Correct — it does not move your money at all. |
| `MW-03` | *"Check first"* person: an expense not involving you | ✅ **Goes in.** It moves none of your numbers, so being asked bought nothing. Fixed 2026-09-04. |
| `MW-11` | Income, or an investment | Never travels between phones at all. |
| `MW-12` | A monthly repeat you already approved once | Goes in. Approving a repeating bill is meant to be the **last** time you are asked. |

**And one thing that is simply not possible:** a note from another person can **never** change your
savings, your assets or your net worth. Not even from someone you fully trust. Those live in a part
of your notebook the sharing system is not allowed to touch.

### When someone changes or removes an entry

| | They… | What happens today | |
|---|---|---|---|
| `MW-21` | edit something you **already approved** | It goes **back to your inbox**. An entry you approved at ₹4,000 arriving at ₹40,000 moves nothing until you look again. | ✅ |
| `MW-22` | edit something you **said no to** | Comes back as waiting — never sneaks in. Their edit cannot overrule your decision. | ✅ |
| `MW-23` | you try to edit **their** entry | Not allowed. You can say no to it; you cannot rewrite it. | ✅ |
| `MW-24` | **delete something you already approved** | ✅ **It waits, like an edit does.** The entry keeps counting until you agree. Fixed 2026-09-04. | ✅ |
| `MW-25` | send a new version of an entry **you** wrote | ⚠️ Their version replaces yours, and the app records **them** as the author. | ⚠️ |

Look at `MW-21` next to `MW-24`. **Editing is careful. Deleting is not checked at all.** That is the
inconsistency, and it is a bug rather than a decision.

---

## Part 5 · The two real problems — ✅ both fixed, 2026-09-04

Everything above is either working correctly or is a question for you to answer. These two were
straightforwardly wrong. **Both are now fixed**, and the account is kept rather than deleted,
because *why* they were wrong is the reasoning the rules rest on.

The fix is one sentence, and it is worth remembering as one:

> **Trust means "I believe what you say we spent." It never means "I believe what you say my money
> did."**

Those are different claims. What we spent, they watched happen. What your money did is a fact about
your bank they cannot observe — it fails on a declined UPI, a wrong VPA, a bank hold — so honesty is
the wrong instrument for it. Three rules follow:

1. **Not your money → never waits.** Neither a payment nor a share names you: it just appears.
2. **They said your money moved → always asks**, however much you trust them.
3. **Any change comes back** — an amount, a split, **or a delete**.

### Problem 1 — "Believe them" was too broad `SYNC-F13` `MW-08` ✅

Right now, marking Aarav as trusted means **"believe everything Aarav says — including what he says
about my wallet."**

```
   Aarav writes:  "Prem paid ₹4,000 for the party"
                             │
                             ▼
   Your app:      believes it, immediately
                  ₹4,000 leaves your cash
                  nobody asks you
                  you may not have paid a rupee
```

The app already knows this shape is dangerous — for **one** case. If Aarav writes *"I paid Prem back
₹5,000"*, your app **always** asks you first, however much you trust him. The reason written in the
code is exactly right: a claim like that hands you cash you may never have received **and** wipes out
a real debt, in one stroke.

That reasoning applies just as well to *"you paid ₹4,000"*. It was simply never extended to it.

**Fixed.** The rule is one sentence: *if someone says money left MY pocket, ask me.*

And it costs almost nothing, because most group expenses are *"Aarav paid, we all owe a share"* —
those keep going straight through. Trust keeps doing real work. The wall goes up only where your own
money is claimed to have moved.

*In the code: `trust.ts:102` checks only for a payback. `peerIngest.ts:246` is where "goes in" is
decided.*

### Problem 2 — Deleting was not checked at all `SYNC-F14` `MW-24` ✅

```
   Day 1   Aarav adds an expense
   Day 1   You look at it and say yes            → it counts
   Day 8   Aarav deletes it
           ↓
           It vanishes from your notebook too.
           Your numbers move back.
           Nothing asks you. Nothing tells you.
```

There is a test in the project that checks this happens — and treats it as **correct**. Its title is
the bug report: *"carries a deletion the author made, and it moves my numbers back."*

**Fixed.** Deleting now has the same care editing already had. A retraction of something you
accepted waits, and the entry **keeps counting** until you decide — approving carries the deletion
out, refusing keeps the entry exactly where it was. A retraction of something still *waiting* still
applies at once, because nothing of yours had moved, so nothing of yours moves back.

*In the code: `peerIngest.ts:249` writes the deletion whether or not you ever approved it.*

---

## Part 6 · Ten more things that can go wrong

Shorter, because they either need someone acting in bad faith, or they are about tidiness rather than
money.

**These can lose data or move numbers:**

| | In plain words |
|---|---|
| `SYNC-F16` `MW-34` | **Removing someone only removes them from your list.** The server is never told. They keep their key and keep receiving every new entry in that group. |
| `SYNC-F18` ✅ | ~~A stuck queue can block a working one.~~ **Fixed 2026-09-04** — the queue now asks only for groups this phone can actually send, so an unshared backlog cannot fill the page. |

**These need someone deliberately misusing the app:**

| | In plain words |
|---|---|
| `SYNC-F15` `MW-25` | Any member of a shared group can overwrite an entry **you** wrote, and the app will then say they wrote it. |
| `SYNC-F17` `MW-39` | **A group's key is never changed.** Anyone who has ever been in the group can still read it, forever, even after leaving. |
| `SYNC-F19` `MW-40` | Someone can send a member list that **makes themselves the admin**, and the app applies it. |
| `SYNC-F24` | Only admins can share a group — but that rule lives on the phone, not the server, so a modified app could ignore it. |

**These are correctness and clarity:**

| | In plain words |
|---|---|
| `SYNC-F20` `MW-38` | A group can arrive with **no admin at all** — and then nobody can ever change its budget, its members, or its name. There is no way to repair it. |
| `SYNC-F21` | **Your decisions are not written down.** "I rejected Aarav's ₹4,000" appears nowhere in the history — which is exactly the record you would want in a disagreement. |
| `SYNC-F22` | The history stores the person's **name as text**, not as a link to them. Rename someone and the old records still say the old name. |
| `SYNC-F23` `MW-19` | The "Shared" label is wrong. It shows only on groups you **received** — never on the ones you shared yourself. |

---

## Part 7 · What we can honestly promise

Plain answers to the questions worth asking.

| Question | Answer |
|---|---|
| **Does the app work without internet?** | **Completely.** Every screen. Sharing is the only thing that waits. |
| **Can something I wrote get lost?** | **No.** It sits in a queue until it goes, and the queue survives closing the app. |
| **Can the same thing arrive twice?** | It can be *sent* twice, and the app recognises the copy and ignores it. Nothing is double-counted. |
| **How fast does a friend's change reach me?** | ⚠️ **Only when you open the app**, or bring it back to the front. There is no live connection and no notification. *"A ledger does not need to be a chat."* |
| **What if two people change the same thing at once?** | The second one is **refused**, and you are shown both. The app **never** guesses a number by merging two versions — a merged figure is one nobody typed. |
| **Will two phones always end up identical?** | **No, and that is on purpose.** If you say an entry did not happen and they say it did, you genuinely disagree. Your objection is sent to them, so the disagreement is **visible to both** instead of being papered over. |
| **Can the server read my money?** | **No.** Everything is locked before it leaves your phone, and the server has no key. It never even learns anyone's name. |
| **What if my phone is lost or sold?** | The new owner cannot get in. The phone's secret is tied to your account and is thrown away if a different person signs in. |

---

## Part 8 · Is the app consistent with itself?

Separate question from everything above, and worth answering because the honest answer is
encouraging.

The rule is: **if one number moves, every number showing the same thing must move with it.** A screen
that disagrees with another screen is worse than both being wrong, because now nothing tells you
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

**It passed on the first run.** The money is consistent, and now there is a test holding it that way
(`crossSurfaceConsistency.test.ts`).

So when the app *feels* inconsistent, it is not the numbers. It is these, and they are already
written down:

- **The same action working differently in different places** — four different filter designs
  (`OV-34`), creating something in a popup but editing it on a full screen (`OV-26`), three buttons
  doing the same thing on one screen (`OV-27`).
- **The same thing looking different in different places** — the "nothing here yet" panel is drawn
  four different ways and sits at three different heights (`OV-32`).

---

## Part 9 · The questions only you can answer

Nobody can decide these from the code. Each one says what happens if you never decide — because that
is what ships.

| | Question | If you never decide |
|---|---|---|
| `DQ-28` | **Which of a friend's entries should wait for you?** Just paybacks, as today — or anything claiming *you* paid? | Just paybacks. Problem 1 stays open. |
| `DQ-29` `MW-29` | **Aarav says you paid ₹5,000. You think it was ₹3,000. What can you do?** Today: only yes or no. There is no way to accept part of it. | Yes or no. Someone in a split bill has no move except refusing. |
| `DQ-30` | **Should there be a "scoreboard only" group** — one that tracks who owes whom but never touches your budget or your spending? | No such thing. Every shared group counts as your spending. |
| `DQ-31` | **Should deleting need your approval**, the way editing already does? | No. Problem 2 stays open. |
| `DQ-32` | **Should removing someone actually cut them off** — and should the group's key change? | No. They keep the key and keep receiving. |
| `DQ-33` `MW-36` `MW-38` | **Should you be able to hand a group over to someone else?** Whoever created a group **cannot leave it** — their only exit is deleting it for everyone. And a group that arrives with no admin can never be repaired. | Neither exists. Every group has one permanent owner — or none at all, permanently. |

---

## Part 10 · What is left before release

```
   Fix the receipt-scan image
              │
   Import UPI statements (PDF / CSV)  +  make reviewing them easy
              │
   ── answer Part 9 ──
              │
   Fix the four that move numbers or lose data
        SYNC-F13 · F14 · F16 · F18
              │
   Apple Developer account
              │
   Add Siri App Intents → delete the old Shortcuts setup completely
   Add notifications and a live connection
              │
   Two phones · two accounts · one shared group     ← the real test
              │
   Release
```

**The two-phone test is not the last box to tick. It is the one that proves everything in this
document.** Right now every statement here is read from the code and checked by tests that never
touch a network.

---

## Appendix · For whoever is fixing these

Where each problem lives, so nobody has to search.

| | File |
|---|---|
| `SYNC-F13` | `src/lib/trust.ts:76-104` decides what waits · `src/db/queries/peerIngest.ts:246` applies it |
| `SYNC-F14` | `src/db/queries/peerIngest.ts:249, :265, :288` — the deletion is written regardless |
| `SYNC-F15` | `src/db/queries/peerIngest.ts:184-186` — looked up by id alone, no group or author check |
| `SYNC-F16` | `src/db/queries/persons.ts:425-462` `removeMemberFromGroup` — no server call at all, and **there is no route to remove anyone but yourself**, so this needs a new one |
| `SYNC-F17` | `server/api/index.ts:1908-1923` — drops their wraps, never re-keys |
| `SYNC-F18` | `src/db/queries/syncOutbox.ts:124-127` · `src/lib/syncEngine.ts:272` |
| `SYNC-F19` | `src/db/queries/syncDoc.ts:690-713` |
| `SYNC-F20` | `src/db/queries/syncDoc.ts:626-632, :700-714` |
| `SYNC-F21` | `src/db/queries/approval.ts:54-144` — no history is written |
| `SYNC-F22` | `src/db/queries/audit.ts` — no author column |
| `SYNC-F23` | `src/db/schema.ts:48` — never updated after creation |

The full failure list with proposed fixes is in `RELEASE_CHECKLIST.md` §3.1, beside the twelve found
while the system was being designed.
