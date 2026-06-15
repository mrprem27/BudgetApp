/* Onboarding hero — the welcome screen. Tapping "Get Started" enters the app. */
function Onboarding({ onDone }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Button } = DS;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 16px 24px', textAlign: 'center' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: 92, height: 92, borderRadius: 24, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: 'var(--shadow-lg)' }}>
          <img src="../../assets/logo-mark.png" alt="" style={{ width: 60, height: 60 }} />
        </div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 36, fontWeight: 600, letterSpacing: '-0.4px', color: 'var(--text-primary)' }}>BudgetSplit</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 16, color: 'var(--text-secondary)', marginTop: 16, lineHeight: 1.5, maxWidth: 300 }}>
          Budget your money and split bills — all on your phone, nothing in the cloud.
        </div>
      </div>
      <Button label="Get Started" variant="primary" fullWidth onClick={onDone} />
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--caption-size)', color: 'var(--text-muted)', marginTop: 14 }}>Takes 20 seconds · no sign-up</div>
    </div>
  );
}
window.BS_Onboarding = Onboarding;
