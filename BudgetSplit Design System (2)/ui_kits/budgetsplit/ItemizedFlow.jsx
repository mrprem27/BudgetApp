/* Complete "Split a bill" flow — the differentiated, complex one, made legible:
   choose who's in → add line items → tap avatars to assign each item →
   see each person's share update live → save (others then owe you their share). */
function ItemizedFlow({ onClose, onSaved }) {
  const DS = window.BudgetSplitDesignSystem_f6e8de;
  const { Button, Icon, MemberAvatar, AmountText, Card } = DS;

  const [members, setMembers] = React.useState([
    { name: 'Aarav Mehta', color: '#319795', me: true, in: true },
    { name: 'Priya Singh', color: '#B83280', in: true },
    { name: 'Rohit Khanna', color: '#38A169', in: true },
    { name: 'Neha Kapoor', color: '#3182CE', in: false },
  ]);
  const inIdx = members.map((m, i) => (m.in ? i : -1)).filter((i) => i >= 0);

  const [items, setItems] = React.useState([
    { id: 1, name: 'Pizzas', entry: '840', who: [0, 1, 2] },
    { id: 2, name: 'Drinks', entry: '420', who: [1, 2] },
  ]);
  const [saving, setSaving] = React.useState(false);
  const nextId = React.useRef(3);

  const P = window.BS_entryToPaise;
  const shares = members.map(() => 0);
  let total = 0;
  items.forEach((it) => {
    const p = P(it.entry);
    total += p;
    const who = it.who.filter((i) => members[i] && members[i].in);
    if (who.length) who.forEach((i) => { shares[i] += p / who.length; });
  });

  function toggleMember(i) {
    setMembers((ms) => ms.map((m, idx) => (idx === i ? { ...m, in: !m.in } : m)));
  }
  function toggleAssign(itemId, mi) {
    setItems((its) => its.map((it) => {
      if (it.id !== itemId) return it;
      const has = it.who.includes(mi);
      return { ...it, who: has ? it.who.filter((x) => x !== mi) : [...it.who, mi] };
    }));
  }
  function addItem() {
    setItems((its) => [...its, { id: nextId.current++, name: '', entry: '', who: [...inIdx] }]);
  }
  function setItem(id, patch) { setItems((its) => its.map((it) => (it.id === id ? { ...it, ...patch } : it))); }
  function removeItem(id) { setItems((its) => its.filter((it) => it.id !== id)); }

  const ready = total > 0;
  function save() {
    if (!ready || saving) return;
    setSaving(true);
    const myShare = Math.round(shares[0]);
    window.BS_STORE.addTxn({ category: 'Split bill', note: `Split ${inIdx.length} ways · you paid ₹${(total / 100).toLocaleString('en-IN')}`, icon: 'users', color: '#F472B6', paise: -myShare, kind: 'expense' });
    // others now owe you their share
    members.forEach((m, i) => {
      if (m.me || !m.in) return;
      const sh = Math.round(shares[i]);
      if (sh > 0) {
        const bal = window.BS_STORE.get().balances.find((b) => b.name === m.name);
        if (bal) window.BS_STORE.recordSettle && null; // balances adjusted below
      }
    });
    // directly bump balances: they owe you more
    const st = window.BS_STORE.get();
    st.balances = st.balances.map((b) => {
      const mi = members.findIndex((m) => m.name === b.name && m.in && !m.me);
      if (mi < 0) return b;
      return { ...b, net: b.net + Math.round(shares[mi]) };
    });
    onSaved && onSaved();
  }

  const lbl = { fontFamily: 'var(--font-ui)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', margin: '0 2px 10px' };

  return (
    <window.BS_FlowShell
      title="Split a bill"
      onClose={onClose}
      closeIcon="x"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>Bill total</div>
            <AmountText paise={total} size="lg" forceColor="var(--text-primary)" />
          </div>
          <div style={{ width: 150 }}><Button label="Save split" variant="primary" fullWidth disabled={!ready} onClick={save} /></div>
        </div>
      }
    >
      {/* Who's in */}
      <div style={lbl}>Who's in</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {members.map((m, i) => (
          <button key={m.name} onClick={() => !m.me && toggleMember(i)} style={{ background: 'none', border: 'none', cursor: m.me ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: m.in ? 1 : 0.4, transition: 'opacity 140ms ease' }}>
            <MemberAvatar name={m.name} color={m.color} size={44} selected={m.in} />
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-secondary)' }}>{m.me ? 'You' : m.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Items */}
      <div style={lbl}>Items · tap avatars to assign</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {items.map((it) => (
          <Card key={it.id} style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <input value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} placeholder="Item" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', fontWeight: 600 }} />
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 16 }}>₹</span>
              <input value={it.entry} onChange={(e) => setItem(it.id, { entry: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" placeholder="0" style={{ width: 72, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 16, textAlign: 'right', padding: '6px 8px' }} />
              <button onClick={() => removeItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}><Icon name="x" size={16} color="var(--text-muted)" /></button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {inIdx.map((mi) => {
                const on = it.who.includes(mi);
                return (
                  <button key={mi} onClick={() => toggleAssign(it.id, mi)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: on ? 1 : 0.28, transform: on ? 'scale(1)' : 'scale(0.9)', transition: 'opacity 140ms ease, transform 140ms ease' }}>
                    <MemberAvatar name={members[mi].name} color={members[mi].color} size={30} selected={on} />
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      <button onClick={addItem} style={{ width: '100%', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', cursor: 'pointer', padding: '12px', fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
        <Icon name="plus" size={16} color="var(--accent)" /> Add item
      </button>

      {/* Live breakdown */}
      <div style={lbl}>Each person pays</div>
      <Card padded={false} style={{ padding: '4px 16px' }}>
        {members.filter((m) => m.in).map((m, idx, arr) => {
          const mi = members.indexOf(m);
          return (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <MemberAvatar name={m.name} color={m.color} size={34} />
              <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 'var(--body-size)', color: 'var(--text-primary)' }}>{m.me ? 'You' : m.name}</span>
              <AmountText paise={Math.round(shares[mi])} size="sm" forceColor={m.me ? 'var(--accent)' : 'var(--text-primary)'} />
            </div>
          );
        })}
      </Card>
    </window.BS_FlowShell>
  );
}
window.BS_ItemizedFlow = ItemizedFlow;
