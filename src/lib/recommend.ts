import { cards, getCardsByIds, getDefaultCards, offers } from "./data";
import { logRecommendationRun } from "./butterbase";
import { explainRecommendation, providerName } from "./explanation";
import { explainWithLlm } from "./llm";
import { identifyProduct } from "./product";
import { scoreOptions } from "./scoring";
import { searchRetailers } from "./search";
import type { MoneySource, Recommendation, ScoredOption } from "./types";

export type RecommendInput = {
  query: string;
  selectedCardIds: string[];
};

export async function recommend({ query, selectedCardIds }: RecommendInput): Promise<Recommendation> {
  const statusLog: string[] = [];
  statusLog.push("Starting recommendation run");

  const selectedCards = resolveSelectedCards(selectedCardIds);
  statusLog.push(`Loaded ${selectedCards.length} selected cards`);

  const identified = await identifyProduct(query);
  statusLog.push(`Identified product: ${identified.product.title}`);

  const retailerSearch = await searchRetailers({
    product: identified.product,
    query,
    demoProduct: identified.demoProduct
  });
  statusLog.push(...retailerSearch.status);
  const warnings = [...retailerSearch.warnings];

  statusLog.push("Applying card rewards, issuer offers, and portal boosts");
  const scored = scoreOptions({
    product: identified.product,
    retailerOffers: retailerSearch.offers,
    cards: selectedCards,
    offers
  }).slice(0, 3);

  statusLog.push(`Scored ${retailerSearch.offers.length * selectedCards.length} retailer-card combinations`);
  if (scored.length === 0) {
    warnings.push({
      code: "NO_SCORED_OPTIONS",
      message: "No in-stock retailer-card combinations were available to score."
    });
  }

  const llmExplanation = await explainWithLlm({
    product: identified.product,
    results: scored
  });
  const safeLlmExplanation =
    llmExplanation && isSafeLlmExplanation(llmExplanation.text) ? llmExplanation : null;
  if (safeLlmExplanation) {
    statusLog.push(`${providerName(safeLlmExplanation.provider)} generated shopper explanation`);
  } else if (llmExplanation) {
    statusLog.push(`${providerName(llmExplanation.provider)} generated explanation draft; deterministic copy used for math safety`);
  } else {
    statusLog.push("Used deterministic fallback explanation");
  }

  const butterbaseLog = await logRecommendationRun({
    query,
    product: identified.product,
    results: scored,
    selectedCardIds: selectedCards.map((card) => card.id)
  });
  statusLog.push(butterbaseLog.message);

  statusLog.push("Generated transparent ranked recommendation");

  return {
    product: identified.product,
    selectedCards,
    results: scored,
    explanation: safeLlmExplanation?.text ?? explainRecommendation(identified.product, scored),
    statusLog,
    warnings,
    dataQuality: {
      resultSource: summarizeResultSource(scored),
      liveLookupAttempted: retailerSearch.liveLookupAttempted,
      liveLookupSucceeded: retailerSearch.liveLookupSucceeded,
      demoMode: retailerSearch.demoMode,
      generatedAt: new Date().toISOString()
    }
  };
}

function resolveSelectedCards(selectedCardIds: string[]) {
  const uniqueIds = Array.from(new Set(selectedCardIds));
  const selected = getCardsByIds(uniqueIds);

  if (selected.length > 0) {
    return selected;
  }

  return getDefaultCards().length > 0 ? getDefaultCards() : cards.slice(0, 1);
}

function isSafeLlmExplanation(text: string) {
  return !/\b(cap|limit|expires|quarter|month|annual|transfer|mile|signup|activation)\b/i.test(text);
}

function summarizeResultSource(results: ScoredOption[]): MoneySource | "mixed" | "none" {
  const sources = new Set(results.map((result) => result.source));
  if (sources.size === 0) {
    return "none";
  }
  if (sources.size === 1) {
    return [...sources][0];
  }
  return "mixed";
}
