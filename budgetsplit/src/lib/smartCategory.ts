/**
 * Smart categories: guess a category from a free-text title so a user can just
 * type "uber to office" instead of picking from a list. Pure + offline — a
 * hand-built keyword→category map over the default catalog. The guess is only
 * returned if a matching category actually exists in the user's list, and the
 * user can always override it.
 */

// Ordered, most-specific first. Category names mirror DEFAULT_CATEGORIES.
const RULES: { category: string; keywords: string[] }[] = [
  { category: 'Cab & Auto', keywords: ['uber', 'ola', 'rapido', 'cab', 'auto', 'taxi', 'ride', 'rickshaw', 'autorickshaw', 'drop', 'uber auto'] },
  { category: 'Metro & Bus', keywords: ['metro', 'bus', 'train', 'local', 'irctc', 'redbus', 'railway', 'ticket', 'bmtc', 'best', 'dtc', 'tram'] },
  { category: 'Fuel', keywords: ['petrol', 'diesel', 'fuel', 'gas station', 'indian oil', 'bharat petroleum', 'hpcl', 'bpcl', 'iocl', 'shell', 'cng', 'pump', 'petrol pump'] },
  { category: 'Parking & Toll', keywords: ['parking', 'toll', 'fastag', 'valet', 'toll plaza'] },
  { category: 'Food Delivery', keywords: ['swiggy', 'zomato', 'food delivery', 'eatsure', 'box8', 'dominos delivery', 'faasos', 'magicpin', 'ordered food', 'food order'] },
  { category: 'Groceries', keywords: ['grocery', 'groceries', 'bigbasket', 'blinkit', 'zepto', 'instamart', 'dmart', 'vegetable', 'vegetables', 'milk', 'kirana', 'supermarket', 'fruits', 'eggs', 'bread', 'jiomart', 'reliance fresh', 'sabzi', 'rations'] },
  { category: 'Chai & Snacks', keywords: ['chai', 'tea', 'coffee', 'cafe', 'starbucks', 'snack', 'snacks', 'samosa', 'ccd', 'chaayos', 'tapri', 'juice', 'shake', 'vada pav', 'pakora', 'cold drink'] },
  { category: 'Eating Out', keywords: ['restaurant', 'dinner', 'lunch', 'breakfast', 'dine', 'eat out', 'eating out', 'pizza', 'burger', 'biryani', 'kfc', 'mcdonald', 'mcd', 'dominos', 'dosa', 'thali', 'buffet', 'bar', 'pub', 'drinks', 'beer', 'food court', 'dhaba'] },
  { category: 'Rent', keywords: ['rent', 'landlord', 'house rent', 'flat rent', 'pg rent', 'maintenance', 'society maintenance', 'brokerage', 'deposit'] },
  { category: 'Household Help', keywords: ['maid', 'cook', 'house help', 'cleaner', 'driver salary', 'bai', 'nanny', 'gardener', 'househelp', 'domestic help'] },
  { category: 'Home Supplies', keywords: ['home supplies', 'utensil', 'utensils', 'detergent', 'cleaning', 'toiletries', 'soap', 'shampoo', 'tissue', 'mop', 'broom', 'dustbin', 'crockery', 'furniture', 'mattress'] },
  { category: 'Electricity', keywords: ['electricity', 'power bill', 'current bill', 'eb bill', 'electricity bill', 'bescom', 'tata power', 'adani electricity', 'lpg', 'gas cylinder', 'water bill'] },
  { category: 'Mobile Recharge', keywords: ['recharge', 'jio', 'airtel', 'vi', 'vodafone', 'mobile bill', 'postpaid', 'prepaid', 'phone recharge', 'bsnl', 'sim'] },
  { category: 'WiFi & Broadband', keywords: ['wifi', 'broadband', 'internet', 'fiber', 'fibre', 'act fibernet', 'jio fiber', 'airtel xstream', 'hathway', 'router'] },
  { category: 'Subscriptions', keywords: ['netflix', 'spotify', 'prime', 'amazon prime', 'hotstar', 'disney', 'subscription', 'youtube premium', 'icloud', 'sony liv', 'sonyliv', 'zee5', 'jiocinema', 'apple music', 'chatgpt', 'membership', 'renewal'] },
  { category: 'Entertainment', keywords: ['movie', 'film', 'cinema', 'pvr', 'inox', 'concert', 'game', 'gaming', 'bookmyshow', 'standup', 'stand up', 'comedy', 'show', 'amusement park', 'theme park', 'bowling', 'arcade', 'club', 'play'] },
  { category: 'Gym & Fitness', keywords: ['gym', 'fitness', 'cult', 'cultfit', 'workout', 'yoga', 'zumba', 'protein', 'supplement', 'trainer', 'crossfit', 'membership fee'] },
  { category: 'Salon & Grooming', keywords: ['salon', 'haircut', 'spa', 'grooming', 'barber', 'parlour', 'parlor', 'facial', 'waxing', 'manicure', 'pedicure', 'massage', 'beard'] },
  { category: 'Shopping', keywords: ['amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'clothes', 'clothing', 'shoes', 'shoe', 'shirt', 'tshirt', 'pant', 'pants', 'jeans', 'kurta', 'saree', 'dress', 'mall', 'meesho', 'nykaa', 'watch', 'bag', 'wallet', 'sunglasses', 'apparel', 'footwear', 'jacket', 'sneakers'] },
  { category: 'Electronics', keywords: ['electronics', 'gadget', 'laptop', 'phone', 'mobile', 'charger', 'headphone', 'headphones', 'earbud', 'earbuds', 'earphone', 'mouse', 'keyboard', 'monitor', 'tv', 'television', 'camera', 'powerbank', 'ssd', 'hard disk', 'tablet', 'ipad', 'speaker', 'smartwatch'] },
  { category: 'Health & Pharmacy', keywords: ['medicine', 'medicines', 'pharmacy', 'doctor', 'hospital', 'clinic', 'apollo', 'pharmeasy', 'health', 'tablet strip', '1mg', 'netmeds', 'dentist', 'checkup', 'lab test', 'blood test', 'diagnostic', 'consultation', 'vaccine', 'physiotherapy', 'spectacles', 'lenskart'] },
  { category: 'Insurance', keywords: ['insurance', 'premium', 'policy', 'lic', 'health insurance', 'term insurance', 'car insurance', 'bike insurance', 'mediclaim'] },
  { category: 'Investments / SIP', keywords: ['sip', 'investment', 'mutual fund', 'stock', 'stocks', 'zerodha', 'groww', 'shares', 'fd', 'rd', 'ppf', 'nps', 'gold', 'crypto', 'bitcoin', 'etf', 'upstox'] },
  { category: 'EMI & Loans', keywords: ['emi', 'loan', 'credit card bill', 'home loan', 'car loan', 'personal loan', 'bajaj finance', 'installment', 'repayment', 'cc bill'] },
  { category: 'Education', keywords: ['course', 'class', 'tuition', 'school fee', 'college', 'udemy', 'book', 'books', 'coursera', 'coaching', 'exam fee', 'stationery', 'notebook', 'fees', 'workshop', 'certification', 'byjus', 'unacademy'] },
  { category: 'Taxes', keywords: ['tax', 'gst', 'income tax', 'advance tax', 'tds', 'property tax', 'professional tax'] },
  { category: 'Gifts', keywords: ['gift', 'present', 'birthday', 'anniversary', 'wedding gift', 'donation', 'flowers', 'bouquet', 'chocolates'] },
  { category: 'Travel', keywords: ['flight', 'hotel', 'trip', 'travel', 'airbnb', 'makemytrip', 'goibibo', 'oyo', 'vacation', 'holiday', 'cleartrip', 'ixigo', 'visa', 'resort', 'sightseeing', 'tour', 'booking', 'yatra'] },
  { category: 'Family & Support', keywords: ['family', 'parents', 'home transfer', 'support', 'mom', 'dad', 'mother', 'father', 'pocket money', 'allowance'] },
];

/** Lowercase, fold every run of non-alphanumerics to a single space, pad with
 *  spaces so whole-word/phrase tests are just substring checks on " word ". */
function normalize(s: string): string {
  return ' ' + s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}

/**
 * Best-guess category name for a free-text title, or null if nothing matches.
 * Only returns a category whose name exists (case-insensitive) in `available`.
 *
 * Matching is **word-boundary aware**, not substring: "automatic" no longer
 * trips the "auto" cab keyword, "steam" no longer trips "tea", "facebook" no
 * longer trips "book". Both the title and each keyword are normalized and
 * space-padded, so a keyword matches only as a whole word (or whole phrase for
 * multi-word keywords like "gas station").
 *
 * When several keywords hit, the most *specific* wins:
 *   1. a multi-word phrase beats any single word (strong, deliberate signal);
 *   2. otherwise the earlier rule wins — RULES is ordered most-specific first,
 *      so e.g. "amazon prime" resolves to Subscriptions (prime) over Shopping.
 */
export function matchCategory(title: string, available: { name: string }[]): string | null {
  const t = normalize(title);
  if (t.trim() === '') return null;
  const names = new Map(available.map(c => [c.name.toLowerCase(), c.name]));

  let bestCategory: string | null = null;
  let bestScore = -1;
  RULES.forEach((rule, order) => {
    const exact = names.get(rule.category.toLowerCase());
    if (!exact) return; // not in the user's list — never guess a category they don't have
    for (const kw of rule.keywords) {
      const k = normalize(kw).trim();
      if (!k) continue;
      if (t.includes(' ' + k + ' ')) {
        const isPhrase = k.includes(' ');
        // Phrases dominate; among single words, earlier rule order ranks higher.
        const score = (isPhrase ? 1000 : 0) + (RULES.length - order);
        if (score > bestScore) { bestCategory = exact; bestScore = score; }
      }
    }
  });
  return bestCategory;
}
