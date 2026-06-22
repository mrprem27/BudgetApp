Every empty list/data state uses this — never a bare "nothing here" string.

```jsx
<EmptyState
  icon="users"
  title="No groups yet"
  body="Create a group to track shared expenses with friends, family or roommates."
  actionLabel="New Group"
  onAction={create}
/>
```

- Always: 64px icon circle → bold title → 1–2 line body → optional primary CTA. Pass `tint` to recolor.
