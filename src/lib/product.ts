import { demoProducts } from "./data";
import { extractProductWithLlm } from "./llm";
import type { DemoProduct, Product } from "./types";

export type IdentifiedProduct = {
  product: Product;
  demoProduct?: DemoProduct;
  source: "cached_match" | "llm" | "keyword_fallback";
};

export async function identifyProduct(query: string, requestId?: string): Promise<IdentifiedProduct> {
  const cached = findDemoProduct(query);
  if (cached) {
    return {
      product: normalizeProduct(cached.product),
      demoProduct: cached,
      source: "cached_match"
    };
  }

  const llmProduct = await extractProductWithLlm(query, requestId);
  if (llmProduct && productMatchesQuery(query, llmProduct)) {
    const llmCachedCandidate = findDemoProduct(`${llmProduct.title} ${llmProduct.brand} ${llmProduct.normalizedQuery ?? ""}`);
    const llmCached =
      llmCachedCandidate && productMatchesQuery(query, llmCachedCandidate.product) ? llmCachedCandidate : null;
    return {
      product: normalizeProduct(llmCached?.product ?? llmProduct),
      demoProduct: llmCached ?? undefined,
      source: "llm"
    };
  }

  return {
    product: inferProductFromKeywords(query),
    source: "keyword_fallback"
  };
}

export function productMatchesQuery(query: string, product: Product) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery || /^https?:\/\//i.test(query.trim())) {
    return true;
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const titleTokens = meaningfulQueryTokens(product.title);
  if (titleTokens.length === 0 || queryTokens.length === 0) {
    return false;
  }

  const matches = titleTokens.filter((token) => queryTokens.some((queryToken) => tokenMatches(queryToken, token))).length;
  if (matches >= Math.min(2, titleTokens.length) || matches / titleTokens.length >= 0.6) {
    return true;
  }

  return queryTokens.some(
    (queryToken) =>
      (/\d/.test(queryToken) || queryToken.length >= 5) &&
      titleTokens.some((titleToken) => tokenMatches(queryToken, titleToken))
  );
}

export function findDemoProduct(query: string) {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return null;
  }

  const exact = demoProducts.find((demoProduct) =>
    demoProduct.aliases.some((alias) => normalized.includes(normalizeQuery(alias)))
  );
  if (exact) {
    return exact;
  }

  return (
    demoProducts
      .map((demoProduct) => ({
        demoProduct,
        score: demoProduct.aliases.reduce((best, alias) => Math.max(best, tokenOverlap(normalized, alias)), 0)
      }))
      .filter(({ score }) => score >= 0.5)
      .sort((a, b) => b.score - a.score)[0]?.demoProduct ?? null
  );
}

function inferProductFromKeywords(query: string): Product {
  const normalized = normalizeQuery(query);
  const category = normalized.includes("gas")
    ? "gas"
    : normalized.includes("grocery") || normalized.includes("groceries")
      ? "grocery"
      : normalized.includes("flight") || normalized.includes("hotel")
        ? "travel"
        : normalized.includes("jacket") || normalized.includes("shoe") || normalized.includes("bike")
          ? "sporting_goods"
          : normalized.includes("coffee") || normalized.includes("kitchen") || normalized.includes("vacuum")
            ? "home_goods"
            : normalized.includes("airpods") ||
                normalized.includes("apple") ||
                normalized.includes("headphones") ||
                normalized.includes("iphone") ||
                normalized.includes("samsung") ||
                normalized.includes("galaxy") ||
                normalized.includes("phone") ||
                normalized.includes("laptop") ||
                normalized.includes("tablet") ||
                normalized.includes("tv")
              ? "electronics"
              : "general_merchandise";

  return {
    title: query.trim() || "Shopping item",
    brand: "Unknown",
    category,
    mccFamily: category,
    confidence: 0.45
  };
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    category: normalizeCategory(product.category),
    mccFamily: normalizeCategory(product.mccFamily)
  };
}

function normalizeCategory(value: string) {
  const normalized = normalizeQuery(value).replace(/\s+/g, "_");

  if (
    [
      "electronics",
      "smartphone",
      "smartphones",
      "phone",
      "phones",
      "mobile_phone",
      "mobile_phones",
      "computer",
      "computers",
      "laptop",
      "laptops",
      "tablet",
      "tablets"
    ].includes(normalized)
  ) {
    return "electronics";
  }

  if (
    [
      "home_appliance",
      "home_appliances",
      "vacuum",
      "vacuum_cleaner",
      "vacuum_cleaners",
      "kitchen",
      "kitchen_appliance",
      "kitchen_appliances"
    ].includes(normalized)
  ) {
    return "home_goods";
  }

  if (["outdoor_apparel", "sporting_goods", "sports", "apparel", "shoes"].includes(normalized)) {
    return "sporting_goods";
  }

  if (["flight", "flights", "hotel", "hotels", "airline", "airlines", "travel"].includes(normalized)) {
    return "travel";
  }

  if (["gas", "fuel", "gas_station"].includes(normalized)) {
    return "gas";
  }

  if (["grocery", "groceries", "supermarket", "supermarkets"].includes(normalized)) {
    return "grocery";
  }

  return normalized || "general_merchandise";
}

function normalizeQuery(value: string) {
  return decodeURIComponent(value)
    .toLowerCase()
    .replace(/^https?:\/\//, " ")
    .replace(/www\./g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenOverlap(query: string, alias: string) {
  const queryTokens = new Set(query.split(" ").filter(Boolean));
  const aliasTokens = normalizeQuery(alias).split(" ").filter(Boolean);
  if (aliasTokens.length === 0) {
    return 0;
  }

  const matches = aliasTokens.filter((token) => queryTokens.has(token)).length;
  const requiredMatches = Math.min(2, aliasTokens.length);
  if (matches < requiredMatches) {
    return 0;
  }

  return matches / aliasTokens.length;
}

function meaningfulQueryTokens(value: string) {
  return normalizeQuery(value)
    .split(" ")
    .filter((token) => (token.length > 2 || /\d/.test(token)) && !["and", "for", "the", "with"].includes(token));
}

function tokenMatches(queryToken: string, titleToken: string) {
  return titleToken === queryToken || (/^\d+$/.test(queryToken) && titleToken.startsWith(queryToken));
}
