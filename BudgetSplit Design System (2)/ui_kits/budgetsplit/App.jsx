/* App shell — phone frame, status bar, scroll area, bottom tab bar + FAB.
   Owns navigation, the live add/settle flows, and success feedback. */
function App() {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { FAB, Icon } = DS;
  const [stage, setStage] = React.useState('onboarding'); // onboarding | app
  const [tab, setTab] = React.useState('home');
  const [detail, setDetail] = React.useState(null);
  const [budget, setBudget] = React.useState(false);
  const [category, setCategory] = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [flow, setFlow] = React.useState(null); // expense | income | itemized | settle
  const [success, setSuccess] = React.useState(null);

  const TABS = [
    { key: 'home', icon: 'home', label: 'Home' },
    { key: 'groups', icon: 'users', label: 'Groups' },
    { key: 'reports', icon: 'bar-chart-2', label: 'Reports' },
    { key: 'settings', icon: 'settings', label: 'Settings' },
  ];

  const Onboarding = window.BS_Onboarding;
  const GroupDetail = window.BS_GroupDetail;
  const DashboardScreen = window.BS_Dashboard;
  const GroupsScreen = window.BS_Groups;
  const ReportsScreen = window.BS_Reports;
  const SettingsScreen = window.BS_Settings;
  const AddSheet = window.BS_AddSheet;
  const ExpenseFlow = window.BS_ExpenseFlow;
  const ItemizedFlow = window.BS_ItemizedFlow;
  const SettleFlow = window.BS_SettleFlow;
  const SuccessOverlay = window.BS_SuccessOverlay;
  const BudgetInsights = window.BS_BudgetInsights;
  const CategoryDetail = window.BS_CategoryDetail;

  function openGroup(g) { setDetail(g); }
  function openSettle() { setFlow('settle'); }

  function finish(label) {
    setFlow(null);
    setDetail(null);
    setBudget(false);
    setCategory(null);
    setTab('home');
    setSuccess(label);
    setTimeout(() => setSuccess(null), 1500);
  }

  let screen;
  if (category) {
    screen = <CategoryDetail category={category} onBack={() => setCategory(null)} />;
  } else if (budget) {
    screen = <BudgetInsights onBack={() => setBudget(false)} />;
  } else if (detail) {
    screen = <GroupDetail group={detail} onBack={() => setDetail(null)} onSettle={openSettle} />;
  } else if (tab === 'home') {
    screen = <DashboardScreen onOpenGroup={openGroup} onSettle={openSettle} onOpenBudget={() => setBudget(true)} onOpenCategory={(c) => setCategory(c)} />;
  } else if (tab === 'groups') {
    screen = <GroupsScreen onOpenGroup={openGroup} onSettle={openSettle} />;
  } else if (tab === 'reports') {
    screen = <ReportsScreen onOpenCategory={(c) => setCategory(c)} />;
  } else {
    screen = <SettingsScreen />;
  }

  const flowEl =
    flow === 'expense' ? <ExpenseFlow onClose={() => setFlow(null)} onSaved={() => finish('Expense added')} />
    : flow === 'income' ? <ExpenseFlow kind="income" onClose={() => setFlow(null)} onSaved={() => finish('Income added')} />
    : flow === 'itemized' ? <ItemizedFlow onClose={() => setFlow(null)} onSaved={() => finish('Split saved')} />
    : flow === 'settle' ? <SettleFlow onClose={() => setFlow(null)} onSaved={() => finish('Payment recorded')} />
    : null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#05080A', padding: 24 }}>
      {/* Phone */}
      <div style={{ position: 'relative', width: 390, height: 844, background: 'var(--bg)', borderRadius: 46, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.6), 0 0 0 11px #1a1d22, 0 0 0 13px #2a2e34' }}>
        {/* Status bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 28px 6px', zIndex: 120, pointerEvents: 'none' }}>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>9:41</span>
          <div style={{ width: 120, height: 30, background: '#000', borderRadius: 16, position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 10 }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-primary)' }}>
            <Icon name="wifi" size={15} color="var(--text-primary)" />
            <Icon name="battery" size={16} color="var(--text-primary)" />
          </div>
        </div>

        {/* Scroll area */}
        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', paddingTop: 50 }} className="bs-scroll">
          {stage === 'onboarding'
            ? <div style={{ height: 794 }}><Onboarding onDone={() => setStage('app')} /></div>
            : screen}
        </div>

        {/* FAB (hidden in onboarding, detail, budget, category & flows) */}
        {stage === 'app' && !detail && !budget && !category && !flow && (
          <FAB onClick={() => setAddOpen(true)} style={{ bottom: 96, right: 20 }} />
        )}

        {/* Tab bar */}
        {stage === 'app' && !flow && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 84, paddingBottom: 18, background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--border)', display: 'flex', zIndex: 60 }}>
            {TABS.map((t) => {
              const active = !detail && !budget && !category && tab === t.key;
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setDetail(null); setBudget(false); setCategory(null); }} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 10 }}>
                  <Icon name={t.icon} size={22} color={active ? 'var(--accent)' : 'var(--text-muted)'} />
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text-muted)' }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Add sheet */}
        <AddSheet open={addOpen} onClose={() => setAddOpen(false)} onPick={(k) => setFlow(k)} />

        {/* Active flow */}
        {flowEl}

        {/* Success */}
        <SuccessOverlay show={!!success} label={success || 'Saved'} />
      </div>
    </div>
  );
}
window.BS_App = App;
