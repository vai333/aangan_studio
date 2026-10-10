#!/usr/bin/env bash
# Copies the production environment variables from .env.local to the linked Vercel project.
# Usage: scripts/vercel-env.sh [production-url]   (needs `npx vercel link` first; uses $VERCEL_TOKEN if set)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo ".env.local not found"; exit 1; }
set -a; . ./.env.local; set +a
[ -n "${1:-}" ] && APP_URL="$1"
TOKEN_ARGS=(); [ -n "${VERCEL_TOKEN:-}" ] && TOKEN_ARGS=(--token "$VERCEL_TOKEN")

# Required for the app to work in production. (HUBSPOT_*, CALL_REPORT_EMAIL, EMAIL_FROM are optional.)
REQUIRED=(DATABASE_URL ADMIN_EMAILS ADMIN_PASSWORD SESSION_SECRET ACK_SECRET CRON_SECRET VAANI_API_KEY VAANI_WEBHOOK_TOKEN GEMINI_API_KEY RESEND_API_KEY APP_URL)
OPTIONAL=(VAANI_AGENT_ID GEMINI_MODEL GEMINI_FALLBACK_MODEL EMAIL_FROM CALL_REPORT_EMAIL HUBSPOT_ACCESS_TOKEN HUBSPOT_PORTAL_ID VAANI_WEBHOOK_SECRET RESEND_WEBHOOK_SECRET)

missing=0
for k in "${REQUIRED[@]}"; do [ -n "${!k:-}" ] || { echo "✗ $k is empty"; missing=1; }; done
[ "${APP_URL:-}" = "http://localhost:3100" ] && { echo "✗ APP_URL is still localhost: pass the production URL as the first argument"; missing=1; }
[ $missing = 0 ] || exit 1

push() { # name value
  npx vercel env rm "$1" production --yes "${TOKEN_ARGS[@]}" >/dev/null 2>&1 || true   # replace if it exists
  printf '%s' "$2" | npx vercel env add "$1" production "${TOKEN_ARGS[@]}" >/dev/null && echo "✓ $1"
}
for k in "${REQUIRED[@]}" "${OPTIONAL[@]}"; do [ -n "${!k:-}" ] && push "$k" "${!k}" || { [[ " ${OPTIONAL[*]} " == *" $k "* ]] && echo "· $k not set (optional)"; }; done
