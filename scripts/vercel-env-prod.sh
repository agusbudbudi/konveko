#!/bin/sh
# Copies the 4 app env vars from .env.production.local to Vercel (Production).
# Values go through stdin, so they are not printed or kept in shell history.
#   sh scripts/vercel-env-prod.sh
set -eu
cd "$(dirname "$0")/.."
[ -f .env.production.local ] || { echo "Tidak ada .env.production.local"; exit 1; }
set -a
. ./.env.production.local
set +a

add() {
  name=$1; value=$2; kind=$3
  [ -n "$value" ] || { echo "✗ $name kosong di .env.production.local"; exit 1; }
  # --force does not replace variables created by an integration, so remove first
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" production "$kind" --yes >/dev/null
  echo "✓ $name"
}

add NEXT_PUBLIC_SUPABASE_URL "$NEXT_PUBLIC_SUPABASE_URL" --no-sensitive
add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" --no-sensitive
add SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY" --sensitive
add PIN_EMAIL_DOMAIN "$PIN_EMAIL_DOMAIN" --no-sensitive

# left over from the Supabase integration, not used by the app
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY production --yes >/dev/null 2>&1 && echo "✓ hapus NEXT_PUBLIC_SUPABASE_ANON_KEY" || true

echo "Selesai. Cek: vercel env ls"
