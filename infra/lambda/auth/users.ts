import { randomBytes } from 'node:crypto';
import { errorName, type AwsCall } from '../shared/aws';

/** A password nobody knows, meeting any policy: the app client allows no password flow. */
export const randomPassword = (): string => `${randomBytes(48).toString('base64url')}Aa1!`;

/**
 * Makes sure `email` has a Cognito user that custom auth can sign in. A new user
 * starts in FORCE_CHANGE_PASSWORD, and a permanent random password confirms it.
 * The password is set on every call, not just after a create, so a user left
 * unconfirmed by an earlier failure (say, throttling between the two calls)
 * recovers on the next request. Setting it again is harmless.
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
    }
    await cognito('AdminSetUserPassword', {
      UserPoolId: userPoolId,
      Username: email,
      Password: password(),
      Permanent: true,
    });
  };
}
