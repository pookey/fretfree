import { App, Tags } from 'aws-cdk-lib';
import { SiteStack } from '../lib/site-stack';

const app = new App();

// Domain names are config, not secrets; forks override them with `-c` (scripts/deploy.sh
// passes SITE_DOMAIN / HOSTED_ZONE_DOMAIN). The account comes from the AWS profile at
// runtime and is never committed.
const siteDomain = app.node.tryGetContext('siteDomain') as string;
const zoneDomain = app.node.tryGetContext('zoneDomain') as string;

new SiteStack(app, 'FretworkSite', {
  // CloudFront certificates must live in us-east-1, so the whole stack does.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  siteDomain,
  zoneDomain,
  description: `Fretwork PWA static site for ${siteDomain}`,
});

Tags.of(app).add('Project', 'guitar');
