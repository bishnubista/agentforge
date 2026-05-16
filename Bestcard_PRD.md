**Product Requirements Document**
**Moneymaker: Wallet-Aware Shopping Agent**
*Codename: Bestcard (working name)*

**Status:** Draft for hackathon build
**Author:** Product (drafted with Claude)
**Audience:** Engineering partner — hackathon build team
**Last updated:** May 16, 2026

# 1. TL;DR
Americans carry an average of 3–4 credit cards, each with rotating category bonuses, retailer offers, signup spend tracking, and statement credits. The information needed to use them well exists, but it is never in front of the user at the moment of purchase. The result: people leave hundreds to thousands of dollars on the table every year.
We are building an agent that answers one question at the moment it matters:
*“For the thing I’m about to buy, where should I buy it, and which card should I use?”*
The agent takes a product (URL or name), shops it across major retailers, cross-references the user’s wallet against active card offers and category bonuses, and returns a ranked recommendation showing total effective price after rewards and discounts.
**Hackathon goal:** a working end-to-end demo where the user picks their cards from a list, pastes a product, and gets a recommendation in under 30 seconds. No PII, no card numbers, no Plaid.
# 2. The Problem
## 2.1 What people do today
Open 4–6 retailer tabs to compare prices on the same product.
Try to remember which card has the current quarterly bonus for that category.
Forget about issuer-specific offers (Amex Offers, Chase Offers, Discover Deals) entirely.
Ignore signup-bonus spend progress, statement credits, and portal multipliers.
Default to whichever card is on top of their wallet.

## 2.2 Why this is hard to solve manually
Card benefits are fragmented across issuer apps, each with its own activation flow.
Offers are dynamic — targeted, expiring, and not visible until you log in.
Retailer prices vary by SKU, promo, and membership status.
The right answer depends on a 3-way join: product × retailer × card.

## 2.3 Concrete examples (from the user’s brief)
**Example A:** User is at a Chevron pump. Should they tap the Amex Gold (4x dining, no gas bonus), Chase Freedom Flex (5% rotating — is gas this quarter?), or Discover It (5% gas this quarter, capped at $1,500)? Today: they guess.
**Example B:** User wants a Patagonia Nano Puff. List price $229 across retailers, but: REI co-op member dividend + Amex Offer = $198 effective; Backcountry + Chase Sapphire portal = $206; Patagonia direct + Citi Custom Cash = $212. Today: they buy from whichever tab they had open.
# 3. Goals & Non-Goals
| Goals (in scope for v0 demo) | Non-goals (explicitly out of scope for hackathon) |
| --- | --- |
| End-to-end agent loop: product input → multi-retailer search → wallet-aware reasoning → ranked recommendation. | Auto-checkout, auto-apply at point of sale, browser extension. |
| Card type onboarding via list selection (no card numbers, no PII). | Plaid / bank integration. No reading real statements. |
| Support a curated set of ~15 popular US cards and ~8 retailers for the demo. | Comprehensive card database. We hardcode the demo set. |
| Show transparent reasoning: line-item breakdown of why one option beat another. | Loyalty programs beyond credit cards (airline miles, hotel status). Defer to v2. |
| A polished 60-second demo flow that judges can run themselves. | Mobile apps, receipt OCR, voice. All deferrable. |


# 4. Users & Use Cases
## 4.1 Target user
Credit-card-engaged Americans (25–55) who carry 3+ cards, are points-aware, and shop online weekly. They already understand the optimization exists — they just can’t do the math in their head.

## 4.2 Primary use cases for v0
**UC1 — Planned online purchase.** User has a specific product in mind. They paste a URL or product name. Agent returns: best retailer × best card combo, total price after rewards, runner-up, and why.
**UC2 — Category lookup.** User asks “best card for gas” or “best card for groceries.” Agent returns the best card from their wallet for that MCC category with the active rate.
**UC3 (stretch) — Same-retailer comparison.** User has decided on a retailer (e.g., Amazon). Agent returns just the best card from their wallet for that retailer, accounting for portal multipliers and active issuer offers.
# 5. User Flow (Demo Script)
User lands on the web app. Single hero input: “What are you buying?”
First-time only: user picks card types from a visual grid (e.g., Amex Gold, Chase Sapphire Preferred, Discover It, Citi Custom Cash). No login, no PII. Stored in localStorage.
User pastes a Patagonia Nano Puff URL (or types “Patagonia Nano Puff Men’s Medium Black”).
Agent shows a live status panel: “Identifying product…”, “Checking REI, Backcountry, Patagonia, Amazon, Dick’s, Moosejaw…”, “Cross-referencing your 4 cards against active offers…”
Result card: ranked list of 3 options. Top option shows retailer, card, list price, line-item adjustments (offer, category multiplier, portal bonus), and final effective price. Expandable “why” for the runner-up.
CTA: “Open at REI” deep-links to the retailer page. (No checkout automation in v0.)
# 6. Functional Requirements
## 6.1 Wallet onboarding
Card picker UI: searchable grid of ~15 popular cards with logos.
Selected cards persist to localStorage as a list of card IDs (e.g., ["amex_gold", "csp", "discover_it"]).
Editable from a settings panel. No login required for v0.
Explicit disclaimer: “We never ask for card numbers.”

## 6.2 Product identification
Accepts either a product URL (any major US retailer) or a free-text product name.
Agent extracts: product title, brand, category (mapped to MCC family), reference price, target SKU/model where possible.
Ambiguous text inputs trigger a one-shot clarifier (“Did you mean the Men’s or Women’s Nano Puff?”).

## 6.3 Multi-retailer price discovery
Agent searches a curated set of retailers for the same product.
Each search returns: retailer name, current price, in-stock status, deep link, any retailer-side promo (e.g., “20% off for members”).
Demo retailer set: Amazon, REI, Backcountry, Patagonia, Dick’s, Moosejaw, Target, Walmart. Configurable.

## 6.4 Wallet-aware scoring
For each (retailer, card) pair, compute effective price = list price − retailer promo − issuer offer − (price × reward rate).
Inputs to scoring: category multiplier from a static rules table, active issuer offers from a static demo dataset, portal bonus if applicable.
Tie-breakers: signup bonus spend progress (if onboarded), card with the highest cashback equivalent at point value (1¢/point baseline).
Show the math transparently in the UI. No black box.

## 6.5 Recommendation output
Top 3 ranked options, with the top option visually emphasized.
Each option shows: retailer logo, card art, list price, breakdown rows (offer, multiplier, redemption value), and bolded effective price.
Plain-language explanation: “We picked REI + Amex Gold because the active 15% Amex Offer plus 4x Membership Rewards on this category beats Backcountry by $12.”
Confidence indicator. Low confidence when offers are stale or prices vary wildly.
# 7. Data Model (Demo Dataset)
For the hackathon build, all card and offer data is hardcoded as JSON. No live issuer integration. The schema is built to swap in live sources post-hackathon.
## 7.1 Cards (demo seed — illustrative subset)
| Card | Category multipliers (demo) | Active offer example | Notes |
| --- | --- | --- | --- |
| Amex Gold | 4x dining, 4x US grocery, 3x flights | $15 off $50 at Patagonia | 10x cap on grocery at $25k/yr |
| Chase Sapphire Preferred | 3x dining, 2x travel, 5x via portal | 5x at REI via Ultimate Rewards | 1.25¢/pt redemption baseline |
| Discover It | 5% rotating (gas/restaurants Q2) | — | Capped at $1,500/quarter |
| Citi Custom Cash | 5% on top spend category | — | $500/month cap; auto-selects category |
| Capital One Venture X | 2x everywhere, 10x hotels via portal | — | Used as the “floor” comparator |


**Important:** Card rates change frequently. The demo seed will be reviewed and timestamped the morning of the hackathon. Treat all rates as configurable, not hardcoded into logic.

## 7.2 Card schema
Each card record:
id, displayName, issuer, network, art_url
rewards: array of { category, multiplier, cap, capPeriod }
portalBoosts: array of { retailer, multiplier }
pointValue: cents per point (baseline + max via transfer)
annualFee, signupBonus (optional, for stretch UC)

## 7.3 Offer schema
id, cardId, merchant, type (statement_credit | percent_off | dollar_off), value
minSpend, validFrom, validTo, oneTimeUse (bool)
source: 'amex_offers' | 'chase_offers' | 'discover_deals' | 'manual'

## 7.4 Product/retailer payload (from agent search)
productId (normalized), title, brand, category, mccFamily
Per retailer: retailerId, price, currency, inStock, url, retailerPromo (if any)
# 8. Agent Architecture
The agent is the product. Everything else is plumbing.

## 8.1 Loop
Receive user input (URL or product name + wallet from localStorage).
Plan: decide whether to clarify, search, or directly score (e.g., for category-only queries like “best card for gas”).
Tool: identify_product — normalizes input to a canonical product.
Tool: search_retailers — parallel fan-out across the configured retailer set. Live browsing (Browserbase or equivalent). Cached for repeat demos.
Tool: lookup_card_rules — pulls category multipliers, portal boosts, and active offers for each card in the user’s wallet.
Tool: score_options — deterministic Python/TS function that computes effective price for each (retailer × card) pair. Not LLM-based; numbers must be exact.
Synthesize: agent writes the plain-English explanation citing only the line items the scoring function used.

## 8.2 Why split scoring from the LLM
LLMs are bad at arithmetic and worse at being audited.
Effective price is a deterministic function. Compute it deterministically.
Use the LLM for: product normalization, ambiguity resolution, retailer page interpretation, and the natural-language summary.

## 8.3 Suggested stack (swap as the hackathon dictates)
**Agent / reasoning:** Claude API (claude-sonnet-4-5 or claude-opus-4-7) with tool use. Sonnet for the live demo to keep latency low.
**Live browsing:** Browserbase or browser-use for retailer page rendering. Falls back to direct HTTP + cached responses if a retailer blocks.
**Frontend:** Next.js + Tailwind. Streamed agent status panel via SSE. Deploy to Vercel.
**State:** localStorage for wallet. No backend database needed for the demo. A flat JSON file in the repo for the card/offer seed.
**Caching:** Aggressive. Pre-fetch the demo products the morning of the hackathon so the live demo never fails on a retailer timeout.
**Note to eng:** this section is opinionated, not binding. Swap any of it for whatever the hackathon sponsors are promoting — the architecture survives the substitution as long as the agent/scoring split holds.
# 9. Scoring Math
Effective price is computed per (retailer × card) pair. Lower is better.
| Component | Definition |
| --- | --- |
| List price | Retailer’s shown price for the canonical product. |
| Retailer promo | Any retailer-side discount (member dividend, coupon already on page, signed-in price). |
| Issuer offer | Active card-linked offer for that merchant (Amex Offers, Chase Offers, Discover Deals). |
| Category reward | list_price × applicable category multiplier × pointValue. Capped per card’s capPeriod. |
| Portal bonus | Extra multiplier when the card has a shopping portal (e.g., Chase UR portal for REI). |
| Effective price | list_price − retailer_promo − issuer_offer − category_reward_value − portal_bonus_value. |


**Honesty in the math:** treat reward points at their baseline cash redemption value (1¢/point for most cards, 1.25¢ for CSP cash-out, etc.). Do not assume max transfer-partner value — that lies to users about effective price.
**Caps matter:** Discover It’s 5% is capped at $1,500/quarter. Citi Custom Cash caps at $500/month. The scoring function must respect caps; for the demo, assume the user has not yet hit them unless they tell us.
# 10. UX Requirements
One-input landing page. No marketing. Demo judges should be inside the product in <5 seconds.
Wallet picker: visual grid with real card art. Selecting a card animates it into a stylized “wallet” at the top of the screen.
Live agent status: streamed log of what the agent is doing. This is the demo magic — show the agent thinking.
Result card: large effective-price number. Line items expand on hover/tap. Plain-English summary in 1–2 sentences.
Trust cues: “We don’t see your card numbers” pinned in the footer. Source-of-truth links on every rate.
Mobile-responsive but desktop-first. Judges demo on laptops.
# 11. Success Metrics (Hackathon)
| Demo-day metric | Target |
| --- | --- |
| End-to-end latency (paste → recommendation) | < 30 seconds for cached products, < 60 seconds cold |
| Demo failure rate across 5 rehearsal runs | 0 hard failures (graceful fallback to cached data is OK) |
| Retailer coverage for any demo product | ≥ 3 retailers returning live or cached prices |
| Recommendation math accuracy vs. hand-calculated | 100% on the 5 demo products |
| Judge can articulate the value prop after watching | Yes — measured by judge questions being about scale, not “what does it do” |


### Post-hackathon, if we keep building
Weekly active wallets.
Estimated savings per recommendation (and cumulative per user).
Recommendation acceptance rate (CTR on the “Open at retailer” CTA).
# 12. Risks
| Risk | Why it matters | Mitigation for demo |
| --- | --- | --- |
| Retailer scraping blocked mid-demo | Live agent fails on stage | Pre-cache the 5 demo products that morning; fall back to cached data with a visible 'cached' badge |
| Card rates / offers in our seed are stale | Embarrassing if a judge knows their card | Timestamp the dataset; show 'last updated' in the UI; stick to well-known stable rates |
| LLM hallucinates a multiplier or offer | Wrong recommendation = product is dead | Scoring is deterministic from the JSON seed; LLM only narrates, never invents numbers |
| Ambiguous product input | Wrong product priced | Clarifier turn; show the product the agent matched before scoring |
| Affiliate / ToS questions raised by judges | Distracts from the demo | Prepare a one-line answer: 'v0 is informational; monetization via affiliate partnerships is the obvious path, not the focus today' |


## 12.1 Open questions for the team to resolve in the first hour
Which 15 cards are in the demo seed? (Decide by popularity + variety of reward structures.)
Which 5 products do we rehearse on? (Aim for visible price variance and an active issuer offer.)
Browserbase vs. browser-use vs. direct HTTP — what does the hackathon want us to showcase?
Do we ship UC2 (category lookup) for the demo, or only UC1?
Do we want a “Surprise me — what should I buy on sale right now?” mode as a stretch?
# 13. Hackathon Build Plan
Time-boxed for a typical 24-hour hackathon. Adjust to the actual schedule.

### Hours 0–2 — Foundations
Lock the demo card seed and demo product list. (Product/PM task.)
Stand up Next.js app, deploy hello-world to Vercel.
Wire Claude API with a single tool: identify_product.

### Hours 2–8 — Agent core
Add search_retailers tool with Browserbase. Get 3 retailers returning data.
Implement deterministic score_options function with unit tests on the 5 demo products.
End-to-end CLI version working before any UI polish.

### Hours 8–16 — UX
Wallet picker grid with card art.
Streamed agent status panel.
Result card with line-item breakdown.

### Hours 16–20 — Polish & cache
Pre-fetch all 5 demo products and cache responses.
Add graceful fallbacks for every external call.
Tighten copy, add the trust footer.

### Hours 20–24 — Rehearse
Run the 60-second demo 10 times. Time every run.
Fix anything that fails twice.
Record a backup video in case live wifi dies on stage.
# 14. Beyond the Hackathon
Browser extension that surfaces the recommendation at checkout on major retailers.
Receipt scanning (mobile) for in-person purchases — “Was I about to use the wrong card?”
Issuer-feed integration (where APIs exist) to read live targeted offers instead of relying on a static seed.
Signup bonus tracker — agent biases toward whichever card the user is trying to hit a minimum spend on.
Travel mode — flights, hotels, car rentals via portals with transfer-partner valuations.
Monetization: affiliate links to retailers and card application referrals. Never sell user data; the no-PII posture is a feature, not a constraint.
# Appendix A — Assumptions Worth Challenging
Flagging the choices I made without your input so your eng partner can push back:
Web app surface (vs. extension or mobile). Chosen for demo velocity and visibility of the agent loop.
Card-type list selection (vs. statement upload or Plaid). Chosen for zero-PII posture and zero auth complexity.
Claude + Browserbase + Next.js as the suggested stack. Swap freely based on which sponsors the hackathon is promoting — the agent/scoring architecture survives any substitution.
Deterministic scoring function separate from the LLM. This is the strongest opinion in the doc; do not break this for any reason.


**End of PRD.** Ship it.