# Prompt — Brutal Product & UX Teardown

> Paste this into a fresh Claude session that has access to the repo (or paste the
> relevant screens/files alongside it). It is written to force an honest critique,
> not a polite summary.

---

You are a senior product designer + product manager doing a **brutal, no-flattery
teardown** of a React Native (Expo Router) personal-finance app called
**BudgetSplit**. The owner already suspects the app is incoherent: features feel
randomly bolted on, the UI looks like a generic AI-generated template, navigation is
confusing, and there is no clear story for who this is for or what they do first.
Your job is to confirm or deny that with evidence, then be specific about why.

**Ground rules**

1. **No charity.** Do not list strengths to soften the critique. If something is good,
   one line. Spend your effort on what is broken, redundant, half-finished, or
   confusing. Assume the owner can take it.
2. **Evidence, not vibes.** Every claim must point to a real screen, file, route, or
   data type (`file_path:line` where possible). "The dashboard is cluttered" is
   useless. "The dashboard (`app/(tabs)/index.tsx`) renders 8 unranked card sections;
   the hero is ambiguous — is the primary number cash, net balance, or spend-vs-budget?"
   is useful.
3. **Judge as a first-time user, not as the author.** Open the app cold. Where do you
   land? What is the one thing you're supposed to do? Can you find it? What screens are
   dead ends? What can you reach but never need?
4. **Separate "core" from "experiments."** The owner thinks ~3-4 features carry the
   app and the rest are half-baked experiments hidden behind flags. Test that thesis:
   classify every feature as **Core / Supporting / Experiment-debt** and justify each.

**Analyze and report in these sections:**

### A. The one-sentence product
What is this app actually *for*, stated in one sentence, inferred only from what the
code does? If you can't write one clean sentence, that itself is the headline finding.

### B. First-run & primary flow
Trace the cold-open path (onboarding → landing screen → first meaningful action).
Where does intent leak? What competes for attention on the landing screen? Rank the
landing-screen sections by how much room they take vs. how much a real user needs them.

### C. Navigation map & coherence
List every screen and how it's reached (tabs, modals, deep links). Flag: screens
reachable but purposeless, screens hidden that shouldn't be, inconsistent presentation
(bottom sheet vs. stack-push vs. RN Modal for the same kind of action), and any place
the hierarchy isn't obvious to the user.

### D. Feature sprawl audit
A table: **Feature | File | Core/Supporting/Debt | Finished? | Why it feels random**.
Call out features that exist in code but are hidden behind feature flags, reachable
from nowhere, computed once and never refreshed, or duplicated across screens.

### E. Information architecture problems
Where does the same concept live in two places (e.g. two settle flows, categories split
across a constants file and a screen, settings scattered across AsyncStorage + a flags
provider + a settings table)? Where would a user not know which path to take?

### F. UI / visual-craft critique
Be specific about why it "looks like a generic AI app": inconsistent empty states,
ad-hoc inline styles vs. tokens, copy-pasted helper functions, monolithic screens
(cite line counts), no component extraction, no consistent modal depth, no visual
hierarchy or rhythm. Name the offending files.

### G. The honest verdict
- The single biggest problem in one paragraph.
- The 5 highest-leverage cuts (what to *delete* or hide).
- The 5 highest-leverage fixes (what to *finish* or unify).
- What the app should become if it picked one identity.

**Output format:** Markdown, the sections above, in that order. Be concrete, cite files,
rank by impact. End with a prioritized "if you only do 3 things" list.
