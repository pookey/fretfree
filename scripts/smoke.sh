#!/usr/bin/env bash
# Production smoke test: HTTPS 200, a valid certificate for the domain,
# the manifest served, SPA fallback, and the expected cache headers.
# Env: SITE_DOMAIN. Retries briefly to ride out CloudFront invalidation.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
url="https://$SITE_DOMAIN"
failures=0
check() { if "$@"; then printf '  ✓ %s\n' "$desc"; else printf '  ✗ %s\n' "$desc"; failures=$((failures + 1)); fi; }

retry() {
  local n=0
  until "$@"; do
    n=$((n + 1)); [[ $n -ge 10 ]] && return 1
    sleep 6
  done
}

log "Smoke testing $url"

desc="HTTPS 200 for / (valid certificate, curl verifies the chain)"
check retry bash -c "[[ \$(curl -sS -o /dev/null -w '%{http_code}' '$url/') == 200 ]]"

desc="certificate covers $SITE_DOMAIN and is valid for at least 7 more days"
cert_ok() {
  local pem
  pem="$(echo | openssl s_client -servername "$SITE_DOMAIN" -connect "$SITE_DOMAIN:443" 2>/dev/null | openssl x509)" || return 1
  echo "$pem" | openssl x509 -noout -checkend 604800 >/dev/null || return 1
  echo "$pem" | openssl x509 -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:$SITE_DOMAIN"
}
check cert_ok

desc="manifest served as JSON naming FretFree"
manifest_ok() {
  local body type
  type="$(curl -sS -o /dev/null -w '%{content_type}' "$url/manifest.webmanifest")"
  body="$(curl -sSf "$url/manifest.webmanifest")" || return 1
  [[ "$type" == *json* ]] && grep -q '"name": *"FretFree"' <<<"$body"
}
check retry manifest_ok

desc="index.html and sw.js are no-cache"
headers_ok() {
  curl -sSI "$url/" | grep -qi '^cache-control: *no-cache' &&
    curl -sSI "$url/sw.js" | grep -qi '^cache-control: *no-cache'
}
check retry headers_ok

desc="hashed assets are immutable"
asset_ok() {
  local asset
  asset="$(curl -sSf "$url/" | grep -oE '/assets/[^"]+\.js' | head -1)" || return 1
  curl -sSI "$url$asset" | grep -qi 'immutable'
}
check retry asset_ok

desc="client-side routes fall back to the app shell"
check retry bash -c "curl -sSf '$url/progress' | grep -q '<div id=\"root\">'"

desc="HTTP redirects to HTTPS"
check bash -c "[[ \$(curl -sS -o /dev/null -w '%{http_code}' 'http://$SITE_DOMAIN/') =~ ^30[1278]$ ]]"

for pair in $SITE_REDIRECT_DOMAINS; do
  from="${pair%%:*}"
  desc="$from redirects (301) to $url, keeping the path"
  check retry bash -c "[[ \$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' 'https://$from/progress') == '301 $url/progress' ]]"
done

[[ $failures -eq 0 ]] || fail "$failures smoke check(s) failed"
log "Smoke test passed"
