A transaction list row — category icon circle, name + optional note, signed amount.

```jsx
<TransactionRow category="Groceries" note="BigBasket" icon="shopping-cart" color="#3ECF8E" paise={-128000} />
<TransactionRow category="Salary" kind="income" paise={6500000} />
<TransactionRow category="Settle with Priya" kind="settlement" paise={-90000} />
```

- `kind="income"` forces a green trending-up icon; `settlement` forces purple check-circle. Min 64px tall — stack inside a `Card padded={false}` with `Divider`s.
