import { envFlag, envPositiveInteger, hasBrightDataConfig } from "./env";
import { getBrightDataOffers, type BrightDataOfferLookup } from "./bright-data";
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
  query,
  demoProduct,
  requestId,
  liveOfferLookup = getBrightDataOffers
}: {
  product: Product;
  query: string;
  demoProduct?: DemoProduct;
  requestId?: string;
  liveOfferLookup?: (input: { product: Product; query: string; requestId?: string }) => Promise<BrightDataOfferLookup>;
}): Promise<RetailerSearchResult> {
  const status: string[] = [];
  const warnings: RecommendationWarning[] = [];
  const useLiveData = envFlag("USE_LIVE_DATA", true);
  const demoMode = envFlag("DEMO_MODE", false);
  const minRetailerResults = envPositiveInteger("MIN_RETAILER_RESULTS", 2);
  let liveLookupAttempted = false;
  let liveLookupSucceeded = false;

  status.push("Checking configured retailers");

  if (useLiveData && demoProduct && shouldSkipShoppingLookup(product)) {
    status.push("Live product shopping lookup does not apply to this category-spend scenario");
  } else if (useLiveData && hasBrightDataConfig()) {
    liveLookupAttempted = true;
    const liveLookup = await liveOfferLookup({ product, query, requestId });
    liveLookupSucceeded = liveLookup.ok;
    status.push(liveLookup.message);
    warnings.push(...(liveLookup.warnings ?? []));

    if (liveLookup.offers.length >= minRetailerResults) {
      status.push(`Using ${liveLookup.offers.length} live retailer prices`);
      return {
        offers: liveLookup.offers,
        status,
        warnings,
        liveLookupAttempted,
        liveLookupSucceeded,
        demoMode
      };
    }

    if (!demoProduct && liveLookup.offers.length > 0) {
      status.push(`Using ${liveLookup.offers.length} partial live retailer price${liveLookup.offers.length === 1 ? "" : "s"}`);
      warnings.push({
        code: "PARTIAL_LIVE_RESULTS",
        message:
          "Live lookup returned fewer retailer prices than the usual comparison target, so this run uses the verified live prices it found."
      });
      return {
        offers: liveLookup.offers,
        status,
        warnings,
        liveLookupAttempted,
        liveLookupSucceeded,
        demoMode
      };
    }

    if (liveLookup.ok) {
      warnings.push({
        code: "LIVE_LOOKUP_INSUFFICIENT",
        message: `Live lookup returned ${liveLookup.offers.length} usable retailer prices; using hackathon fallback coverage for a fuller comparison.`
      });
    } else {
      warnings.push({
        code: "LIVE_LOOKUP_FAILED",
        message: "Live retailer lookup was attempted but did not return enough usable product offers."
      });
    }
  } else if (useLiveData) {
    status.push("Bright Data key not found; using hackathon fallback coverage");
    warnings.push({
      code: "LIVE_LOOKUP_NOT_CONFIGURED",
      message: "Live retailer lookup is enabled, but no Bright Data credentials are configured."
    });
  } else {
    status.push("Live data disabled; using hackathon fallback coverage");
    warnings.push({
      code: "LIVE_LOOKUP_DISABLED",
      message: "Live retailer lookup is disabled for this run."
    });
  }

  if (demoProduct) {
    status.push(`Using hackathon fallback coverage with ${demoProduct.retailerOffers.length} retailer offers`);
    warnings.push({
      code: "HACKATHON_FALLBACK_DATA",
      message: "Live lookup did not return enough retailer prices, so this run uses the hackathon fallback dataset."
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
    status.push("No fallback product match; demo mode is using seeded hackathon retailer links");
    warnings.push({
      code: "SEEDED_HACKATHON_FALLBACK",
      message: "This product was not found in the fallback dataset, so demo-mode seeded prices are being shown."
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

  status.push("No reliable live or fallback retailer offers found for this product");
  warnings.push({
    code: "NO_RETAILER_OFFERS",
    message: "No live or fallback retailer offers were available, so the app did not fabricate a price comparison."
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

function shouldSkipShoppingLookup(product: Product) {
  return ["flights", "gas", "grocery"].includes(product.mccFamily) || ["flights", "gas", "grocery"].includes(product.category);
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
