#!/usr/bin/env bash
# Optional: deploy the SES sending identity (FretworkEmail) for the hosted
# version's sign-in emails, then report verification and sandbox status.
# Self-hosted copies don't need this; the app works with no backend.
# Env: AWS_PROFILE, EMAIL_DOMAIN, EMAIL_ZONE_DOMAIN, EMAIL_FROM, EMAIL_FROM_NAME,
# EMAIL_SSM_PREFIX.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS profile '$AWS_PROFILE' has no valid credentials"

log "Deploying FretworkEmail ($EMAIL_FROM)"
(cd infra && pnpm exec cdk deploy FretworkEmail \
  --require-approval never \
  -c emailDomain="$EMAIL_DOMAIN" -c emailZoneDomain="$EMAIL_ZONE_DOMAIN" \
  -c emailFrom="$EMAIL_FROM" -c emailFromName="$EMAIL_FROM_NAME" \
  -c emailSsmPrefix="$EMAIL_SSM_PREFIX")

log "Identity status (DKIM can take a few minutes to verify)"
aws sesv2 get-email-identity --region "$CDK_REGION" --email-identity "$EMAIL_DOMAIN" \
  --query '{sending:VerifiedForSendingStatus,dkim:DkimAttributes.Status,mailFrom:MailFromAttributes.MailFromDomainStatus}' \
  --output table

# Leaving the SES sandbox is a one-off request reviewed by AWS, made by the
# account owner (console, or `aws sesv2 put-account-details --production-access-enabled …`).
log "Account sending status"
aws sesv2 get-account --region "$CDK_REGION" \
  --query '{productionAccess:ProductionAccessEnabled,review:Details.ReviewDetails.Status,max24h:SendQuota.Max24HourSend}' \
  --output table
