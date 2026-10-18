import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

export interface EmailStackProps extends StackProps {
  /** The sending domain, e.g. fretfree.app. May be a subdomain of the zone. */
  emailDomain: string;
  /** The existing public hosted zone, looked up by name. */
  zoneDomain: string;
  /** e.g. no-reply@fretfree.app. Must be at the sending domain. */
  fromAddress: string;
  /** Display name for the From header, e.g. "Fret Free". */
  fromName: string;
  /** SSM prefix other stacks read the identity from, e.g. /fretwork/email. */
  ssmPrefix: string;
}

/**
 * Optional SES sending for the hosted version's sign-in emails (M7). Self-hosted
 * copies never need it: the app works with no backend at all.
 *
 * Creates a domain identity with Easy DKIM, a custom MAIL FROM subdomain and a
 * DMARC policy, all as records in the zone. A configuration set enforces TLS and
 * suppresses addresses that bounce or complain. Other stacks find the identity
 * through SSM parameters, so no ARN ever lands in git. Cognito sends through the
 * identity with its own service-linked role, so no identity policy is needed.
 */
export class EmailStack extends Stack {
  constructor(scope: Construct, id: string, props: EmailStackProps) {
    super(scope, id, props);
    const { emailDomain, zoneDomain, fromAddress, fromName, ssmPrefix } = props;
    if (emailDomain !== zoneDomain && !emailDomain.endsWith(`.${zoneDomain}`)) {
      throw new Error(`emailDomain ${emailDomain} is not inside zone ${zoneDomain}`);
    }
    if (!fromAddress.endsWith(`@${emailDomain}`)) {
      throw new Error(`fromAddress ${fromAddress} is not at ${emailDomain}`);
    }

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: zoneDomain });
    const mailFromDomain = `mail.${emailDomain}`;

    const configurationSet = new ses.ConfigurationSet(this, 'ConfigurationSet', {
      reputationMetrics: true,
      sendingEnabled: true,
      tlsPolicy: ses.ConfigurationSetTlsPolicy.REQUIRE,
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
    });

    // Identity.domain (not publicHostedZone) so a subdomain of the zone works too;
    // the records are created explicitly below.
    const identity = new ses.EmailIdentity(this, 'Identity', {
      identity: ses.Identity.domain(emailDomain),
      configurationSet,
      mailFromDomain,
      mailFromBehaviorOnMxFailure: ses.MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE,
    });

    identity.dkimRecords.forEach((record, i) => {
      new route53.CfnRecordSet(this, `Dkim${i + 1}`, {
        hostedZoneId: zone.hostedZoneId,
        name: record.name,
        type: 'CNAME',
        resourceRecords: [record.value],
        ttl: '1800',
      });
    });

    const ttl = Duration.minutes(30);
    new route53.MxRecord(this, 'MailFromMx', {
      zone,
      recordName: mailFromDomain,
      values: [{ priority: 10, hostName: `feedback-smtp.${this.region}.amazonses.com` }],
      ttl,
    });
    new route53.TxtRecord(this, 'MailFromSpf', {
      zone,
      recordName: mailFromDomain,
      values: ['v=spf1 include:amazonses.com -all'],
      ttl,
    });
    // Only SES sends as this domain, DKIM-signed, so anything unaligned is spoofed.
    new route53.TxtRecord(this, 'Dmarc', {
      zone,
      recordName: `_dmarc.${emailDomain}`,
      values: ['v=DMARC1; p=quarantine; adkim=r; aspf=r'],
      ttl,
    });

    const params: Record<string, string> = {
      domain: emailDomain,
      'from-address': fromAddress,
      'from-name': fromName,
      'identity-arn': identity.emailIdentityArn,
      'configuration-set': configurationSet.configurationSetName,
    };
    for (const [name, value] of Object.entries(params)) {
      new ssm.StringParameter(this, `Param-${name}`, {
        parameterName: `${ssmPrefix}/${name}`,
        stringValue: value,
      });
    }

    new CfnOutput(this, 'IdentityName', { value: identity.emailIdentityName });
    new CfnOutput(this, 'ConfigurationSetName', { value: configurationSet.configurationSetName });
    new CfnOutput(this, 'SsmPrefix', { value: ssmPrefix });
  }
}
