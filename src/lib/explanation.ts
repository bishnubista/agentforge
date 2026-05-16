import type { Product, ScoredOption } from "./types";

export function explainRecommendation(product: Product, results: ScoredOption[]) {
  const best = results[0];
  const runnerUp = results[1];

  if (!best) {
    return `I could not find enough retailer-card combinations for ${product.title}.`;
  }

  const strongestLine = [...best.lineItems].sort((a, b) => b.amount - a.amount)[0];
  const lead = `${best.retailerName} with ${best.cardName} wins at ${formatCurrency(best.effectivePrice)} effective.`;
  const reason = strongestLine
    ? `The biggest driver is ${strongestLine.label.toLowerCase()}, worth ${formatCurrency(strongestLine.amount)}.`
    : "It wins on the lowest available list price.";
  const comparison = runnerUp
    ? `It beats the next best option by ${formatCurrency(runnerUp.effectivePrice - best.effectivePrice)}.`
    : "";

  return [lead, reason, comparison].filter(Boolean).join(" ");
}

export function explainCardPickRecommendation(product: Product, results: ScoredOption[], benchmarkSpend: number) {
  const best = results[0];
  const runnerUp = results[1];

  if (!best) {
    return `I could not find enough selected-card value for ${product.title}.`;
  }

  const strongestLine = [...best.lineItems].sort((a, b) => b.amount - a.amount)[0];
  const lead = `For an estimated ${formatCurrency(benchmarkSpend)} ${product.title} purchase, ${best.cardName} gives the best value.`;
  const reason = strongestLine
    ? `${strongestLine.label} is worth ${formatCurrency(strongestLine.amount)}.`
    : `It earns ${formatCurrency(best.savings)} in estimated card value.`;
  const comparison = runnerUp
    ? `That is ${formatCurrency(best.savings - runnerUp.savings)} more value than the next selected card.`
    : "";

  return [lead, reason, comparison].filter(Boolean).join(" ");
}

export function providerName(provider: string) {
  if (provider === "qwen") {
    return "Qwen Cloud";
  }
  if (provider === "tokenrouter") {
    return "TokenRouter";
  }
  if (provider === "zai") {
    return "Z.ai";
  }
  return provider;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}
