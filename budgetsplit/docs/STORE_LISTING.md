# App Store listing — copy to paste, and the declarations that gate submission

The listing does not live in this repo, so this is the source of truth for what
should be in App Store Connect. Copy from here; edit here when it changes.

> ⚠️ **The listing currently says "nothing leaves your device".** That stopped
> being true when sign-in shipped, and it is the same sentence already corrected in
> the app itself (`Onboarding.tsx`, `help.tsx`, `settings/backup.tsx`,
> `settings/account.tsx`). Replacing it is the first job here — an absolute privacy
> claim that is false is worse than a vague one, and Apple compares the listing
> against the privacy declarations below.

---

## 1 · Name and subtitle

**Name** (30 char limit)
```
BudgetSplit
```

**Subtitle** (30 char limit — leads with splitting, because that is the shared-use
hook; budgeting is what keeps people)
```
Split bills. Budget for real.
```

---

## 2 · Promotional text (170 chars, changeable without review)

```
Split with friends without losing track of your own money. No bank login, no ads, no tracking. Works offline, and signing in is optional.
```

---

## 3 · Description

```
BudgetSplit is two apps that finally agree with each other: a bill splitter, and a
budget that stays honest while you use it.

Split anything
• Equal, exact, percentage or shares — or itemise the receipt line by line
• Groups for flatmates, trips, and the people you actually split with
• Settle up in one tap, with UPI, and it records itself
• See who owes whom at a glance, simplified so nobody pays three people

A budget that tells the truth
• Your share of a shared bill counts as your spending, the moment it happens
• Money you fronted for others is money owed back — never mistaken for spending
• Safe-to-Spend, so you know what is actually free before payday
• Budgets by category, at the period that suits you

Everything else
• Scan a receipt and have the line items read for you
• Import a bank or GPay statement, review each row before it counts
• Recurring bills that post themselves, or just remind you
• Savings goals, funded on a schedule or from what a good month left over
• A money-health score that explains itself instead of scolding you

Your data
The app works fully offline, with no account. There is no ad network, no
analytics, and no tracking of any kind.

Two things can leave your phone. Receipt scanning sends that one photo to a cloud
text-reader — you can switch it to reading on the phone instead. And if you sign
in, your account keeps a copy of everything, so a new phone gets it all back and
the groups you split with stay up to date for everyone in them.

That copy is stored on our server as it is — it is not end-to-end encrypted — so
that the server can check who may change what in a shared group. Deleting your
account erases everything that was yours alone. All of it is explained in the
app.

Made for India. Rupees, UPI, and the way people here actually settle up.
```

---

## 4 · Keywords (100 chars, comma-separated, no spaces)

```
split,expense,bill,budget,upi,money,shared,flatmate,trip,settle,tracker,spending,savings,india
```

---

## 5 · What's New

```
• Split with friends without your own budget going wrong
• Money now lands somewhere real — bank, cash or wallet
• Savings remember which account they came from, and go back there
• Recurring bills can post themselves, or just remind you
• Backups are encrypted with a much stronger key
• Sign in and everything syncs — a new phone gets it all back
```

---

## 6 · Privacy — the part that actually blocks submission

> **An undeclared data type is a rejection.** Fill this in from the table below,
> not from memory, and re-check it whenever a network path is added. Every claim
> here is traceable to code, and the code references are for whoever has to defend
> it.

### Data collected

| Type | Collected? | Linked to identity? | Tracking? | Purpose | Where |
|---|---|---|---|---|---|
| **Email address** | **Yes** | **Yes** | No | Sign-in and the account | `serverApi.ts`, `server/api` D1 `users` |
| **Name** | Yes, optional | Yes | No | Shown to people you link with | `PATCH /me` |
| **Phone number** | Yes, optional | Yes | No | Only shown to people you link with, and only if you switch it on | `links.share_phone_*` |
| **Photos** (receipts) | **Yes, on by default** | No | No | Read the line items off a receipt. Never sent to our own server | `receipt-ocr-proxy` → Gemini |
| **Financial info** (other financial info) | **Yes, once signed in** | **Yes** | No | App functionality: the account's copy of the ledger — transactions, balances, budgets, goals, assets — which syncs shared groups and restores a new phone | `lib/sync/`, `server/api/sync/`, D1 |
| **User content** (other) | **Yes, once signed in** | **Yes** | No | Notes, category names, and the names you give the people you split with, as part of that copy | same |
| **Identifiers / usage / diagnostics** | No | — | — | No analytics SDK, no crash reporter, no ad network | — |

### The three answers people get wrong

1. **Receipt photos count as collected**, even though the proxy stores nothing —
   Apple asks whether data *leaves the device*, not whether it is retained. It is
   also **on by default** (`settings.ocrProvider()` is `gemini`), so it cannot be
   declared as opt-in.
2. **Financial info IS collected, and linked to the account**, from the moment
   someone signs in (`DQ-93`). It used to be "not collected" because everything that
   left was sealed with a key the server never had. Server sync ended that: the
   account's copy is readable, on purpose. Keeping the old answer would be a false
   declaration — declare it, as app functionality, not tracking.
3. **Nothing is "tracking"** in Apple's sense — no data goes to a data broker and
   nothing is joined with third-party data for advertising. So no ATT prompt.

### What server sync changed (`DQ-93`)

Sync used to be end-to-end encrypted and a whole-app copy was a passphrase-sealed
envelope, so neither added a data type. Both were replaced by server sync: a
signed-in account's copy is stored readable, so the server can enforce who may
change what. That is why **Financial info** and **User content** are now declared
as collected and linked. Things that did not change:

- **Still no tracking**, so still no ATT prompt.
- **Receipt photos never reach our server** — only the OCR provider, and only
  when scanning in the cloud.
- **The backup file is still the user's own**: encrypted on the phone with a
  passphrase never sent anywhere, and never uploaded by the app.

The description above is written to match: the app works without an account,
two things can leave, and the one that stores data says plainly that it is not
end-to-end encrypted. Keep that shape in any future edit — the honest version is a
default plus a list, not an absolute.

---

## 7 · Age rating and category

- **Category:** Finance. Secondary: Productivity.
- **Age rating:** 4+. Nothing user-generated is shared publicly, there is no chat,
  no web view onto arbitrary content, and no gambling.

---

## 8 · Support and marketing URLs

Both are **required** and neither exists yet. Minimum viable: a single page with
what the app does, a support email, and the privacy policy at a stable URL.

- Support URL: `TODO`
- Marketing URL: `TODO` (optional, but the same page can serve)
- **Privacy policy URL: `TODO` — required even for external TestFlight.**

---

## 9 · Before you submit → `TRACKER.md` §1

**Moved.** Every item that was here is a ship blocker, and all six were already in
[`TRACKER.md`](./TRACKER.md) §1 under `B-01`, `B-08`, `B-09`, `B-10` and `B-13` — a strict subset,
kept in two places and ticked in neither.

The two that are specifically about this document: paste the copy below into App Store Connect
(`B-13`), and answer the privacy questionnaire from §6 — **receipt photos count as collected**,
because they leave the device, and they are ON by default. An undeclared data type is a rejection.
