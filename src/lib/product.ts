import { demoProducts } from "./data";
import { extractProductWithLlm } from "./llm";
import type { DemoProduct, Product } from "./types";

export type IdentifiedProduct = {
  product: Product;
  demoProduct?: DemoProduct;
  source: "cached_match" | "llm" | "keyword_fallback";
};

export async function identifyProduct(query: string): Promise<IdentifiedProduct> {
  const cached = findDemoProduct(query);
  if (cached) {
    return {
      product: cached.product,
      demoProduct: cached,
      source: "cached_match"
    };
  }

  const llmProduct = await extractProductWithLlm(query);
  if (llmProduct) {
    const llmCached = findDemoProduct(`${llmProduct.title} ${llmProduct.brand} ${llmProduct.normalizedQuery ?? ""}`);
    return {
      product: llmCached?.product ?? llmProduct,
      demoProduct: llmCached ?? undefined,
      source: "llm"
    };
  }

  return {
    product: inferProductFromKeywords(query),
    source: "keyword_fallback"
  };
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
          : normalized.includes("coffee") || normalized.includes("kitchen")
            ? "home_goods"
            : normalized.includes("airpods") || normalized.includes("apple") || normalized.includes("headphones")
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
  return matches / aliasTokens.length;
}
