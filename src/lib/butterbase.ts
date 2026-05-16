import { getButterbaseConfig } from "./env";
import type { Product, ScoredOption } from "./types";

export async function logRecommendationRun({
  query,
  product,
  results,
  selectedCardIds
}: {
  query: string;
  product: Product;
  results: ScoredOption[];
  selectedCardIds: string[];
}): Promise<{ ok: boolean; message: string }> {
  const config = getButterbaseConfig();
  if (!config) {
    return {
      ok: false,
      message: "Butterbase not configured"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const best = results[0];
    const response = await fetch(`${config.apiBase}/recommendation_logs`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        query,
        product_title: product.title,
        product_brand: product.brand,
        selected_cards: selectedCardIds.join(","),
        best_retailer: best?.retailerName ?? null,
        best_card: best?.cardName ?? null,
        effective_price: best?.effectivePrice ?? null,
        result_count: results.length,
        source: best?.source ?? null
      })
    });

    if (!response.ok) {
      return {
        ok: false,
        message: "Butterbase history table unavailable; run setup script if history is needed"
      };
    }

    return {
      ok: true,
      message: "Butterbase logged recommendation history"
    };
  } catch {
    return {
      ok: false,
      message: "Butterbase logging skipped after timeout"
    };
  } finally {
    clearTimeout(timeout);
  }
}
