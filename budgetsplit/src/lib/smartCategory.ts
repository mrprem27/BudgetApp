/**
 * Smart categories: guess a category from a free-text title so a user can just
 * type "uber to office" instead of picking from a list. Pure + offline — a
 * hand-built keyword→category map over the default catalog. The guess is only
 * returned if a matching category actually exists in the user's list, and the
 * user can always override it.
 */

// Ordered, most-specific first. Category names mirror DEFAULT_CATEGORIES.
const RULES: { category: string; keywords: string[] }[] = [
  { category: 'Cab & Auto', keywords: ['uber', 'ola', 'rapido', 'cab', 'auto', 'taxi', 'ride'] },
  { category: 'Metro & Bus', keywords: ['metro', 'bus', 'train', 'local', 'irctc'] },
  { category: 'Fuel', keywords: ['petrol', 'diesel', 'fuel', 'gas station', 'hp ', 'indian oil'] },
  { category: 'Parking & Toll', keywords: ['parking', 'toll', 'fastag'] },
  { category: 'Food Delivery', keywords: ['swiggy', 'zomato', 'food delivery', 'eatsure', 'box8'] },
  { category: 'Groceries', keywords: ['grocery', 'groceries', 'bigbasket', 'blinkit', 'zepto', 'instamart', 'dmart', 'vegetable', 'milk', 'kirana'] },
  { category: 'Chai & Snacks', keywords: ['chai', 'tea', 'coffee', 'cafe', 'starbucks', 'snack', 'samosa'] },
  { category: 'Eating Out', keywords: ['restaurant', 'dinner', 'lunch', 'breakfast', 'dine', 'eat out', 'pizza', 'burger', 'biryani'] },
  { category: 'Rent', keywords: ['rent', 'landlord'] },
  { category: 'Household Help', keywords: ['maid', 'cook', 'help', 'cleaner', 'driver salary'] },
  { category: 'Home Supplies', keywords: ['home supplies', 'utensil', 'detergent', 'cleaning'] },
  { category: 'Electricity', keywords: ['electricity', 'power bill', 'current bill'] },
  { category: 'Mobile Recharge', keywords: ['recharge', 'jio', 'airtel', 'vi ', 'vodafone', 'mobile bill'] },
  { category: 'WiFi & Broadband', keywords: ['wifi', 'broadband', 'internet', 'fiber', 'act '] },
  { category: 'Subscriptions', keywords: ['netflix', 'spotify', 'prime', 'hotstar', 'subscription', 'youtube premium', 'icloud'] },
  { category: 'Entertainment', keywords: ['movie', 'cinema', 'pvr', 'inox', 'concert', 'game', 'bookmyshow'] },
  { category: 'Gym & Fitness', keywords: ['gym', 'fitness', 'cult', 'workout', 'yoga'] },
  { category: 'Salon & Grooming', keywords: ['salon', 'haircut', 'spa', 'grooming', 'barber'] },
  { category: 'Shopping', keywords: ['amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'clothes', 'shoes', 'mall'] },
  { category: 'Electronics', keywords: ['electronics', 'gadget', 'laptop', 'phone', 'charger', 'headphone', 'earbud'] },
  { category: 'Health & Pharmacy', keywords: ['medicine', 'pharmacy', 'doctor', 'hospital', 'clinic', 'apollo', 'pharmeasy', 'health'] },
  { category: 'Insurance', keywords: ['insurance', 'premium', 'policy', 'lic'] },
  { category: 'Investments / SIP', keywords: ['sip', 'investment', 'mutual fund', 'stock', 'zerodha', 'groww'] },
  { category: 'EMI & Loans', keywords: ['emi', 'loan', 'credit card bill'] },
  { category: 'Education', keywords: ['course', 'class', 'tuition', 'school fee', 'college', 'udemy', 'book'] },
  { category: 'Taxes', keywords: ['tax', 'gst', 'income tax'] },
  { category: 'Gifts', keywords: ['gift', 'present', 'birthday'] },
  { category: 'Travel', keywords: ['flight', 'hotel', 'trip', 'travel', 'airbnb', 'makemytrip', 'goibibo', 'oyo'] },
  { category: 'Family & Support', keywords: ['family', 'parents', 'home transfer', 'support'] },
];

/**
 * Best-guess category name for a free-text title, or null if nothing matches.
 * Only returns a category whose name exists (case-insensitive) in `available`.
 */
export function matchCategory(title: string, available: { name: string }[]): string | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  const names = new Map(available.map(c => [c.name.toLowerCase(), c.name]));
  for (const rule of RULES) {
    if (rule.keywords.some(k => t.includes(k.trim()))) {
      const exact = names.get(rule.category.toLowerCase());
      if (exact) return exact;
    }
  }
  return null;
}
