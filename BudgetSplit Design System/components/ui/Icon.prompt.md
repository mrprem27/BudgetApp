Renders Feather icons (the only icon set BudgetSplit uses) and the signature colored icon-circle.

```jsx
<Icon name="trending-up" size={18} color="var(--income)" />
<IconCircle name="home" color="#7C6AF7" size={40} />
```

- `Icon` — bare SVG glyph; pass any valid Feather name. Unknown names render nothing.
- `IconCircle` — icon inside a tinted circle (background = color at ~13% opacity). Used for categories, transaction rows, settings rows, empty states.
- Requires the Feather script on the page: `<script src="https://unpkg.com/feather-icons"></script>`.
