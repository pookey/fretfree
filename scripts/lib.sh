# Shared config for the delivery scripts. Everything is overridable via env so
# forks can deploy their own copy; nothing account-specific is committed.
: "${AWS_PROFILE:=smartthings-hp}"
: "${SITE_DOMAIN:=guitar.dwellsee.com}"
: "${HOSTED_ZONE_DOMAIN:=dwellsee.com}"
: "${STACK_NAME:=FretworkSite}"
: "${CDK_REGION:=us-east-1}"
export AWS_PROFILE SITE_DOMAIN HOSTED_ZONE_DOMAIN STACK_NAME CDK_REGION

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT

log() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
