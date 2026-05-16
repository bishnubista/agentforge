import { cards, getCardsByIds, getDefaultCards, offers } from "./data";
import { logRecommendationRun } from "./butterbase";
import { explainCardPickRecommendation, explainRecommendation, providerName } from "./explanation";
import {
  CARD_PICK_BENCHMARK_SPEND,
  describeIntent,
  productForCardPickIntent,
  resolveQueryIntent,
  scoreCardPickIntent
} from "./intent";
import { explainWithLlm } from "./llm";
import { logger } from "./logger";
import { identifyProduct } from "./product";
import { scoreOptions } from "./scoring";
import { searchRetailers } from "./search";
import type { MoneySource, Recommendation, ScoredOption } from "./types";

export type RecommendInput = {
  query: string;
  selectedCardIds: string[];
  requestId?: string;
};

export async function recommend({ query, selectedCardIds, requestId }: RecommendInput): Promise<Recommendation> {
  const runLogger = logger.child({
    module: "recommend",
    requestId
  });
  const statusLog: string[] = [];
  statusLog.push("Starting recommendation run");
  runLogger.info("Recommendation run started", {
    queryLength: query.length,
    selectedCardCount: selectedCardIds.length
  });

  const selectedCards = resolveSelectedCards(selectedCardIds);
  statusLog.push(`Loaded ${selectedCards.length} selected cards`);
  runLogger.debug("Selected cards resolved", {
    selectedCardIds: selectedCards.map((card) => card.id)
  });

  const intent = await resolveQueryIntent(query, requestId);
  statusLog.push(`Classified intent: ${describeIntent(intent)}`);
  runLogger.info("Query intent classified", {
    kind: intent.kind,
    source: intent.source,
    confidence: intent.confidence,
    merchant: intent.kind === "merchant_card_pick" ? intent.merchant.name : undefined,
    category:
      intent.kind === "merchant_card_pick"
        ? intent.merchant.category
        : intent.kind === "category_card_pick"
          ? intent.category
          : undefined
  });

  if (intent.kind === "merchant_card_pick" || intent.kind === "category_card_pick") {
    const product = productForCardPickIntent(intent);
    statusLog.push("Skipped live product lookup for merchant/category card-pick intent");
    statusLog.push(`Using ${formatCurrency(CARD_PICK_BENCHMARK_SPEND)} benchmark spend to compare selected-card value`);
    statusLog.push("Applying card rewards, issuer offers, and portal boosts");

    const scored = scoreCardPickIntent({
      intent,
      cards: selectedCards,
      offers
    }).slice(0, 3);

    statusLog.push(`Scored ${selectedCards.length} selected-card combinations`);
    runLogger.info("Merchant/category card-pick combinations scored", {
      intent: intent.kind,
      candidateCount: selectedCards.length,
      resultCount: scored.length,
      bestRetailer: scored[0]?.retailerName,
      bestCard: scored[0]?.cardName,
      bestSavings: scored[0]?.savings
    });

    const warnings = [];
    if (scored.length === 0) {
      warnings.push({
        code: "NO_SCORED_OPTIONS",
        message: "No selected-card combinations were available to score."
      });
    }

    const llmExplanation = await explainWithLlm({
      product,
      results: scored,
      requestId
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
      product,
      results: scored,
      selectedCardIds: selectedCards.map((card) => card.id),
      requestId
    });
    statusLog.push(butterbaseLog.message);
    runLogger.debug("Recommendation history logging completed", {
      ok: butterbaseLog.ok,
      message: butterbaseLog.message
    });

    statusLog.push("Generated transparent ranked recommendation");
    runLogger.info("Recommendation run completed", {
      warningCodes: warnings.map((warning) => warning.code),
      resultSource: summarizeResultSource(scored)
    });

    return {
      product,
      selectedCards,
      results: scored,
      explanation:
        safeLlmExplanation?.text ?? explainCardPickRecommendation(product, scored, CARD_PICK_BENCHMARK_SPEND),
      statusLog,
      warnings,
      dataQuality: {
        resultSource: summarizeResultSource(scored),
        liveLookupAttempted: false,
        liveLookupSucceeded: false,
        demoMode: false,
        generatedAt: new Date().toISOString()
      }
    };
  }

  const identified = await identifyProduct(query, requestId);
  statusLog.push(`Identified product: ${identified.product.title}`);
  runLogger.info("Product identified", {
    source: identified.source,
    productTitle: identified.product.title,
    productBrand: identified.product.brand,
    category: identified.product.category,
    confidence: identified.product.confidence
  });

  const retailerSearch = await searchRetailers({
    product: identified.product,
    query,
    demoProduct: identified.demoProduct,
    requestId
  });
  statusLog.push(...retailerSearch.status);
  const warnings = [...retailerSearch.warnings];
  runLogger.info("Retailer search completed", {
    offerCount: retailerSearch.offers.length,
    warningCodes: warnings.map((warning) => warning.code),
    liveLookupAttempted: retailerSearch.liveLookupAttempted,
    liveLookupSucceeded: retailerSearch.liveLookupSucceeded,
    demoMode: retailerSearch.demoMode
  });

  statusLog.push("Applying card rewards, issuer offers, and portal boosts");
  const scored = scoreOptions({
    product: identified.product,
    retailerOffers: retailerSearch.offers,
    cards: selectedCards,
    offers
  }).slice(0, 3);

  statusLog.push(`Scored ${retailerSearch.offers.length * selectedCards.length} retailer-card combinations`);
  runLogger.info("Retailer-card combinations scored", {
    candidateCount: retailerSearch.offers.length * selectedCards.length,
    resultCount: scored.length,
    bestRetailer: scored[0]?.retailerName,
    bestCard: scored[0]?.cardName,
    bestEffectivePrice: scored[0]?.effectivePrice
  });
  if (scored.length === 0) {
    warnings.push({
      code: "NO_SCORED_OPTIONS",
      message: "No in-stock retailer-card combinations were available to score."
    });
  }

  const llmExplanation = await explainWithLlm({
    product: identified.product,
    results: scored,
    requestId
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
    selectedCardIds: selectedCards.map((card) => card.id),
    requestId
  });
  statusLog.push(butterbaseLog.message);
  runLogger.debug("Recommendation history logging completed", {
    ok: butterbaseLog.ok,
    message: butterbaseLog.message
  });

  statusLog.push("Generated transparent ranked recommendation");
  runLogger.info("Recommendation run completed", {
    warningCodes: warnings.map((warning) => warning.code),
    resultSource: summarizeResultSource(scored)
  });

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}
