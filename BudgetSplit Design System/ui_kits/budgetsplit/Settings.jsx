/* Settings tab — profile, privacy toggles, preferences, personal limits. */
function Settings() {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Card, Divider, SettingsRow, Switch, MemberAvatar, Icon } = DS;
  const D = window.BS_DATA;
  const [faceId, setFaceId] = React.useState(false);
  const [privacy, setPrivacy] = React.useState(true);
  const [loc, setLoc] = React.useState(false);

  const section = { fontFamily: 'var(--font-ui)', fontSize: 'var(--label-size)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '20px 0 8px' };

  return (
    <div style={{ padding: '0 16px 130px' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--title-size)', fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)', padding: '8px 0 4px' }}>Settings</div>

      <div style={section}>Account</div>
      <Card style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <MemberAvatar name={D.me.name} color={D.me.color} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--subheading-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{D.me.name}</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)', marginTop: 2 }}>Tap to edit your name</div>
        </div>
        <Icon name="edit-2" size={16} color="var(--text-muted)" />
      </Card>

      <div style={section}>Privacy &amp; Security</div>
      <Card padded={false}>
        <SettingsRow icon="lock" label="Face ID / Touch ID lock" right={<Switch checked={faceId} onChange={setFaceId} />} />
        <Divider inset={64} />
        <SettingsRow icon="eye-off" label="Privacy screen" right={<Switch checked={privacy} onChange={setPrivacy} />} />
        <Divider inset={64} />
        <SettingsRow icon="map-pin" label="Save transaction location" right={<Switch checked={loc} onChange={setLoc} />} />
      </Card>

      <div style={section}>Preferences</div>
      <Card padded={false}>
        <SettingsRow icon="repeat" label="Default budget cadence" value="Monthly" onClick={() => {}} />
        <Divider inset={64} />
        <SettingsRow icon="dollar-sign" label="Currency" value="₹ Indian Rupee" chevron={false} />
      </Card>

      <div style={section}>Manage</div>
      <Card padded={false}>
        <SettingsRow icon="tag" label="Categories" onClick={() => {}} />
        <Divider inset={64} />
        <SettingsRow icon="clock" label="History" onClick={() => {}} />
        <Divider inset={64} />
        <SettingsRow icon="help-circle" label="Help &amp; Guide" onClick={() => {}} />
      </Card>

      <div style={{ textAlign: 'center', marginTop: 24, fontFamily: 'var(--font-ui)' }}>
        <div style={{ fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>BudgetSplit v1.0</div>
        <div style={{ fontSize: 'var(--caption-size)', color: 'var(--text-secondary)', marginTop: 2 }}>Offline-first · No accounts · No tracking</div>
      </div>
    </div>
  );
}
window.BS_Settings = Settings;
