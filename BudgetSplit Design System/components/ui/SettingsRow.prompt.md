A settings/form row: tinted icon circle + label + value/chevron. Min 52px tall.

```jsx
<Card padded={false}>
  <SettingsRow icon="repeat" label="Default cadence" value="Monthly" onClick={pick} />
  <Divider inset={64} />
  <SettingsRow icon="lock" label="Face ID lock" right={<Switch checked={on} onChange={setOn} />} />
  <Divider inset={64} />
  <SettingsRow icon="trash-2" label="Delete account" danger onClick={del} />
</Card>
```

- Put a `Switch` or any node in `right`. `danger` flips the row to coral.
