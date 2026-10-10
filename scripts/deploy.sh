#!/usr/bin/env bash
# One-shot: push to GitHub, create/link the Vercel project, copy env vars, deploy, then set APP_URL and redeploy.
# Usage:  scripts/deploy.sh [github-owner/repo]        default: vai333/aangan_studio
#         SKIP_GITHUB=1 scripts/deploy.sh               deploy to Vercel without pushing to GitHub
# Auth:   GitHub (git push prompts or uses your saved login) and Vercel (`npx vercel login`, or export VERCEL_TOKEN).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${1:-vai333/aangan_studio}"
PROJECT="aangan-studio"
TOKEN_ARGS=(); [ -n "${VERCEL_TOKEN:-}" ] && TOKEN_ARGS=(--token "$VERCEL_TOKEN")

if [ "${SKIP_GITHUB:-0}" = "1" ]; then
  echo "→ 1/6 GitHub: skipped (SKIP_GITHUB=1). Vercel will deploy your local files directly."
else
  echo "→ 1/6 GitHub"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$REPO.git"
  git push -u origin main
fi

echo "→ 2/6 Vercel project"
npx vercel whoami ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} >/dev/null 2>&1 || npx vercel login
npx vercel link --yes --project "$PROJECT" ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"}

echo "→ 3/6 Environment variables (APP_URL is a placeholder until the first deploy)"
APP_URL="https://$PROJECT.vercel.app" ./scripts/vercel-env.sh "https://$PROJECT.vercel.app"

echo "→ 4/6 First production deploy"
URL=$(npx vercel deploy --prod --yes ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} | tail -1)
echo "   deployed: $URL"

echo "→ 5/6 Point APP_URL at the real production alias and redeploy"
ALIAS=$(npx vercel project inspect "$PROJECT" ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} 2>/dev/null | awk '/Domains|\.vercel\.app/ {for(i=1;i<=NF;i++) if ($i ~ /\.vercel\.app$/) {print $i; exit}}')
FINAL="https://${ALIAS:-$PROJECT.vercel.app}"
printf '%s' "$FINAL" | { npx vercel env rm APP_URL production --yes ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} >/dev/null 2>&1 || true; npx vercel env add APP_URL production ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} >/dev/null; }
npx vercel deploy --prod --yes ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} | tail -1

echo "→ 6/6 Done. Paste this into Vaani → Settings → Webhooks:"
node scripts/webhook-url.mjs "$FINAL"
echo "Then sign in at $FINAL/login with ADMIN_EMAILS and ADMIN_PASSWORD from .env.local."
