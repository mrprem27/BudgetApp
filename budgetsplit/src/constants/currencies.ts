export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'SGD' | 'AED' | 'THB';

export type CurrencyDef = {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  decimals: number;
};

export const CURRENCIES: CurrencyDef[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', decimals: 2 },
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', decimals: 0 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', decimals: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA', decimals: 2 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG', decimals: 2 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE', decimals: 2 },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', locale: 'th-TH', decimals: 2 },
];

export const CURRENCY_MAP: Record<CurrencyCode, CurrencyDef> = Object.fromEntries(
  CURRENCIES.map(c => [c.code, c]),
) as Record<CurrencyCode, CurrencyDef>;

export const DEFAULT_CURRENCY: CurrencyCode = 'INR';
