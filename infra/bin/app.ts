import { App, Tags } from 'aws-cdk-lib';
import { EmailStack } from '../lib/email-stack';
import { SiteStack, type ExtraDomain } from '../lib/site-stack';
import { SyncStack } from '../lib/sync-stack';

const app = new App();

// Domain names are config, not secrets; forks override them with `-c` (scripts/deploy.sh
// passes SITE_DOMAIN / HOSTED_ZONE_DOMAIN). The account comes from the AWS profile at
// runtime and is never committed.
const siteDomain = app.node.tryGetContext('siteDomain') as string;
const zoneDomain = app.node.tryGetContext('zoneDomain') as string;
// Space-separated `domain:zone` pairs (scripts/lib.sh SITE_REDIRECT_DOMAINS).
const extraDomains = (key: string): ExtraDomain[] =>
  String(app.node.tryGetContext(key) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [domain = '', zoneDomain = ''] = pair.split(':');
      if (!domain || !zoneDomain) throw new Error(`${key}: expected domain:zone, got "${pair}"`);
      return { domain, zoneDomain };
    });
// CloudFront certificates must live in us-east-1, so the site stacks do.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };

new SiteStack(app, 'FretworkSite', {
  env,
  siteDomain,
  zoneDomain,
  redirectDomains: extraDomains('siteRedirectDomains'),
  description: `Fretwork PWA static site for ${siteDomain}`,
});

// Optional extras for the hosted version. They exist only when their context is
// passed (scripts/deploy-email.sh, scripts/deploy.sh, scripts/deploy-brand.sh), so
// self-hosted copies never synthesise them or look up their zones.
const context = (key: string): string => {
  const value = app.node.tryGetContext(key) as string | undefined;
  if (!value) throw new Error(`missing context ${key}`);
  return value;
};
const emailDomain = app.node.tryGetContext('emailDomain') as string | undefined;
// FretworkSync reads the email keys too, so the email stack is keyed on its zone,
// which only deploy-email.sh passes.
if (emailDomain && app.node.tryGetContext('emailZoneDomain')) {
  new EmailStack(app, 'FretworkEmail', {
    // SES production access is per region, so the sending region is configurable.
    env: { ...env, region: app.node.tryGetContext('emailRegion') as string },
    emailDomain,
    zoneDomain: app.node.tryGetContext('emailZoneDomain') as string,
    fromAddress: app.node.tryGetContext('emailFrom') as string,
    fromName: app.node.tryGetContext('emailFromName') as string,
    configurationSetName: app.node.tryGetContext('emailConfigSet') as string,
    ssmPrefix: app.node.tryGetContext('emailSsmPrefix') as string,
    description: `Fretwork SES sending identity for ${emailDomain}`,
  });
}

// Sign-in and sync (scripts/deploy.sh when SYNC_API_DOMAIN is set). It sends mail
// through the FretworkEmail identity, built from config: that stack's SSM
// parameters live in its own region, out of reach of a lookup from here.
const syncApiDomain = app.node.tryGetContext('syncApiDomain') as string | undefined;
if (syncApiDomain) {
  new SyncStack(app, 'FretworkSync', {
    env,
    apiDomain: syncApiDomain,
    zoneDomain: context('syncZoneDomain'),
    siteDomain,
    extraOrigins: String(app.node.tryGetContext('syncExtraOrigins') ?? '')
      .split(/\s+/)
      .filter(Boolean),
    email: {
      region: context('emailRegion'),
      domain: context('emailDomain'),
      fromAddress: context('emailFrom'),
      fromName: context('emailFromName'),
      configurationSetName: context('emailConfigSet'),
    },
    description: `Fretwork sign-in and sync API at ${syncApiDomain}`,
  });
}

const brandDomain = app.node.tryGetContext('brandDomain') as string | undefined;
if (brandDomain) {
  new SiteStack(app, 'FretworkBrand', {
    env,
    siteDomain: brandDomain,
    zoneDomain: app.node.tryGetContext('brandZoneDomain') as string,
    description: `Fretwork brand preview site for ${brandDomain}`,
  });
}

Tags.of(app).add('Project', 'guitar');
