# CashMine practical task

Expo (React Native, TypeScript) app delivered as a web app, designed for a ~390 px phone screen.

- Live: _link_
- Decisions and known issues: [`NOTES.md`](NOTES.md)
- AI conversations: [`ai-logs/`](ai-logs/)

## Run locally

```bash
yarn install
npx expo start --web
yarn test
```

On first open the app asks for your API token. It is kept in this browser (`localStorage`) and can be changed with **Token** in the header.

Optional, for calling the API from a terminal: `cp .env.example .env.local`, fill in the values, then `bash scripts/api.sh GET /v1/balances`.

## What works

- **Token gate**: asks for the token, checks it, stores it in the browser, lets you change it; a 401 anywhere brings you back to it.
- **Balances**: per-asset available / pending (may be reversed) / claiming, USD total and "claimable now", snapshot age, loading, error with retry, refresh.
- **Claim**: pick asset, amount or Max, destination; live validation against the API rules; fee and receive amount; review and confirm; status tracking until completed or failed. Balances include the claim right away (reconciled with the server snapshot). Unknown results are replayed with the same Idempotency-Key, so a claim is never created twice.
- **Activity**: paginated history of accruals, reversals and claims.
- **Tests**: `yarn test`, covering amount parsing, validation, fee, totals and the balance-after-claim overlay.

The API base URL lives in `src/api/config.ts`.
