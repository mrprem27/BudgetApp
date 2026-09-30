# SPEC — "How" and "From" are two things (`U-48`)

Your point, 2026-09-30: *how* you paid (UPI, net banking, credit card, cash) is not *where the money
came from*. Today the app stores only how (`txn.pay_method`) and guesses from with one fixed rule
(`assetOf`: UPI, net banking, autopay → Bank). That guess is wrong for UPI on a RuPay credit card —
now common — which is card debt, not money out of the bank. Pick: **kind of source**, not named
accounts (`DQ-14` stays parked).

## The model

- **How** — `txn.pay_method`, unchanged: UPI · Credit card · Cash · Bank · Wallet · Autopay · Other.
- **From** — Bank · Cash · Wallet · Credit card. **Derived from How**, and stored only when you
  change it: new nullable `txn.pay_from` (`'bank' | 'cash' | 'wallet' | 'credit'`).
- **Effective From = `pay_from` ?? `assetOf(pay_method)`.** One function (`payFromOf`), one SQL
  expression (`EFFECTIVE_FROM_SQL`), and every money reader uses them. `NULL` pay_from means "the
  usual", so every existing row keeps exactly its current meaning. No backfill.
- **Only UPI and Autopay offer a choice** (Bank, Credit card or Wallet — a debit card is Bank). Cash is from cash, a wallet from the
  wallet, a credit card from the card; offering a choice there would only let a wrong one in.

## Modules

| # | What | Done when |
|---|---|---|
| 1 | **Schema.** `txn.pay_from` and `pending_txn.pay_from` (client `schema.ts` additive migration). | Old rows read unchanged. |
| 2 | **Money math reads effective From.** `CASH_TOTALS_SQL` (card spend and card repayment), `BUCKET_FLOWS_SQL`, `lib/cash.ts`, `settlementView`'s card repayment. | Parity tests (`cashSql`, `bucketFlows`) extended with UPI-from-credit; a UPI-on-credit spend raises card owed and leaves Bank untouched. |
| 3 | **Writes carry it.** Insert, update, recurring copy, sync row map (`transactions.pay_from`, `imported_transactions.pay_from`). | Round-trip test. |
| 4 | **Imports derive it.** Paytm "…Rupay Credit Card" on a UPI payment → How UPI, From credit (was How Card). Alert text "UPI … credit card" likewise. | Parser tests. |
| 5 | **Add and Review show it.** The pay chip reads `UPI · from Bank`; the pay sheet shows From (Bank / Credit card) under UPI and Autopay only. Transaction detail shows From when it isn't the usual. | Guard: the choice appears only for UPI and Autopay. |
| 6 | **Server.** `0002_pay_from.sql` (additive column + CHECK), `pay_from` in the transactions and imported-transactions allowlists. **Needs your go to deploy.** Until then From works on the phone and isn't synced. | Deployed, migrated first (`npm run deploy`). |

Build order **1 → 2 → 3 → 4 → 5**, then 6 on your word. One commit per module or two.

## Not in scope

Named accounts (HDFC, SBI) — `DQ-14`. Landing (`INCOME_LANDING`) stays How-based: income arrives
into Bank, Cash or Wallet, never "from" a card. Approvals' `landed_pay_method` stays How; its From
is derived like any other row.
