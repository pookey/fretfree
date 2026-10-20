import { sdkCall } from '../shared/aws';
import { createStartHandler } from './start';
import { dynamoStore } from './store';
import { createEnsureUser } from './users';

// The POST /auth/start Lambda: the pure handler wired to the runtime's AWS SDK.
// Config comes from the environment the stack sets (lib/sync-stack.ts).
const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** The display name and address for the From header, quoted as RFC 5322 wants. */
const fromHeader = (name: string, address: string): string =>
  `"${name.replace(/["\\]/g, '\\$&')}" <${address}>`;

export const handler = (() => {
  const cognito = sdkCall('cognito-identity-provider', 'CognitoIdentityProvider');
  const ses = sdkCall('sesv2', 'SESv2', env('EMAIL_REGION'));
  const userPoolId = env('USER_POOL_ID');
  return createStartHandler({
    store: dynamoStore(sdkCall('dynamodb', 'DynamoDB'), env('SIGN_IN_TABLE')),
    now: Date.now,
    siteUrl: env('SITE_URL'),
    brand: env('BRAND_NAME'),
    ensureUser: createEnsureUser(cognito, userPoolId),
    async sendEmail(to, message) {
      await ses('SendEmail', {
        FromEmailAddress: fromHeader(env('EMAIL_FROM_NAME'), env('EMAIL_FROM')),
        Destination: { ToAddresses: [to] },
        ConfigurationSetName: env('EMAIL_CONFIG_SET'),
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: message.text, Charset: 'UTF-8' },
              Html: { Data: message.html, Charset: 'UTF-8' },
            },
          },
        },
      });
    },
  });
})();
