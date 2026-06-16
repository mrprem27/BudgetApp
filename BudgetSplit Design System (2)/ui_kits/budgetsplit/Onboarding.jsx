/* Onboarding hero — the welcome screen. Tapping "Get Started" enters the app. */
function Onboarding({ onDone }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Button, IconCircle } = DS;
  const features = [
    { icon: 'pie-chart', color: '#20C4B8', title: 'See where it goes', desc: 'A live picture of every rupee, by category' },
    { icon: 'users', color: '#7C6AF7', title: 'Split bills fairly', desc: 'Itemise and assign \u2014 everyone pays their share' },
    { icon: 'check-circle', color: '#3ECF8E', title: 'Settle in a tap', desc: 'Track who owes whom, clear it instantly' },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 16px 24px', textAlign: 'center' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 26, background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ position: 'absolute', inset: -1, borderRadius: 26, boxShadow: '0 0 44px 4px rgba(32,196,184,0.22)', pointerEvents: 'none' }}></div>
          <img src="../../assets/logo-mark.png" alt="" style={{ width: 62, height: 62, position: 'relative' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 36, fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>BudgetSplit</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 16, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.5, maxWidth: 300 }}>
          Budget your money and split bills — all on your phone, nothing in the cloud.
        </div>

        {/* Feature highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 34, width: '100%', maxWidth: 320, textAlign: 'left' }}>
          {features.map((f) => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <IconCircle name={f.icon} color={f.color} size={42} iconSize={19} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', fontWeight: 600, color: 'var(--text-primary)' }}>{f.title}</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Button label="Get Started" variant="primary" fullWidth onClick={onDone} />
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)', marginTop: 14 }}>Takes 20 seconds · no sign-up</div>
    </div>
  );
}
window.BS_Onboarding = Onboarding;
