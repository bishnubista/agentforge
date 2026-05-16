# AgentForge

AgentForge is a hackathon demo for **Moneymaker**, a wallet-aware shopping agent that recommends where to buy a product and which credit card to use.

Users select the cards they carry, enter a product URL or product name, and receive ranked retailer-card recommendations based on list price, retailer promos, issuer offers, category rewards, and portal boosts. The demo keeps card selection local, does not ask for card numbers, and uses hackathon fallback coverage when live integrations are unavailable.

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

### Hackathon API Keys

The demo expects these key names in a local `.env` or deployment environment:

| Integration | Env vars | Used for |
| --- | --- | --- |
| Bright Data | `BRIGHT_DATA_API_KEY`, `BRIGHTDATA_API_KEY`, or `BRIGHTDATA_API_TOKEN`; optional `BRIGHT_DATA_SERP_ZONE`, `BRIGHT_DATA_ZONE` | Live retailer/search lookup and product price discovery |
| Qwen Cloud | `DASHSCOPE_API_KEY`; optional `QWEN_BASE_URL`, `QWEN_MODEL` | Product extraction and shopper-facing recommendation explanation |
| TokenRouter | `TOKENROUTER_API_KEY`; optional `TOKENROUTER_BASE_URL`, `TOKENROUTER_MODEL` | LLM fallback route if Qwen is unavailable |
| Z.ai | `ZAI_API_KEY`; optional `ZAI_BASE_URL`, `ZAI_MODEL` | Secondary LLM fallback route |
| Butterbase | `BUTTERBASE_API_KEY`, `BUTTERBASE_APP_ID`; optional `BUTTERBASE_API_BASE` or `BUTTERBASE_BASE_URL` | Recommendation run logging/history |
| Nosana | `NOSANA_API_KEY` or hackathon-provided `NOSANA_CREDIT_CODE` | Optional GPU/inference stretch integration |

For judging, share only the environment variable names above. Keep actual API key values in `.env`, Vercel project settings, or the hackathon secret manager.

## Demo Queries

Use these for the judging flow:

- `Patagonia Nano Puff Men's Medium Black` — product-shopping flow; tries Bright Data live prices first.
- `gas station fill up` — gas category-spend flow; exercises gas rewards.
- `flight tickets LAX to JFK` — flight category-spend flow; exercises travel and flight rewards.
- `weekly groceries` — grocery category-spend flow; exercises grocery rewards.

The live lookup path is intentionally timeout-bounded for stage demos. Tune `BRIGHT_DATA_TIMEOUT_MS`, `LLM_TIMEOUT_MS`, and `BUTTERBASE_TIMEOUT_MS` if provider latency changes.

## Logging

Structured logs are emitted as JSON to the console through `src/lib/logger.ts`. Set `LOG_LEVEL=debug`, `info`, `warn`, or `error` to tune verbosity. Every recommendation API response includes an `x-request-id` header and failed UI requests show that id so browser reports can be matched to server logs.

The logger uses a swappable transport interface (`setLoggerTransport`) so a Sentry, Datadog, or hosted log drain transport can replace the console backend without changing call sites.

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
