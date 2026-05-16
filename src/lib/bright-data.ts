import { envPositiveInteger, getBrightDataApiKey } from "./env";
import { retailers } from "./data";
import { logger } from "./logger";
import type { Product, RecommendationWarning, RetailerOffer } from "./types";

export type BrightDataOfferLookup = {
  ok: boolean;
  message: string;
  offers: RetailerOffer[];
  sourceCount?: number;
  warnings?: RecommendationWarning[];
};

type BrightDataShoppingRow = {
  title?: unknown;
  link?: unknown;
  referral_link?: unknown;
  shop_link?: unknown;
  price?: unknown;
  old_price?: unknown;
  shop?: unknown;
  source?: unknown;
  display_link?: unknown;
};

const DEFAULT_SERP_ZONE = "sdk_serp";
const SHOPPING_RESULT_KEYS = ["shopping", "top_pla", "bottom_pla", "jackpot_pla"] as const;
const RESALE_MARKETPLACE_TOKENS = [
  "depop",
  "ebay",
  "etsy",
  "facebook marketplace",
  "mercari",
  "offerup",
  "pawn america",
  "poshmark",
  "recell",
  "reverb",
  "stockx",
  "the realreal",
  "thredup",
  "whatnot"
];
const CONDITION_RETAILER_TOKENS = ["back market", "gazelle", "reebelo"];
const GENERIC_MERCHANT_TOKENS = ["magento", "nopcommerce", "prestashop", "shopify", "woocommerce"];
const CONDITION_TOKENS = [
  "fair",
  "open box",
  "parts only",
  "pre owned",
  "preowned",
  "refurbished",
  "renewed",
  "restored",
  "used"
];
const CARRIER_LOCKED_TOKENS = [
  "at and t",
  "att",
  "boost mobile",
  "carrier locked",
  "cricket",
  "locked",
  "metro",
  "prepaid",
  "simple mobile",
  "straight talk",
  "t mobile",
  "tmobile",
  "tracfone",
  "verizon",
  "xfinity mobile"
];
const PHONE_VARIANT_TOKENS = ["pro max", "pro", "max", "ultra", "plus", "mini", "fe", "se"];
const ACCESSORY_TOKENS = [
  "adapter",
  "band",
  "battery",
  "case",
  "cases",
  "cable",
  "charger",
  "cover",
  "filter",
  "holder",
  "mount",
  "protector",
  "repair kit",
  "replacement",
  "screen protector",
  "stand",
  "strap"
];
const PHONE_FAMILY_TOKENS = ["galaxy", "iphone", "pixel", "phone", "smartphone"];
const STOP_WORDS = new Set([
  "and",
  "for",
  "gen",
  "generation",
  "jacket",
  "large",
  "the",
  "with"
]);

export async function getBrightDataOffers({
  product,
  query,
  requestId
}: {
  product: Product;
  query: string;
  requestId?: string;
}): Promise<BrightDataOfferLookup> {
  const brightDataLogger = logger.child({
    module: "bright-data",
    requestId
  });
  const apiKey = getBrightDataApiKey();
  if (!apiKey) {
    brightDataLogger.debug("Bright Data lookup skipped because credentials are not configured");
    return {
      ok: false,
      message: "Bright Data key not configured",
      offers: []
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envPositiveInteger("BRIGHT_DATA_TIMEOUT_MS", 15000));

  try {
    const response = await fetch("https://api.brightdata.com/request", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        zone: process.env.BRIGHT_DATA_SERP_ZONE || process.env.BRIGHTDATA_SERP_ZONE || DEFAULT_SERP_ZONE,
        url: buildGoogleShoppingUrl(product, query),
        format: "json"
      })
    });

    if (!response.ok) {
      brightDataLogger.warn("Bright Data lookup returned a non-OK response", {
        status: response.status,
        statusText: response.statusText,
        productTitle: product.title,
        queryLength: query.length
      });
      return {
        ok: false,
        message: `Bright Data live shopping lookup failed with HTTP ${response.status}`,
        offers: []
      };
    }

    const payload = (await response.json()) as { body?: unknown };
    const body = parsePayloadBody(payload.body);
    const sourceCount = countShoppingRows(body);
    const queryHint = isHttpUrl(query) ? "" : query;
    const strictOffers = parseBrightDataShoppingOffers(body, product, queryHint);
    const constrainedOffers =
      strictOffers.length === 0
        ? parseBrightDataShoppingOffers(body, product, queryHint, { allowConstrainedListings: true })
        : [];
    const offers = strictOffers.length > 0 ? strictOffers : constrainedOffers;
    const warnings =
      strictOffers.length === 0 && constrainedOffers.length > 0
        ? [
            {
              code: "CONSTRAINED_LIVE_RESULTS",
              message:
                "Only constrained live listings were found, such as refurbished, prepaid, carrier-locked, or secondary-market offers. Review the retailer product title before buying."
            }
          ]
        : [];
    brightDataLogger.info("Bright Data lookup completed", {
      productTitle: product.title,
      sourceCount,
      offerCount: offers.length,
      constrainedFallback: strictOffers.length === 0 && constrainedOffers.length > 0,
      ok: offers.length > 0
    });

    return {
      ok: offers.length > 0,
      offers,
      sourceCount,
      warnings,
      message:
        offers.length > 0
          ? `Bright Data returned ${offers.length} live shopping prices from ${sourceCount} candidates`
          : `Bright Data returned ${sourceCount} shopping candidates, but none matched this product confidently`
    };
  } catch (error) {
    brightDataLogger.warn("Bright Data lookup failed; fallback data may be used", {
      error,
      productTitle: product.title,
      queryLength: query.length
    });
    return {
      ok: false,
      message: "Bright Data live shopping lookup unavailable; using hackathon fallback if needed",
      offers: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

type BrightDataParseOptions = {
  allowConstrainedListings?: boolean;
};

type ParsedRetailerOffer = RetailerOffer & { relevanceScore: number; knownRetailer: boolean };

export function parseBrightDataShoppingOffers(
  body: unknown,
  product: Product,
  queryHint = "",
  options: BrightDataParseOptions = {}
): RetailerOffer[] {
  const rows = extractShoppingRows(body);
  const now = new Date().toISOString();
  const maxRetailers = positiveIntegerFromEnv("MAX_RETAILERS", 8);

  const candidates = filterPriceOutliers(
    rows
      .map((row) => rowToOffer(row, product, queryHint, now, options))
      .filter((offer): offer is ParsedRetailerOffer => Boolean(offer))
  )
    .sort((a, b) => {
      if (a.knownRetailer !== b.knownRetailer) {
        return a.knownRetailer ? -1 : 1;
      }
      if (a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.price - b.price;
    });

  const bestByRetailer = new Map<string, ParsedRetailerOffer>();
  for (const candidate of candidates) {
    const current = bestByRetailer.get(candidate.retailerId);
    if (!current || candidate.relevanceScore > current.relevanceScore || candidate.price < current.price) {
      bestByRetailer.set(candidate.retailerId, candidate);
    }
  }

  return [...bestByRetailer.values()]
    .slice(0, maxRetailers)
    .map(({ relevanceScore: _relevanceScore, knownRetailer: _knownRetailer, ...offer }) => offer);
}

function rowToOffer(
  row: BrightDataShoppingRow,
  product: Product,
  queryHint: string,
  fetchedAt: string,
  options: BrightDataParseOptions
): ParsedRetailerOffer | null {
  const title = cleanDuplicatedText(stringValue(row.title));
  const price = parsePrice(row.price);
  const url = preferredUrl(row);
  const merchant = cleanDuplicatedText(merchantName(row, url));
  const relevanceScore = productRelevance(product, title, queryHint);

  if (
    !title ||
    !merchant ||
    !price ||
    !isHttpUrl(url) ||
    relevanceScore < 0.55 ||
    isGenericMerchant(merchant) ||
    isResaleMarketplace(merchant) ||
    isConditionRetailer(merchant, queryHint, product, options) ||
    isDisqualifiedTitle(title, queryHint, product, options)
  ) {
    return null;
  }

  const retailer = resolveRetailer(merchant, url);

  return {
    retailerId: retailer.id,
    retailerName: retailer.name,
    productTitle: title,
    price,
    currency: "USD",
    inStock: true,
    url,
    source: "live",
    fetchedAt,
    relevanceScore,
    knownRetailer: retailer.known
  };
}

function merchantName(row: BrightDataShoppingRow, url: string) {
  const rawMerchant = stringValue(row.shop) || stringValue(row.source);
  if (rawMerchant && !isGenericMerchant(rawMerchant)) {
    return rawMerchant;
  }

  const domain = domainName(url);
  if (domain && !isGoogleUrl(url)) {
    return domain;
  }

  return rawMerchant || domain;
}

function isGenericMerchant(merchant: string) {
  const normalizedMerchant = normalizeText(merchant);
  return hasAnyPhrase(normalizedMerchant, GENERIC_MERCHANT_TOKENS);
}

function filterPriceOutliers(offers: ParsedRetailerOffer[]) {
  if (offers.length < 2) {
    return offers;
  }

  const median = medianPrice(offers.map((offer) => offer.price));
  const minPrice = median * 0.35;
  const maxPrice = median * 3.5;
  return offers.filter((offer) => offer.price >= minPrice && offer.price <= maxPrice);
}

function medianPrice(prices: number[]) {
  const sorted = [...prices].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function buildGoogleShoppingUrl(product: Product, query: string) {
  const searchQuery = isHttpUrl(query) ? product.title : `${query || product.title} price`;
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("udm", "28");
  url.searchParams.set("brd_json", "1");
  return url.toString();
}

function parsePayloadBody(body: unknown) {
  if (typeof body !== "string") {
    return body;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    logger.warn("Bright Data payload body was not valid JSON", {
      module: "bright-data",
      error,
      bodyLength: body.length
    });
    return null;
  }
}

function countShoppingRows(body: unknown) {
  return extractShoppingRows(body).length;
}

function extractShoppingRows(body: unknown): BrightDataShoppingRow[] {
  if (!body || typeof body !== "object") {
    return [];
  }

  const record = body as Record<string, unknown>;
  return SHOPPING_RESULT_KEYS.flatMap((key) => {
    const value = record[key];
    return Array.isArray(value) ? (value as BrightDataShoppingRow[]) : [];
  });
}

function resolveRetailer(merchant: string, url: string) {
  const normalizedMerchant = normalizeText(merchant);
  const normalizedUrl = normalizeText(url);
  const known = retailers.find((retailer) => {
    const retailerName = normalizeText(retailer.name);
    const retailerDomain = normalizeText(retailer.domain);
    return (
      normalizedMerchant.includes(retailerName) ||
      normalizedMerchant.includes(retailerDomain.replace(/com$/, "")) ||
      normalizedUrl.includes(retailerDomain)
    );
  });

  if (known) {
    return { id: known.id, name: known.name, known: true };
  }

  return {
    id: slugify(merchant),
    name: merchant,
    known: false
  };
}

function isResaleMarketplace(merchant: string) {
  const normalizedMerchant = normalizeText(merchant);
  return RESALE_MARKETPLACE_TOKENS.some((token) => normalizedMerchant.includes(normalizeText(token)));
}

function isConditionRetailer(
  merchant: string,
  queryHint: string,
  product: Product,
  options: BrightDataParseOptions
) {
  const normalizedMerchant = normalizeText(merchant);
  if (!hasAnyPhrase(normalizedMerchant, CONDITION_RETAILER_TOKENS)) {
    return false;
  }

  return !options.allowConstrainedListings && !hasConditionIntent(queryHint, product);
}

function productRelevance(product: Product, title: string, queryHint: string) {
  const productTokens = meaningfulTokens(`${product.brand} ${product.title} ${queryHint}`);
  const titleTokens = meaningfulTokens(title);
  if (productTokens.length === 0 || titleTokens.length === 0) {
    return 0;
  }

  const matches = productTokens.filter((token) => tokenMatches(token, titleTokens)).length;
  return matches / productTokens.length;
}

function meaningfulTokens(value: string) {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  const meaningful = tokens.filter((token) => (token.length > 2 || /^\d+$/.test(token)) && !STOP_WORDS.has(token));
  return meaningful.length > 0 ? Array.from(new Set(meaningful)) : Array.from(new Set(tokens));
}

function tokenMatches(productToken: string, titleTokens: string[]) {
  return titleTokens.some((titleToken) => {
    if (titleToken === productToken) {
      return true;
    }
    return /^\d+$/.test(productToken) && titleToken.startsWith(productToken);
  });
}

function isDisqualifiedTitle(
  title: string,
  queryHint: string,
  product: Product,
  options: BrightDataParseOptions
) {
  const normalizedTitle = normalizeText(title);
  const normalizedQuery = normalizeText(queryHint);
  const normalizedProductTitle = normalizeText(product.title);
  const normalizedIntent = normalizeText(`${queryHint} ${product.title} ${product.brand}`);

  if (hasPhrase(normalizedTitle, "parts only")) {
    return true;
  }

  if (
    hasAnyPhrase(normalizedTitle, CONDITION_TOKENS) &&
    !options.allowConstrainedListings &&
    !hasConditionIntent(queryHint, product)
  ) {
    return true;
  }

  if (
    isPhoneLike(normalizedIntent, normalizedTitle) &&
    hasAnyPhrase(normalizedTitle, CARRIER_LOCKED_TOKENS) &&
    !options.allowConstrainedListings &&
    !hasAnyPhrase(normalizedIntent, CARRIER_LOCKED_TOKENS)
  ) {
    return true;
  }

  if (hasUnrequestedPhoneVariant(normalizedTitle, normalizedIntent)) {
    return true;
  }

  if (hasAnyPhrase(normalizedTitle, ACCESSORY_TOKENS) && !hasAnyPhrase(normalizedIntent, ACCESSORY_TOKENS)) {
    return true;
  }

  if (/\b(men|mens)\b/.test(normalizedQuery) && /\b(kid|kids|women|womens)\b/.test(normalizedTitle)) {
    return true;
  }

  if (/\b(women|womens)\b/.test(normalizedQuery) && /\b(kid|kids|men|mens)\b/.test(normalizedTitle)) {
    return true;
  }

  if (
    /\bjacket\b/.test(normalizedProductTitle) &&
    !/\b(hoody|hoodie)\b/.test(normalizedQuery) &&
    /\b(hoody|hoodie)\b/.test(normalizedTitle)
  ) {
    return true;
  }

  return false;
}

function hasConditionIntent(queryHint: string, product: Product) {
  return hasAnyPhrase(normalizeText(`${queryHint} ${product.title}`), CONDITION_TOKENS);
}

function hasUnrequestedPhoneVariant(normalizedTitle: string, normalizedIntent: string) {
  if (!isPhoneLike(normalizedIntent, normalizedTitle)) {
    return false;
  }

  const titleVariants = PHONE_VARIANT_TOKENS.filter((variant) => hasPhrase(normalizedTitle, variant));
  if (titleVariants.length === 0) {
    return false;
  }

  return titleVariants.some((variant) => !hasPhrase(normalizedIntent, variant));
}

function isPhoneLike(normalizedIntent: string, normalizedTitle: string) {
  return hasAnyPhrase(normalizedIntent, PHONE_FAMILY_TOKENS) || hasAnyPhrase(normalizedTitle, PHONE_FAMILY_TOKENS);
}

function hasAnyPhrase(normalizedValue: string, phrases: string[]) {
  return phrases.some((phrase) => hasPhrase(normalizedValue, phrase));
}

function hasPhrase(normalizedValue: string, phrase: string) {
  const normalizedPhrase = normalizeText(phrase);
  return new RegExp(`(?:^| )${escapeRegExp(normalizedPhrase)}(?: |$)`).test(normalizedValue);
}

function preferredUrl(row: BrightDataShoppingRow) {
  const candidates = [row.referral_link, row.shop_link, row.link].map(stringValue).filter(isHttpUrl);
  return candidates.find((url) => !isGoogleUrl(url)) ?? candidates[0] ?? "";
}

function isGoogleUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").endsWith("google.com");
  } catch {
    return false;
  }
}

function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return roundMoney(value);
  }
  if (typeof value !== "string") {
    return null;
  }

  const match = value.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!match) {
    return null;
  }

  const price = Number(match[1]);
  return Number.isFinite(price) && price > 0 ? roundMoney(price) : null;
}

function cleanDuplicatedText(value: string) {
  const trimmed = value.trim();
  if (trimmed.length % 2 !== 0) {
    return trimmed;
  }

  const middle = trimmed.length / 2;
  const firstHalf = trimmed.slice(0, middle).trim();
  const secondHalf = trimmed.slice(middle).trim();
  return firstHalf && firstHalf === secondHalf ? firstHalf : trimmed;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function domainName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value: string) {
  return normalizeText(value).replace(/\s+/g, "-") || "unknown-retailer";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function positiveIntegerFromEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
