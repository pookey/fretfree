import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { SyncStack, type SyncStackProps } from '../lib/sync-stack';

const email = {
  region: 'eu-west-1',
  domain: 'example.com',
  fromAddress: 'no-reply@example.com',
  fromName: 'Example App',
  configurationSetName: 'test-email',
};

function synth(overrides: Partial<SyncStackProps> = {}) {
  const app = new App({
    context: {
      // A fake cached zone lookup so synth runs without AWS credentials.
      'hosted-zone:account=111111111111:domainName=example.com:region=us-east-1': {
        Id: '/hostedzone/ZFAKEFAKEFAKE',
        Name: 'example.com.',
      },
    },
  });
  const stack = new SyncStack(app, 'Test', {
    env: { account: '111111111111', region: 'us-east-1' },
    apiDomain: 'api.example.com',
    zoneDomain: 'example.com',
    siteDomain: 'example.com',
    extraOrigins: ['http://localhost:5173'],
    email,
    ...overrides,
  });
  return { template: Template.fromStack(stack), assembly: app.synth() };
}

/** The environment variables of the function whose handler bundle came from `entry`. */
const { template: t, assembly } = synth();
const functions = t.findResources('AWS::Lambda::Function');
const envOf = (logicalPrefix: string): Record<string, unknown> => {
  const [, fn] = Object.entries(functions).find(([id]) => id.startsWith(logicalPrefix))!;
  return (fn as { Properties: { Environment?: { Variables: Record<string, unknown> } } }).Properties
    .Environment!.Variables;
};

describe('SyncStack: sign-in', () => {
  it('has a passwordless pool: no self sign-up, email usernames, custom auth triggers', () => {
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      UsernameConfiguration: { CaseSensitive: false },
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      MfaConfiguration: 'OFF',
      LambdaConfig: {
        DefineAuthChallenge: Match.anyValue(),
        CreateAuthChallenge: Match.anyValue(),
        VerifyAuthChallengeResponse: Match.anyValue(),
      },
    });
  });

  it('sends Cognito mail through the cross-region SES identity, by config', () => {
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      EmailConfiguration: {
        EmailSendingAccount: 'DEVELOPER',
        From: 'Example App <no-reply@example.com>',
        ConfigurationSet: 'test-email',
        SourceArn: {
          'Fn::Join': ['', Match.arrayWith([Match.stringLikeRegexp(':ses:eu-west-1:')])],
        },
      },
    });
  });

  it('allows only custom auth and refresh on the app client, with a 15-minute session', () => {
    t.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: Match.arrayEquals(['ALLOW_CUSTOM_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
      GenerateSecret: false,
      PreventUserExistenceErrors: 'ENABLED',
      AuthSessionValidity: 15,
      AllowedOAuthFlowsUserPoolClient: false,
    });
  });

  it('lets the start function send only as the configured sender, in the email region', () => {
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ses:SendEmail',
            Condition: { StringEquals: { 'ses:FromAddress': 'no-reply@example.com' } },
            Resource: [
              {
                'Fn::Join': [
                  '',
                  Match.arrayWith([
                    Match.stringLikeRegexp(':ses:eu-west-1:.*:identity/example.com$'),
                  ]),
                ],
              },
              {
                'Fn::Join': [
                  '',
                  Match.arrayWith([
                    Match.stringLikeRegexp(':ses:eu-west-1:.*:configuration-set/test-email$'),
                  ]),
                ],
              },
            ],
          }),
        ]),
      },
    });
  });

  it('configures the email copy from the sender name, never a hardcoded brand', () => {
    expect(envOf('AuthStart')).toMatchObject({
      BRAND_NAME: 'Example App',
      EMAIL_FROM_NAME: 'Example App',
      EMAIL_FROM: 'no-reply@example.com',
      EMAIL_REGION: 'eu-west-1',
      EMAIL_CONFIG_SET: 'test-email',
      SITE_URL: 'https://example.com',
    });
  });

  it('keeps pending sign-ins in a TTL table', () => {
    t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
  });

  it('throttles the public mail-sending route harder than the rest', () => {
    t.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: { ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 },
      RouteSettings: {
        'POST /auth/start': { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 },
      },
    });
  });
});

describe('SyncStack: sync API', () => {
  it('partitions the sync table by user, with a seq LSI for consistent pulls', () => {
    t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      LocalSecondaryIndexes: [
        Match.objectLike({
          IndexName: 'bySeq',
          KeySchema: [
            { AttributeName: 'userId', KeyType: 'HASH' },
            { AttributeName: 'seq', KeyType: 'RANGE' },
          ],
        }),
      ],
      Replicas: [
        Match.objectLike({
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        }),
      ],
    });
    t.hasResource('AWS::DynamoDB::GlobalTable', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        KeySchema: Match.arrayWith([Match.objectLike({ AttributeName: 'userId' })]),
      }),
    });
  });

  it('puts a Cognito JWT authoriser on every sync route and none on the public ones', () => {
    t.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: {
        Audience: [Match.anyValue()],
        Issuer: Match.anyValue(),
      },
    });
    const routes = Object.values(t.findResources('AWS::ApiGatewayV2::Route')).map(
      (r) => (r as { Properties: { RouteKey: string; AuthorizationType?: string } }).Properties,
    );
    const auth = Object.fromEntries(routes.map((r) => [r.RouteKey, r.AuthorizationType ?? 'NONE']));
    expect(auth).toEqual({
      'GET /health': 'NONE',
      'GET /config': 'NONE',
      'POST /auth/start': 'NONE',
      'POST /sync/push': 'JWT',
      'GET /sync/pull': 'JWT',
      'DELETE /account': 'JWT',
    });
  });

  it('gives the sync function its table, index and pool, and leave to delete users', () => {
    expect(envOf('SyncApi')).toMatchObject({ SEQ_INDEX: 'bySeq' });
    expect(Object.keys(envOf('SyncApi')).sort()).toEqual([
      'SEQ_INDEX',
      'TABLE_NAME',
      'USER_POOL_ID',
    ]);
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([Match.objectLike({ Action: 'cognito-idp:AdminDeleteUser' })]),
      },
    });
  });

  it('allows the site origin and configured extras for CORS', () => {
    t.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      DisableExecuteApiEndpoint: true,
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['https://example.com', 'http://localhost:5173'],
        AllowHeaders: ['authorization', 'content-type'],
      }),
    });
  });

  it('serves the API at its own name with a DNS-validated certificate', () => {
    t.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'api.example.com',
      ValidationMethod: 'DNS',
    });
    t.hasResourceProperties('AWS::ApiGatewayV2::DomainName', { DomainName: 'api.example.com' });
    t.hasResourceProperties('AWS::ApiGatewayV2::ApiMapping', { Stage: '$default' });
    for (const Type of ['A', 'AAAA']) {
      t.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: 'api.example.com.',
        Type,
        HostedZoneId: 'ZFAKEFAKEFAKE',
      });
    }
  });

  it('runs every function on Node 24, arm64, with bounded log retention', () => {
    for (const fn of Object.values(functions)) {
      expect(fn).toMatchObject({
        Properties: { Runtime: 'nodejs24.x', Architectures: ['arm64'], Handler: 'index.handler' },
      });
    }
    expect(Object.keys(functions)).toHaveLength(4);
    t.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: 30 }, 4);
  });

  it('outputs the API URL and the pool and client IDs, never committing them', () => {
    t.hasOutput('ApiUrl', { Value: 'https://api.example.com' });
    t.hasOutput('UserPoolId', Match.anyValue());
    t.hasOutput('UserPoolClientId', Match.anyValue());
  });
});

describe('SyncStack: bundles', () => {
  it('bundles each handler as ESM that leaves the AWS SDK to the runtime', () => {
    const dir = assembly.directory;
    const bundles = readdirSync(dir)
      .filter((d) => d.startsWith('asset.'))
      .map((d) => readFileSync(path.join(dir, d, 'index.mjs'), 'utf8'));
    expect(bundles).toHaveLength(4);
    for (const code of bundles) {
      expect(code).toMatch(/export\s*\{/);
      expect(code).not.toMatch(/@aws-sdk\/client-[a-z]+\/dist/);
    }
    // The start function loads SESv2 from the runtime, so it isn't bundled.
    expect(bundles.filter((c) => c.includes('"sesv2"'))).toHaveLength(1);
  });
});

describe('SyncStack: config checks', () => {
  it('rejects an API name outside the zone or a sender at another domain', () => {
    expect(() => synth({ apiDomain: 'api.other.com' })).toThrow(/not inside zone/);
    expect(() => synth({ email: { ...email, fromAddress: 'no-reply@other.com' } })).toThrow(
      /not at example.com/,
    );
  });
});
