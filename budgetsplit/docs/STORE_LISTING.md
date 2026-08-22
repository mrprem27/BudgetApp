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
Split with friends without losing track of your own money. Everything lives on your phone — no bank login, no ads, no tracking.
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
Your money lives on this phone. There is no ad network, no analytics, and no
tracking of any kind. Your personal spending, income, savings goals, budgets and
net worth never leave the device at all.

Three things can leave, and only when you switch them on. Receipt scanning sends
that one photo to a cloud text-reader. Signing in lets you keep an encrypted
backup off the phone. And if you turn on sync, the groups you split with are
encrypted here before they are sent, so the people in them stay up to date — we
store sealed data we have no key for, and cannot read amounts, who paid, or what
it was for. All three are explained in the app, and all three can be turned off.

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
| **Email address** | **Yes** | **Yes** | No | Sign-in and account backup | `serverApi.ts`, `server/api` D1 `users` |
| **Name** | Yes, optional | Yes | No | Shown to people you link with | `PATCH /me` |
| **Phone number** | Yes, optional | Yes | No | Only shown to people you link with, and only if you switch it on | `links.share_phone_*` |
| **Photos** (receipts) | **Yes, on by default** | No | No | Read the line items off a receipt | `receipt-ocr-proxy` → Gemini |
| **Financial info** | **No** | — | — | Never leaves the device except inside an encrypted backup the server cannot read | `backup.ts` |
| **Identifiers / usage / diagnostics** | No | — | — | No analytics SDK, no crash reporter, no ad network | — |

### The three answers people get wrong

1. **Receipt photos count as collected**, even though the proxy stores nothing —
   Apple asks whether data *leaves the device*, not whether it is retained. It is
   also **on by default** (`settings.ocrProvider()` is `gemini`), so it cannot be
   declared as opt-in.
2. **Financial info is genuinely "not collected"**, and that is defensible: backups
   are sealed with a passphrase-derived key before upload and the server has no key
   (`encryptPayload`). Say encrypted-and-unreadable, never "we don't store it".
3. **Nothing is "tracking"** in Apple's sense — no data goes to a data broker and
   nothing is joined with third-party data for advertising. So no ATT prompt.

### Sync — shipped, and what it does not change

Nothing is added to the table above. Shared-group entries are end-to-end encrypted
with a per-group key the server never receives, exactly the argument backups
already make. The declarations that follow from it:

- **Financial info stays "not collected".** Defensible for the same reason as
  backups — sealed before upload, no key on the server. Say
  encrypted-and-unreadable, never "we don't store it".
- **No new data type.** Group membership is stored, but it is derived from
  accounts already declared, not separately collected.
- **Still no tracking**, so still no ATT prompt.

The description above has been rewritten accordingly: it no longer implies
transactions never leave the phone, and it distinguishes personal data (which
genuinely never does) from shared groups (which do, sealed). Keep that
distinction in any future edit — it is the honest version and it is also the
selling point.

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

## 9 · Before you submit

- [ ] Listing copy replaced — the old text still claims *"nothing leaves your device"*
- [ ] Privacy questionnaire filled from §6, including **receipt photos**
- [ ] Privacy policy live at a stable URL
- [ ] `DEV_TOOLS_ENABLED` set to `false` (`src/constants/devTools.ts`) — the build
      currently contains a screen that erases all data
- [ ] Screenshots taken on a current device (the assets have never been audited)
- [ ] **India DPDP**: the moment one real user signs in you hold personal data on a
      server you operate. Being opt-in does not change that.
