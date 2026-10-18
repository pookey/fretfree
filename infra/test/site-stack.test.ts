import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { SiteStack } from '../lib/site-stack';

function synth(siteDomain = 'guitar.example.com', zoneDomain = 'example.com') {
  const app = new App({
    context: {
      // A fake cached zone lookup so synth runs without AWS credentials.
      'hosted-zone:account=111111111111:domainName=example.com:region=us-east-1': {
        Id: '/hostedzone/ZFAKEFAKEFAKE',
        Name: 'example.com.',
      },
    },
  });
  const stack = new SiteStack(app, 'Test', {
    env: { account: '111111111111', region: 'us-east-1' },
    siteDomain,
    zoneDomain,
  });
  return Template.fromStack(stack);
}

describe('SiteStack', () => {
  const t = synth();

  it('keeps the bucket private', () => {
    t.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('serves through CloudFront with OAC, HTTPS and an SPA fallback', () => {
    t.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['guitar.example.com'],
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
        ]),
      }),
    });
  });

  it('creates only A/AAAA records for the site name', () => {
    t.resourceCountIs('AWS::Route53::RecordSet', 2);
    for (const type of ['A', 'AAAA']) {
      t.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: 'guitar.example.com.',
        Type: type,
      });
    }
  });

  it('validates a certificate for the site name', () => {
    t.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'guitar.example.com',
      ValidationMethod: 'DNS',
    });
  });

  it('rejects a site domain outside the zone', () => {
    expect(() => synth('guitar.other.com', 'example.com')).toThrow(/not inside zone/);
  });
});
