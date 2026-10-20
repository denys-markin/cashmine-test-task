#!/usr/bin/env bash
# Calls the test API with the token from .env.local, so the token never appears in the terminal or in AI logs.
# Usage: bash scripts/api.sh GET /path            bash scripts/api.sh POST /path '{"json":"body"}'
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "Missing .env.local (copy .env.example)" >&2; exit 1; }
set -a; . ./.env.local; set +a
method="${1:-GET}"; path="${2:-/}"; body="${3:-}"
auth="${API_AUTH_HEADER:-Authorization: Bearer ${API_TOKEN}}"
args=(-sS -m 20 -X "$method" -H "$auth" -H "Accept: application/json" -w '\nHTTP %{http_code} in %{time_total}s\n')
[ -n "$body" ] && args+=(-H "Content-Type: application/json" --data "$body")
curl "${args[@]}" "${API_BASE_URL%/}${path}" \
  | perl -pe 'BEGIN { $t = $ENV{API_TOKEN} // "" } s/\Q$t\E/[REDACTED_API_TOKEN]/g if length $t'

