F-01: KEEP
F-02: KEEP
F-03: KEEP
F-04: KEEP
F-05: KEEP
F-06: KEEP
F-07: KEEP
F-08: KEEP
F-09: KEEP
F-10: KEEP
F-11: KEEP
F-12: KEEP
F-13: KEEP — ✓ flag now gates the health ring
F-14: KEEP
F-15: KEEP — ✓ savingsInsights now gates the nudges
F-16: KEEP
F-17: KEEP
F-18: DEFER — 977 L, four interaction modes; needs its own effort
F-19: KEEP — ✓ both chart flags now gate
F-20: KEEP
F-21: KEEP
F-22: KEEP
F-23: KEEP
F-24: KEEP
F-25: KEEP
F-26: KEEP
F-27: KEEP — ✓ Pass 4: persona now sets flag defaults via lib/personaDefaults.ts
F-28: KEEP
F-29: KEEP
F-30: KEEP — by design: permission-gated pref, not an optimistic flag
F-31: DEFER — blocked on real line-item extraction; Android side missing
F-32: KEEP
F-33: KEEP — ✓ 12 keys, all gating, invariant tested
F-34: KEEP

S-01: KEEP
S-02: KEEP
S-03: KEEP — ✓ dead imports removed
S-04: KEEP — ✓ Pass 4: call made, /personal wins; the row still routes there
S-05: KEEP
S-06: KEEP
S-07: KEEP
S-08: DEFER — 614 L wizard; lower traffic than review.tsx
S-09: KEEP
S-10: KEEP
S-11: KEEP
S-12: KEEP
S-13: KEEP
S-14: KEEP — ✓ Pass 4: the call inverted — S-09's personal branch was the duplicate and is gone; S-14 is canonical and gained swipe/FAB/audit-log
S-15: KEEP
S-16: DEFER — correct today; needs a windowing design
S-17: KEEP
S-18: KEEP
S-19: DEFER — same screen as F-18; decomposition + device testing
S-20: KEEP — ✓ chart sections now honour their flags
S-21: KEEP
S-22: KEEP
S-23: KEEP
S-24: KEEP — ✓ no-op switches gone; mixed storage is intentional
S-25: KEEP
S-26: KEEP
S-27: KEEP
S-28: KEEP
S-29: KEEP
S-30: KEEP
S-31: KEEP
S-32: KEEP
S-33: KEEP

FLOW-01: KEEP — ✓ Pass 4: flag defaults wired; the people step is skipped for the personal persona
FLOW-02: KEEP — ✓ no-op switches removed
FLOW-03: DEFER — premium tier is planned for a later phase
FLOW-04: KEEP
FLOW-05: KEEP
FLOW-06: KEEP
FLOW-07: KEEP
FLOW-08: KEEP
FLOW-09: KEEP
FLOW-10: KEEP

INT-01: KEEP
INT-02: KEEP
INT-03: KEEP
INT-04: KEEP — ✓ test-notification failures now surface a reason
INT-05: KEEP — ✓ usage strings declared in app.json
INT-06: KEEP
INT-07: KEEP
INT-08: KEEP — ✓ SHA-256 pin + SRI on the fallback
INT-09: DEFER — complete iOS side, no Android impl, no caller
INT-10: KEEP
INT-11: KEEP
INT-12: KEEP
INT-13: KEEP
INT-14: KEEP

BL-01: KEEP
BL-02: KEEP — ✓ one validateShares serves both commit paths
BL-03: KEEP
BL-04: KEEP
BL-05: KEEP — ✓ exact on both margins; property-tested
BL-06: KEEP
BL-07: KEEP
BL-08: KEEP — ✓ false positive; behaviour was tested and intended
BL-09: KEEP
BL-10: KEEP
BL-11: KEEP — ✓ guarded by txnInvariant.test.ts
BL-12: KEEP
BL-13: KEEP
BL-14: KEEP
BL-15: KEEP
BL-16: KEEP
BL-17: KEEP
BL-18: KEEP — ✓ legacy carry-over path deleted (was unreachable)
BL-19: KEEP
BL-20: KEEP
BL-21: KEEP
BL-22: KEEP
BL-23: KEEP
BL-24: KEEP
BL-25: KEEP
BL-26: KEEP
BL-27: KEEP
BL-28: KEEP
BL-29: KEEP
BL-30: KEEP
BL-31: KEEP — ✓ screen composes lib/recurrence
BL-32: KEEP
BL-33: KEEP — ✓ write-only storage removed; salary rule is the record

ISS-01: KEEP — ✓ fixes guarded by completion keys
ISS-02: KEEP — ✓ wired four, deleted seven
ISS-03: KEEP — ✓ switch removed while OCR stays dormant
ISS-04: KEEP — ✓ Pass 4: mapping landed, the write is read
ISS-05: KEEP — ✓ stopped writing what nothing read
ISS-06: KEEP — ✓ camera and photo strings declared
ISS-07: KEEP — ✓ android block dropped from module config
ISS-08: KEEP — ✓ archived action; label derives from entity
ISS-09: KEEP — ✓ audit rows and receipt files cleaned
ISS-10: KILL — ✓ columns and writes removed
ISS-11: KEEP — ✓ FlagsGate holds render until ready
ISS-12: KEEP — ✓ guard added at the write boundary
ISS-13: KILL — ✓ removed
ISS-14: KILL — ✓ removed from migration, seed and demo seed

DEBT-01: DEFER — partly mitigated; version table is its own project
DEBT-02: DEFER — splitting savings.ts moves Plan and afford together
DEBT-03: KEEP — ✓ Pass 4: merged; /group/{personalId} forwards to /personal. The "every other deep link" claim was overstated — there was one nav site
DEBT-04: KEEP — by design: save_location needs async refusal; flags cannot
DEBT-05: KEEP — ✓ hand-rolled walker deleted
DEBT-06: DEFER — same as S-16; degrades only as history grows
DEBT-07: KEEP — ✓ testDb adapter + all 4 assemblers covered
DEBT-08: KEEP — ✓ one rollover semantic; legacy columns now readerless
DEBT-09: KEEP — ✓ union now matches reality
DEBT-10: KEEP — ✓ hash verified on download and cache read
DEBT-11: DEFER — highest-complexity screen; no safe incremental split
DEBT-12: KEEP — ✓ Pass 4: state → useOnboardingForm (screen is 0 useState); setMoneyProfile folded into finalizeOnboarding. Hero animation untouched
DEBT-13: KEEP — standing AGENTS.md policy: extract opportunistically
DEBT-14: KEEP — ✓ source-scanning guard test; caught 2 live violations
DEBT-15: KILL — ✓ removed
DEBT-16: KEEP — documented back-compat shims; converges via new code

DRIFT-01: KEEP — ✓ section deleted
DRIFT-02: KILL — ✓ section deleted
DRIFT-03: KILL — ✓ section deleted
DRIFT-04: KILL — ✓ section deleted
DRIFT-05: KILL — ✓ section deleted
DRIFT-06: KILL — ✓ section deleted
DRIFT-07: KEEP — ✓ section deleted
DRIFT-08: KEEP — ✓ section deleted
DRIFT-09: KEEP — ✓ table deleted, points at AUDIT §4.3
DRIFT-10: KEEP — ✓ section deleted, points at AGENTS.md
DRIFT-11: KEEP — ✓ moot; claim died with ARCHITECTURE §8/§9
DRIFT-12: KEEP — ✓ section deleted, points at AUDIT §4.1
DRIFT-13: KEEP — ✓ duplication actually fixed; row corrected
DRIFT-14: KEEP — ✓ corrected to 13
DRIFT-15: KEEP
DRIFT-16: KEEP — ✓ corrected to 977
DRIFT-17: KEEP
DRIFT-18: KEEP — ✓ row now names the set; is_demo removed
DRIFT-19: DEFER — accurate; both blockers are external and still open
DRIFT-20: KEEP — ✓ table rewritten against the code
DRIFT-21: KEEP — ✓ replaced with a pointer to AUDIT §1
