# Card Image Sources

Rewardr can render real card covers through `card.coverImage`, but exact issuer card art should only be added from an approved source.

## Usable Candidates

- Rewards Credit Card API: docs say API data, including images, may be used in a website or software application owned by the subscriber. Caching/storage requires MEGA or SUPREME plans.
- CardAPI: Enterprise tier advertises card images and affiliate links for credit card data apps. Confirm commercial/image terms before storing assets.
- RewardLayers: card lookup includes base metadata with card image. Terms allow API integration by subscription tier, but prohibit building a competing dataset or caching beyond immediate display needs.
- Network token card art providers such as VGS/Cardtokens: appropriate only when we are displaying tokenized cards for actual cardholders, not for a generic card catalog.

## Avoid Without Permission

- Credit Karma CDN images.
- Directly copied issuer product images from Chase, Amex, Citi, Capital One, Wells Fargo, Discover, or Amazon pages.
- Network logos or card artwork copied from Visa/Mastercard/Amex brand centers unless their license specifically covers this app.

## Implementation Rule

Use local files under `public/cards/` only after rights are approved, or use provider-hosted image URLs only when the provider subscription allows display in this app. Keep CSS-generated covers as the fallback.
