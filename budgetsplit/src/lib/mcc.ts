/**
 * ISO 18245 merchant category codes → our expense categories.
 *
 * A shop's UPI QR carries its MCC in EMV tag `52` (`emvQr.ts` parses it, `parseAnyUpiQr`
 * forwards it as `params.mc`). It is the merchant's own declaration of what they sell,
 * registered with their acquiring bank — which makes it a far better category signal than
 * guessing from a display name, and it costs nothing because the scan already has it.
 *
 * **Why this sits in front of the name guesser rather than replacing it.** MCC is
 * declared, not inferred, so where it exists it wins. But it is coarse by design: 5814 is
 * every fast-food counter in the country, and plenty of small merchants are registered
 * under a generic retail code that says little. So an unmapped or generic MCC falls
 * through to `matchCategory`, which reads the merchant's name.
 *
 * **Only codes with an unambiguous single answer are mapped.** 5999 "miscellaneous retail"
 * and 5311 "department stores" are deliberately absent: mapping them to Shopping would be
 * right often enough to look fine and wrong often enough to mis-budget, and a name like
 * "Krishna Medical Store" carries more signal than the code does. A category we cannot
 * defend is worse than none, because Review shows a filled field as an answer and a blank
 * one as a question.
 *
 * Every target must be a real name from `DEFAULT_CATEGORIES` — a category string that
 * matches nothing silently drops on the way into Review. `mcc.test.ts` holds that line.
 */
export const MCC_CATEGORY: Readonly<Record<string, string>> = {
  // Food & drink
  '5411': 'Groceries',          // grocery stores, supermarkets
  '5422': 'Groceries',          // meat, butchers
  '5441': 'Groceries',          // confectionery
  '5451': 'Groceries',          // dairy
  '5462': 'Groceries',          // bakeries
  '5499': 'Groceries',          // misc food — kirana, convenience
  '5812': 'Eating Out',         // restaurants
  '5813': 'Eating Out',         // bars, taverns
  '5814': 'Eating Out',         // fast food
  '5811': 'Eating Out',         // caterers

  // Transport
  '4121': 'Cab & Auto',         // taxis, limousines
  '4111': 'Metro & Bus',        // suburban/local commuter transport
  '4131': 'Metro & Bus',        // bus lines
  '5541': 'Fuel',               // service stations
  '5542': 'Fuel',               // automated fuel dispensers
  '7523': 'Parking & Toll',     // parking lots, garages
  '4784': 'Parking & Toll',     // tolls, bridge fees

  // Travel
  '3000': 'Travel',             // airlines (3000–3299 is per-carrier; 3000 is the common stand-in)
  '4511': 'Travel',             // airlines, air carriers
  '4722': 'Travel',             // travel agencies
  '7011': 'Travel',             // lodging, hotels
  '4112': 'Travel',             // passenger railways

  // Health
  '5912': 'Health & Pharmacy',  // drug stores, pharmacies
  '8011': 'Health & Pharmacy',  // doctors
  '8021': 'Health & Pharmacy',  // dentists
  '8062': 'Health & Pharmacy',  // hospitals
  '8071': 'Health & Pharmacy',  // medical labs
  '8043': 'Health & Pharmacy',  // opticians

  // Bills & utilities
  '4900': 'Bills',              // utilities — electric, gas, water, sanitary
  '4814': 'Mobile Recharge',    // telecom services
  '4899': 'WiFi & Broadband',   // cable, satellite, other pay TV/internet

  // Lifestyle
  '5651': 'Shopping',           // family clothing
  '5661': 'Shopping',           // shoe stores
  '5691': 'Shopping',           // men's & women's clothing
  '5944': 'Shopping',           // jewellery
  '5977': 'Salon & Grooming',   // cosmetic stores
  '7230': 'Salon & Grooming',   // beauty & barber shops
  '7997': 'Gym & Fitness',      // clubs — membership, athletic
  '7991': 'Entertainment',      // tourist attractions
  '7832': 'Entertainment',      // cinemas
  '7841': 'Entertainment',      // video rental
  '5732': 'Electronics',        // electronics stores
  '5734': 'Electronics',        // computer software
  '5945': 'Gifts',              // hobby, toy, game shops
  '5992': 'Gifts',              // florists

  // Home
  '5200': 'Home Supplies',      // home supply warehouse
  '5211': 'Maintenance',        // building materials, lumber
  '5251': 'Maintenance',        // hardware
  '5712': 'Home Supplies',      // furniture
  '5722': 'Home Supplies',      // household appliances

  // Education
  '8220': 'Education',          // colleges, universities
  '8211': 'Education',          // schools
  '8299': 'Education',          // other educational services

  // Money
  '6300': 'Insurance',          // insurance sales & underwriting
  '9311': 'Taxes',              // tax payments
};

/**
 * The category a merchant's own MCC implies, or `null` to fall through to the name guesser.
 *
 * Fails closed on anything malformed. The code arrives from a scanned QR, so it is
 * attacker-controlled: a four-digit shape is checked before the lookup, and an
 * unrecognised code returns `null` rather than a nearest guess.
 */
export function categoryForMcc(mcc: string | undefined | null): string | null {
  if (!mcc) return null;
  const code = mcc.trim();
  if (!/^\d{4}$/.test(code)) return null;
  return MCC_CATEGORY[code] ?? null;
}
