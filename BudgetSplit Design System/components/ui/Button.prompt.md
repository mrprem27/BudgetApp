The BudgetSplit button — primary CTAs use the teal gradient; one primary per screen.

```jsx
<Button label="Save" variant="primary" onClick={save} />
<Button label="Settle Up" variant="secondary" />
<Button label="Delete" variant="destructive" icon="trash-2" />
<Button label="Skip" variant="ghost" size="sm" />
```

- Variants: `primary` (gradient fill), `secondary` (accent border), `ghost` (text only), `destructive` (coral fill).
- Sizes: `lg` (52px, default), `md` (44px), `sm` (36px). `fullWidth` stretches it. `loading` blocks presses.
