The floating action button — teal→coral gradient, glows coral. Sits bottom-right over a screen.

```jsx
<div style={{ position: 'relative', height: '100%' }}>
  {/* ...screen... */}
  <FAB onClick={openAddMenu} />
</div>
```
Tapping it typically opens a bottom sheet of add actions (Expense, Income, Transfer, Itemized Bill). Needs a positioned ancestor.
