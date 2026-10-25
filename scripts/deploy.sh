#!/bin/sh
# Build the static site and deploy it to Cloudflare Pages (https://printable.md).
# Usage: pnpm run deploy        (needs `wrangler login` or CLOUDFLARE_API_TOKEN)
set -e

PROJECT="printable-md"
export CLOUDFLARE_ACCOUNT_ID="0c086f4093829cf5c303752825406df2"

cd "$(dirname "$0")/.."

# Only ship committed code that is on origin/main, so the live site always
# matches a commit anyone can check out.
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty; commit first" >&2
  exit 1
fi
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "error: HEAD is not origin/main; push (or pull) first" >&2
  exit 1
fi

pnpm install --frozen-lockfile
rm -rf out
pnpm build

pnpm exec wrangler pages deploy out \
  --project-name "$PROJECT" \
  --branch main \
  --commit-hash "$(git rev-parse HEAD)" \
  --commit-message "$(git log -1 --format=%s)"

echo "Live: https://printable.md"
