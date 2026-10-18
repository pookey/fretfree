#!/usr/bin/env bash
# Fails if a diff contains AWS account IDs, hosted-zone IDs, access keys or
# private keys. The real account and zone IDs are fetched at runtime (when the
# AWS profile is available) so they are matched exactly without being committed.
# Usage: secret-scan.sh [<git-range>]   (default: origin/main..HEAD, or all of HEAD)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

range="${1:-}"
if [[ -z "$range" ]]; then
  if git rev-parse --verify -q origin/main >/dev/null; then range="origin/main..HEAD"; else range="HEAD"; fi
fi
if [[ "$range" == *..* ]]; then
  diff="$(git diff "$range" -- . ':(exclude)pnpm-lock.yaml' ':(exclude)scripts/secret-scan.sh' | grep -E '^\+' | grep -vE '^\+\+\+' || true)"
else
  diff="$(git show "$range" --format= -- . ':(exclude)pnpm-lock.yaml' ':(exclude)scripts/secret-scan.sh' | grep -E '^\+' || true)"
fi

patterns=(
  'AKIA[0-9A-Z]{16}'
  'ASIA[0-9A-Z]{16}'
  'aws_secret_access_key *[=:] *[A-Za-z0-9/+]{30,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'Z0[0-9A-Z]{10,}'
  'arn:aws:[a-z0-9-]+:[a-z0-9-]*:[0-9]{12}:'
)
if account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  patterns+=("$account")
  zone="$(aws route53 list-hosted-zones-by-name --dns-name "$HOSTED_ZONE_DOMAIN" \
    --query "HostedZones[?Name=='$HOSTED_ZONE_DOMAIN.'].Id" --output text 2>/dev/null | sed 's#.*/##')" || true
  [[ -n "${zone:-}" && "$zone" != None ]] && patterns+=("$zone")
else
  echo "secret-scan: AWS profile unavailable; using generic patterns only" >&2
fi

# Any other 12-digit number is suspicious unless it is an obvious placeholder.
generic_ids="$(grep -oE '(^|[^0-9])[0-9]{12}([^0-9]|$)' <<<"$diff" | grep -oE '[0-9]{12}' |
  grep -vE '^(0{12}|1{12}|123456789012)$' || true)"

found=0
for i in "${!patterns[@]}"; do
  if grep -qE -- "${patterns[$i]}" <<<"$diff"; then
    # Don't echo the pattern itself: it may be the real account or zone ID.
    echo "secret-scan: blocked pattern #$((i + 1)) found in $range" >&2
    found=1
  fi
done
if [[ -n "$generic_ids" ]]; then
  echo "secret-scan: 12-digit number(s) found in $range — possible AWS account ID" >&2
  found=1
fi
[[ $found -eq 0 ]] || exit 1
echo "secret-scan: clean ($range)"
