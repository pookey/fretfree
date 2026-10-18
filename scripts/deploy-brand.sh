#!/usr/bin/env bash
# Optional: deploy the brand preview (FretworkBrand, a second SiteStack) and
# upload brand/options/ to it. Env: AWS_PROFILE, BRAND_DOMAIN, BRAND_ZONE_DOMAIN,
# SKIP_INFRA=1.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

src="brand/options"
[[ -f "$src/index.html" ]] || fail "$src/index.html is missing"
aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS profile '$AWS_PROFILE' has no valid credentials"

if [[ "${SKIP_INFRA:-}" != 1 ]]; then
  log "Deploying FretworkBrand ($BRAND_DOMAIN)"
  (cd infra && pnpm exec cdk deploy FretworkBrand \
    --require-approval never \
    -c brandDomain="$BRAND_DOMAIN" -c brandZoneDomain="$BRAND_ZONE_DOMAIN")
fi

read_output() {
  aws cloudformation describe-stacks --region "$CDK_REGION" --stack-name FretworkBrand \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
bucket="$(read_output BucketName)"
dist_id="$(read_output DistributionId)"
[[ -n "$bucket" && "$bucket" != None ]] || fail "Could not read the bucket name from FretworkBrand"

log "Uploading $src"
aws s3 sync "$src" "s3://$bucket" --delete --cache-control "no-cache" --only-show-errors

log "Invalidating CloudFront"
aws cloudfront create-invalidation --distribution-id "$dist_id" --paths "/*" \
  --query 'Invalidation.Id' --output text >/dev/null

log "Deployed https://$BRAND_DOMAIN"
