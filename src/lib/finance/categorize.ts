import type { Confidence, TransactionCategory } from './types';

// Local merchant → category fallback. Nessie purchases are not categorized, and
// Plaid can't categorize arbitrary Nessie purchases, so we categorize ourselves
// and let the player correct mistakes.

type Rule = { pattern: RegExp; category: TransactionCategory; confidence: Confidence };

// Order matters: the first match wins (e.g. "uber eats" before "uber").
const NAME_RULES: Rule[] = [
  { pattern: /\b(payroll|salary|paycheck|direct dep(osit)?)\b/i, category: 'income', confidence: 'high' },
  { pattern: /\b(vanguard|fidelity|schwab|robinhood|brokerage|roth|ira|401k)\b/i, category: 'investment_contribution', confidence: 'medium' },
  { pattern: /\b(uber ?eats|doordash|grubhub|postmates)\b/i, category: 'dining_out', confidence: 'high' },
  { pattern: /\b(netflix|spotify|hulu|disney\+?|hbo|max streaming|youtube premium|apple music|crunchyroll|audible|planet fitness|gym membership)\b/i, category: 'subscriptions', confidence: 'high' },
  { pattern: /\b(chipotle|starbucks|mcdonald'?s|chick-fil-a|panera|taco|pizza|sushi|burger|cafe|coffee|restaurant|diner|grill|kitchen|whataburger|torchy'?s)\b/i, category: 'dining_out', confidence: 'high' },
  { pattern: /\b(bar|pub|brewery|brewing|tavern|lounge|night ?club|taproom|saloon)\b/i, category: 'nightlife', confidence: 'medium' },
  { pattern: /\b(amc|cinemark|cinema|movie|theater|steam|playstation|xbox|nintendo|ticketmaster|concert|bowling|arcade|topgolf)\b/i, category: 'entertainment', confidence: 'high' },
  { pattern: /\b(kroger|h-?e-?b|whole foods|trader joe'?s|aldi|safeway|publix|tom thumb|sprouts|grocery)\b/i, category: 'groceries', confidence: 'high' },
  { pattern: /\b(costco|walmart)\b/i, category: 'groceries', confidence: 'low' },
  { pattern: /\b(amazon|target|best buy|nike|h&m|zara|ulta|sephora|old navy|uniqlo|mall|apparel|shein)\b/i, category: 'shopping', confidence: 'medium' },
  { pattern: /\b(rent|landlord|apartments?|property management|leasing)\b/i, category: 'housing', confidence: 'high' },
  { pattern: /\b(electric|energy|txu|reliant|water utility|water bill|internet|wifi|at&t|verizon|t-mobile|comcast|xfinity|spectrum|wireless|phone bill)\b/i, category: 'utilities', confidence: 'high' },
  { pattern: /\b(shell|exxon|chevron|valero|qt|quiktrip|gas station|fuel|uber|lyft|dart|metro|parking|toll)\b/i, category: 'transportation', confidence: 'medium' },
  { pattern: /\b(cvs|walgreens|pharmacy|clinic|dental|dentist|doctor|urgent care|hospital)\b/i, category: 'healthcare', confidence: 'high' },
  { pattern: /\b(student loan|loan payment|navient|nelnet|sallie mae|mohela|card payment|credit card|quicksilver|venture card|savor)\b/i, category: 'debt_payment', confidence: 'high' },
  { pattern: /\bsavings\b/i, category: 'savings_transfer', confidence: 'medium' },
];

// Nessie merchants carry free-form category tags (e.g. ["food"]).
const PROVIDER_TAGS: Array<{ tags: string[]; category: TransactionCategory }> = [
  { tags: ['bar', 'night_club', 'nightlife'], category: 'nightlife' },
  { tags: ['grocery', 'grocery_or_supermarket', 'supermarket'], category: 'groceries' },
  { tags: ['food', 'restaurant', 'cafe', 'meal_takeaway', 'meal_delivery', 'bakery'], category: 'dining_out' },
  { tags: ['movie_theater', 'entertainment', 'amusement_park', 'bowling_alley', 'stadium'], category: 'entertainment' },
  { tags: ['clothing_store', 'shopping_mall', 'department_store', 'electronics_store', 'store', 'shopping'], category: 'shopping' },
  { tags: ['gas_station', 'transit_station', 'parking', 'car_repair'], category: 'transportation' },
  { tags: ['pharmacy', 'health', 'doctor', 'hospital', 'dentist'], category: 'healthcare' },
  { tags: ['subscription', 'streaming'], category: 'subscriptions' },
];

export type CategoryGuess = {
  category: TransactionCategory;
  confidence: Confidence;
  source: 'rule' | 'provider' | 'default';
};

export function categorizeByText(text: string | undefined): CategoryGuess | null {
  if (!text) return null;
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(text)) return { category: rule.category, confidence: rule.confidence, source: 'rule' };
  }
  return null;
}

export function categorizeByProviderTags(tags: string[] | undefined): CategoryGuess | null {
  if (!tags?.length) return null;
  const norm = tags.map(t => t.toLowerCase().trim().replace(/\s+/g, '_'));
  for (const entry of PROVIDER_TAGS) {
    if (entry.tags.some(t => norm.includes(t))) {
      return { category: entry.category, confidence: 'medium', source: 'provider' };
    }
  }
  return null;
}

/** Merchant name wins over provider tags; falls back to 'other' (low confidence). */
export function categorizePurchase(merchantName?: string, providerTags?: string[], description?: string): CategoryGuess {
  return (
    categorizeByText(merchantName) ??
    categorizeByProviderTags(providerTags) ??
    categorizeByText(description) ?? { category: 'other', confidence: 'low', source: 'default' }
  );
}
