/* Live in-memory store for the BudgetSplit prototype, so actions (add expense,
   split a bill, settle up) actually change what the dashboard & ledger show.
   Seeded from BS_DATA. Plain pub/sub + a React hook (window.useBS). */
(function () {
  const seed = window.BS_DATA;

  let state = {
    txns: seed.recent.map((t, i) => ({ id: 'seed-' + i, ...t })),
    // What you owe each member (negative = you owe them, positive = they owe you), in paise.
    balances: [
      { name: 'Priya Singh', color: '#B83280', net: -90000 },
      { name: 'Rohit Khanna', color: '#38A169', net: 46000 },
      { name: 'Neha Kapoor', color: '#3182CE', net: -32500 },
    ],
  };

  const subs = new Set();
  function emit() { subs.forEach((f) => f()); }

  window.BS_STORE = {
    get: () => state,
    addTxn(t) {
      const txn = { id: 't-' + Date.now(), when: 'Today', kind: 'expense', ...t };
      state = { ...state, txns: [txn, ...state.txns] };
      emit();
      return txn;
    },
    recordSettle(name, paise) {
      // paise is the magnitude settled; reduce the outstanding toward zero.
      state = {
        ...state,
        balances: state.balances.map((b) => {
          if (b.name !== name) return b;
          const dir = b.net < 0 ? 1 : -1;
          return { ...b, net: b.net + dir * Math.min(Math.abs(b.net), paise) };
        }),
        txns: [{ id: 't-' + Date.now(), when: 'Today', kind: 'settlement', category: 'Settle with ' + name.split(' ')[0], note: 'Recorded payment', icon: 'check-circle', color: '#8B7CF8', paise: -paise }, ...state.txns],
      };
      emit();
    },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };

  window.useBS = function () {
    const [, force] = React.useReducer((x) => x + 1, 0);
    React.useEffect(() => window.BS_STORE.subscribe(force), []);
    return [window.BS_STORE.get(), window.BS_STORE];
  };

  // Curated category grid for the add-expense flow (from the master catalog).
  window.BS_CATS = [
    { name: 'Food Delivery', icon: 'shopping-bag', color: '#F0A500' },
    { name: 'Groceries', icon: 'shopping-cart', color: '#3ECF8E' },
    { name: 'Eating Out', icon: 'coffee', color: '#FB923C' },
    { name: 'Cab & Auto', icon: 'navigation', color: '#FACC15' },
    { name: 'Rent', icon: 'home', color: '#7C6AF7' },
    { name: 'Electricity', icon: 'zap', color: '#60A5FA' },
    { name: 'Subscriptions', icon: 'repeat', color: '#2DD4BF' },
    { name: 'Shopping', icon: 'shopping-bag', color: '#A78BFA' },
    { name: 'Health', icon: 'heart', color: '#F06060' },
    { name: 'Fuel', icon: 'droplet', color: '#F97316' },
    { name: 'Entertainment', icon: 'film', color: '#F87171' },
    { name: 'Other', icon: 'more-horizontal', color: '#8B8A99' },
  ];

  window.BS_INCOME_CATS = [
    { name: 'Salary', icon: 'briefcase', color: '#3ECF8E' },
    { name: 'Freelance', icon: 'edit-3', color: '#34D399' },
    { name: 'Business', icon: 'trending-up', color: '#10B981' },
    { name: 'Bonus', icon: 'award', color: '#22C55E' },
    { name: 'Cashback', icon: 'corner-up-left', color: '#2BD49B' },
    { name: 'Interest', icon: 'percent', color: '#4ADE80' },
    { name: 'Refund', icon: 'rotate-ccw', color: '#3ECF8E' },
    { name: 'Other', icon: 'more-horizontal', color: '#8B8A99' },
  ];

  // --- amount entry helpers (entry is a rupee string; money is integer paise) ---
  window.BS_keyReduce = function (str, key) {
    if (key === 'del') return str.length <= 1 ? '' : str.slice(0, -1);
    if (key === '.') {
      if (str.includes('.') || str === '') return str === '' ? '0.' : str;
      return str + '.';
    }
    // digit
    if (str === '0') return key; // replace leading zero
    const dot = str.indexOf('.');
    if (dot >= 0 && str.length - dot > 2) return str; // max 2 decimals
    if (str.replace('.', '').length >= 9) return str; // sane cap
    return str + key;
  };
  window.BS_entryToPaise = function (str) {
    if (!str) return 0;
    return Math.round(parseFloat(str) * 100);
  };
  window.BS_fmtEntry = function (str) {
    if (!str) return '0';
    const [intp, dec] = str.split('.');
    const grouped = parseInt(intp || '0', 10).toLocaleString('en-IN');
    return dec !== undefined ? grouped + '.' + dec : grouped;
  };
  // paise → display rupees
  window.BS_formatRupees = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  window.BS_formatRupeesShort = (paise) => '₹' + Math.round(paise / 100).toLocaleString('en-IN');
})();
