import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/** Another name for the site, in its own (or the same) public hosted zone. */
export interface ExtraDomain {
  domain: string;
  zoneDomain: string;
}

export interface SiteStackProps extends StackProps {
  /** The canonical name, e.g. fretfree.app or guitar.example.com (apex or subdomain). */
  siteDomain: string;
  /** The existing public hosted zone, looked up by name, e.g. fretfree.app */
  zoneDomain: string;
  /** Answer at these names with a 301 to `siteDomain` (e.g. www, or a retired domain). */
  redirectDomains?: ExtraDomain[];
}

function inZone(domain: string, zoneDomain: string): boolean {
  return domain === zoneDomain || domain.endsWith(`.${zoneDomain}`);
}

/**
 * Private S3 bucket + CloudFront (OAC) + ACM certificate + Route53 A/AAAA
 * aliases. Only records for the site's own names are created in each zone
 * (plus the certificate's DNS-validation CNAMEs for those names).
 */
export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);
    const { siteDomain, zoneDomain, redirectDomains = [] } = props;
    const extras = redirectDomains;
    for (const d of [{ domain: siteDomain, zoneDomain }, ...extras]) {
      if (!inZone(d.domain, d.zoneDomain)) {
        throw new Error(`domain ${d.domain} is not inside zone ${d.zoneDomain}`);
      }
    }

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: zoneDomain });
    const zones = new Map<string, route53.IHostedZone>([[zoneDomain, zone]]);
    const zoneFor = (name: string): route53.IHostedZone => {
      let z = zones.get(name);
      if (!z) {
        z = route53.HostedZone.fromLookup(this, `Zone-${name}`, { domainName: name });
        zones.set(name, z);
      }
      return z;
    };

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: siteDomain,
      subjectAlternativeNames: extras.length ? extras.map((d) => d.domain) : undefined,
      validation: acm.CertificateValidation.fromDnsMultiZone(
        Object.fromEntries([
          [siteDomain, zone],
          ...extras.map((d) => [d.domain, zoneFor(d.zoneDomain)] as const),
        ]),
      ),
    });

    // A viewer-request function answers the redirect names with a 301 to the
    // canonical name, keeping the path and query.
    const redirect = redirectDomains.length
      ? new cloudfront.Function(this, 'RedirectFunction', {
          runtime: cloudfront.FunctionRuntime.JS_2_0,
          comment: `301 to ${siteDomain}`,
          code: cloudfront.FunctionCode.fromInline(
            redirectFunctionCode(siteDomain, redirectDomains),
          ),
        })
      : undefined;

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: false,
          override: true,
        },
      },
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      domainNames: [siteDomain, ...extras.map((d) => d.domain)],
      certificate,
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // Honours the Cache-Control set per object by scripts/deploy.sh.
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        compress: true,
        functionAssociations: redirect && [
          { function: redirect, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      // Client-side routes (e.g. /progress) fall back to the SPA shell.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    });

    const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    // Redirect names get record IDs keyed by name, so adding or removing one never
    // touches the others.
    new route53.ARecord(this, 'AliasA', { zone, recordName: siteDomain, target });
    new route53.AaaaRecord(this, 'AliasAAAA', { zone, recordName: siteDomain, target });
    for (const d of extras) {
      const z = zoneFor(d.zoneDomain);
      new route53.ARecord(this, `AliasA-${d.domain}`, { zone: z, recordName: d.domain, target });
      new route53.AaaaRecord(this, `AliasAAAA-${d.domain}`, {
        zone: z,
        recordName: d.domain,
        target,
      });
    }

    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'SiteUrl', { value: `https://${siteDomain}` });
  }
}

/** CloudFront Functions (JS 2.0) source: 301 the redirect hosts to the site. */
export function redirectFunctionCode(siteDomain: string, redirectDomains: ExtraDomain[]): string {
  const hosts = JSON.stringify(redirectDomains.map((d) => d.domain));
  return `var HOSTS = ${hosts};
function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';
  if (HOSTS.indexOf(host) === -1) return request;
  var qs = request.querystring;
  var query = Object.keys(qs)
    .map(function (k) { return qs[k].value === '' ? k : k + '=' + qs[k].value; })
    .join('&');
  var location = 'https://${siteDomain}' + request.uri + (query ? '?' + query : '');
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: location } } };
}
`;
}
