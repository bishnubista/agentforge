import { cards, demoProducts, offers } from "../src/lib/data";
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
  source: "cached",
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

const previousDemoMode = process.env.DEMO_MODE;
const previousUseLiveData = process.env.USE_LIVE_DATA;
process.env.DEMO_MODE = "false";
process.env.USE_LIVE_DATA = "false";
const productionSearch = await searchRetailers({
  product: {
    title: "Uncached production-only item",
    brand: "Unknown",
    category: "general_merchandise",
    mccFamily: "general_merchandise",
    confidence: 0.4
  }
});
assertEqual(productionSearch.offers.length, 0, "production mode must not fabricate seeded retailer prices");
process.env.DEMO_MODE = previousDemoMode;
process.env.USE_LIVE_DATA = previousUseLiveData;

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
