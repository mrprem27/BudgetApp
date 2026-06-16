The grouping container — nothing floats bare on the dark background. Group rows and fields inside.

```jsx
<Card>
  <SettingsRow icon="repeat" label="Default cadence" value="Monthly" />
  <Divider inset={64} />
  <SettingsRow icon="dollar-sign" label="Currency" value="₹ Indian Rupee" />
</Card>
```

- `padded` (default true) — set false for full-bleed row lists, then pad rows themselves.
- `Divider` — hairline between rows; pass `inset` to start it past an icon (typically 64).
