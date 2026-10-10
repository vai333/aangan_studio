#!/usr/bin/env bash
# One-shot: push to GitHub, create/link the Vercel project, copy env vars, deploy, then set APP_URL and redeploy.
# Usage:  scripts/deploy.sh [github-owner/repo]        default: vai333/aangan_studio
#         SKIP_GITHUB=1 scripts/deploy.sh               deploy to Vercel without pushing to GitHub
# Auth:   GitHub (git push prompts or uses your saved login) and Vercel (`npx --yes vercel login`, or export VERCEL_TOKEN).
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
npx --yes vercel whoami ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} >/dev/null 2>&1 || npx --yes vercel login
npx --yes vercel link --yes --project "$PROJECT" ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"}

echo "→ 3/6 Environment variables (APP_URL is a placeholder until the first deploy)"
APP_URL="https://$PROJECT.vercel.app" ./scripts/vercel-env.sh "https://$PROJECT.vercel.app"

echo "→ 4/6 First production deploy"
URL=$(npx --yes vercel deploy --prod --yes ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} | tail -1)
echo "   deployed: $URL"

echo "→ 5/6 Point APP_URL at the real production alias and redeploy"
# Ask Vercel for the real production hostname; the plain project name is often taken (e.g. it became aangan-studio-chi)
ALIAS=$(curl -s -H "Authorization: Bearer ${VERCEL_TOKEN:-$(python3 -c 'import json,os,glob; p=glob.glob(os.path.expanduser("~/Library/Application Support/com.vercel.cli/auth.json")); print(json.load(open(p[0]))["token"] if p else "")')}" "https://api.vercel.com/v9/projects/$PROJECT" | python3 -c 'import json,sys; d=json.load(sys.stdin); a=(d.get("targets",{}).get("production",{}) or {}).get("alias") or []; print(next((x for x in a if x.endswith(".vercel.app")), ""))')
FINAL="https://${ALIAS:-$PROJECT.vercel.app}"
printf '%s' "$FINAL" | { npx --yes vercel env rm APP_URL production --yes ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} >/dev/null 2>&1 || true; npx --yes vercel env add APP_URL production ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} >/dev/null; }
npx --yes vercel deploy --prod --yes ${TOKEN_ARGS[@]+"${TOKEN_ARGS[@]}"} | tail -1

echo "→ 6/6 Done. Paste this into Vaani → Settings → Webhooks:"
node scripts/webhook-url.mjs "$FINAL"
echo "Then sign in at $FINAL/login with ADMIN_EMAILS and ADMIN_PASSWORD from .env.local."
