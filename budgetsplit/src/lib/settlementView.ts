import { colors } from '../theme';
import type { FeatherName } from '../constants/palette';

/**
 * What a settlement **is**, and how every surface should say it.
 *
 * ## Why this exists
 *
 * `txn.kind = 'settlement'` means four different things (`OV-02`): a debt settle-up
 * between two people, a credit-card repayment, money moving into or out of an asset,
 * and a plain transfer between holdings. Which one a row is was being re-derived
 * independently in **six** places — the transaction row, the detail screen, the
 * report drill-down twice, the kind enum's plural labels, the history feed and the
 * PDF export — and they produced **four different words** for the same event:
 * "Transfers", "Settlement", "Settlements", "settled".
 *
 * The Invest pill (`OV-30`) made that unignorable: it shipped an entry surface for
 * a movement the app has no *exit* surface for. The word "Invest" existed only in
 * `ADD_KIND_LABEL`, read by two entry screens; `asset_id` reached every ledger and
 * was read by no display file at all. So a ₹10,000 SIP rendered as a coral −₹10,000
 * — pixel-identical to spending it — and selling gold rendered as green income,
 * which `AGENTS.md` §12 forbids in as many words.
 *
 * ## The two discriminators, and why they live here
 *
 * **`asset_id`, not the category.** `INVESTMENT_CATEGORY` is written by *both*
 * asset directions (`assets.ts` `transferToAsset` and `transferFromAsset`), so the
 * category cannot tell buying from selling. A card repayment is also a settlement
 * and carries no `asset_id` at all.
 *
 * **Direction is which side carries rows.** A personal asset movement records only
 * the side that moved: outbound is `payments`-only, inbound is `shares`-only. Read
 * the wrong one and redeeming an FD reads as investing in it. `cashDirectionOf`
 * documents the same shape for the cash question.
 *
 * ⛔ `OV-02` proposes a `settle_kind` column to formalise this. It is **not needed**
 * for presentation: `asset_id` is already on every row on every surface (`SELECT
 * t.*`), needs no migration and no wire compatibility, and is strictly *more*
 * expressive — it names which asset, where a four-value enum could not. If
 * `settle_kind` ever lands, it becomes this function's input; nothing above changes.
 */

/** The four things `kind = 'settlement'` can mean. */
export type SettlementKind = 'invest' | 'redeem' | 'card' | 'adjust' | 'transfer';

export type SettlementView = {
  kind: SettlementKind;
  /** Noun for a filter chip or a tab — "Moved to assets", "Transfers". */
  label: string;
  /** Past-tense verb for a sentence — "Moved ₹500", "Repaid ₹500". */
  verb: string;
  /** The whole feed line — "Moved to Gold", "Repaid". One place for the wording. */
  line: string;
  icon: FeatherName;
  tint: string;
  /**
   * True when the money left me. **The sign is decided once, here.** Every surface
   * that renders an amount was inferring it, and the redemption case was inferred
   * wrong in at least two of them.
   */
  outbound: boolean;
  /** The asset a movement touched, when the caller could resolve its name. */
  destination: string | null;
};

/** The minimum a row must expose. A superset of what every ledger already holds. */
export type SettlementRow = {
  asset_id?: string | null;
  pay_method?: string | null;
  /** Set on a card-bill payment: the card it went into (`DQ-109`). */
  to_account_id?: string | null;
  /** Read only to recognise a balance adjustment (`U-64`). */
  category?: string | null;
  payments: ReadonlyArray<{ personId: string; amount: number }>;
  shares: ReadonlyArray<{ personId: string; amount: number }>;
};

/**
 * Classify one settlement.
 *
 * `assetName` is passed in rather than looked up: this is `src/lib`, so it holds no
 * database. Every ledger screen already builds a `groupNames` map; the asset name
 * travels the same way.
 */
export function settlementView(row: SettlementRow, assetName?: string | null): SettlementView {
  const outbound = row.payments.length > 0;

  if (row.asset_id) {
    return outbound
      ? {
          kind: 'invest',
          label: 'Moved to assets',
          verb: 'Moved',
          line: assetName ? `Moved to ${assetName}` : 'Moved to assets',
          icon: 'trending-up',
          tint: colors.settle,
          outbound: true,
          destination: assetName ?? null,
        }
      : {
          kind: 'redeem',
          label: 'Moved from assets',
          verb: 'Moved back',
          line: assetName ? `Moved from ${assetName}` : 'Moved from assets',
          icon: 'trending-down',
          tint: colors.settle,
          // Money came back to me — but this is NOT income and must never be
          // tinted like it. You already owned it; it only changed shape.
          outbound: false,
          destination: assetName ?? null,
        };
  }

  // A balance adjustment (`recordBalanceAdjustment`): a place brought to what it really holds.
  // Neither spending, income nor a debt — its sign is which way the place moved.
  if (row.category === 'Balance adjustment') {
    return {
      kind: 'adjust',
      label: 'Balance adjustments',
      verb: 'Adjusted',
      line: 'Balance adjustment',
      icon: 'sliders',
      tint: colors.textSecondary,
      outbound,
      destination: null,
    };
  }

  // A card repayment names the card it went into (`to_account_id`, `DQ-109`); `lib/cash.ts`
  // reads the same column.
  if (row.to_account_id) {
    return {
      kind: 'card',
      label: 'Card payment',
      verb: 'Repaid',
      line: 'Repaid',
      icon: 'credit-card',
      tint: colors.settle,
      outbound: true,
      destination: null,
    };
  }

  return {
    kind: 'transfer',
    label: 'Transfers',
    verb: 'Settled',
    line: 'Settled',
    icon: 'check-circle',
    tint: colors.settle,
    outbound,
    destination: null,
  };
}

/** True when this row is money going **into** something you own. */
export function isInvestment(row: SettlementRow): boolean {
  return !!row.asset_id && row.payments.length > 0;
}
