import { merchants } from "./data";
import { classifyIntentWithLlm } from "./llm";
import { scoreOptions } from "./scoring";
import type { Card, Merchant, Offer, Product, RetailerOffer, ScoredOption } from "./types";

export const CARD_PICK_BENCHMARK_SPEND = 100;

export type QueryIntent =
  | {
      kind: "product_price_compare";
      source: "rule" | "llm" | "fallback";
      confidence: number;
    }
  | {
      kind: "merchant_card_pick";
      merchant: Merchant;
      source: "rule" | "llm";
      confidence: number;
    }
  | {
      kind: "category_card_pick";
      category: string;
      mccFamily: string;
      label: string;
      source: "rule" | "llm";
      confidence: number;
    };

type CategoryIntent = {
  category: string;
  mccFamily: string;
  label: string;
  aliases: string[];
};

const CATEGORY_INTENTS: CategoryIntent[] = [
  {
    category: "dining",
    mccFamily: "dining",
    label: "Dining",
    aliases: ["dining", "restaurants", "restaurant", "coffee shops", "coffee shop"]
  },
  {
    category: "grocery",
    mccFamily: "grocery",
    label: "Groceries",
    aliases: ["grocery", "groceries", "supermarkets", "supermarket"]
  },
  {
    category: "gas",
    mccFamily: "gas",
    label: "Gas",
    aliases: ["gas", "fuel", "gas station", "gas stations"]
  },
  {
    category: "travel",
    mccFamily: "travel",
    label: "Travel",
    aliases: ["travel", "flights", "flight", "hotels", "hotel", "airlines", "airline"]
  },
  {
    category: "electronics",
    mccFamily: "electronics",
    label: "Electronics",
    aliases: ["electronics", "tech"]
  },
  {
    category: "home_goods",
    mccFamily: "home_goods",
    label: "Home goods",
    aliases: ["home goods", "home", "kitchen"]
  },
  {
    category: "sporting_goods",
    mccFamily: "sporting_goods",
    label: "Sporting goods",
    aliases: ["sporting goods", "sports", "outdoor gear"]
  }
];

const PRODUCT_CUES = [
  "airpods",
  "bottle",
  "bottles",
  "beans",
  "coffee beans",
  "frappuccino",
  "k cup",
  "k cups",
  "k-cup",
  "k-cups",
  "maker",
  "machine",
  "headphones",
  "iphone",
  "phone",
  "laptop",
  "tablet",
  "tv",
  "jacket",
  "shoe",
  "shoes",
  "tumbler",
  "mug",
  "price",
  "prices",
  "cheap",
  "cheapest",
  "deal",
  "deals"
];

export async function resolveQueryIntent(query: string, requestId?: string): Promise<QueryIntent> {
  const ruleIntent = resolveRuleIntent(query);
  if (ruleIntent) {
    return ruleIntent;
  }

  const llmIntent = await classifyIntentWithLlm(query, requestId);
  if (llmIntent && (llmIntent.confidence ?? 0) >= 0.65) {
    if (llmIntent.intent === "merchant_card_pick" && llmIntent.merchantName) {
      return {
        kind: "merchant_card_pick",
        merchant: resolveMerchant(llmIntent.merchantName, llmIntent.category),
        source: "llm",
        confidence: llmIntent.confidence ?? 0.65
      };
    }

    if (llmIntent.intent === "category_card_pick" && llmIntent.category) {
      const category = resolveCategory(llmIntent.category);
      if (category) {
        return {
          kind: "category_card_pick",
          category: category.category,
          mccFamily: category.mccFamily,
          label: category.label,
          source: "llm",
          confidence: llmIntent.confidence ?? 0.65
        };
      }
    }

    if (llmIntent.intent === "product_price_compare") {
      return {
        kind: "product_price_compare",
        source: "llm",
        confidence: llmIntent.confidence ?? 0.65
      };
    }
  }

  return {
    kind: "product_price_compare",
    source: "fallback",
    confidence: 0.5
  };
}

export function isCardPickIntent(intent: QueryIntent) {
  return intent.kind === "merchant_card_pick" || intent.kind === "category_card_pick";
}

export function productForCardPickIntent(intent: Extract<QueryIntent, { kind: "merchant_card_pick" | "category_card_pick" }>): Product {
  if (intent.kind === "merchant_card_pick") {
    return {
      title: intent.merchant.name,
      brand: intent.merchant.name,
      category: intent.merchant.category,
      mccFamily: intent.merchant.mccFamily,
      confidence: intent.confidence
    };
  }

  return {
    title: intent.label,
    brand: "Category",
    category: intent.category,
    mccFamily: intent.mccFamily,
    confidence: intent.confidence
  };
}

export function scoreCardPickIntent({
  intent,
  cards,
  offers,
  now = new Date()
}: {
  intent: Extract<QueryIntent, { kind: "merchant_card_pick" | "category_card_pick" }>;
  cards: Card[];
  offers: Offer[];
  now?: Date;
}): ScoredOption[] {
  const product = productForCardPickIntent(intent);
  return scoreOptions({
    product,
    retailerOffers: [retailerOfferForIntent(intent)],
    cards,
    offers,
    now
  });
}

export function describeIntent(intent: QueryIntent) {
  if (intent.kind === "merchant_card_pick") {
    return `${intent.merchant.name} merchant card pick`;
  }
  if (intent.kind === "category_card_pick") {
    return `${intent.label} category card pick`;
  }
  return "product price comparison";
}

function resolveRuleIntent(query: string): QueryIntent | null {
  const normalized = normalizeText(query);
  if (!normalized || /^https?:\/\//i.test(query.trim())) {
    return { kind: "product_price_compare", source: "rule", confidence: 0.9 };
  }

  const cardIntent = hasCardIntentPhrase(normalized);
  const exactMerchant = merchants.find((merchant) =>
    merchant.aliases.some((alias) => normalized === normalizeText(alias))
  );
  const mentionedMerchant = merchants.find((merchant) =>
    merchant.aliases.some((alias) => includesPhrase(normalized, normalizeText(alias)))
  );
  const exactCategory = CATEGORY_INTENTS.find((category) =>
    category.aliases.some((alias) => normalized === normalizeText(alias))
  );
  const mentionedCategory = CATEGORY_INTENTS.find((category) =>
    category.aliases.some((alias) => includesPhrase(normalized, normalizeText(alias)))
  );

  if (exactMerchant) {
    return {
      kind: "merchant_card_pick",
      merchant: exactMerchant,
      source: "rule",
      confidence: 0.95
    };
  }

  if (mentionedMerchant && (cardIntent || mentionedCategory)) {
    return {
      kind: "merchant_card_pick",
      merchant: mentionedMerchant,
      source: "rule",
      confidence: 0.9
    };
  }

  if (exactCategory) {
    return {
      kind: "category_card_pick",
      category: exactCategory.category,
      mccFamily: exactCategory.mccFamily,
      label: exactCategory.label,
      source: "rule",
      confidence: 0.92
    };
  }

  if (mentionedCategory && cardIntent) {
    return {
      kind: "category_card_pick",
      category: mentionedCategory.category,
      mccFamily: mentionedCategory.mccFamily,
      label: mentionedCategory.label,
      source: "rule",
      confidence: 0.88
    };
  }

  const hasProductCue = PRODUCT_CUES.some((cue) => includesPhrase(normalized, cue));
  if (hasProductCue) {
    return { kind: "product_price_compare", source: "rule", confidence: 0.82 };
  }

  return null;
}

function retailerOfferForIntent(intent: Extract<QueryIntent, { kind: "merchant_card_pick" | "category_card_pick" }>): RetailerOffer {
  const now = new Date().toISOString();
  if (intent.kind === "merchant_card_pick") {
    return {
      retailerId: intent.merchant.id,
      retailerName: intent.merchant.name,
      productTitle: `Estimated ${formatCurrency(CARD_PICK_BENCHMARK_SPEND)} spend at ${intent.merchant.name}`,
      price: CARD_PICK_BENCHMARK_SPEND,
      currency: "USD",
      inStock: true,
      url: intent.merchant.domain ? `https://${intent.merchant.domain}` : `https://www.google.com/search?q=${encodeURIComponent(intent.merchant.name)}`,
      source: "estimated",
      fetchedAt: now
    };
  }

  return {
    retailerId: intent.category,
    retailerName: intent.label,
    productTitle: `Estimated ${formatCurrency(CARD_PICK_BENCHMARK_SPEND)} ${intent.label.toLowerCase()} spend`,
    price: CARD_PICK_BENCHMARK_SPEND,
    currency: "USD",
    inStock: true,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${intent.label} rewards credit card`)}`,
    source: "estimated",
    fetchedAt: now
  };
}

function resolveMerchant(name: string, category?: string): Merchant {
  const normalized = normalizeText(name);
  const known = merchants.find(
    (merchant) =>
      normalizeText(merchant.name) === normalized ||
      merchant.aliases.some((alias) => normalizeText(alias) === normalized)
  );
  if (known) {
    return known;
  }

  const resolvedCategory = resolveCategory(category ?? "") ?? {
    category: "general_merchandise",
    mccFamily: "general_merchandise",
    label: "General merchandise"
  };

  return {
    id: slugify(name),
    name: name.trim() || "Merchant",
    aliases: [name],
    category: resolvedCategory.category,
    mccFamily: resolvedCategory.mccFamily
  };
}

function resolveCategory(value: string): CategoryIntent | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  return (
    CATEGORY_INTENTS.find(
      (category) =>
        category.category === normalized ||
        category.mccFamily === normalized ||
        category.aliases.some((alias) => normalizeText(alias) === normalized)
    ) ?? null
  );
}

function hasCardIntentPhrase(normalized: string) {
  return (
    /\b(best|which|what)\b.*\b(card|cashback|cash back|points|rewards?)\b/.test(normalized) ||
    /\b(card|cashback|cash back|points|rewards?)\b.*\b(for|at|use)\b/.test(normalized) ||
    /\buse\b.*\bcard\b/.test(normalized)
  );
}

function includesPhrase(value: string, phrase: string) {
  return new RegExp(`(^|\\s)${escapeRegExp(phrase)}($|\\s)`).test(value);
}

function normalizeText(value: string) {
  return decodeURIComponent(value)
    .toLowerCase()
    .replace(/^https?:\/\//, " ")
    .replace(/www\./g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value: string) {
  return normalizeText(value).replace(/\s+/g, "-") || "merchant";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}
