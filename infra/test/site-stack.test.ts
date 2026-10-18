import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { redirectFunctionCode, SiteStack, type SiteStackProps } from '../lib/site-stack';

function synth(
  siteDomain = 'guitar.example.com',
  zoneDomain = 'example.com',
  extra: Pick<SiteStackProps, 'aliasDomains' | 'redirectDomains'> = {},
) {
  // Fake cached zone lookups so synth runs without AWS credentials.
  const zone = (name: string, id: string) => ({
    [`hosted-zone:account=111111111111:domainName=${name}:region=us-east-1`]: {
      Id: `/hostedzone/${id}`,
      Name: `${name}.`,
    },
  });
  const app = new App({
    context: { ...zone('example.com', 'ZFAKEFAKEFAKE'), ...zone('old.net', 'ZOLDOLDOLD') },
  });
  const stack = new SiteStack(app, 'Test', {
    env: { account: '111111111111', region: 'us-east-1' },
    siteDomain,
    zoneDomain,
    ...extra,
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
    expect(() =>
      synth('example.com', 'example.com', {
        aliasDomains: [{ domain: 'guitar.other.com', zoneDomain: 'old.net' }],
      }),
    ).toThrow(/not inside zone/);
  });

  it('adds no redirect function without redirect names', () => {
    t.resourceCountIs('AWS::CloudFront::Function', 0);
  });
});

describe('SiteStack at an apex with alias and redirect names (a domain move)', () => {
  const t = synth('example.com', 'example.com', {
    aliasDomains: [{ domain: 'guitar.old.net', zoneDomain: 'old.net' }],
    redirectDomains: [{ domain: 'www.example.com', zoneDomain: 'example.com' }],
  });

  it('serves every name from one distribution and certificate', () => {
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['example.com', 'guitar.old.net', 'www.example.com'],
      }),
    });
    t.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'example.com',
      SubjectAlternativeNames: ['guitar.old.net', 'www.example.com'],
      DomainValidationOptions: Match.arrayWith([
        { DomainName: 'guitar.old.net', HostedZoneId: 'ZOLDOLDOLD' },
      ]),
    });
  });

  it('creates A/AAAA records for each name in its own zone', () => {
    t.resourceCountIs('AWS::Route53::RecordSet', 6);
    t.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'example.com.',
      Type: 'A',
      HostedZoneId: 'ZFAKEFAKEFAKE',
    });
    t.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'guitar.old.net.',
      Type: 'AAAA',
      HostedZoneId: 'ZOLDOLDOLD',
    });
  });

  it('attaches the redirect function to viewer requests', () => {
    t.resourceCountIs('AWS::CloudFront::Function', 1);
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
        }),
      }),
    });
  });
});

describe('redirectFunctionCode', () => {
  type Handler = (event: unknown) => {
    statusCode?: number;
    headers?: { location: { value: string } };
  };
  const handler = new Function(
    `${redirectFunctionCode('example.com', [{ domain: 'www.example.com', zoneDomain: 'example.com' }])}
    return handler;`,
  )() as Handler;
  const request = (
    host: string,
    uri: string,
    querystring: Record<string, { value: string }> = {},
  ) => ({
    request: { headers: { host: { value: host } }, uri, querystring },
  });

  it('301s a redirect host to the site, keeping path and query', () => {
    const res = handler(
      request('www.example.com', '/progress', { a: { value: '1' }, b: { value: '' } }),
    );
    expect(res.statusCode).toBe(301);
    expect(res.headers?.location.value).toBe('https://example.com/progress?a=1&b');
  });

  it('passes other hosts through untouched', () => {
    const req = request('example.com', '/');
    expect(handler(req)).toBe(req.request);
  });
});
