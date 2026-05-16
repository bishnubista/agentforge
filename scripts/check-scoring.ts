import { cards, demoProducts, offers } from "../src/lib/data";
import { parseBrightDataShoppingOffers } from "../src/lib/bright-data";
import { findDemoProduct, productMatchesQuery } from "../src/lib/product";
import { resolveQueryIntent, scoreCardPickIntent } from "../src/lib/intent";
import { scoreOptions } from "../src/lib/scoring";
import { searchRetailers } from "../src/lib/search";
import type { Product, RetailerOffer } from "../src/lib/types";

const product = demoProducts[0];

if (!product) {
  throw new Error("No demo products are configured.");
}

const selectedCards = cards.filter((card) =>
  ["amex_gold", "chase_sapphire_preferred", "capital_one_venture_x"].includes(card.id)
);

const results = scoreOptions({
  product: product.product,
  retailerOffers: product.retailerOffers,
  cards: selectedCards,
  offers,
  now: new Date("2026-05-16T12:00:00-07:00")
}).slice(0, 3);

assertEqual(results.length, 3, "expected three top results");
assertEqual(results[0]?.retailerId, "backcountry", "expected Backcountry to win demo scenario");
assertEqual(results[0]?.cardId, "chase_sapphire_preferred", "expected CSP to win demo scenario");
assertEqual(results[0]?.effectivePrice, 183.55, "expected hand-checked winning effective price");

for (const result of results) {
  const lineItemTotal = result.lineItems.reduce((total, item) => total + item.amount, 0);
  const expected = Math.round((result.listPrice - lineItemTotal + Number.EPSILON) * 100) / 100;

  assertEqual(
    result.effectivePrice,
    expected,
    `${result.retailerName} + ${result.cardName} effective price must equal list minus line items`
  );
}

const expiredOfferResults = scoreOptions({
  product: product.product,
  retailerOffers: product.retailerOffers,
  cards: selectedCards,
  offers,
  now: new Date("2026-07-02T12:00:00-07:00")
});
assert(
  expiredOfferResults.every((result) => result.lineItems.every((lineItem) => lineItem.kind !== "issuer_offer")),
  "expired issuer offers must not affect scoring"
);

const discover = cards.find((card) => card.id === "discover_it");
assert(discover, "Discover it card must exist for cap test");

const gasProduct: Product = {
  title: "Gas purchase",
  brand: "Chevron",
  category: "gas",
  mccFamily: "gas",
  confidence: 1
};
const gasOffer: RetailerOffer = {
  retailerId: "chevron",
  retailerName: "Chevron",
  productTitle: "Gas purchase",
  price: 2000,
  currency: "USD",
  inStock: true,
  url: "https://www.chevron.com/",
  source: "fallback",
  fetchedAt: "2026-05-16T12:00:00-07:00"
};
const gasResult = scoreOptions({
  product: gasProduct,
  retailerOffers: [gasOffer],
  cards: [discover],
  offers,
  now: new Date("2026-05-16T12:00:00-07:00")
})[0];
assertEqual(
  gasResult?.lineItems.find((lineItem) => lineItem.kind === "category_reward")?.amount,
  75,
  "reward cap should limit Discover 5% gas reward to $1,500 eligible spend"
);

const outOfStockResults = scoreOptions({
  product: product.product,
  retailerOffers: [{ ...product.retailerOffers[0], inStock: false }],
  cards: selectedCards,
  offers,
  now: new Date("2026-05-16T12:00:00-07:00")
});
assertEqual(outOfStockResults.length, 0, "out-of-stock retailer offers must not be scored");
assert(!findDemoProduct("iPhone 13 Pro"), "single-token overlap must not match an unrelated cached demo product");
assertEqual(findDemoProduct("AirPods Pro 2")?.id, "airpods-pro-2", "exact cached aliases should still match");
assert(
  !productMatchesQuery("iPhone 13 Pro", demoProducts.find((demoProduct) => demoProduct.id === "airpods-pro-2")!.product),
  "LLM extraction validation should reject unrelated products that only share a generic variant token"
);
assert(
  productMatchesQuery("S24", {
    title: "Samsung Galaxy S24",
    brand: "Samsung",
    category: "electronics",
    mccFamily: "electronics",
    confidence: 0.9
  }),
  "LLM extraction validation should allow short distinctive model-number searches"
);

const starbucksIntent = await resolveQueryIntent("Starbucks");
assertEqual(starbucksIntent.kind, "merchant_card_pick", "bare Starbucks should route as a merchant card pick");
if (starbucksIntent.kind !== "merchant_card_pick") {
  throw new Error("Starbucks intent should be narrowed to merchant_card_pick.");
}
const misspelledStarbucksIntent = await resolveQueryIntent("Startbucks");
assertEqual(
  misspelledStarbucksIntent.kind,
  "merchant_card_pick",
  "common Starbucks typo should route as a merchant card pick"
);
const starbucksCardResults = scoreCardPickIntent({
  intent: starbucksIntent,
  cards: selectedCards,
  offers,
  now: new Date("2026-05-16T12:00:00-07:00")
});
assertEqual(starbucksCardResults[0]?.cardId, "amex_gold", "Amex Gold should win $100 Starbucks benchmark among selected demo cards");
assertEqual(starbucksCardResults[0]?.source, "estimated", "merchant card picks should be labeled as estimated");

const starbucksProductIntent = await resolveQueryIntent("Starbucks Frappuccino bottle");
assertEqual(
  starbucksProductIntent.kind,
  "product_price_compare",
  "Starbucks packaged products should still route to product price comparison"
);
const diningIntent = await resolveQueryIntent("best card for dining");
assertEqual(diningIntent.kind, "category_card_pick", "best card for dining should route as a category card pick");
const costcoGroceriesIntent = await resolveQueryIntent("Costco groceries");
assertEqual(costcoGroceriesIntent.kind, "merchant_card_pick", "merchant plus category queries should route as merchant card picks");
const dunkinIntent = await resolveQueryIntent("Dunkin");
assertEqual(dunkinIntent.kind, "merchant_card_pick", "common dining vendors should route without LLM fallback");
const homeDepotIntent = await resolveQueryIntent("Home Depot");
assertEqual(homeDepotIntent.kind, "merchant_card_pick", "common home improvement vendors should route without LLM fallback");
const doorDashIntent = await resolveQueryIntent("DoorDash");
assertEqual(doorDashIntent.kind, "merchant_card_pick", "common delivery vendors should route without LLM fallback");
const blueBottleIntent = await resolveQueryIntent("Blue Bottle Coffee");
assertEqual(blueBottleIntent.kind, "merchant_card_pick", "coffee shop brands with product cue words should route as merchants when exact");
const blueBottleBeansIntent = await resolveQueryIntent("Blue Bottle coffee beans");
assertEqual(blueBottleBeansIntent.kind, "product_price_compare", "packaged coffee beans should still route to product price comparison");

const previousDemoMode = process.env.DEMO_MODE;
const previousUseLiveData = process.env.USE_LIVE_DATA;
const previousBrightDataApiKey = process.env.BRIGHT_DATA_API_KEY;
process.env.DEMO_MODE = "false";
process.env.USE_LIVE_DATA = "false";
const productionSearch = await searchRetailers({
  query: "Uncached production-only item",
  product: {
    title: "Uncached production-only item",
    brand: "Unknown",
    category: "general_merchandise",
    mccFamily: "general_merchandise",
    confidence: 0.4
  }
});
assertEqual(productionSearch.offers.length, 0, "production mode must not fabricate seeded retailer prices");

process.env.USE_LIVE_DATA = "true";
process.env.BRIGHT_DATA_API_KEY = "test-key";
const partialLiveSearch = await searchRetailers({
  query: "iPhone 13",
  product: {
    title: "iPhone 13",
    brand: "Apple",
    category: "electronics",
    mccFamily: "electronics",
    confidence: 0.9
  },
  liveOfferLookup: async () => ({
    ok: true,
    message: "mocked one live offer",
    sourceCount: 40,
    offers: [
      {
        retailerId: "walmart",
        retailerName: "Walmart",
        productTitle: "Apple iPhone 13 128 GB",
        price: 249,
        currency: "USD",
        inStock: true,
        url: "https://www.walmart.com/search?q=iphone%2013",
        source: "live",
        fetchedAt: "2026-05-16T12:00:00-07:00"
      }
    ]
  })
});
assertEqual(partialLiveSearch.offers.length, 1, "uncached products should keep partial live retailer prices");
assert(
  partialLiveSearch.warnings.some((warning) => warning.code === "PARTIAL_LIVE_RESULTS"),
  "partial live search should disclose limited live coverage"
);

restoreEnv("DEMO_MODE", previousDemoMode);
restoreEnv("USE_LIVE_DATA", previousUseLiveData);
restoreEnv("BRIGHT_DATA_API_KEY", previousBrightDataApiKey);

const liveOffers = parseBrightDataShoppingOffers(
  {
    shopping: [
      {
        title: "Apple AirPods Pro 2Apple AirPods Pro 2",
        shop: "Target",
        price: "$199.99",
        old_price: "$249.99",
        link: "https://www.target.com/p/apple-airpods-pro-2"
      },
      {
        title: "Apple iPhone 16",
        shop: "Apple",
        price: "$829.00",
        link: "https://www.apple.com/iphone/"
      }
    ]
  },
  {
    title: "Apple AirPods Pro 2",
    brand: "Apple",
    category: "electronics",
    mccFamily: "electronics",
    confidence: 0.9
  }
);
assertEqual(liveOffers.length, 1, "Bright Data parser should keep relevant shopping rows only");
assertEqual(liveOffers[0]?.source, "live", "Bright Data parser should label parsed rows as live");
assertEqual(liveOffers[0]?.retailerId, "target", "Bright Data parser should map known retailers");
assertEqual(liveOffers[0]?.price, 199.99, "Bright Data parser should parse USD prices");

const phoneProduct: Product = {
  title: "iPhone 13",
  brand: "Apple",
  category: "electronics",
  mccFamily: "electronics",
  confidence: 0.9
};
const strictPhoneOffers = parseBrightDataShoppingOffers(
  {
    shopping: [
      {
        title: "Restored Apple iPhone 13",
        shop: "Walmart",
        price: "$249.00",
        link: "https://www.walmart.com/ip/restored-apple-iphone-13"
      },
      {
        title: "At&t Apple iPhone 13, 128 GB, Midnight - Prepaid Smartphone [Locked to AT&T]",
        shop: "Walmart",
        price: "$249.00",
        link: "https://www.walmart.com/ip/att-iphone-13-prepaid"
      },
      {
        title: "Apple iPhone 13 Pro 128GB",
        shop: "Best Buy",
        price: "$699.00",
        link: "https://www.bestbuy.com/site/iphone-13-pro"
      },
      {
        title: "Apple iPhone 13 MagSafe Case",
        shop: "Target",
        price: "$49.99",
        link: "https://www.target.com/p/iphone-13-case"
      },
      {
        title: "Apple iPhone 13 128GB Unlocked",
        shop: "Apple",
        price: "$599.00",
        link: "https://www.apple.com/shop/buy-iphone/iphone-13"
      }
    ]
  },
  phoneProduct,
  "iPhone 13"
);
assertEqual(strictPhoneOffers.length, 1, "strict phone parsing should reject constrained, variant, and accessory rows");
assertEqual(strictPhoneOffers[0]?.productTitle, "Apple iPhone 13 128GB Unlocked", "strict phone parsing should keep the exact base phone");

const constrainedPhoneOffers = parseBrightDataShoppingOffers(
  {
    shopping: [
      {
        title: "Restored Apple iPhone 13",
        shop: "Walmart",
        price: "$249.00",
        link: "https://www.walmart.com/ip/restored-apple-iphone-13"
      },
      {
        title: "iPhone 13 128GB - Green - Unlocked",
        shop: "Back Market",
        price: "$247.00",
        link: "https://www.backmarket.com/en-us/p/iphone-13"
      }
    ]
  },
  phoneProduct,
  "iPhone 13",
  { allowConstrainedListings: true }
);
assertEqual(constrainedPhoneOffers.length, 2, "constrained fallback should preserve matching reconditioned rows");

const galaxyOffers = parseBrightDataShoppingOffers(
  {
    shopping: [
      {
        title: "Samsung Galaxy S24 256GB",
        shop: "nopCommerce",
        price: "$859.00",
        link: "https://www.google.com/search?ibp=oshop&q=Samsung+Galaxy+S24+256GB"
      },
      {
        title: "Samsung Galaxy S24 Ultra 5G 256GB",
        shop: "Newegg",
        price: "$999.99",
        link: "https://www.newegg.com/samsung-galaxy-s24-ultra"
      },
      {
        title: "Samsung Galaxy S24 128GB Unlocked",
        shop: "Samsung",
        price: "$799.99",
        link: "https://www.samsung.com/us/smartphones/galaxy-s24/buy/"
      }
    ]
  },
  {
    title: "Samsung Galaxy S24",
    brand: "Samsung",
    category: "electronics",
    mccFamily: "electronics",
    confidence: 0.9
  },
  "Samsung Galaxy S24"
);
assertEqual(galaxyOffers.length, 1, "base phone searches should reject unrequested Ultra/Pro/Max variants");
assertEqual(galaxyOffers[0]?.productTitle, "Samsung Galaxy S24 128GB Unlocked", "base phone parsing should keep the base model");

const vacuumOffers = parseBrightDataShoppingOffers(
  {
    shopping: [
      {
        title: "Dyson V15 Best Cordless Vacuum Black Friday Dyson V15 Detect Cordless Vacuum Cleaner",
        shop: "derechoysociedad.pe",
        price: "$40.00",
        link: "https://derechoysociedad.pe/dyson-v15"
      },
      {
        title: "Dyson V15 Detect Cordless Vacuum",
        shop: "Best Buy",
        price: "$399.00",
        link: "https://www.bestbuy.com/site/dyson-v15-detect"
      },
      {
        title: "Dyson V15 Detect Vacuum",
        shop: "Dyson",
        price: "$449.00",
        link: "https://www.dyson.com/vacuum-cleaners/cordless/v15"
      }
    ]
  },
  {
    title: "Dyson V15 Vacuum",
    brand: "Dyson",
    category: "home_goods",
    mccFamily: "home_goods",
    confidence: 0.9
  },
  "Dyson V15 vacuum"
);
assertEqual(vacuumOffers.length, 2, "live parser should reject severe low-price outliers");
assert(
  vacuumOffers.every((offer) => offer.retailerName !== "derechoysociedad.pe"),
  "low-price outlier merchant should not survive parsing"
);

console.table(
  results.map((result) => ({
    rank: result.rank,
    retailer: result.retailerName,
    card: result.cardName,
    list: result.listPrice,
    savings: result.savings,
    effective: result.effectivePrice
  }))
);

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
