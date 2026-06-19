# BudgetSplit — UX Redesign Plan (premium, scannable, fast)

Goal: make every screen **easier to understand, faster to use, visually cleaner,
and more delightful** — without adding UI weight. Inspiration from Splitwise,
Settle Up, Tricount, Splid, Cred, Revolut — adapted, not copied. This plan is
grounded in the *current* code (file:line refs) so it's executable, not generic.

Pairs with `PENDING.md` (hardening/feature backlog) and `APP_FLOW.md` (screen map).

### Decisions locked (Jun 2026)
- **Scan/OCR → deferred to last.** Without true line-item itemization the scan has
  no real value, so we won't ship a half-measure. Keep it honest in the meantime
  (don't discard the photo; don't pretend to itemize) and build the *real* AI
  itemization (§3 Option B) as the final piece.
- **People → segment on Groups** (not a separate tab yet): reusable type-to-create
  picker + cross-group friend balances + a People segment. (§1)
- **Build order → the P0 sweep, drawing heavily from the reference screenshots**
  (Splitwise): inline "Paid by · split" sentence, row "you lent/you borrowed"
  labels, colored activity sentences, receipt attach/preview loop.

---

## 0. Design principles (the bar)

1. **One hero per screen, everything else recedes.** Balances and "what needs my
   attention" must read in <1 second.
2. **Sentences over forms where possible.** Splitwise's "Paid by *you* and split
   *equally*" inline sentence beats our two separate sheet-buttons for the 90% case.
3. **Color = meaning, always the same.** green = you're owed / income, coral =
   you owe / expense, purple = settlement, muted = settled. No decorative color.
4. **No childish/outdated chrome.** Kill cartoon money glyphs, the purple "gem"
   chart button, heavy gradients-for-the-sake-of-it. Premium = restraint +
   typography + spacing, not stickers.
5. **Every common action ≤ 2 taps.** Add expense, settle, mark paid, attach a
   receipt.
6. **Confirm destructive, celebrate completion.** Haptics + a tasteful "all
   settled" moment; never a silent success.

---

## 1. The biggest gap — a reusable **People / Friends** layer

**Today (group-first):** a `person` exists globally (`person` table) but is only
reachable *through* a group's member list. There's no Friends tab; persons are
created on-the-fly inside `app/group/[id]/members.tsx:82`. Tabs are Home /
Groups / Money / Settings (`app/(tabs)/_layout.tsx`). `email`/`mobile` are stored
but never surfaced.

**Target (people-and-groups, like Splitwise):** people persist; groups are
collections of people. This unlocks "settle with a friend across all groups",
reuse without retyping, and a cleaner mental model.

**Plan (incremental, low-risk — DB already supports it):**
- **P1 — Reusable picker first (no new tab):** anywhere you add a member or a
  payer, show *existing people* first (one tap to reuse) with "New person" as the
  fallback — already half-built in `members.tsx:46`; make it the default,
  deduplicate by name, show avatar+balance.
- **P1 — Friend = person with cross-group balance:** add
  `getFriendBalances(db)` = net per person summed across all shared groups (reuse
  `getGlobalNet` in `balances.ts`). 
- **P2 — Friends surface:** a "People" section (a tab, or a segment on the Groups
  screen). Row = avatar + name + net-across-all-groups + one-tap **Settle**. Tap →
  friend detail: their balance per group + shared history + Settle. This reuses
  `simplify(net)` filtered to that pair.
- **P2 — Friend profile:** expose the stored `email`/`mobile`, edit name/color in
  place (no separate screen). Merge-duplicate-people action.

Decision needed: **dedicated "People" tab** vs **a segment on Groups**. Rec: start
as a segment (no nav churn), promote to a tab if it earns its place.

---

## 2. Screen-by-screen

### 2.1 Groups list — `app/(tabs)/groups.tsx`
Already strong (net hero + per-person tree + swipe-archive). Polish:
- **Tighten the hero**: "Overall, you are owed ₹53,833" as the single hero number;
  the owe/owed split card below it (we have this — keep, compact it).
- **Per-group row**: lead with the *balance* (right-aligned, colored) as the
  scannable value; group name + the 1–2 line owes-tree under it (we do this). Drop
  "this month spent" from the row — it competes with the balance; move to detail.
- **Inline Settle affordance** on rows where you owe (we have a "Settle up" pill on
  MD in the screenshots) — keep it to the rows that need attention only.
- **Filter** (the slider icon) → a real sheet: All / You owe / Owes you / Settled /
  Archived. Reduces scrolling for people with many groups.

### 2.2 Group detail — `app/group/[id].tsx`
- **Action pills** (Settle up · Charts · Balances · Total) — good pattern; make
  them a sticky segment, ensure 44pt targets (PENDING §3). Drop the purple "gem"
  styling on Charts → use the standard accent.
- **Balances tab**: the per-member net list + simplify toggle is right. Add a
  one-line plain-English summary at top: "2 payments settle everyone." Each
  settlement row keeps its inline **Settle** (we have `BalanceRow`).
- **Transaction rows**: add a right-side **"you lent ₹X / you borrowed ₹X"** label
  (Splitwise pattern) so each row's *personal* impact is scannable without opening
  it. We compute share vs paid already in `txn/[id].tsx`; surface it on the row.
- **Spending trend**: replace the childish single gray bar ("Spending trends for
  …") with our existing clean mini-trend, or drop it from detail (it lives in
  Reports). Less is more here.

### 2.3 Add expense — `app/add/quick.tsx` (the highest-traffic screen)
Current: amount → category → "Who paid?" sheet + "Split how?" sheet → save
(~5 taps for a simple equal split).
- **Adopt the inline sentence**: under the amount, render
  **"Paid by [you ▾] · split [equally ▾]"** as two inline pills (Splitwise's
  pattern). Default *you / equally* → a simple split is now **0 extra taps**; the
  sheets open only when you change a pill. This is the single biggest speed win.
- **Group + category** stay, but make group a compact chip in the header (it's
  context, not a hero).
- **Amount-first focus** (we autofocus — good). Keep the big mono number.
- The **"Repeat this" Switch** (just shipped) lives below — good.
- Net effect: log a typical split in **2 taps** (amount → Save).

### 2.4 History / Activity — `app/history.tsx`
Unified audit feed already exists (color-coded action icons, date sections,
filters) — better than Splitwise's flat list. Polish:
- **Lead with the colored category/action thumbnail + a one-line sentence**
  ("You added *Cab* · you get back ₹2,675") and a **colored amount** on the right
  (green get-back / coral owe). Matches the screenshot's scannability.
- **Group recurring-series changes** under one expandable entry (avoid N rows when
  a "this & future" edit touches a series — PENDING §6 model makes this possible).
- **Quiet the noise**: collapse consecutive edits to the same txn within a short
  window into "edited 3×". Keep deletions/settlements always-visible.

### 2.5 Settle flow — `app/settle.tsx` + `SettleSheet`
Solid (2 taps, before/after preview). Polish:
- **"Settle all" affordance** when multiple payments clear at once.
- **Completion moment**: on full settle, a brief "All settled 🎉"-style state
  (tasteful, token-colored, haptic.success) instead of just returning.
- **Record method** (optional): Cash / UPI note on the settlement (stored in
  `note`) — small, premium touch.

### 2.6 Members — `app/group/[id]/members.tsx`
- Collapse add/create into **one sheet**: a search field that filters existing
  people and offers "Create '<typed name>'" as the first result when there's no
  match (type-to-create). Removes the create-vs-add fork (2 taps → 1).
- Show each member's balance inline; **Settle** inline for non-zero.
- Touch targets ≥44pt (PENDING §3).

### 2.7 Attachments & receipts — **currently dead**
`attachment_uri` exists in `txn` but is **never written or shown**; the scanner
captures `imageUri` then **discards it** (`src/lib/ocr.ts`). Fix the whole loop:
- **Attach** from the add screen and the detail screen: a camera/photo chip →
  pick/take → store the file (FileSystem) and set `attachment_uri`.
- **Thumbnail chip** on the transaction row + **detail** shows the receipt; tap →
  full-screen lightbox with pinch-zoom. Multiple attachments → a small strip.
- Keep it visually consistent (rounded card, `colors.border`, subtle shadow) — the
  "modern attachment experience" the brief asks for, without new chrome.

---

## 3. Receipt OCR — the honest call (you're right)

**Reality:** `src/lib/ocr.ts` uses on-device `expo-ocr` + **regex** that grabs a
single "total" amount and the first text line. It **cannot** parse a receipt into
line items — and itemized entry is exactly where that would matter. So today's
"scan" in the itemized flow adds *one* line, defeating the purpose. Your instinct
is correct: **real receipt → line-items needs AI**, not regex.

Three honest options:

**A. Manual-first, OCR as a tiny assist (no AI, ship now).**
Keep on-device OCR but scope it to what it can do: **prefill the total amount +
date** on the *quick* expense (not itemized), and **always attach the photo**.
Drop the "scan → itemized lines" promise. Honest, free, offline, private. *Rec for
v1.*

**B. AI line-item extraction via a vision model (best UX, needs network + key).**
Send the photo to a vision-LLM (Claude / GPT-4o) or a specialized receipt API
(Veryfi / Taggun / Mindee — these return structured line items). Returns
`{merchant, date, total, items:[{name, qty, price}]}` → auto-builds the itemized
bill. This is the "magic" experience. Cost: per-scan API + a backend proxy to hold
the key (don't ship keys in the app). Privacy: receipt leaves the device — make it
**opt-in** with a clear note.

**C. Hybrid:** on-device OCR for instant total+attach (A), with an **optional
"Itemize with AI"** button that calls B only when the user asks. Best of both;
more build.

Decision needed: **A now, B/C later** (rec) — or commit to B if "scan a bill and
it fills itself" is a flagship feature. Either way: **stop discarding the image,
relabel the current button honestly** (e.g., "Scan total") until B lands.

---

## 4. Micro-interactions & feel (the "premium" layer)

- **Numbers**: count-up on balance heroes; we already animate bars/donut. Compact
  K/L/Cr on overviews (done), exact on entry (done).
- **Press feedback**: `PressableScale` everywhere tappable (mostly done); haptics
  only on meaningful actions (AGENTS.md §7).
- **Transitions**: shared-element-ish — the category dot/avatar persists from row →
  detail. Sheets spring, don't snap.
- **Skeletons** not spinners (done on savings/txn; extend to group detail + reports
  loads).
- **Confirmations**: settle/delete = haptic + concise toast; "all settled" moment.

---

## 5. Empty states & onboarding
- Empty states already follow the icon→title→body→CTA rule (`EmptyState.tsx`).
  Audit each for a **useful CTA** (e.g., empty group → "Add the first expense";
  empty Friends → "Add a friend").
- Onboarding (4 slides) is solid; add a **one-tap "Add your first expense"** at the
  end that deep-links into the add sheet, so the first action is immediate.

---

## 6. Roadmap (prioritised, grounded)

**P0 — fast wins, high impact (days)**
- Add-expense inline "Paid by · split" sentence → 2-tap logging (§2.3).
- Transaction-row "you lent / you borrowed" label (§2.2).
- History row: colored thumbnail + sentence + colored amount (§2.4).
- Stop discarding the receipt image + attach/preview loop (§2.7).
- Relabel "scan" honestly; scope OCR to total+date+attach (§3A).

**P1 — structural (1–2 weeks)**
- Reusable people picker (type-to-create) in members + payers (§1, §2.6).
- `getFriendBalances` + People segment on Groups (§1).
- Settle: "Settle all" + completion moment (§2.5).
- Groups list filter sheet; row balance-first (§2.1).

**P2 — depth (later)**
- Friend profiles (email/mobile, merge duplicates) (§1).
- AI receipt → itemized (Option B/C) behind opt-in (§3).
- Activity grouping for recurring-series edits (§2.4, needs PENDING §6).

---

## 7. Scenarios (acceptance, in plain language)

- **Split a dinner**: open Add, type ₹1200, tap Save. (Paid by you, split equally
  with the group by default.) 2 taps. Changing payer/split is one pill tap.
- **Settle with a friend across groups**: People → tap friend → one **Settle** that
  clears them everywhere they net out. Completion moment.
- **Attach a receipt**: in Add or on a txn, tap the photo chip → take photo → it's
  stored and shows as a thumbnail; tap to zoom. Image never lost.
- **Scan a bill (v1, honest)**: tap "Scan total" → photo attaches + amount/date
  prefill the quick expense. (No fake itemization.) Later: "Itemize with AI" fills
  the lines.
- **Reuse a person**: adding a member, type "Kh" → "Khushi" appears first (reuse,
  1 tap) or "Create 'Kh'" if new.
- **Read activity at a glance**: each row says who/what/impact with a colored
  amount; a recurring "this & future" edit is one expandable line, not ten.

---

## Sources (inspiration / research)
- [10 Best Splitwise Alternatives 2026 — Hitasoft](https://www.hitasoft.com/blog/best-splitwise-alternative-in-2026)
- [7 best bill-splitting apps 2026 — Splitty](https://splittyapp.com/learn/best-bill-splitting-apps/)
- [Best Splitwise Alternatives for Group Travel — SquadTrip](https://www.squadtrip.com/guides/top-splitwise-alternatives-for-group-travel-expenses/)
- [Best Receipt OCR Software 2026 — Lido](https://www.lido.app/blog/best-receipt-ocr-software)
- [Best Receipt Parser APIs 2026 — Eden AI](https://www.edenai.co/post/best-receipt-parser-apis)
- [Invoice OCR benchmark: Veryfi vs Google Vision vs Mindee](https://www.veryfi.com/ai-insights/invoice-ocr-competitors-veryfi/)
