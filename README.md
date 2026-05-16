# AgentForge

AgentForge is a hackathon demo for **Moneymaker**, a wallet-aware shopping agent that recommends where to buy a product and which credit card to use.

Users select the cards they carry, enter a product URL or product name, and receive ranked retailer-card recommendations based on list price, retailer promos, issuer offers, category rewards, and portal boosts. The demo keeps card selection local, does not ask for card numbers, and falls back to cached data when live integrations are unavailable.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- CSS Modules
- Static JSON seed data with optional live vendor adapters

## Getting Started

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment

The app runs without secrets using demo data. Optional integrations can be enabled by filling in values from `.env.example`.

Do not commit real secrets. `.env`, `.env.local`, and environment-specific `.env` files are ignored.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test:scoring
```

## Product Spec

See [Bestcard_PRD.md](Bestcard_PRD.md) for the product requirements and hackathon scope.
