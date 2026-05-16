import cardsJson from "../../data/cards.json";
import demoProductsJson from "../../data/demo-products.json";
import offersJson from "../../data/offers.json";
import retailersJson from "../../data/retailers.json";
import type { Card, DemoProduct, Offer, Retailer } from "./types";

export const cards = cardsJson as Card[];
export const offers = offersJson as Offer[];
export const retailers = retailersJson as Retailer[];
export const demoProducts = demoProductsJson as DemoProduct[];

export function getCardsByIds(cardIds: string[]) {
  const selected = new Set(cardIds);
  return cards.filter((card) => selected.has(card.id));
}

export function getDefaultCards() {
  return cards.slice(0, 5);
}
