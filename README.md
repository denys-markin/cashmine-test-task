# CashMine practical task

Expo (React Native, TypeScript) app delivered as a web app.

- Live: _link_
- AI conversations: [`ai-logs/`](ai-logs/)

## Run locally

```bash
yarn install
npx expo start --web
```

On first open the app asks for your API token. It is kept in the browser (`localStorage`) and can be changed from the app.

Optional, for calling the API from a terminal: `cp .env.example .env.local`, fill in the values, then `bash scripts/api.sh GET /v1/balances`.
