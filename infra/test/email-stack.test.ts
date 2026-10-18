import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { EmailStack } from '../lib/email-stack';

function synth(emailDomain = 'example.com', fromAddress = 'no-reply@example.com') {
  const app = new App({
    context: {
      // A fake cached zone lookup so synth runs without AWS credentials.
      'hosted-zone:account=111111111111:domainName=example.com:region=us-east-1': {
        Id: '/hostedzone/ZFAKEFAKEFAKE',
        Name: 'example.com.',
      },
    },
  });
  const stack = new EmailStack(app, 'Test', {
    env: { account: '111111111111', region: 'us-east-1' },
    emailDomain,
    zoneDomain: 'example.com',
    fromAddress,
    fromName: 'Example',
    ssmPrefix: '/test/email',
  });
  return Template.fromStack(stack);
}

describe('EmailStack', () => {
  const t = synth();

  it('creates a DKIM domain identity with a custom MAIL FROM', () => {
    t.hasResourceProperties('AWS::SES::EmailIdentity', {
      EmailIdentity: 'example.com',
      MailFromAttributes: { MailFromDomain: 'mail.example.com' },
    });
  });

  it('publishes the DKIM, MAIL FROM and DMARC records', () => {
    t.resourcePropertiesCountIs('AWS::Route53::RecordSet', { Type: 'CNAME' }, 3);
    t.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'mail.example.com.',
      Type: 'MX',
      ResourceRecords: ['10 feedback-smtp.us-east-1.amazonses.com'],
    });
    t.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'mail.example.com.',
      Type: 'TXT',
      ResourceRecords: ['"v=spf1 include:amazonses.com -all"'],
    });
    t.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: '_dmarc.example.com.',
      Type: 'TXT',
      ResourceRecords: [Match.stringLikeRegexp('v=DMARC1; p=quarantine')],
    });
  });

  it('requires TLS and suppresses bounces and complaints', () => {
    t.hasResourceProperties('AWS::SES::ConfigurationSet', {
      DeliveryOptions: { TlsPolicy: 'REQUIRE' },
      SuppressionOptions: { SuppressedReasons: ['BOUNCE', 'COMPLAINT'] },
    });
  });

  it('exposes the identity to other stacks through SSM, not committed ARNs', () => {
    for (const name of [
      'domain',
      'from-address',
      'from-name',
      'identity-arn',
      'configuration-set',
    ]) {
      t.hasResourceProperties('AWS::SSM::Parameter', { Name: `/test/email/${name}` });
    }
  });

  it('allows a subdomain of the zone', () => {
    const sub = synth('mail.example.com', 'no-reply@mail.example.com');
    sub.hasResourceProperties('AWS::SES::EmailIdentity', { EmailIdentity: 'mail.example.com' });
  });

  it('rejects a domain outside the zone or a sender at another domain', () => {
    expect(() => synth('other.com', 'no-reply@other.com')).toThrow(/not inside zone/);
    expect(() => synth('example.com', 'no-reply@other.com')).toThrow(/not at example.com/);
  });
});
