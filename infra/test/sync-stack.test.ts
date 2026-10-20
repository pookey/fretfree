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

  it('lets signed-in users change no sign-in attribute, and verifies any address change', () => {
    t.hasResourceProperties('AWS::Cognito::UserPoolClient', { WriteAttributes: ['locale'] });
    t.hasResourceProperties('AWS::Cognito::UserPool', {
      UserAttributeUpdateSettings: { AttributesRequireVerificationBeforeUpdate: ['email'] },
    });
  });

  it('creates the stage only after the route its settings name', () => {
    const routes = t.findResources('AWS::ApiGatewayV2::Route', {
      Properties: { RouteKey: 'POST /auth/start' },
    });
    const [routeId] = Object.keys(routes);
    expect(routeId).toBeDefined();
    const [stage] = Object.values(t.findResources('AWS::ApiGatewayV2::Stage'));
    expect((stage as { DependsOn?: string[] }).DependsOn).toContain(routeId);
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

type Props = Record<string, unknown>;
const only = (type: string): Props => {
  const all = Object.values(t.findResources(type));
  expect(all).toHaveLength(1);
  return (all[0] as { Properties: Props }).Properties;
};

/**
 * Rules Cognito checks when CloudFormation creates the pool and client. A synth
 * passes without them, and the first deploy fails, so each is asserted here.
 */
describe('SyncStack: Cognito create-time constraints', () => {
  const pool = only('AWS::Cognito::UserPool');
  const client = only('AWS::Cognito::UserPoolClient');
  const writable = client.WriteAttributes as string[];

  it('gives the client write access to every required attribute', () => {
    const schema = (pool.Schema ?? []) as { Name: string; Required?: boolean }[];
    const required = schema.filter((a) => a.Required).map((a) => a.Name);
    for (const name of required) expect(writable).toContain(name);
    // And the client can't write email, so it can't make Cognito mail anyone.
    expect(writable).not.toContain('email');
  });

  it('reads at least what it writes', () => {
    const readable = client.ReadAttributes as string[] | undefined;
    if (readable) for (const name of writable) expect(readable).toContain(name);
  });

  it('keeps original values only for attributes Cognito verifies', () => {
    const keep = (pool.UserAttributeUpdateSettings as Props)
      .AttributesRequireVerificationBeforeUpdate as string[];
    for (const name of keep) expect(pool.AutoVerifiedAttributes).toContain(name);
  });

  it('uses email usernames without aliases (the two are exclusive)', () => {
    expect(pool.UsernameAttributes).toEqual(['email']);
    expect(pool.AliasAttributes).toBeUndefined();
  });

  it('uses no feature the Lite plan lacks', () => {
    expect(pool.UserPoolTier).toBe('LITE');
    expect(pool.UserPoolAddOns).toBeUndefined();
    const policy = (pool.Policies as Props).PasswordPolicy as Props;
    expect(policy.PasswordHistorySize).toBeUndefined();
    expect(policy.MinimumLength).toBeGreaterThanOrEqual(6);
    expect(policy.MinimumLength).toBeLessThanOrEqual(99);
  });

  it('sends from the verified domain, in an SES region a us-east-1 pool may use', () => {
    const config = pool.EmailConfiguration as { From: string; SourceArn: unknown };
    const arn = JSON.stringify(config.SourceArn);
    expect(config.From).toMatch(/<[^@>]+@example\.com>$/);
    expect(arn).toMatch(/:identity\/example\.com"/);
    const region = /:ses:([a-z0-9-]+):/.exec(arn)?.[1];
    expect(['us-east-1', 'us-west-2', 'eu-west-1']).toContain(region);
  });

  it('keeps the auth session and token lifetimes inside the allowed ranges', () => {
    expect(client.AuthSessionValidity).toBeGreaterThanOrEqual(3);
    expect(client.AuthSessionValidity).toBeLessThanOrEqual(15);
    const units = client.TokenValidityUnits as Record<string, string>;
    const minutes = (value: unknown, unit: string | undefined): number =>
      Number(value) * ({ minutes: 1, hours: 60, days: 1440 }[unit ?? 'days'] ?? NaN);
    const access = minutes(client.AccessTokenValidity, units.AccessToken);
    const id = minutes(client.IdTokenValidity, units.IdToken);
    const refresh = minutes(client.RefreshTokenValidity, units.RefreshToken);
    for (const short of [access, id]) {
      expect(short).toBeGreaterThanOrEqual(5);
      expect(short).toBeLessThanOrEqual(1440);
      expect(short).toBeLessThan(refresh);
    }
    expect(refresh).toBeGreaterThanOrEqual(60);
    expect(refresh).toBeLessThanOrEqual(3650 * 1440);
  });

  it('sets no OAuth flow, so it needs no callback URL', () => {
    expect(client.AllowedOAuthFlowsUserPoolClient).toBe(false);
    expect(client.AllowedOAuthFlows).toBeUndefined();
    expect(client.CallbackURLs).toBeUndefined();
  });

  it('lets Cognito invoke the trigger function', () => {
    t.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'cognito-idp.amazonaws.com',
      SourceArn: { 'Fn::GetAtt': [Match.stringLikeRegexp('^Users'), 'Arn'] },
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
