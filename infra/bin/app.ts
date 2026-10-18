import { App, Tags } from 'aws-cdk-lib';
import { EmailStack } from '../lib/email-stack';
import { SiteStack } from '../lib/site-stack';

const app = new App();

// Domain names are config, not secrets; forks override them with `-c` (scripts/deploy.sh
// passes SITE_DOMAIN / HOSTED_ZONE_DOMAIN). The account comes from the AWS profile at
// runtime and is never committed.
const siteDomain = app.node.tryGetContext('siteDomain') as string;
const zoneDomain = app.node.tryGetContext('zoneDomain') as string;
// CloudFront certificates must live in us-east-1, so every stack does.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };

new SiteStack(app, 'FretworkSite', {
  env,
  siteDomain,
  zoneDomain,
  description: `Fretwork PWA static site for ${siteDomain}`,
});

// Optional extras for the hosted version. They exist only when their context is
// passed (scripts/deploy-email.sh, scripts/deploy-brand.sh), so the site deploy and
// self-hosted copies never synthesise them or look up their zones.
const emailDomain = app.node.tryGetContext('emailDomain') as string | undefined;
if (emailDomain) {
  new EmailStack(app, 'FretworkEmail', {
    env,
    emailDomain,
    zoneDomain: app.node.tryGetContext('emailZoneDomain') as string,
    fromAddress: app.node.tryGetContext('emailFrom') as string,
    fromName: app.node.tryGetContext('emailFromName') as string,
    ssmPrefix: app.node.tryGetContext('emailSsmPrefix') as string,
    description: `Fretwork SES sending identity for ${emailDomain}`,
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
