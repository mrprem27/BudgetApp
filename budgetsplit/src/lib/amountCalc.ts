import { parseToPaise } from './money';

/**
 * A sequential amount calculator, in integer paise.
 *
 * Deliberately **not** an expression parser with precedence. A phone keypad is used
 * sequentially — "1200 ÷ 3", "480 × 1.18" — and inventing precedence would mean
 * "100 + 20 × 3" silently answering 160 when the person typing it meant 360. Each step
 * folds into a running total, exactly like the calculator on a phone.
 *
 * **Money never becomes a float.** The accumulator is always integer paise, and the two
 * operators that can produce a fraction round once, explicitly, at the moment they're
 * applied — so the value on screen is the value that gets saved. AGENTS.md: "Money is
 * always integer paise. Never floats."
 */

export type CalcOp = '+' | '-' | '*' | '/';

/** Operand meaning per operator — the subtlety worth being explicit about. */
export type OperandKind = 'money' | 'factor';

/**
 * `+` and `-` take an **amount** (₹50 off a bill). `×` and `÷` take a plain **factor**
 * (÷ 3 to split three ways, × 1.18 to add tax) — treating those as money would make
 * "÷ 3" mean "divide by three rupees", which is not a thing anyone wants.
 */
export function operandKind(op: CalcOp): OperandKind {
  return op === '+' || op === '-' ? 'money' : 'factor';
}

/** A factor typed as text → number. Returns null when it isn't a usable factor. */
function parseFactor(raw: string): number | null {
  const n = Number(raw.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Apply one step to the running total. Returns the new total in paise.
 *
 * Returns `acc` unchanged when the operand is unusable (empty, non-numeric, or a divide
 * by zero) — a calculator that silently zeroes your bill because you hit ÷ before typing
 * anything is worse than one that does nothing.
 *
 * The result is clamped at zero: a negative transaction amount has no meaning here, and
 * `parseToPaise` on the way back out would reject it anyway.
 */
export function applyStep(accPaise: number, op: CalcOp, operand: string): number {
  const kind = operandKind(op);

  if (kind === 'money') {
    const amount = parseToPaise(operand);
    if (amount <= 0) return accPaise;
    return Math.max(0, op === '+' ? accPaise + amount : accPaise - amount);
  }

  const factor = parseFactor(operand);
  if (factor === null) return accPaise;

  if (op === '*') {
    if (factor < 0) return accPaise;
    // One explicit round. 48000 × 1.18 = 56640 exactly; 100 × 1.005 = 100.5 → 101.
    return Math.max(0, Math.round(accPaise * factor));
  }

  // Divide. Zero and negatives are refused rather than producing Infinity or a negative.
  if (factor <= 0) return accPaise;
  return Math.max(0, Math.round(accPaise / factor));
}

/**
 * Whether a step would change anything — so the UI can disable `=` instead of letting
 * someone tap it and wonder why nothing happened.
 */
export function stepIsUsable(accPaise: number, op: CalcOp, operand: string): boolean {
  return applyStep(accPaise, op, operand) !== accPaise;
}

/**
 * Does this division leave a remainder? Used to tell the user their split doesn't divide
 * evenly, rather than silently handing them a rounded figure that won't sum back.
 *
 * ₹1,200 ÷ 3 is exact. ₹100 ÷ 3 is not — three people paying the rounded ₹33.33 each
 * settle ₹99.99, and someone has to carry the last paisa.
 */
export function divisionRemainder(accPaise: number, operand: string): number {
  const factor = parseFactor(operand);
  if (factor === null || factor <= 0 || !Number.isInteger(factor)) return 0;
  return accPaise % factor;
}
