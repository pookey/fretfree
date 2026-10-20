import { randomBytes } from 'node:crypto';
import { errorName, type AwsCall } from '../shared/aws';

/** A password nobody knows, meeting any policy: the app client allows no password flow. */
export const randomPassword = (): string => `${randomBytes(48).toString('base64url')}Aa1!`;

/**
 * Makes sure `email` has a Cognito user that custom auth can sign in. A new user
 * starts in FORCE_CHANGE_PASSWORD, and a permanent random password confirms it.
 * An existing user gets the password only if it's still unconfirmed, say after
 * throttling between the two calls on an earlier request. A confirmed user, who
 * may be signed in on other devices, is never touched.
 */
export function createEnsureUser(
  cognito: AwsCall,
  userPoolId: string,
  password: () => string = randomPassword,
): (email: string) => Promise<void> {
  return async (email) => {
    try {
      await cognito('AdminCreateUser', {
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          // Signing in proves the address: only its inbox gets the code.
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      });
    } catch (error) {
      if (errorName(error) !== 'UsernameExistsException') throw error;
      const user = (await cognito('AdminGetUser', { UserPoolId: userPoolId, Username: email })) as {
        UserStatus?: string;
      };
      if (user.UserStatus !== 'FORCE_CHANGE_PASSWORD') return;
    }
    await cognito('AdminSetUserPassword', {
      UserPoolId: userPoolId,
      Username: email,
      Password: password(),
      Permanent: true,
    });
  };
}
