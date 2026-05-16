# Agent Notes

## Project

- Next.js app in `src/app` with the main UI in `src/components/moneymaker-app.tsx`.
- Styling for the main UI lives in `src/components/moneymaker-app.module.css`; global design tokens live in `src/app/globals.css`.
- The app is wallet-aware shopping/rewards UI branded as `moneymaker` / `rewardr`.

## Local Commands

- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Dev server: `npm run dev`
- Scoring smoke test: `npm run test:scoring`

Run `npm run typecheck` and `npm run lint` before committing UI or TypeScript changes.

## Vercel

- Vercel CLI is available locally: `vercel`.
- The repo is already linked in `.vercel/project.json`:
  - project: `agentforge`
  - Vercel team/org: `bbista`
- Production deploy command: `vercel --prod --yes`
- Inspect a deployment: `vercel inspect <deployment-url>`
- Production aliases observed after the latest deploy:
  - `https://rewardr.ai`
  - `https://www.rewardr.ai`
  - `https://agentforge-hazel.vercel.app`
  - `https://agentforge-bbista.vercel.app`
  - `https://agentforge-bishnubista-bbista.vercel.app`

## UI Behavior Notes

- The top navigation is app state, not anchor scrolling.
- `Search` shows the hero, product search, wallet summary, agent status, recommendation, and results.
- `Wallet` must show only the wallet selector and allow selecting/deselecting cards.
- `Results` shows recommendation status/results without the search hero or wallet selector.
- Wallet selections are persisted in `localStorage` under `moneymaker:selected-cards`.

## Git

- Main branch tracks `origin/main`.
- Use focused commits. Do not include unrelated local files or generated screenshots from `.next`.
