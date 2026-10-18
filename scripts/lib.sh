# Shared config for the delivery scripts. Everything is overridable via env so
# forks can deploy their own copy; nothing account-specific is committed.
: "${AWS_PROFILE:=smartthings-hp}"
: "${SITE_DOMAIN:=guitar.dwellsee.com}"
: "${HOSTED_ZONE_DOMAIN:=dwellsee.com}"
: "${STACK_NAME:=FretworkSite}"
: "${CDK_REGION:=us-east-1}"
export AWS_PROFILE SITE_DOMAIN HOSTED_ZONE_DOMAIN STACK_NAME CDK_REGION

# Optional, hosted version only (scripts/deploy-email.sh): SES sending for sign-in
# emails. Other stacks read the identity from SSM under EMAIL_SSM_PREFIX.
: "${EMAIL_DOMAIN:=fretfree.app}"
: "${EMAIL_ZONE_DOMAIN:=$EMAIL_DOMAIN}"
: "${EMAIL_FROM:=no-reply@$EMAIL_DOMAIN}"
: "${EMAIL_FROM_NAME:=Fret Free}"
: "${EMAIL_SSM_PREFIX:=/fretwork/email}"
export EMAIL_DOMAIN EMAIL_ZONE_DOMAIN EMAIL_FROM EMAIL_FROM_NAME EMAIL_SSM_PREFIX

# Optional (scripts/deploy-brand.sh): a static preview of the brand options.
: "${BRAND_DOMAIN:=brand.fretfree.app}"
: "${BRAND_ZONE_DOMAIN:=fretfree.app}"
export BRAND_DOMAIN BRAND_ZONE_DOMAIN

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
