#!/usr/bin/env bash
# Build → cdk deploy (site, plus sign-in and sync when SYNC_API_DOMAIN is set) →
# s3 sync (with cache headers) → CloudFront invalidation.
# Env: AWS_PROFILE, SITE_DOMAIN, HOSTED_ZONE_DOMAIN, SITE_REDIRECT_DOMAINS,
# SYNC_API_DOMAIN, SYNC_ZONE_DOMAIN, SYNC_EXTRA_ORIGINS, the EMAIL_* sender config,
# SKIP_BUILD=1, SKIP_INFRA=1.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS profile '$AWS_PROFILE' has no valid credentials"

if [[ "${SKIP_BUILD:-}" != 1 ]]; then
  log "Building app"
  pnpm --filter app build
fi
[[ -f app/dist/index.html ]] || fail "app/dist is missing; build first"

outputs="infra/cdk.out/outputs.json"
if [[ "${SKIP_INFRA:-}" != 1 ]]; then
  stacks=("$STACK_NAME")
  sync_args=()
  if [[ -n "$SYNC_API_DOMAIN" ]]; then
    # The sender is the FretworkEmail identity, rebuilt from config (no lookup:
    # its SSM parameters live in EMAIL_REGION, not here).
    stacks+=("$SYNC_STACK_NAME")
    sync_args=(-c syncApiDomain="$SYNC_API_DOMAIN" -c syncZoneDomain="$SYNC_ZONE_DOMAIN"
      -c syncExtraOrigins="$SYNC_EXTRA_ORIGINS"
      -c emailRegion="$EMAIL_REGION" -c emailDomain="$EMAIL_DOMAIN" -c emailFrom="$EMAIL_FROM"
      -c emailFromName="$EMAIL_FROM_NAME" -c emailConfigSet="$EMAIL_CONFIG_SET")
  fi
  log "Deploying infrastructure (${stacks[*]} → $SITE_DOMAIN${SYNC_API_DOMAIN:+, $SYNC_API_DOMAIN})"
  (cd infra && pnpm exec cdk deploy "${stacks[@]}" \
    --require-approval never \
    -c siteDomain="$SITE_DOMAIN" -c zoneDomain="$HOSTED_ZONE_DOMAIN" \
    -c siteRedirectDomains="$SITE_REDIRECT_DOMAINS" ${sync_args[@]+"${sync_args[@]}"} \
    --outputs-file cdk.out/outputs.json)
fi

read_output() {
  aws cloudformation describe-stacks --region "$CDK_REGION" --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
bucket="$(read_output BucketName)"
dist_id="$(read_output DistributionId)"
[[ -n "$bucket" && "$bucket" != None ]] || fail "Could not read the bucket name from $STACK_NAME"

log "Uploading hashed assets (immutable)"
aws s3 sync app/dist/assets "s3://$bucket/assets" \
  --cache-control "public, max-age=31536000, immutable" --only-show-errors

log "Uploading entry files (no-cache)"
# Always copy, never sync: sync skips a same-size file when the bucket's copy is
# newer, so deploying a build made before the last deploy kept the old
# index.html, and the stale-file pass then deleted the bundle it referenced.
aws s3 cp app/dist "s3://$bucket" --recursive --exclude "assets/*" --exclude "*.webmanifest" \
  --cache-control "no-cache" --only-show-errors
aws s3 cp app/dist/manifest.webmanifest "s3://$bucket/manifest.webmanifest" \
  --content-type "application/manifest+json" --cache-control "no-cache" --only-show-errors

log "Removing stale files"
# Everything current is already uploaded with the right headers, so this only deletes.
aws s3 sync app/dist "s3://$bucket" --delete --size-only --only-show-errors

log "Invalidating CloudFront"
aws cloudfront create-invalidation --distribution-id "$dist_id" --paths "/*" \
  --query 'Invalidation.Id' --output text >/dev/null

log "Deployed https://$SITE_DOMAIN"
