import type { FeatherName } from './palette';
import type { AssetKind } from '../db/queries/assets';

/**
 * How each asset kind is labelled and drawn. One place, so a picker, a row and a
 * ledger entry cannot disagree about what a "deposit" is called.
 *
 * The kind is presentational and nothing more — every asset is worth what it is
 * worth, and no money math anywhere branches on it. That is deliberate: the
 * moment a kind changes a number, the register stops being a list of what you own
 * and becomes a set of special cases.
 */
export const ASSET_KIND: AssetKind[] = ['investment', 'gold', 'property', 'deposit', 'vehicle', 'other'];

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  investment: 'Investment',
  gold: 'Gold',
  property: 'Property',
  deposit: 'Deposit / FD',
  vehicle: 'Vehicle',
  other: 'Other',
};

/** Feather only (§8) — `star` stands in for gold, which Feather has no glyph for. */
export const ASSET_KIND_ICON: Record<AssetKind, FeatherName> = {
  investment: 'trending-up',
  gold: 'star',
  property: 'home',
  deposit: 'lock',
  vehicle: 'truck',
  other: 'package',
};
