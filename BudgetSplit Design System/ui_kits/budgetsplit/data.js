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

  budget: { allocated: 5000000, spent: 4218000, over: 1, near: 2 },

  // Spending by category (paise) — feeds the donut
  byCategory: [
    { name: 'Rent',          paise: 1800000, color: '#7C6AF7' },
    { name: 'Food Delivery', paise: 624000,  color: '#F0A500' },
    { name: 'Groceries',     paise: 512000,  color: '#3ECF8E' },
    { name: 'Cab & Auto',    paise: 388000,  color: '#FACC15' },
    { name: 'Subscriptions', paise: 294000,  color: '#2DD4BF' },
    { name: 'Eating Out',    paise: 600000,  color: '#FB923C' },
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
};
