#!/usr/bin/env bash
# Builds two versions of the app and publishes them behind one CloudFront distribution:
#   fast (HEAD)            -> s3://<bucket>/fast/ -> https://lab7.naukma.com
#   slow (initial commit)  -> s3://<bucket>/slow/ -> https://slow.lab7.naukma.com
set -euo pipefail

SLOW_REF="${SLOW_REF:-ec127d3}"
FAST_REF="${FAST_REF:-HEAD}"
export AWS_PROFILE="${AWS_PROFILE:-personal}"

root="$(cd "$(dirname "$0")/.." && pwd)"
tf="$root/deploy/terraform"
bucket="$(terraform -chdir="$tf" output -raw bucket)"
distribution="$(terraform -chdir="$tf" output -raw distribution_id)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

build() {
  local ref="$1" dir="$work/$2"
  mkdir -p "$dir"
  git -C "$root" archive "$ref" | tar -x -C "$dir"
  ln -s "$root/node_modules" "$dir/node_modules"
  (cd "$dir" && npx vite build --logLevel warn)
}

upload() {
  local dist="$work/$1/dist" prefix="$1"
  aws s3 sync "$dist/assets" "s3://$bucket/$prefix/assets" --delete \
    --cache-control "public, max-age=31536000, immutable"
  aws s3 sync "$dist" "s3://$bucket/$prefix" --delete \
    --exclude "assets/*" --exclude "index.html" \
    --cache-control "public, max-age=3600"
  aws s3 cp "$dist/index.html" "s3://$bucket/$prefix/index.html" \
    --cache-control "no-cache"
}

build "$FAST_REF" fast
build "$SLOW_REF" slow
upload fast
upload slow

aws cloudfront create-invalidation --distribution-id "$distribution" --paths "/*" \
  --query "Invalidation.Id" --output text
