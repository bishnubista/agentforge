export type MoneySource = "live" | "fallback" | "seeded";

export type RewardRule = {
  category: string;
  multiplier: number;
  label: string;
  retailerId?: string;
  cap?: number;
  capPeriod?: "month" | "quarter" | "year";
};

export type PortalBoost = {
  retailerId: string;
  extraMultiplier: number;
  label: string;
};

export type Card = {
  id: string;
  displayName: string;
  issuer: string;
  network: string;
  pointValueCents: number;
  baseRewardRate: number;
  art: {
    background: string;
    foreground: string;
  };
  rewards: RewardRule[];
  portalBoosts: PortalBoost[];
};

export type Offer = {
  id: string;
  cardId: string;
  retailerId: string;
  merchant: string;
  type: "statement_credit" | "percent_off" | "dollar_off";
  value: number;
  maxValue?: number;
  minSpend?: number;
  validFrom: string;
  validTo: string;
  source: "manual" | "amex_offers" | "chase_offers" | "discover_deals";
  label: string;
};

export type Retailer = {
  id: string;
  name: string;
  domain: string;
};

export type Product = {
  title: string;
  brand: string;
  category: string;
  mccFamily: string;
  confidence: number;
};

export type RetailerOffer = {
  retailerId: string;
  retailerName: string;
  productTitle: string;
  price: number;
  currency: "USD";
  inStock: boolean;
  url: string;
  retailerPromo?: {
    label: string;
    amount: number;
  };
  source: MoneySource;
  fetchedAt: string;
};

export type DemoProduct = {
  id: string;
  aliases: string[];
  product: Product;
  retailerOffers: RetailerOffer[];
};

export type LineItemKind =
  | "retailer_promo"
  | "issuer_offer"
  | "category_reward"
  | "portal_bonus";

export type LineItem = {
  kind: LineItemKind;
  label: string;
  amount: number;
  detail?: string;
};

export type ScoredOption = {
  rank: number;
  retailerId: string;
  retailerName: string;
  productTitle: string;
  cardId: string;
  cardName: string;
  listPrice: number;
  chargedPrice: number;
  effectivePrice: number;
  savings: number;
  lineItems: LineItem[];
  source: MoneySource;
  inStock: boolean;
  url: string;
  fetchedAt: string;
};

export type Recommendation = {
  product: Product;
  selectedCards: Card[];
  results: ScoredOption[];
  explanation: string;
  statusLog: string[];
  warnings: RecommendationWarning[];
  dataQuality: RecommendationDataQuality;
};

export type RecommendationWarning = {
  code: string;
  message: string;
};

export type RecommendationDataQuality = {
  resultSource: MoneySource | "mixed" | "none";
  liveLookupAttempted: boolean;
  liveLookupSucceeded: boolean;
  demoMode: boolean;
  generatedAt: string;
};
