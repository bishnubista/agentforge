import { getBrightDataApiKey } from "./env";
import type { Product } from "./types";

export type BrightDataSignal = {
  ok: boolean;
  message: string;
  sourceCount?: number;
};

export async function getBrightDataSignal(product: Product): Promise<BrightDataSignal> {
  const apiKey = getBrightDataApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message: "Bright Data key not configured"
    };
  }

  try {
    const { bdclient } = await import("@brightdata/sdk");
    const client = new bdclient({
      apiKey,
      serpZone: process.env.BRIGHT_DATA_SERP_ZONE || process.env.BRIGHTDATA_SERP_ZONE || "sdk_serp",
      webUnlockerZone: process.env.BRIGHT_DATA_ZONE || process.env.BRIGHTDATA_ZONE,
      autoCreateZones: true,
      timeout: 4500
    });

    try {
      const result = await client.discover(`${product.title} price`, {
        intent: "Find current public retailer prices and shopping sources for reward optimization.",
        includeContent: false
      });
      const sourceCount = Array.isArray(result.data) ? result.data.length : undefined;

      return {
        ok: result.success,
        sourceCount,
        message: result.success
          ? `Bright Data live search checked ${sourceCount ?? "multiple"} web result sources`
          : `Bright Data search skipped: ${result.error ?? "no result"}`
      };
    } finally {
      await client.close();
    }
  } catch {
    return {
      ok: false,
      message: "Bright Data live search unavailable; cached retailer data used"
    };
  }
}
