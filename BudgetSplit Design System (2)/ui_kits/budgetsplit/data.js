/* BudgetSplit UI-kit seed data. Amounts are integer paise (₹1 = 100 paise).
   Context: an urban Indian working professional in Gurgaon — the same framing
   the real app's category catalog is tuned for. */
window.BS_DATA = {
  me: { name: 'Aarav Mehta', color: '#319795' },

  // Dashboard headline (this month, my share)
  month: {
    spending: 4218000,   // ₹42,180
    prevSpending: 3890000,
    income: 9500000,     // ₹95,000
  },

  owe: 132500,           // you owe ₹1,325
  owed: 460000,          // owed ₹4,600

  budget: { allocated: 5000000, spent: 4218000, over: 2, near: 3 },

  // Per-category budget lines (paise) — feeds the Budget & Insights screen.
  budgetLines: [
    { name: 'Rent',          icon: 'home',          color: '#7C6AF7', allocated: 1800000, spent: 1800000 },
    { name: 'Food Delivery', icon: 'shopping-bag',  color: '#F0A500', allocated: 500000,  spent: 624000 },
    { name: 'Eating Out',    icon: 'coffee',        color: '#FB923C', allocated: 500000,  spent: 600000 },
    { name: 'Groceries',     icon: 'shopping-cart', color: '#3ECF8E', allocated: 700000,  spent: 512000 },
    { name: 'Cab & Auto',    icon: 'navigation',    color: '#FACC15', allocated: 400000,  spent: 388000 },
    { name: 'Subscriptions', icon: 'repeat',        color: '#2DD4BF', allocated: 300000,  spent: 294000 },
    { name: 'Health',        icon: 'heart',         color: '#F06060', allocated: 300000,  spent: 0 },
    { name: 'Fuel',          icon: 'droplet',       color: '#F97316', allocated: 200000,  spent: 0 },
    { name: 'Other',         icon: 'more-horizontal', color: '#8B8A99', allocated: 300000, spent: 0 },
  ],
  // Projection (simple pace estimate) shown on the insights screen.
  projection: { projected: 5240000, dayOfMonth: 16, daysInMonth: 30 },

  // Spending by category (paise) — feeds the donut
  byCategory: [
    { name: 'Rent',          paise: 1800000, color: '#7C6AF7', icon: 'home' },
    { name: 'Food Delivery', paise: 624000,  color: '#F0A500', icon: 'shopping-bag' },
    { name: 'Eating Out',    paise: 600000,  color: '#FB923C', icon: 'coffee' },
    { name: 'Groceries',     paise: 512000,  color: '#3ECF8E', icon: 'shopping-cart' },
    { name: 'Cab & Auto',    paise: 388000,  color: '#FACC15', icon: 'navigation' },
    { name: 'Subscriptions', paise: 294000,  color: '#2DD4BF', icon: 'repeat' },
  ],

  recent: [
    { category: 'Food Delivery', note: 'Swiggy — dinner',      icon: 'shopping-bag',  color: '#F0A500', paise: -48000,  kind: 'expense', when: 'Today' },
    { category: 'Cab & Auto',    note: 'Uber to office',        icon: 'navigation',    color: '#FACC15', paise: -21800,  kind: 'expense', when: 'Today' },
    { category: 'Chai & Snacks', note: 'Blue Tokai',            icon: 'box',           color: '#FBBF24', paise: -36000,  kind: 'expense', when: 'Today' },
    { category: 'Salary',        note: 'October — Acme Corp',   icon: 'briefcase',     color: '#3ECF8E', paise: 9500000, kind: 'income',  when: 'Yesterday' },
    { category: 'Groceries',     note: 'BigBasket weekly',      icon: 'shopping-cart', color: '#3ECF8E', paise: -184500, kind: 'expense', when: 'Yesterday' },
    { category: 'Settle with Priya', note: 'Goa trip share',    icon: 'check-circle',  color: '#8B7CF8', paise: -90000,  kind: 'settlement', when: '14 Jun' },
    { category: 'Subscriptions', note: 'Spotify + Netflix',     icon: 'repeat',        color: '#2DD4BF', paise: -79900,  kind: 'expense', when: '14 Jun' },
  ],

  groups: [
    { id: 'flat', name: 'Flatmates — Gurgaon', icon: 'home',         color: '#7C6AF7', spent: 6840000, members: 3, pct: 78, health: 'amber' },
    { id: 'goa',  name: 'Goa Trip',            icon: 'map',          color: '#F472B6', spent: 4215000, members: 5, pct: 104, health: 'red' },
    { id: 'me',   name: 'Personal',            icon: 'credit-card',  color: '#20C4B8', spent: 4218000, members: 1, pct: 84, health: 'amber', personal: true },
    { id: 'off',  name: 'Office Lunch Club',   icon: 'coffee',       color: '#FB923C', spent: 312000,  members: 6, pct: 41, health: 'green' },
  ],

  members: [
    { name: 'Aarav Mehta', color: '#319795' },
    { name: 'Priya Singh', color: '#B83280' },
    { name: 'Rohit Khanna', color: '#38A169' },
  ],

  // Reports tab — trend series with per-period drill-downs.
  reports: {
    month: {
      budget: 1150000, // weekly budget line (₹11,500)
      label: 'This month',
      bars: [
        { label: 'Jun 1',  paise: 620000,  top: [
          { name: 'Groceries',     color: '#3ECF8E', icon: 'shopping-cart', paise: 220000 },
          { name: 'Food Delivery', color: '#F0A500', icon: 'shopping-bag',  paise: 180000 },
          { name: 'Cab & Auto',    color: '#FACC15', icon: 'navigation',    paise: 120000 },
        ] },
        { label: 'Jun 8',  paise: 980000,  top: [
          { name: 'Eating Out',    color: '#FB923C', icon: 'coffee',        paise: 340000 },
          { name: 'Food Delivery', color: '#F0A500', icon: 'shopping-bag',  paise: 240000 },
          { name: 'Subscriptions', color: '#2DD4BF', icon: 'repeat',        paise: 159900 },
        ] },
        { label: 'Jun 15', paise: 760000,  top: [
          { name: 'Groceries',     color: '#3ECF8E', icon: 'shopping-cart', paise: 292000 },
          { name: 'Eating Out',    color: '#FB923C', icon: 'coffee',        paise: 160000 },
          { name: 'Cab & Auto',    color: '#FACC15', icon: 'navigation',    paise: 148000 },
        ] },
        { label: 'Jun 22', paise: 1240000, top: [
          { name: 'Food Delivery', color: '#F0A500', icon: 'shopping-bag',  paise: 320000 },
          { name: 'Cab & Auto',    color: '#FACC15', icon: 'navigation',    paise: 220000 },
          { name: 'Eating Out',    color: '#FB923C', icon: 'coffee',        paise: 180000 },
        ] },
        { label: 'Jun 29', paise: 618000,  top: [
          { name: 'Groceries',     color: '#3ECF8E', icon: 'shopping-cart', paise: 200000 },
          { name: 'Subscriptions', color: '#2DD4BF', icon: 'repeat',        paise: 134100 },
          { name: 'Food Delivery', color: '#F0A500', icon: 'shopping-bag',  paise: 124000 },
        ] },
      ],
    },
    year: {
      budget: 5000000, // monthly budget line (₹50,000)
      label: 'Last 12 months',
      bars: [
        { label: 'Jul', paise: 4120000 }, { label: 'Aug', paise: 4380000 },
        { label: 'Sep', paise: 3990000 }, { label: 'Oct', paise: 4710000 },
        { label: 'Nov', paise: 5240000 }, { label: 'Dec', paise: 6180000 },
        { label: 'Jan', paise: 4050000 }, { label: 'Feb', paise: 3870000 },
        { label: 'Mar', paise: 4460000 }, { label: 'Apr', paise: 4230000 },
        { label: 'May', paise: 4920000 }, { label: 'Jun', paise: 4218000 },
      ],
    },
  },

  // Per-group budget analytics — feeds the group-scoped insights view.
  groupBudget: {
    flat: {
      allocated: 9000000, spent: 6840000, rollover: 'Unused budget rolls into next month',
      members: [
        { name: 'Aarav Mehta',  color: '#319795', paid: 2840000, share: 2280000 },
        { name: 'Priya Singh',  color: '#B83280', paid: 2600000, share: 2280000 },
        { name: 'Rohit Khanna', color: '#38A169', paid: 1400000, share: 2280000 },
      ],
      lines: [
        { name: 'Rent',          icon: 'home',          color: '#7C6AF7', allocated: 6000000, spent: 6000000 },
        { name: 'Utilities',     icon: 'zap',           color: '#FACC15', allocated: 1200000, spent: 1340000 },
        { name: 'Groceries',     icon: 'shopping-cart', color: '#3ECF8E', allocated: 1200000, spent: 980000 },
        { name: 'Help & Cleaning', icon: 'wind',        color: '#2DD4BF', allocated: 600000,  spent: 520000 },
      ],
    },
    goa: {
      allocated: 4000000, spent: 4215000, rollover: 'One-off trip — no rollover',
      members: [
        { name: 'Aarav Mehta',  color: '#319795', paid: 1420000, share: 843000 },
        { name: 'Priya Singh',  color: '#B83280', paid: 980000,  share: 843000 },
        { name: 'Rohit Khanna', color: '#38A169', paid: 650000,  share: 843000 },
        { name: 'Neha Verma',   color: '#D69E2E', paid: 765000,  share: 843000 },
        { name: 'Karan Shah',   color: '#805AD5', paid: 400000,  share: 843000 },
      ],
      lines: [
        { name: 'Stay',      icon: 'home',     color: '#7C6AF7', allocated: 1800000, spent: 1920000 },
        { name: 'Flights',   icon: 'send',     color: '#2DD4BF', allocated: 1200000, spent: 1180000 },
        { name: 'Food & Bar', icon: 'coffee',  color: '#FB923C', allocated: 600000,  spent: 740000 },
        { name: 'Activities', icon: 'compass', color: '#F472B6', allocated: 400000,  spent: 375000 },
      ],
    },
    off: {
      allocated: 760000, spent: 312000, rollover: 'Resets weekly',
      members: [
        { name: 'Aarav Mehta',  color: '#319795', paid: 120000, share: 52000 },
        { name: 'Priya Singh',  color: '#B83280', paid: 80000,  share: 52000 },
        { name: 'Rohit Khanna', color: '#38A169', paid: 60000,  share: 52000 },
      ],
      lines: [
        { name: 'Lunch',  icon: 'coffee',       color: '#FB923C', allocated: 600000, spent: 268000 },
        { name: 'Snacks', icon: 'box',          color: '#FBBF24', allocated: 160000, spent: 44000 },
      ],
    },
  },
};
