All money in BudgetSplit renders through AmountText, in Space Mono. Sign drives the color.

```jsx
<AmountText paise={1850000} size="xl" forceColor="var(--text-primary)" rounded /> /* ₹18,500 hero */
<AmountText paise={-45000} size="sm" />        /* −₹450.00 in coral */
<AmountText paise={120000} size="md" showSign />/* +₹1,200.00 in green */
```

- Amounts are **integer paise** (₹1 = 100 paise) — never floats. `formatRupees` / `formatRupeesShort` exported for plain text.
- `forceColor` overrides the green/coral sign coloring (use for neutral totals).
