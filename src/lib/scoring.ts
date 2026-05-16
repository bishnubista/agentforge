import type { Card, LineItem, Offer, Product, RetailerOffer, RewardRule, ScoredOption } from "./types";

type ScoreOptionsInput = {
  product: Product;
  retailerOffers: RetailerOffer[];
  cards: Card[];
  offers: Offer[];
  now?: Date;
};

export function scoreOptions({
  product,
  retailerOffers,
  cards,
  offers,
  now = new Date()
}: ScoreOptionsInput): ScoredOption[] {
  const scored = retailerOffers
    .filter((retailerOffer) => retailerOffer.inStock)
    .flatMap((retailerOffer) =>
      cards.map((card) => scorePair({ product, retailerOffer, card, offers, now }))
    )
    .sort((a, b) => {
      if (a.effectivePrice !== b.effectivePrice) {
        return a.effectivePrice - b.effectivePrice;
      }
      if (a.savings !== b.savings) {
        return b.savings - a.savings;
      }
      return a.cardName.localeCompare(b.cardName);
    });

  return scored.map((option, index) => ({ ...option, rank: index + 1 }));
}

function scorePair({
  product,
  retailerOffer,
  card,
  offers,
  now
}: {
  product: Product;
  retailerOffer: RetailerOffer;
  card: Card;
  offers: Offer[];
  now: Date;
}): ScoredOption {
  const listPrice = roundMoney(retailerOffer.price);
  const retailerPromoAmount = roundMoney(retailerOffer.retailerPromo?.amount ?? 0);
  const chargedPrice = roundMoney(Math.max(listPrice - retailerPromoAmount, 0));

  const lineItems: LineItem[] = [];

  if (retailerPromoAmount > 0) {
    lineItems.push({
      kind: "retailer_promo",
      label: retailerOffer.retailerPromo?.label ?? "Retailer promo",
      amount: retailerPromoAmount
    });
  }

  const issuerOffer = bestIssuerOffer({
    offers,
    card,
    retailerOffer,
    chargedPrice,
    now
  });
  if (issuerOffer) {
    lineItems.push(issuerOffer);
  }

  const rewardRule = bestRewardRule(card, product, retailerOffer);
  const rewardValue = rewardValueForRule(chargedPrice, card, rewardRule);
  if (rewardValue > 0) {
    lineItems.push({
      kind: "category_reward",
      label: rewardRule.label,
      amount: rewardValue,
      detail: `${formatMultiplier(rewardRule.multiplier)} at ${formatPointValue(card.pointValueCents)}`
    });
  }

  const portalBoost = card.portalBoosts.find((boost) => boost.retailerId === retailerOffer.retailerId);
  const portalValue = portalBoost
    ? roundMoney((chargedPrice * portalBoost.extraMultiplier * card.pointValueCents) / 100)
    : 0;
  if (portalBoost && portalValue > 0) {
    lineItems.push({
      kind: "portal_bonus",
      label: portalBoost.label,
      amount: portalValue,
      detail: `${formatMultiplier(portalBoost.extraMultiplier)} extra`
    });
  }

  const savings = roundMoney(lineItems.reduce((total, item) => total + item.amount, 0));
  const effectivePrice = roundMoney(Math.max(listPrice - savings, 0));

  return {
    rank: 0,
    retailerId: retailerOffer.retailerId,
    retailerName: retailerOffer.retailerName,
    productTitle: retailerOffer.productTitle,
    cardId: card.id,
    cardName: card.displayName,
    listPrice,
    chargedPrice,
    effectivePrice,
    savings,
    lineItems,
    source: retailerOffer.source,
    inStock: retailerOffer.inStock,
    url: retailerOffer.url,
    fetchedAt: retailerOffer.fetchedAt
  };
}

function bestRewardRule(card: Card, product: Product, retailerOffer: RetailerOffer): RewardRule {
  const exactRetailerRule = card.rewards.find(
    (rule) =>
      rule.retailerId === retailerOffer.retailerId &&
      (rule.category === "any" ||
        rule.category === product.mccFamily ||
        rule.category === product.category)
  );
  if (exactRetailerRule) {
    return exactRetailerRule;
  }

  const categoryRule = card.rewards.find(
    (rule) => !rule.retailerId && (rule.category === product.mccFamily || rule.category === product.category)
  );
  if (categoryRule) {
    return categoryRule;
  }

  return {
    category: "base",
    multiplier: card.baseRewardRate,
    label: `${formatMultiplier(card.baseRewardRate)} base reward`
  };
}

function rewardValueForRule(chargedPrice: number, card: Card, rule: RewardRule) {
  const eligibleSpend = typeof rule.cap === "number" ? Math.min(chargedPrice, rule.cap) : chargedPrice;
  return roundMoney((eligibleSpend * rule.multiplier * card.pointValueCents) / 100);
}

function bestIssuerOffer({
  offers,
  card,
  retailerOffer,
  chargedPrice,
  now
}: {
  offers: Offer[];
  card: Card;
  retailerOffer: RetailerOffer;
  chargedPrice: number;
  now: Date;
}): LineItem | null {
  const activeOffers: LineItem[] = offers
    .filter((offer) => offer.cardId === card.id && offer.retailerId === retailerOffer.retailerId)
    .filter((offer) => isOfferActive(offer, now))
    .flatMap((offer) => {
      if (offer.minSpend && chargedPrice < offer.minSpend) {
        return [];
      }

      const amount =
        offer.type === "percent_off"
          ? Math.min((chargedPrice * offer.value) / 100, offer.maxValue ?? Number.POSITIVE_INFINITY)
          : offer.value;

      return [{
        kind: "issuer_offer" as const,
        label: offer.label,
        amount: roundMoney(amount),
        detail: offer.source === "manual" ? "Demo offer seed" : offer.source
      }];
    })
    .sort((a, b) => b.amount - a.amount);

  return activeOffers[0] ?? null;
}

function isOfferActive(offer: Offer, now: Date) {
  const current = now.getTime();
  const from = new Date(`${offer.validFrom}T00:00:00`).getTime();
  const to = new Date(`${offer.validTo}T23:59:59`).getTime();
  return current >= from && current <= to;
}

function formatMultiplier(multiplier: number) {
  return Number.isInteger(multiplier) ? `${multiplier}x` : `${multiplier.toFixed(2)}x`;
}

function formatPointValue(pointValueCents: number) {
  return pointValueCents === 1 ? "1 cent/point" : `${pointValueCents} cents/point`;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
