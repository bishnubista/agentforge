import { envPositiveInteger, getBrightDataApiKey } from "./env";
import { retailers } from "./data";
import type { Product, RetailerOffer } from "./types";

export type BrightDataOfferLookup = {
  ok: boolean;
  message: string;
  offers: RetailerOffer[];
  sourceCount?: number;
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
  query
}: {
  product: Product;
  query: string;
}): Promise<BrightDataOfferLookup> {
  const apiKey = getBrightDataApiKey();
  if (!apiKey) {
    return {
      ok: false,
      message: "Bright Data key not configured",
      offers: []
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envPositiveInteger("BRIGHT_DATA_TIMEOUT_MS", 9000));

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
      return {
        ok: false,
        message: `Bright Data live shopping lookup failed with HTTP ${response.status}`,
        offers: []
      };
    }

    const payload = (await response.json()) as { body?: unknown };
    const body = parsePayloadBody(payload.body);
    const sourceCount = countShoppingRows(body);
    const offers = parseBrightDataShoppingOffers(body, product, isHttpUrl(query) ? "" : query);

    return {
      ok: offers.length > 0,
      offers,
      sourceCount,
      message:
        offers.length > 0
          ? `Bright Data returned ${offers.length} live shopping prices from ${sourceCount} candidates`
          : `Bright Data returned ${sourceCount} shopping candidates, but none matched this product confidently`
    };
  } catch {
    return {
      ok: false,
      message: "Bright Data live shopping lookup unavailable; using hackathon fallback if needed",
      offers: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseBrightDataShoppingOffers(body: unknown, product: Product, queryHint = ""): RetailerOffer[] {
  const rows = extractShoppingRows(body);
  const now = new Date().toISOString();
  const maxRetailers = positiveIntegerFromEnv("MAX_RETAILERS", 8);

  const candidates = rows
    .map((row) => rowToOffer(row, product, queryHint, now))
    .filter((offer): offer is RetailerOffer & { relevanceScore: number; knownRetailer: boolean } => Boolean(offer))
    .sort((a, b) => {
      if (a.knownRetailer !== b.knownRetailer) {
        return a.knownRetailer ? -1 : 1;
      }
      if (a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.price - b.price;
    });

  const bestByRetailer = new Map<string, RetailerOffer & { relevanceScore: number; knownRetailer: boolean }>();
  for (const candidate of candidates) {
    const current = bestByRetailer.get(candidate.retailerId);
    if (!current || candidate.relevanceScore > current.relevanceScore || candidate.price < current.price) {
      bestByRetailer.set(candidate.retailerId, candidate);
    }
  }

  const deduped = [...bestByRetailer.values()];
  const knownRetailerOffers = deduped.filter((offer) => offer.knownRetailer);
  const offers = knownRetailerOffers.length > 0 ? knownRetailerOffers : deduped;

  return offers
    .slice(0, maxRetailers)
    .map(({ relevanceScore: _relevanceScore, knownRetailer: _knownRetailer, ...offer }) => offer);
}

function rowToOffer(
  row: BrightDataShoppingRow,
  product: Product,
  queryHint: string,
  fetchedAt: string
): (RetailerOffer & { relevanceScore: number; knownRetailer: boolean }) | null {
  const title = cleanDuplicatedText(stringValue(row.title));
  const merchant = cleanDuplicatedText(stringValue(row.shop) || stringValue(row.source) || domainName(stringValue(row.link)));
  const price = parsePrice(row.price);
  const url = stringValue(row.link) || stringValue(row.referral_link) || stringValue(row.shop_link);
  const relevanceScore = productRelevance(product, title, queryHint);

  if (
    !title ||
    !merchant ||
    !price ||
    !isHttpUrl(url) ||
    relevanceScore < 0.55 ||
    isResaleMarketplace(merchant) ||
    isDisqualifiedTitle(title, queryHint, product)
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
  } catch {
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

function isDisqualifiedTitle(title: string, queryHint: string, product: Product) {
  const normalizedTitle = normalizeText(title);
  const normalizedQuery = normalizeText(queryHint);
  const normalizedProductTitle = normalizeText(product.title);

  if (/\b(used|pre owned|preowned|refurbished|restored|renewed|parts only)\b/.test(normalizedTitle)) {
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
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value: string) {
  return normalizeText(value).replace(/\s+/g, "-") || "unknown-retailer";
}

function positiveIntegerFromEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
