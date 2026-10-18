# Shared config for the delivery scripts. Everything is overridable via env so
# forks can deploy their own copy; nothing account-specific is committed.
: "${AWS_PROFILE:=smartthings-hp}"
# The hosted copy moved from guitar.dwellsee.com to fretfree.app. The old name keeps
# serving the app so learners can export their progress (stored per origin) and
# import it on the new one; www redirects. Space-separated `domain:zone` lists.
# Forks that set SITE_DOMAIN get no extra names unless they set them too.
if [[ -z "${SITE_DOMAIN:-}" ]]; then
  SITE_DOMAIN=fretfree.app
  : "${HOSTED_ZONE_DOMAIN:=fretfree.app}"
  : "${SITE_ALIAS_DOMAINS:=guitar.dwellsee.com:dwellsee.com}"
  : "${SITE_REDIRECT_DOMAINS:=www.fretfree.app:fretfree.app}"
fi
: "${HOSTED_ZONE_DOMAIN:=$SITE_DOMAIN}"
: "${SITE_ALIAS_DOMAINS:=}"
: "${SITE_REDIRECT_DOMAINS:=}"
: "${STACK_NAME:=FretworkSite}"
: "${CDK_REGION:=us-east-1}"
export AWS_PROFILE SITE_DOMAIN HOSTED_ZONE_DOMAIN SITE_ALIAS_DOMAINS SITE_REDIRECT_DOMAINS STACK_NAME
export CDK_REGION

# Optional, hosted version only (scripts/deploy-email.sh): SES sending for sign-in
# emails. EMAIL_REGION is wherever the account has SES production access; a
# us-east-1 Cognito pool can send through us-east-1, us-west-2 or eu-west-1.
: "${EMAIL_REGION:=eu-west-1}"
: "${EMAIL_DOMAIN:=fretfree.app}"
: "${EMAIL_ZONE_DOMAIN:=$EMAIL_DOMAIN}"
: "${EMAIL_FROM:=no-reply@$EMAIL_DOMAIN}"
: "${EMAIL_FROM_NAME:=Fret Free}"
: "${EMAIL_CONFIG_SET:=fretwork-email}"
: "${EMAIL_SSM_PREFIX:=/fretwork/email}"
export EMAIL_REGION EMAIL_DOMAIN EMAIL_ZONE_DOMAIN EMAIL_FROM EMAIL_FROM_NAME EMAIL_CONFIG_SET EMAIL_SSM_PREFIX

# Optional (scripts/deploy-brand.sh): a static preview of the brand options.
: "${BRAND_DOMAIN:=brand.fretfree.app}"
: "${BRAND_ZONE_DOMAIN:=fretfree.app}"
export BRAND_DOMAIN BRAND_ZONE_DOMAIN

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
