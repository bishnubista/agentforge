import { envFlag, hasBrightDataConfig } from "./env";
import { getBrightDataSignal } from "./bright-data";
import type { DemoProduct, Product, RecommendationWarning, RetailerOffer } from "./types";

export type RetailerSearchResult = {
  offers: RetailerOffer[];
  status: string[];
  warnings: RecommendationWarning[];
  liveLookupAttempted: boolean;
  liveLookupSucceeded: boolean;
  demoMode: boolean;
};

export async function searchRetailers({
  product,
  demoProduct
}: {
  product: Product;
  demoProduct?: DemoProduct;
}): Promise<RetailerSearchResult> {
  const status: string[] = [];
  const warnings: RecommendationWarning[] = [];
  const useLiveData = envFlag("USE_LIVE_DATA", true);
  const demoMode = envFlag("DEMO_MODE", false);
  let liveLookupAttempted = false;
  let liveLookupSucceeded = false;

  status.push("Checking configured retailers");

  if (useLiveData && hasBrightDataConfig()) {
    liveLookupAttempted = true;
    const signal = await getBrightDataSignal(product);
    liveLookupSucceeded = signal.ok;
    status.push(signal.message);
    if (!signal.ok) {
      warnings.push({
        code: "LIVE_LOOKUP_FAILED",
        message: "Live retailer lookup was attempted but did not return usable product offers."
      });
    }
  } else if (useLiveData) {
    status.push("Bright Data key not found; using cached retailer payloads");
    warnings.push({
      code: "LIVE_LOOKUP_NOT_CONFIGURED",
      message: "Live retailer lookup is enabled, but no Bright Data credentials are configured."
    });
  } else {
    status.push("Live data disabled; using cached retailer payloads");
    warnings.push({
      code: "LIVE_LOOKUP_DISABLED",
      message: "Live retailer lookup is disabled for this run."
    });
  }

  if (demoProduct) {
    status.push(`Matched cached demo product with ${demoProduct.retailerOffers.length} retailer offers`);
    warnings.push({
      code: "CACHED_PRODUCT_DATA",
      message: "Recommendations are based on cached demo product data, not a fresh retailer quote."
    });
    return {
      offers: demoProduct.retailerOffers,
      status,
      warnings,
      liveLookupAttempted,
      liveLookupSucceeded,
      demoMode
    };
  }

  if (demoMode) {
    status.push("No cached product match; demo mode is using seeded retailer links");
    warnings.push({
      code: "SEEDED_DEMO_DATA",
      message: "This product was not found in the cache, so demo-mode seeded prices are being shown."
    });
    return {
      offers: seededRetailerOffers(product),
      status,
      warnings,
      liveLookupAttempted,
      liveLookupSucceeded,
      demoMode
    };
  }

  status.push("No reliable retailer offers found for this product");
  warnings.push({
    code: "NO_RETAILER_OFFERS",
    message: "No cached or live retailer offers were available, so the app did not fabricate a price comparison."
  });
  return {
    offers: [],
    status,
    warnings,
    liveLookupAttempted,
    liveLookupSucceeded,
    demoMode
  };
}

function seededRetailerOffers(product: Product): RetailerOffer[] {
  const now = new Date().toISOString();
  const encoded = encodeURIComponent(product.title);

  return [
    {
      retailerId: "amazon",
      retailerName: "Amazon",
      productTitle: product.title,
      price: 199,
      currency: "USD",
      inStock: true,
      url: `https://www.amazon.com/s?k=${encoded}`,
      source: "seeded",
      fetchedAt: now
    },
    {
      retailerId: "target",
      retailerName: "Target",
      productTitle: product.title,
      price: 205,
      currency: "USD",
      inStock: true,
      url: `https://www.target.com/s?searchTerm=${encoded}`,
      source: "seeded",
      fetchedAt: now
    },
    {
      retailerId: "walmart",
      retailerName: "Walmart",
      productTitle: product.title,
      price: 197,
      currency: "USD",
      inStock: true,
      url: `https://www.walmart.com/search?q=${encoded}`,
      source: "seeded",
      fetchedAt: now
    }
  ];
}
