import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AssetHashType,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import type { Construct } from 'constructs';
import { buildSync } from 'esbuild';

/** The SES identity the FretworkEmail stack (lib/email-stack.ts) provisions. */
export interface SyncEmailConfig {
  /** Where the identity lives, e.g. eu-west-1. May differ from this stack's region. */
  region: string;
  /** The verified domain, e.g. fretfree.app. */
  domain: string;
  /** e.g. no-reply@fretfree.app. */
  fromAddress: string;
  /** The From display name, e.g. "Fret Free". Also the product name in the email copy. */
  fromName: string;
  /** The identity's configuration set (a fixed name). */
  configurationSetName: string;
}

export interface SyncStackProps extends StackProps {
  /** The API's own name, e.g. api.fretfree.app. */
  apiDomain: string;
  /** The existing public hosted zone for `apiDomain`, looked up by name. */
  zoneDomain: string;
  /** The app's canonical name. Sign-in links land there, and it is the CORS origin. */
  siteDomain: string;
  /** More origins allowed to call the API, e.g. http://localhost:5173 for development. */
  extraOrigins?: string[];
  email: SyncEmailConfig;
}

const LAMBDA_DIR = fileURLToPath(new URL('../lambda', import.meta.url));

/** Attribute names M7-03's handlers rely on (docs/design/sync.md §5, Server notes). */
export const SYNC_TABLE_KEYS = { partition: 'userId', sort: 'sk', seq: 'seq', seqIndex: 'bySeq' };

/** One ESM bundle (`index.mjs`) from a TypeScript entry under lambda/. The SDK is the runtime's. */
function bundle(entry: string): lambda.Code {
  return lambda.Code.fromAsset(LAMBDA_DIR, {
    assetHashType: AssetHashType.OUTPUT,
    bundling: {
      // CDK caches bundles by source path and options, not by the tryBundle closure,
      // so the entry must be in the options or every function gets the first bundle.
      environment: { LAMBDA_ENTRY: entry },
      image: lambda.Runtime.NODEJS_24_X.bundlingImage,
      local: {
        tryBundle(outputDir) {
          buildSync({
            entryPoints: [path.join(LAMBDA_DIR, entry)],
            outfile: path.join(outputDir, 'index.mjs'),
            bundle: true,
            platform: 'node',
            target: 'node24',
            format: 'esm',
            external: ['@aws-sdk/*'],
            legalComments: 'none',
            logLevel: 'warning',
          });
          return true;
        },
      },
    },
  });
}

/**
 * Optional accounts and sync for the hosted version (M7, docs/design/sync.md).
 * The app works fully without it: offline, on one device, with no account.
 *
 * - **Sign-in** is passwordless. `POST /auth/start` emails one message with a
 *   6-digit code and a magic link. Either one answers a Cognito custom-auth
 *   challenge. Both are single use, expire after 15 minutes and allow a few
 *   attempts across sessions, and the request is rate-limited per address and
 *   per IP (lambda/auth/config.ts). Mail goes through the FretworkEmail SES
 *   identity, which may be in another region.
 * - **Sync** is an HTTP API with a Cognito JWT authoriser in front of one Lambda,
 *   and a DynamoDB table partitioned by user ID.
 * - `GET /health` (smoke test) and `GET /config` (pool and client IDs for the app)
 *   are public.
 */
export class SyncStack extends Stack {
  constructor(scope: Construct, id: string, props: SyncStackProps) {
    super(scope, id, props);
    const { apiDomain, zoneDomain, siteDomain, extraOrigins = [], email } = props;
    if (apiDomain !== zoneDomain && !apiDomain.endsWith(`.${zoneDomain}`)) {
      throw new Error(`apiDomain ${apiDomain} is not inside zone ${zoneDomain}`);
    }
    if (!email.fromAddress.endsWith(`@${email.domain}`)) {
      throw new Error(`email.fromAddress ${email.fromAddress} is not at ${email.domain}`);
    }

    const fn = (
      name: string,
      entry: string,
      opts: { timeout: Duration; memorySize?: number; environment?: Record<string, string> },
    ) =>
      new lambda.Function(this, name, {
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        handler: 'index.handler',
        code: bundle(entry),
        memorySize: opts.memorySize ?? 256,
        timeout: opts.timeout,
        environment: opts.environment,
        logGroup: new logs.LogGroup(this, `${name}Logs`, {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      });

    // ---- Sign-in ----------------------------------------------------------------
    // Pending sign-ins and rate-limit counters. Short-lived, so TTL cleans it up.
    const signInTable = new dynamodb.TableV2(this, 'SignInTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Cognito waits at most 5 s for a trigger.
    const authTriggers = fn('AuthTriggers', 'auth/triggers.lambda.ts', {
      timeout: Duration.seconds(5),
      environment: { SIGN_IN_TABLE: signInTable.tableName },
    });
    signInTable.grantReadWriteData(authTriggers);

    const userPool = new cognito.UserPool(this, 'Users', {
      featurePlan: cognito.FeaturePlan.LITE,
      // Accounts are created by POST /auth/start, never by the client.
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      // Not required: Cognito makes every required attribute writable by each app
      // client, and the client mustn't write email (below). AdminCreateUser always
      // sets it, and it is the username anyway. Mutable can't change later.
      standardAttributes: { email: { required: false, mutable: true } },
      // An address change only takes effect once the new address is verified.
      keepOriginal: { email: true },
      // A random password nobody knows confirms each user; no client may use it.
      passwordPolicy: {
        minLength: 32,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.NONE,
      mfa: cognito.Mfa.OFF,
      // Cognito's own mail (e.g. an address change) uses the same identity. In the
      // same account it sends through its service-linked role.
      email: cognito.UserPoolEmail.withSES({
        fromEmail: email.fromAddress,
        fromName: email.fromName,
        sesRegion: email.region,
        configurationSetName: email.configurationSetName,
        sesVerifiedDomain: email.domain,
      }),
      lambdaTriggers: {
        defineAuthChallenge: authTriggers,
        createAuthChallenge: authTriggers,
        verifyAuthChallengeResponse: authTriggers,
      },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const appClient = userPool.addClient('AppClient', {
      // Custom auth (code or link) plus refresh. No password or SRP flow.
      authFlows: { custom: true },
      disableOAuth: true,
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      // Signed-in users can't change their email (the sign-in key) or make
      // Cognito mail other addresses. Leaving the list unset makes every
      // attribute writable, and an empty one risks reading as unset, so it
      // names one harmless attribute.
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({ locale: true }),
      authSessionValidity: Duration.minutes(15),
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      // Signing in is a chore; a learner should rarely do it twice on one device.
      refreshTokenValidity: Duration.days(365),
    });

    const sesArn = (resource: string, resourceName: string) =>
      this.formatArn({ service: 'ses', region: email.region, resource, resourceName });
    const startFn = fn('AuthStart', 'auth/start.lambda.ts', {
      timeout: Duration.seconds(10),
      environment: {
        SIGN_IN_TABLE: signInTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        SITE_URL: `https://${siteDomain}`,
        BRAND_NAME: email.fromName,
        EMAIL_REGION: email.region,
        EMAIL_FROM: email.fromAddress,
        EMAIL_FROM_NAME: email.fromName,
        EMAIL_CONFIG_SET: email.configurationSetName,
      },
    });
    signInTable.grantReadWriteData(startFn);
    userPool.grant(
      startFn,
      'cognito-idp:AdminCreateUser',
      'cognito-idp:AdminGetUser',
      'cognito-idp:AdminSetUserPassword',
    );
    startFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [
          sesArn('identity', email.domain),
          sesArn('configuration-set', email.configurationSetName),
        ],
        conditions: { StringEquals: { 'ses:FromAddress': email.fromAddress } },
      }),
    );

    // ---- Sync data --------------------------------------------------------------
    // One partition per user. Pulls read the local secondary index on `seq` with
    // consistent reads, which a GSI can't give (docs/design/sync.md §5).
    const k = SYNC_TABLE_KEYS;
    const syncTable = new dynamodb.TableV2(this, 'SyncTable', {
      partitionKey: { name: k.partition, type: dynamodb.AttributeType.STRING },
      sortKey: { name: k.sort, type: dynamodb.AttributeType.STRING },
      localSecondaryIndexes: [
        { indexName: k.seqIndex, sortKey: { name: k.seq, type: dynamodb.AttributeType.NUMBER } },
      ],
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const syncFn = fn('SyncApi', 'sync/handler.ts', {
      timeout: Duration.seconds(29),
      memorySize: 512,
      environment: {
        TABLE_NAME: syncTable.tableName,
        SEQ_INDEX: k.seqIndex,
        USER_POOL_ID: userPool.userPoolId,
      },
    });
    syncTable.grantReadWriteData(syncFn);
    // DELETE /account removes the Cognito user too.
    userPool.grant(syncFn, 'cognito-idp:AdminDeleteUser');

    const publicFn = fn('PublicApi', 'health/handler.ts', {
      timeout: Duration.seconds(3),
      memorySize: 128,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: appClient.userPoolClientId,
      },
    });

    // ---- API --------------------------------------------------------------------
    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: zoneDomain });
    const certificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: apiDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });
    const domainName = new apigwv2.DomainName(this, 'ApiDomain', {
      domainName: apiDomain,
      certificate,
      ipAddressType: apigwv2.IpAddressType.DUAL_STACK,
    });

    const api = new apigwv2.HttpApi(this, 'Api', {
      description: `Sign-in and sync API for ${siteDomain}`,
      createDefaultStage: false,
      ipAddressType: apigwv2.IpAddressType.DUAL_STACK,
      // Reached only through apiDomain.
      disableExecuteApiEndpoint: true,
      corsPreflight: {
        allowOrigins: [`https://${siteDomain}`, ...extraOrigins],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.DELETE,
        ],
        allowHeaders: ['authorization', 'content-type'],
        exposeHeaders: ['retry-after'],
        maxAge: Duration.hours(1),
      },
    });
    const stage = api.addStage('DefaultStage', {
      stageName: '$default',
      autoDeploy: true,
      domainMapping: { domainName },
      throttle: { rateLimit: 50, burstLimit: 100 },
    });
    // The one unauthenticated route that sends mail gets a much lower ceiling.
    (stage.node.defaultChild as apigwv2.CfnStage).routeSettings = {
      'POST /auth/start': { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 },
    };

    const integration = (name: string, f: lambda.IFunction) => new HttpLambdaIntegration(name, f);
    const publicIntegration = integration('PublicIntegration', publicFn);
    api.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: publicIntegration,
    });
    api.addRoutes({
      path: '/config',
      methods: [apigwv2.HttpMethod.GET],
      integration: publicIntegration,
    });
    const startRoutes = api.addRoutes({
      path: '/auth/start',
      methods: [apigwv2.HttpMethod.POST],
      integration: integration('AuthStartIntegration', startFn),
    });
    // The stage's RouteSettings name this route, and API Gateway rejects a stage
    // whose settings name a route that doesn't exist yet.
    stage.node.addDependency(...startRoutes);

    const authorizer = new HttpUserPoolAuthorizer('Jwt', userPool, {
      userPoolClients: [appClient],
    });
    const syncIntegration = integration('SyncIntegration', syncFn);
    for (const [route, method] of [
      ['/sync/push', apigwv2.HttpMethod.POST],
      ['/sync/pull', apigwv2.HttpMethod.GET],
      ['/account', apigwv2.HttpMethod.DELETE],
    ] as const) {
      api.addRoutes({ path: route, methods: [method], integration: syncIntegration, authorizer });
    }

    const alias = route53.RecordTarget.fromAlias(
      new targets.ApiGatewayv2DomainProperties(
        domainName.regionalDomainName,
        domainName.regionalHostedZoneId,
      ),
    );
    new route53.ARecord(this, 'ApiAlias', { zone, recordName: apiDomain, target: alias });
    new route53.AaaaRecord(this, 'ApiAliasV6', { zone, recordName: apiDomain, target: alias });

    new CfnOutput(this, 'ApiUrl', { value: `https://${apiDomain}` });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: appClient.userPoolClientId });
    new CfnOutput(this, 'SyncTableName', { value: syncTable.tableName });
  }
}
